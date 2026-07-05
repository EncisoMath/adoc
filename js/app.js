(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const state = {
    session: null,
    settings: null,
    teachers: [],
    types: [],
    records: [],
    days: [],
    holidays: [],
    recipients: [],
    currentTab: 'tabHoy',
    viewDate: new Date(),
    selectedDate: new Date().toISOString().slice(0, 10),
    weather: null
  };

  const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtLong(date) {
    const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function fmtShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function normalizeText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function toast(message, ms = 3300) {
    const root = $('#toastRoot');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function applyTheme() {
    const s = state.settings || {};
    const mode = s.theme_mode || 'light';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', mode === 'dark' || (mode === 'auto' && prefersDark));
    document.documentElement.style.setProperty('--fuchsia', s.primary_fuchsia || '#ff006e');
    document.documentElement.style.setProperty('--fuchsia-2', s.secondary_fuchsia || '#d9005c');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.primary_fuchsia || '#ff006e');
  }

  async function init() {
    $('#appShell').classList.remove('booting');
    bindAuth();
    bindNavigation();
    registerServiceWorker();
    window.addEventListener('online', async () => {
      toast('Conexión recuperada. Sincronizando...');
      await syncNow();
    });

    state.session = await Api.session();
    if (!state.session) return showLogin();
    await loadApp();
  }

  function showLogin() {
    $('#loginView').classList.remove('hidden');
    $('#mainView').classList.add('hidden');
  }

  function showMain() {
    $('#loginView').classList.add('hidden');
    $('#mainView').classList.remove('hidden');
  }

  function bindAuth() {
    $('#loginBtn').addEventListener('click', async () => {
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const msg = $('#loginMsg');
      msg.classList.add('hidden');
      if (!email || !password) return showLoginMsg('Escribe correo y contraseña.');
      $('#loginBtn').disabled = true;
      const { data, error } = await Api.login(email, password);
      $('#loginBtn').disabled = false;
      if (error) return showLoginMsg(error.message);
      state.session = data.session;
      await loadApp();
    });

    $('#signupBtn').addEventListener('click', async () => {
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      if (!email || !password) return showLoginMsg('Escribe correo y contraseña para crear el usuario inicial.');
      $('#signupBtn').disabled = true;
      const { error } = await Api.signup(email, password);
      $('#signupBtn').disabled = false;
      if (error) return showLoginMsg(error.message);
      showLoginMsg('Usuario creado. Si Supabase pide confirmación por correo, confirma y luego entra.', false);
    });

    $('#logoutBtn').addEventListener('click', async () => {
      if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
      await Api.logout();
      state.session = null;
      showLogin();
    });

    $('#syncBtn').addEventListener('click', syncNow);
  }

  function showLoginMsg(text, isError = true) {
    const msg = $('#loginMsg');
    msg.textContent = text;
    msg.style.background = isError ? '' : 'color-mix(in srgb, var(--success) 14%, var(--surface))';
    msg.classList.remove('hidden');
  }

  async function loadApp() {
    showMain();
    try {
      const data = await Api.bootstrap();
      Object.assign(state, data);
      state.settings = data.settings || defaultSettings();
      await fetchWeather();
      applyTheme();
      renderAll();
      toast(navigator.onLine ? 'Datos cargados desde Supabase.' : 'Modo sin conexión. Usando datos guardados.');
    } catch (err) {
      console.error(err);
      toast('No se pudo cargar la app. Revisa Supabase/Auth.');
    }
  }

  function defaultSettings() {
    return {
      id: 1,
      app_name: 'Asistencia GGM',
      greeting_name: 'Madeleine',
      theme_mode: 'light',
      primary_fuchsia: '#ff006e',
      secondary_fuchsia: '#d9005c',
      institution_name: 'Institución Educativa Departamental Gabriel García Márquez',
      city: 'Aracataca',
      department: 'Magdalena',
      nit: '800096058-1',
      dane: '147053000151',
      coordinator_name: 'Madeleine Blanco Manotas',
      coordinator_title: 'Coordinadora',
      rector_name: 'Shirly Luna',
      rector_title: 'Rectora',
      daily_reminder_enabled: true,
      daily_reminder_time: '07:00',
      ai_correction_enabled: true,
      save_original_observation: true
    };
  }

  function renderAll() {
    applyTheme();
    renderHoy();
    renderCalendario();
    renderDocentes();
    renderPdf();
    renderAjustes();
    switchTab(state.currentTab, false);
  }

  function bindNavigation() {
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tabId, rerender = true) {
    state.currentTab = tabId;
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tabId));
    $('#topTitle').textContent = $('#' + tabId)?.dataset.title || 'Asistencia GGM';
    if (rerender) renderAll();
  }

  async function syncNow() {
    const btn = $('#syncBtn');
    btn.disabled = true;
    const result = await Api.syncQueue();
    btn.disabled = false;
    if (!result.ok && result.message) return toast(result.message);
    if (result.failed) return toast(`Sincronización parcial: ${result.synced} ok, ${result.failed} pendientes.`);
    await refreshData();
    toast(result.synced ? `Sincronizado: ${result.synced} cambios.` : 'Todo está sincronizado.');
  }

  async function refreshData() {
    const data = await Api.bootstrap();
    Object.assign(state, data);
    state.settings = data.settings || defaultSettings();
    applyTheme();
    renderAll();
  }

  async function fetchWeather() {
    try {
      const loc = window.ASGGM_CONFIG.defaultWeather;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('weather');
      const json = await res.json();
      state.weather = json.current || null;
      await LocalDB.set('weather', state.weather);
    } catch {
      state.weather = await LocalDB.get('weather', null);
    }
  }

  function weatherFace() {
    const w = state.weather;
    if (!w) {
      const hour = new Date().getHours();
      return hour >= 18 || hour < 6 ? '🌙' : '☀️';
    }
    const code = Number(w.weather_code);
    if (w.is_day === 0) return '🌙';
    if ([0, 1].includes(code)) return '☀️';
    if ([2, 3].includes(code)) return '☁️';
    if ([45, 48].includes(code)) return '🌫️';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
    if (code >= 95) return '⛈️';
    return '🌤️';
  }

  function monthRecords() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    return state.records.filter(r => !r.deleted_at && isSameMonth(r.date, y, m));
  }

  function monthDays() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    return state.days.filter(d => isSameMonth(d.date, y, m));
  }

  function isSameMonth(dateStr, y, m) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() === m;
  }

  function isWeekend(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  }

  function teacherById(id) {
    return state.teachers.find(t => t.id === id);
  }

  function typeByCode(code) {
    return state.types.find(t => t.code === code);
  }

  function computeStats() {
    const records = monthRecords();
    const days = monthDays();
    const byTeacher = new Map();
    const byType = new Map();
    records.forEach(r => {
      byTeacher.set(r.teacher_id, (byTeacher.get(r.teacher_id) || 0) + 1);
      byType.set(r.absence_code, (byType.get(r.absence_code) || 0) + 1);
    });
    const topTeacherEntry = [...byTeacher.entries()].sort((a, b) => b[1] - a[1])[0];
    const topTypeEntry = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    const institutionalDays = days.filter(d => d.status === 'institucional').length;
    const pendingDays = pendingSchoolDays().length;
    return {
      total: records.length,
      institutionalDays,
      pendingDays,
      topTeacher: topTeacherEntry ? `${teacherById(topTeacherEntry[0])?.full_name || 'Docente'} (${topTeacherEntry[1]})` : 'Sin registros',
      topType: topTypeEntry ? `${typeByCode(topTypeEntry[0])?.name || topTypeEntry[0]} (${topTypeEntry[1]})` : 'Sin registros',
      byType,
      byTeacher
    };
  }

  function pendingSchoolDays() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    const today = new Date();
    const limit = today.getFullYear() === y && today.getMonth() === m ? today.getDate() : new Date(y, m + 1, 0).getDate();
    const dayMap = new Map(state.days.map(d => [d.date, d]));
    const recordDates = new Set(state.records.filter(r => !r.deleted_at && isSameMonth(r.date, y, m)).map(r => r.date));
    const holidaySet = new Set(state.holidays.map(h => h.date));
    const pending = [];
    for (let day = 1; day <= limit; day++) {
      const iso = new Date(y, m, day).toISOString().slice(0, 10);
      if (isWeekend(iso) || holidaySet.has(iso)) continue;
      const dayRec = dayMap.get(iso);
      if (recordDates.has(iso)) continue;
      if (dayRec && ['sin_novedades', 'institucional', 'no_laboral', 'con_novedades'].includes(dayRec.status)) continue;
      pending.push(iso);
    }
    return pending;
  }

  function renderHoy() {
    const s = state.settings || defaultSettings();
    const stats = computeStats();
    const today = todayIso();
    const todayRecords = state.records.filter(r => !r.deleted_at && r.date === today);
    const todayDay = state.days.find(d => d.date === today);
    const hasToday = todayRecords.length > 0 || (todayDay && todayDay.status !== 'pendiente');
    $('#tabHoy').innerHTML = `
      <div class="hero ps-card">
        <div>
          <h2>Hola, ${escapeHtml(s.greeting_name || 'Madeleine')}</h2>
          <p>Hoy es ${escapeHtml(fmtLong(new Date()))}</p>
          <p class="tiny">${state.weather?.temperature_2m != null ? `${Math.round(state.weather.temperature_2m)}°C · ` : ''}${window.ASGGM_CONFIG.defaultWeather.label}</p>
        </div>
        <div class="weather-face" aria-hidden="true">${weatherFace()}</div>
      </div>

      <div class="actions-row">
        <button class="primary-btn" id="todayRegisterBtn">${hasToday ? 'Ver asistencia de hoy' : 'Registrar asistencia de hoy'}</button>
        <button class="secondary-btn" id="markNoNewsTodayBtn">Marcar sin novedades</button>
      </div>

      <div class="grid three">
        <div class="stat-card"><small>Inasistencias del mes</small><strong>${stats.total}</strong><span>${MONTHS[state.viewDate.getMonth()]} ${state.viewDate.getFullYear()}</span></div>
        <div class="stat-card"><small>Días institucionales</small><strong>${stats.institutionalDays}</strong><span>Paro, asamblea, reunión, etc.</span></div>
        <div class="stat-card"><small>Días pendientes</small><strong>${stats.pendingDays}</strong><span>Por confirmar</span></div>
      </div>

      <div class="grid two" style="margin-top:12px;">
        <div class="panel">
          <h3>Docente con más novedades</h3>
          <p class="muted">${escapeHtml(stats.topTeacher)}</p>
        </div>
        <div class="panel">
          <h3>Tipo más frecuente</h3>
          <p class="muted">${escapeHtml(stats.topType)}</p>
        </div>
      </div>

      <div class="panel" style="margin-top:12px;">
        <h3>Gráfico por tipo</h3>
        ${renderTypeBars(stats.byType)}
      </div>
    `;
    $('#todayRegisterBtn').addEventListener('click', () => openDayModal(today));
    $('#markNoNewsTodayBtn').addEventListener('click', () => markNoNews(today));
  }

  function renderTypeBars(byType) {
    const entries = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(x => x[1]));
    if (!entries.length) return '<p class="muted">Todavía no hay registros este mes.</p>';
    return `<div class="bar-chart">${entries.map(([code, count]) => {
      const type = typeByCode(code);
      const pct = Math.max(4, Math.round((count / max) * 100));
      return `<div class="bar-row"><strong>${escapeHtml(code)}</strong><div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${escapeHtml(type?.color || 'var(--fuchsia)')}"></div></div><span>${count}</span></div>`;
    }).join('')}</div>`;
  }

  function renderCalendario() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const title = `${MONTHS[month]} ${year}`;
    const stats = computeStats();
    $('#tabCalendario').innerHTML = `
      <div class="calendar-head">
        <button class="icon-btn" id="prevMonth">‹</button>
        <h2>${escapeHtml(title)}</h2>
        <button class="icon-btn" id="nextMonth">›</button>
      </div>
      <div class="grid three" style="margin-bottom:12px;">
        <div class="stat-card"><small>Registros</small><strong>${stats.total}</strong></div>
        <div class="stat-card"><small>Institucionales</small><strong>${stats.institutionalDays}</strong></div>
        <div class="stat-card"><small>Pendientes</small><strong>${stats.pendingDays}</strong></div>
      </div>
      <div class="calendar-grid">
        ${['D','L','M','M','J','V','S'].map(d => `<div class="weekday">${d}</div>`).join('')}
        ${calendarCells(year, month)}
      </div>
      <div class="panel" style="margin-top:12px;">
        <h3>Días pendientes</h3>
        ${renderPendingList()}
      </div>
    `;
    $('#prevMonth').addEventListener('click', () => { state.viewDate = new Date(year, month - 1, 1); renderAll(); });
    $('#nextMonth').addEventListener('click', () => { state.viewDate = new Date(year, month + 1, 1); renderAll(); });
    $$('.day-cell:not(.out)', $('#tabCalendario')).forEach(cell => cell.addEventListener('click', () => openDayModal(cell.dataset.date)));
    bindPendingButtons($('#tabCalendario'));
  }

  function calendarCells(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const dayMap = new Map(state.days.map(d => [d.date, d]));
    const holidaySet = new Set(state.holidays.map(h => h.date));
    const recordCount = new Map();
    state.records.filter(r => !r.deleted_at && isSameMonth(r.date, year, month)).forEach(r => recordCount.set(r.date, (recordCount.get(r.date) || 0) + 1));
    let html = '';
    for (let i = 0; i < startPad; i++) html += '<button class="day-cell out" disabled></button>';
    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(year, month, day);
      const iso = date.toISOString().slice(0, 10);
      const dayRec = dayMap.get(iso);
      const count = recordCount.get(iso) || 0;
      const classes = ['day-cell'];
      if (iso === todayIso()) classes.push('today');
      if (isWeekend(iso)) classes.push('weekend');
      if (holidaySet.has(iso)) classes.push('holiday');
      if (count > 0) classes.push('has-records', 'ok');
      if (dayRec?.status === 'sin_novedades') classes.push('ok');
      if (dayRec?.status === 'institucional') classes.push('institutional');
      if (!isWeekend(iso) && !holidaySet.has(iso) && !count && (!dayRec || dayRec.status === 'pendiente') && iso <= todayIso()) classes.push('pending');
      const note = dayRec?.status === 'institucional' ? (dayRec.institutional_type || dayRec.institutional_title || 'Institucional') :
        dayRec?.status === 'sin_novedades' ? 'Sin novedades' :
        count ? `${count} registro${count === 1 ? '' : 's'}` :
        isWeekend(iso) ? 'No laboral' : holidaySet.has(iso) ? 'Festivo' : '';
      html += `<button class="${classes.join(' ')}" data-date="${iso}" data-count="${count}"><span class="day-num">${day}</span><span class="day-note">${escapeHtml(note)}</span></button>`;
    }
    return html;
  }

  function renderPendingList() {
    const list = pendingSchoolDays();
    if (!list.length) return '<p class="muted">No hay días pendientes hasta hoy.</p>';
    return `<div class="list">${list.slice(0, 10).map(d => `<div class="list-item"><div class="item-title"><span>${escapeHtml(fmtLong(d))}</span><span class="badge red">Pendiente</span></div><div class="item-actions"><button class="secondary-btn" data-open-day="${d}">Abrir</button><button class="ghost-btn" data-no-news="${d}">Marcar sin novedades</button></div></div>`).join('')}</div>`;
  }

  function bindPendingButtons(root = document) {
    $$('[data-open-day]', root).forEach(b => b.addEventListener('click', () => openDayModal(b.dataset.openDay)));
    $$('[data-no-news]', root).forEach(b => b.addEventListener('click', () => markNoNews(b.dataset.noNews)));
  }

  function openDayModal(dateStr) {
    state.selectedDate = dateStr;
    const records = state.records.filter(r => !r.deleted_at && r.date === dateStr);
    const day = state.days.find(d => d.date === dateStr);
    const modal = $('#modal');
    const content = $('#modalContent');
    content.innerHTML = `
      <h2>${escapeHtml(fmtLong(dateStr))}</h2>
      <div class="actions-row">
        <button type="button" class="primary-btn" id="addRecordBtn">Registrar novedad docente</button>
        <button type="button" class="secondary-btn" id="dayNoNewsBtn">Marcar sin novedades</button>
        <button type="button" class="ghost-btn" id="institutionalBtn">Evento institucional</button>
      </div>
      ${day ? `<div class="panel"><strong>Estado:</strong> ${escapeHtml(day.status)}${day.institutional_type ? ` · ${escapeHtml(day.institutional_type)}` : ''}<br><span class="muted">${escapeHtml(day.observation || '')}</span></div>` : ''}
      <h3>Registros del día</h3>
      ${records.length ? `<div class="list">${records.map(r => recordListItem(r)).join('')}</div>` : '<p class="muted">Sin registros de docentes en este día.</p>'}
    `;
    modal.showModal();
    $('#addRecordBtn').addEventListener('click', () => openAttendanceForm(dateStr));
    $('#dayNoNewsBtn').addEventListener('click', () => markNoNews(dateStr));
    $('#institutionalBtn').addEventListener('click', () => openInstitutionalForm(dateStr));
    $$('[data-edit-record]', content).forEach(b => b.addEventListener('click', () => openAttendanceForm(dateStr, b.dataset.editRecord)));
    $$('[data-delete-record]', content).forEach(b => b.addEventListener('click', () => deleteRecord(b.dataset.deleteRecord)));
  }

  function recordListItem(r) {
    const t = teacherById(r.teacher_id);
    const type = typeByCode(r.absence_code);
    return `<div class="list-item">
      <div class="item-title"><span>${escapeHtml(t?.full_name || 'Docente')}</span><span class="badge fuchsia">${escapeHtml(r.absence_code)}</span></div>
      <div class="item-meta">${escapeHtml(type?.name || r.absence_code)}${r.replacement_name ? ` · Reemplazo: ${escapeHtml(r.replacement_name)}` : ''}<br>${escapeHtml(r.observation_final || '')}</div>
      <div class="item-actions"><button type="button" class="secondary-btn" data-edit-record="${r.id}">Editar</button><button type="button" class="danger-btn" data-delete-record="${r.id}">Eliminar</button></div>
    </div>`;
  }

  function openAttendanceForm(dateStr, recordId = null) {
    const record = recordId ? state.records.find(r => r.id === recordId) : null;
    const teachersOptions = state.teachers.filter(t => t.active !== false || t.id === record?.teacher_id).sort((a,b) => a.full_name.localeCompare(b.full_name, 'es')).map(t => `<option value="${t.id}" ${record?.teacher_id === t.id ? 'selected' : ''}>${escapeHtml(t.full_name)}${t.active === false ? ' (inactivo)' : ''}</option>`).join('');
    const typeOptions = state.types.map(t => `<option value="${t.code}" ${record?.absence_code === t.code ? 'selected' : ''}>${escapeHtml(t.code)} · ${escapeHtml(t.name)}</option>`).join('');
    $('#modalContent').innerHTML = `
      <h2>${record ? 'Editar novedad' : 'Registrar novedad'}</h2>
      <div class="form-grid">
        <label class="field"><span>Fecha</span><input id="recDate" type="date" value="${escapeHtml(record?.date || dateStr)}"></label>
        <label class="field"><span>Docente</span><select id="recTeacher">${teachersOptions}</select></label>
        <label class="field"><span>Tipo</span><select id="recType">${typeOptions}</select></label>
        <label class="field" id="replacementField" style="display:none;"><span>Reemplazo</span><input id="recReplacement" value="${escapeHtml(record?.replacement_name || '')}" placeholder="Nombre de quien reemplazó"></label>
        <label class="field"><span>Observación</span><textarea id="recObservation" placeholder="Ej: Envió mensaje por WhatsApp informando cita médica.">${escapeHtml(record?.observation_final || record?.observation_original || '')}</textarea></label>
        <div class="actions-row">
          <button type="button" class="ghost-btn" id="spellBtn">Corregir redacción</button>
          <button type="button" class="ghost-btn" id="voiceBtn">🎙 Dictar</button>
        </div>
        <button type="button" class="primary-btn" id="saveRecordBtn">Guardar</button>
      </div>
    `;
    const recType = $('#recType');
    const replacementField = $('#replacementField');
    const toggleReplacement = () => replacementField.style.display = recType.value === 'RM' ? 'grid' : 'none';
    recType.addEventListener('change', toggleReplacement);
    toggleReplacement();
    $('#spellBtn').addEventListener('click', localCorrectObservation);
    $('#voiceBtn').addEventListener('click', startDictation);
    $('#saveRecordBtn').addEventListener('click', async () => {
      const payload = {
        id: record?.id || crypto.randomUUID(),
        date: $('#recDate').value,
        teacher_id: $('#recTeacher').value,
        absence_code: $('#recType').value,
        observation_original: record?.observation_original || $('#recObservation').value.trim(),
        observation_final: $('#recObservation').value.trim(),
        replacement_name: $('#recType').value === 'RM' ? $('#recReplacement').value.trim() : null,
        has_attachments: record?.has_attachments || false
      };
      if (!payload.date || !payload.teacher_id || !payload.absence_code) return toast('Faltan datos obligatorios.');
      await Api.saveAttendance(payload);
      await Api.saveDayRecord({ date: payload.date, status: 'con_novedades', is_school_day: true });
      $('#modal').close();
      await refreshData();
      toast('Novedad guardada.');
    });
  }

  function localCorrectObservation() {
    const input = $('#recObservation');
    let text = input.value.trim();
    if (!text) return toast('Escribe una observación primero.');
    const replacements = [
      [/\bwasap\b/gi, 'WhatsApp'], [/\bwsp\b/gi, 'WhatsApp'], [/\bws\b/gi, 'WhatsApp'],
      [/\bq\b/gi, 'que'], [/\bx\b/gi, 'por'], [/\bmedica\b/gi, 'médica'],
      [/\bcit(a|as) medica(s)?\b/gi, 'cita médica'], [/\benvio\b/gi, 'Envió'], [/\bmsj\b/gi, 'mensaje']
    ];
    replacements.forEach(([re, v]) => text = text.replace(re, v));
    text = text.replace(/\s+/g, ' ').trim();
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!/[.!?]$/.test(text)) text += '.';
    input.value = text;
    toast('Corrección local aplicada. Luego conectaremos el agente OpenAI.');
  }

  function startDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast('Este navegador no soporta dictado local. Luego usaremos OpenAI por Supabase.');
    const rec = new SpeechRecognition();
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = e => {
      const text = e.results[0][0].transcript;
      $('#recObservation').value = ($('#recObservation').value + ' ' + text).trim();
    };
    rec.onerror = () => toast('No se pudo usar el micrófono.');
    rec.start();
    toast('Escuchando...');
  }

  async function markNoNews(dateStr) {
    await Api.saveDayRecord({ date: dateStr, status: 'sin_novedades', is_school_day: true, observation: 'Día registrado sin novedades.' });
    $('#modal').close();
    await refreshData();
    toast('Día marcado sin novedades.');
  }

  function openInstitutionalForm(dateStr) {
    const existing = state.days.find(d => d.date === dateStr);
    const types = ['Paro','Asamblea','Reunión','Comisión','Jornada pedagógica','Festivo','Actividad institucional','Otro'];
    $('#modalContent').innerHTML = `
      <h2>Evento institucional</h2>
      <div class="form-grid">
        <label class="field"><span>Fecha</span><input id="instDate" type="date" value="${escapeHtml(dateStr)}"></label>
        <label class="field"><span>Tipo</span><select id="instType">${types.map(t => `<option ${existing?.institutional_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Título corto</span><input id="instTitle" value="${escapeHtml(existing?.institutional_title || '')}" placeholder="Ej: Asamblea general"></label>
        <label class="field"><span>Observación</span><textarea id="instObs">${escapeHtml(existing?.observation || '')}</textarea></label>
        <button type="button" class="primary-btn" id="saveInstBtn">Guardar evento</button>
      </div>`;
    $('#saveInstBtn').addEventListener('click', async () => {
      await Api.saveDayRecord({
        date: $('#instDate').value,
        status: $('#instType').value === 'Festivo' ? 'no_laboral' : 'institucional',
        institutional_type: $('#instType').value,
        institutional_title: $('#instTitle').value.trim(),
        observation: $('#instObs').value.trim(),
        is_school_day: $('#instType').value !== 'Festivo'
      });
      $('#modal').close();
      await refreshData();
      toast('Evento institucional guardado.');
    });
  }

  async function deleteRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    const name = teacherById(rec.teacher_id)?.full_name || 'Docente';
    if (!confirm(`¿Eliminar esta novedad?\n\nDocente: ${name}\nFecha: ${fmtShort(rec.date)}\nTipo: ${rec.absence_code}`)) return;
    await Api.softDeleteAttendance(id);
    $('#modal').close();
    await refreshData();
    toast('Novedad eliminada.');
  }

  function renderDocentes() {
    const rows = [...state.teachers].sort((a, b) => (b.active === true) - (a.active === true) || a.full_name.localeCompare(b.full_name, 'es'));
    const counts = new Map();
    state.records.filter(r => !r.deleted_at).forEach(r => counts.set(r.teacher_id, (counts.get(r.teacher_id) || 0) + 1));
    $('#tabDocentes').innerHTML = `
      <div class="actions-row"><button class="primary-btn" id="newTeacherBtn">Agregar docente</button></div>
      <div class="search-row"><input id="teacherSearch" placeholder="Buscar docente..."></div>
      <div class="list" id="teacherList">
        ${rows.map(t => teacherItem(t, counts.get(t.id) || 0)).join('')}
      </div>`;
    $('#newTeacherBtn').addEventListener('click', () => openTeacherForm());
    $('#teacherSearch').addEventListener('input', e => {
      const q = normalizeText(e.target.value);
      $$('.teacher-row').forEach(row => row.style.display = normalizeText(row.dataset.name).includes(q) ? '' : 'none');
    });
    $$('.teacher-row [data-open-teacher]').forEach(btn => btn.addEventListener('click', () => openTeacherDetail(btn.dataset.openTeacher)));
    $$('.teacher-row [data-edit-teacher]').forEach(btn => btn.addEventListener('click', () => openTeacherForm(btn.dataset.editTeacher)));
  }

  function teacherItem(t, count) {
    return `<div class="list-item teacher-row" data-name="${escapeHtml(t.full_name)}">
      <div class="item-title"><span>${escapeHtml(t.full_name)}</span><span class="badge ${t.active ? 'green' : 'gray'}">${t.active ? 'Activa' : 'Inactiva'}</span></div>
      <div class="item-meta">${escapeHtml(t.role)} · ${escapeHtml(t.campus)} · ${count} novedades</div>
      <div class="item-actions"><button class="secondary-btn" data-open-teacher="${t.id}">Historial</button><button class="ghost-btn" data-edit-teacher="${t.id}">Editar</button></div>
    </div>`;
  }

  function openTeacherForm(id = null) {
    const t = id ? state.teachers.find(x => x.id === id) : null;
    $('#modalContent').innerHTML = `
      <h2>${t ? 'Editar docente' : 'Agregar docente'}</h2>
      <div class="form-grid two">
        <label class="field"><span>Nombre completo</span><input id="teacherName" value="${escapeHtml(t?.full_name || '')}"></label>
        <label class="field"><span>Cargo</span><select id="teacherRole"><option ${t?.role === 'Docente' ? 'selected' : ''}>Docente</option><option ${t?.role === 'Directivo' ? 'selected' : ''}>Directivo</option></select></label>
        <label class="field"><span>Sede</span><select id="teacherCampus"><option ${t?.campus === 'Primaria' ? 'selected' : ''}>Primaria</option><option ${t?.campus === 'Bachillerato' ? 'selected' : ''}>Bachillerato</option><option ${t?.campus === 'Otra' ? 'selected' : ''}>Otra</option></select></label>
        <label class="field"><span>Estado</span><select id="teacherActive"><option value="true" ${t?.active !== false ? 'selected' : ''}>Activa</option><option value="false" ${t?.active === false ? 'selected' : ''}>Inactiva</option></select></label>
      </div>
      <label class="field"><span>Notas</span><textarea id="teacherNotes">${escapeHtml(t?.notes || '')}</textarea></label>
      <button type="button" class="primary-btn full" id="saveTeacherBtn">Guardar docente</button>`;
    $('#modal').showModal();
    $('#saveTeacherBtn').addEventListener('click', async () => {
      const payload = {
        id: t?.id || crypto.randomUUID(),
        full_name: $('#teacherName').value.trim().replace(/\s+/g, ' '),
        role: $('#teacherRole').value,
        campus: $('#teacherCampus').value,
        active: $('#teacherActive').value === 'true',
        notes: $('#teacherNotes').value.trim() || null
      };
      if (!payload.full_name) return toast('Escribe el nombre.');
      await Api.saveTeacher(payload);
      $('#modal').close();
      await refreshData();
      toast('Docente guardado.');
    });
  }

  function openTeacherDetail(id) {
    const t = state.teachers.find(x => x.id === id);
    const recs = state.records.filter(r => !r.deleted_at && r.teacher_id === id).sort((a, b) => b.date.localeCompare(a.date));
    const byType = new Map();
    recs.forEach(r => byType.set(r.absence_code, (byType.get(r.absence_code) || 0) + 1));
    $('#modalContent').innerHTML = `
      <h2>${escapeHtml(t.full_name)}</h2>
      <p class="muted">${escapeHtml(t.role)} · ${escapeHtml(t.campus)} · ${t.active ? 'Activa' : 'Inactiva'}</p>
      <div class="panel"><h3>Estadística individual</h3>${renderTypeBars(byType)}</div>
      <h3>Historial</h3>
      ${recs.length ? `<div class="list">${recs.slice(0, 80).map(r => `<div class="list-item"><div class="item-title"><span>${fmtShort(r.date)}</span><span class="badge fuchsia">${escapeHtml(r.absence_code)}</span></div><div class="item-meta">${escapeHtml(typeByCode(r.absence_code)?.name || r.absence_code)}<br>${escapeHtml(r.observation_final || '')}${r.replacement_name ? `<br>Reemplazo: ${escapeHtml(r.replacement_name)}` : ''}</div></div>`).join('')}</div>` : '<p class="muted">Sin historial.</p>'}`;
    $('#modal').showModal();
  }

  function renderPdf() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    const stats = computeStats();
    $('#tabPdf').innerHTML = `
      <div class="panel">
        <h2>Reportes de ${escapeHtml(MONTHS[m])} ${y}</h2>
        <p class="muted">Genera reportes formales listos para imprimir o guardar como PDF.</p>
        <div class="grid three">
          <div class="stat-card"><small>Registros</small><strong>${stats.total}</strong></div>
          <div class="stat-card"><small>Pendientes</small><strong>${stats.pendingDays}</strong></div>
          <div class="stat-card"><small>Días institucionales</small><strong>${stats.institutionalDays}</strong></div>
        </div>
        <div class="actions-row">
          <button class="primary-btn" id="printPlanilla">Planilla mensual</button>
          <button class="secondary-btn" id="printDetalle">Detalle mensual</button>
          <button class="ghost-btn" id="printResumen">Resumen por docente</button>
        </div>
        <p class="tiny muted">En esta v0.1 el navegador abre la vista de impresión. Allí eliges “Guardar como PDF”. Luego conectamos generación automática + correo mensual.</p>
      </div>`;
    $('#printPlanilla').addEventListener('click', () => printReport('planilla'));
    $('#printDetalle').addEventListener('click', () => printReport('detalle'));
    $('#printResumen').addEventListener('click', () => printReport('resumen'));
  }

  function reportData() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    return { settings: state.settings, teachers: state.teachers, types: state.types, records: monthRecords(), days: monthDays(), holidays: state.holidays, year: y, monthIndex: m };
  }

  function printReport(kind) {
    const data = reportData();
    if (kind === 'planilla') ReportPDF.printPlanilla(data);
    if (kind === 'detalle') ReportPDF.printDetalle(data);
    if (kind === 'resumen') ReportPDF.printResumenDocente(data);
  }

  function renderAjustes() {
    const s = state.settings || defaultSettings();
    $('#tabAjustes').innerHTML = `
      <div class="panel">
        <h2>Apariencia</h2>
        <div class="form-grid two">
          <label class="field"><span>Nombre para saludo</span><input id="setGreeting" value="${escapeHtml(s.greeting_name || '')}"></label>
          <label class="field"><span>Modo</span><select id="setTheme"><option value="light" ${s.theme_mode === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${s.theme_mode === 'dark' ? 'selected' : ''}>Oscuro</option><option value="auto" ${s.theme_mode === 'auto' ? 'selected' : ''}>Automático</option></select></label>
          <label class="field"><span>Fucsia principal</span><input id="setFuchsia" type="color" value="${escapeHtml(s.primary_fuchsia || '#ff006e')}"></label>
          <label class="field"><span>Fucsia secundario</span><input id="setFuchsia2" type="color" value="${escapeHtml(s.secondary_fuchsia || '#d9005c')}"></label>
        </div>
      </div>

      <div class="panel" style="margin-top:12px;">
        <h2>Institución y PDF</h2>
        <div class="form-grid two">
          <label class="field"><span>Institución</span><input id="setInst" value="${escapeHtml(s.institution_name || '')}"></label>
          <label class="field"><span>Ciudad</span><input id="setCity" value="${escapeHtml(s.city || '')}"></label>
          <label class="field"><span>Departamento</span><input id="setDept" value="${escapeHtml(s.department || '')}"></label>
          <label class="field"><span>NIT</span><input id="setNit" value="${escapeHtml(s.nit || '')}"></label>
          <label class="field"><span>DANE</span><input id="setDane" value="${escapeHtml(s.dane || '')}"></label>
          <label class="field"><span>Coordinadora</span><input id="setCoord" value="${escapeHtml(s.coordinator_name || '')}"></label>
          <label class="field"><span>Rectora</span><input id="setRector" value="${escapeHtml(s.rector_name || '')}"></label>
        </div>
        <label class="field"><span>Membrete negrita</span><input id="setBold" value="${escapeHtml(s.letterhead_bold || '')}"></label>
        <label class="field"><span>Membrete normal</span><input id="setNormal" value="${escapeHtml(s.letterhead_normal || '')}"></label>
      </div>

      <div class="panel" style="margin-top:12px;">
        <h2>Datos y conexión</h2>
        <div class="actions-row">
          <button class="primary-btn" id="saveSettingsBtn">Guardar ajustes</button>
          <button class="secondary-btn" id="askNotificationsBtn">Activar notificaciones</button>
          <button class="ghost-btn" id="exportBackupBtn">Exportar respaldo JSON</button>
        </div>
        <p class="tiny muted">Notificaciones push reales + correos automáticos + agente OpenAI van en la siguiente fase con Edge Functions.</p>
      </div>`;
    $('#saveSettingsBtn').addEventListener('click', saveSettings);
    $('#askNotificationsBtn').addEventListener('click', askNotifications);
    $('#exportBackupBtn').addEventListener('click', exportBackup);
  }

  async function saveSettings() {
    const payload = {
      ...state.settings,
      greeting_name: $('#setGreeting').value.trim() || 'Madeleine',
      theme_mode: $('#setTheme').value,
      primary_fuchsia: $('#setFuchsia').value,
      secondary_fuchsia: $('#setFuchsia2').value,
      institution_name: $('#setInst').value.trim(),
      city: $('#setCity').value.trim(),
      department: $('#setDept').value.trim(),
      nit: $('#setNit').value.trim(),
      dane: $('#setDane').value.trim(),
      coordinator_name: $('#setCoord').value.trim(),
      rector_name: $('#setRector').value.trim(),
      letterhead_bold: $('#setBold').value.trim(),
      letterhead_normal: $('#setNormal').value.trim()
    };
    await Api.saveSettings(payload);
    state.settings = payload;
    applyTheme();
    await refreshData();
    toast('Ajustes guardados.');
  }

  async function askNotifications() {
    if (!('Notification' in window)) return toast('Este navegador no soporta notificaciones.');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('Asistencia GGM', { body: 'Recordatorios activados en este dispositivo.' });
      toast('Notificaciones activadas.');
    } else toast('No se activaron las notificaciones.');
  }

  function exportBackup() {
    const data = {
      exported_at: new Date().toISOString(),
      settings: state.settings,
      teachers: state.teachers,
      absence_types: state.types,
      attendance_records: state.records,
      day_records: state.days,
      holidays: state.holidays,
      email_recipients: state.recipients
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `asistencia-ggm-respaldo-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('SW', err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
