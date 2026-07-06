(function () {
  const config = window.ASGGM_CONFIG;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const apiErrors = [];

  const TABLE_KEYS = [
    'app_settings',
    'teachers',
    'absence_types',
    'attendance_records',
    'day_records',
    'attachments',
    'email_recipients',
    'holidays'
  ];

  async function fromCache(table) {
    return LocalDB.get(table, []);
  }

  async function setCache(table, rows) {
    await LocalDB.set(table, rows || []);
  }

  function dateMonthRange(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    };
  }

  async function safeSelect(table, queryBuilder) {
    if (!navigator.onLine) return await fromCache(table);
    try {
      const query = queryBuilder ? queryBuilder(client.from(table)) : client.from(table).select('*');
      const { data, error } = await query;
      if (error) throw error;
      apiErrors.splice(0, apiErrors.length, ...apiErrors.filter(e => e.table !== table));
      await setCache(table, data || []);
      return data || [];
    } catch (err) {
      const message = err?.message || String(err);
      apiErrors.push({ table, message, at: new Date().toISOString() });
      console.warn('Fallo select, usando cache', table, err);
      return await fromCache(table);
    }
  }

  async function saveLocal(table, row, key = 'id') {
    const rows = await fromCache(table);
    const idx = rows.findIndex(x => x[key] === row[key]);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
    else rows.push(row);
    await setCache(table, rows);
  }

  async function queueOrRun({ table, action, payload, match }) {
    await saveLocal(table, payload, table === 'day_records' ? 'date' : 'id');

    if (!navigator.onLine) {
      await LocalDB.enqueue({ table, action, payload, match });
      return { data: payload, queued: true };
    }

    try {
      let req;
      if (action === 'insert') req = client.from(table).insert(payload).select().single();
      if (action === 'upsert') req = client.from(table).upsert(payload, { onConflict: match || 'id' }).select().single();
      if (action === 'update') req = client.from(table).update(payload).match(match).select().single();
      const { data, error } = await req;
      if (error) throw error;
      await saveLocal(table, data || payload, table === 'day_records' ? 'date' : 'id');
      return { data: data || payload, queued: false };
    } catch (err) {
      console.warn('Fallo escritura, queda en cola', err);
      await LocalDB.enqueue({ table, action, payload, match });
      return { data: payload, queued: true, error: err };
    }
  }

  async function syncQueue() {
    if (!navigator.onLine) return { ok: false, message: 'Sin conexión' };
    const queue = await LocalDB.queueAll();
    let ok = 0;
    let fail = 0;

    for (const item of queue) {
      try {
        let req;
        if (item.action === 'insert') req = client.from(item.table).insert(item.payload);
        if (item.action === 'upsert') req = client.from(item.table).upsert(item.payload, { onConflict: item.match || 'id' });
        if (item.action === 'update') req = client.from(item.table).update(item.payload).match(item.match);
        const { error } = await req;
        if (error) throw error;
        await LocalDB.removeQueue(item.id);
        ok += 1;
      } catch (err) {
        console.warn('No se pudo sincronizar item', item, err);
        fail += 1;
      }
    }

    return { ok: fail === 0, synced: ok, failed: fail };
  }

  window.Api = {
    client,
    dateMonthRange,
    apiErrors,

    async session() {
      const { data } = await client.auth.getSession();
      return data.session;
    },

    async login(email, password) {
      return client.auth.signInWithPassword({ email, password });
    },

    async signup(email, password) {
      return client.auth.signUp({ email, password });
    },

    async logout() {
      await client.auth.signOut();
    },

    async bootstrap() {
      await syncQueue();
      const settings = await this.getSettings();
      const teachers = await this.getTeachers();
      const types = await this.getAbsenceTypes();
      const records = await this.getAttendanceRecords();
      const days = await this.getDayRecords();
      const holidays = await this.getHolidays();
      const recipients = await this.getRecipients();
      return { settings, teachers, types, records, days, holidays, recipients };
    },

    async getSettings() {
      const rows = await safeSelect('app_settings', q => q.select('*').eq('id', 1).limit(1));
      if (Array.isArray(rows)) return rows[0] || null;
      return rows || null;
    },

    async saveSettings(settings) {
      const payload = { id: 1, ...settings, updated_at: new Date().toISOString() };
      return queueOrRun({ table: 'app_settings', action: 'upsert', payload, match: 'id' });
    },

    async getTeachers() {
      return safeSelect('teachers', q => q.select('*').order('active', { ascending: false }).order('full_name'));
    },

    async saveTeacher(teacher) {
      const payload = { id: teacher.id || crypto.randomUUID(), ...teacher, updated_at: new Date().toISOString() };
      return queueOrRun({ table: 'teachers', action: 'upsert', payload, match: 'id' });
    },

    async getAbsenceTypes() {
      return safeSelect('absence_types', q => q.select('*').eq('active', true).order('sort_order'));
    },

    async getAttendanceRecords(year, monthIndex) {
      if (Number.isInteger(year) && Number.isInteger(monthIndex)) {
        const { start, end } = dateMonthRange(year, monthIndex);
        return safeSelect('attendance_records', q => q.select('*').gte('date', start).lte('date', end).is('deleted_at', null).order('date'));
      }
      return safeSelect('attendance_records', q => q.select('*').is('deleted_at', null).order('date', { ascending: false }).limit(2400));
    },

    async saveAttendance(record) {
      const payload = {
        id: record.id || crypto.randomUUID(),
        date: record.date,
        teacher_id: record.teacher_id,
        absence_code: record.absence_code,
        observation_original: record.observation_original || null,
        observation_corrected: record.observation_corrected || null,
        observation_final: record.observation_final || null,
        replacement_name: record.replacement_name || null,
        has_attachments: !!record.has_attachments,
        updated_at: new Date().toISOString()
      };
      return queueOrRun({ table: 'attendance_records', action: 'upsert', payload, match: 'id' });
    },

    async correctObservation(text) {
      const raw = String(text || '').trim();
      if (!raw) return '';
      if (!navigator.onLine) throw new Error('Sin conexión para corregir con IA.');

      const sessionResult = await client.auth.getSession();
      const accessToken = sessionResult?.data?.session?.access_token;
      if (!accessToken) throw new Error('No hay sesión activa para corregir con IA.');

      const functionUrl = `${config.supabaseUrl}/functions/v1/correct-observation`;
      let response;
      try {
        response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ text: raw })
        });
      } catch (err) {
        throw new Error('No se pudo conectar con la Edge Function correct-observation. Revisa que esté desplegada en Supabase y que tenga CORS/JWT configurado.');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `La Edge Function respondió con error ${response.status}.`);
      }

      const corrected = String(data?.corrected || data?.text || '').trim();
      if (!corrected) throw new Error('La IA no devolvió texto corregido.');
      return corrected;
    },

    async softDeleteAttendance(id) {
      const payload = { id, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const rows = await fromCache('attendance_records');
      await setCache('attendance_records', rows.map(r => r.id === id ? { ...r, ...payload } : r));
      return queueOrRun({ table: 'attendance_records', action: 'update', payload, match: { id } });
    },

    async getDayRecords(year, monthIndex) {
      if (Number.isInteger(year) && Number.isInteger(monthIndex)) {
        const { start, end } = dateMonthRange(year, monthIndex);
        return safeSelect('day_records', q => q.select('*').gte('date', start).lte('date', end).order('date'));
      }
      return safeSelect('day_records', q => q.select('*').order('date', { ascending: false }).limit(1600));
    },

    async saveDayRecord(day) {
      const payload = {
        id: day.id || crypto.randomUUID(),
        date: day.date,
        status: day.status,
        institutional_type: day.institutional_type || null,
        institutional_title: day.institutional_title || null,
        observation: day.observation || null,
        is_school_day: day.is_school_day !== false,
        updated_at: new Date().toISOString()
      };
      return queueOrRun({ table: 'day_records', action: 'upsert', payload, match: 'date' });
    },

    async getHolidays() {
      return safeSelect('holidays', q => q.select('*').order('date'));
    },

    async getRecipients() {
      return safeSelect('email_recipients', q => q.select('*').order('email'));
    },

    async saveRecipient(recipient) {
      const payload = { id: recipient.id || crypto.randomUUID(), ...recipient, updated_at: new Date().toISOString() };
      return queueOrRun({ table: 'email_recipients', action: 'upsert', payload, match: 'id' });
    },

    syncQueue,

    async reloadAll() {
      await syncQueue();
      const data = {};
      for (const key of TABLE_KEYS) data[key] = await safeSelect(key);
      return data;
    }
  };
})();
