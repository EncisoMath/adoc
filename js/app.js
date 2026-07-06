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
    attachments: [],
    currentTab: 'tabHoy',
    viewDate: new Date(),
    pdfDate: new Date(),
    selectedDate: new Date().toISOString().slice(0, 10),
    selectedTeacherId: null,
    weather: null,
    recognition: null
  };

  const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const APP_ICON_URL = new URL('icons/icon-192.png', window.location.href).href;
  const NOTIFICATION_BADGE_URL = new URL('icons/notification-badge-96.png', window.location.href).href;
  const LOCAL_CORRECTION_QUEUE_KEY = 'pending_ai_corrections';
  const MAX_SUPPORT_FILE_SIZE = 10 * 1024 * 1024;
  const SUPPORT_FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

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


  function fmtMonthYear(date) {
    const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    return `${capitalizeFirst(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  }

  function monthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function parseMonthValue(value) {
    const [year, month] = String(value || '').split('-').map(Number);
    return year && month ? new Date(year, month - 1, 1) : new Date();
  }

  function allKnownMonthOptions() {
    const dates = [todayIso(), ...state.records.map(r => r.date), ...state.days.map(d => d.date), ...state.holidays.map(h => h.date)].filter(Boolean).sort();
    const first = dates.length ? new Date(dates[0] + 'T00:00:00') : new Date();
    const last = new Date();
    const maxKnown = dates.length ? new Date(dates[dates.length - 1] + 'T00:00:00') : last;
    const end = maxKnown > last ? maxKnown : last;
    const start = new Date(first.getFullYear(), first.getMonth(), 1);
    const months = [];
    for (let d = new Date(start); d <= new Date(end.getFullYear(), end.getMonth(), 1); d.setMonth(d.getMonth() + 1)) {
      months.push({ value: monthValue(d), label: fmtMonthYear(d) });
    }
    return months;
  }

  function renderTopMonthSelector() {
    const select = $('#globalMonthSelect');
    if (!select) return;
    const selected = monthValue(state.viewDate);
    select.innerHTML = allKnownMonthOptions().map(m => `<option value="${m.value}" ${m.value === selected ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('');
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

  function capitalizeFirst(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function ensureFinalPunctuation(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    return /[.!?]$/.test(value) ? value : value + '.';
  }

  function cleanObservationText(text) {
    return ensureFinalPunctuation(capitalizeFirst(String(text || '').replace(/\s+/g, ' ').trim()));
  }

  function normalizeForDictionary(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  const OBSERVATION_WORD_CORRECTIONS = Object.freeze({
    q: 'que', ke: 'que', k: 'que', qe: 'que', xq: 'porque', pq: 'porque', pk: 'porque', porq: 'porque', porqe: 'porque', porquee: 'porque',
    d: 'de', dl: 'del', cn: 'con', cmo: 'como', tmb: 'también', tambn: 'también', bn: 'bien', ps: 'pues',
    ud: 'usted', uds: 'ustedes', profe: 'docente', profesor: 'docente', profesora: 'docente',
    bino: 'vino', vno: 'vino', asistio: 'asistió', asistira: 'asistirá', asistiria: 'asistiría', inasistio: 'inasistió',
    falto: 'faltó', llego: 'llegó', llegara: 'llegará', llegaria: 'llegaría', salio: 'salió', retiro: 'retiró', regreso: 'regresó',
    aviso: 'avisó', avizo: 'avisó', avixo: 'avisó', abiso: 'avisó', abizo: 'avisó', notifico: 'notificó', reporto: 'reportó',
    informo: 'informó', comunico: 'comunicó', manifesto: 'manifestó', solicito: 'solicitó', presento: 'presentó', entrego: 'entregó',
    envio: 'envió', mando: 'mandó', adjunto: 'adjuntó', compartio: 'compartió', explico: 'explicó', pidio: 'pidió',
    wasap: 'WhatsApp', wasapp: 'WhatsApp', watsap: 'WhatsApp', whatsap: 'WhatsApp', whatsaap: 'WhatsApp', whatssap: 'WhatsApp',
    whatsapp: 'WhatsApp', whasap: 'WhatsApp', whasapp: 'WhatsApp', guasap: 'WhatsApp', wsp: 'WhatsApp', wpp: 'WhatsApp', wapp: 'WhatsApp', wp: 'WhatsApp',
    msj: 'mensaje', msg: 'mensaje', mjs: 'mensaje', sms: 'mensaje', cel: 'celular', celu: 'celular', telefono: 'teléfono', telefonico: 'telefónico',
    medica: 'médica', medico: 'médico', medicas: 'médicas', medicos: 'médicos', cita: 'cita', eps: 'EPS',
    incapacidad: 'incapacidad', incapacida: 'incapacidad', incap: 'incapacidad', remision: 'remisión', formula: 'fórmula', diagnostico: 'diagnóstico',
    hospitalizacion: 'hospitalización', urgencia: 'urgencia', urgencias: 'urgencias', consulta: 'consulta', control: 'control',
    excusa: 'excusa', escusa: 'excusa', soporte: 'soporte', soport: 'soporte', constancia: 'constancia', certificacion: 'certificación',
    calamidad: 'calamidad', domestica: 'doméstica', familiar: 'familiar', fallecimiento: 'fallecimiento', enfermedad: 'enfermedad',
    permiso: 'permiso', sindicado: 'sindical', sindical: 'sindical', reunion: 'reunión', capacitación: 'capacitación', capacitacion: 'capacitación',
    rectoria: 'rectoría', coordinacion: 'coordinación', secretaria: 'secretaría', comision: 'comisión', servicio: 'servicio',
    jurado: 'jurado', votacion: 'votación', elecciones: 'elecciones', escrutinio: 'escrutinio',
    transporte: 'transporte', camioneros: 'camioneros', bloqueo: 'bloqueo', paro: 'paro', lluvia: 'lluvia', inundacion: 'inundación',
    institucion: 'institución', institucional: 'institucional', actividad: 'actividad', acompañamiento: 'acompañamiento', salida: 'salida',
    pedagogica: 'pedagógica', academica: 'académica', laboral: 'laboral', personal: 'personal', administrativo: 'administrativo',
    informacion: 'información', observacion: 'observación', justificacion: 'justificación', reemplazo: 'reemplazo', reemplasa: 'reemplaza',
    manana: 'mañana', dia: 'día', dias: 'días', sabado: 'sábado', miercoles: 'miércoles', tambien: 'también', despues: 'después',
    papa: 'papá', mama: 'mamá', hijo: 'hijo', hija: 'hija', esposo: 'esposo', esposa: 'esposa', acudiente: 'acudiente',
    llegaria: 'llegaría', llegara: 'llegará', tendra: 'tendrá', tenia: 'tenía', teniaa: 'tenía', debia: 'debía', podia: 'podía',
    esta: 'está', estan: 'están', estaba: 'estaba', habia: 'había', habiaa: 'había', haria: 'haría', realizo: 'realizó',
    realizara: 'realizará', realizaria: 'realizaría', envioo: 'envió', avisa: 'avisa', dice: 'dice'
  });

  const OBSERVATION_PHRASE_CORRECTIONS = [
    [/\bno\s+vino\b/gi, 'no asistió'],
    [/\bno\s+asistio\b/gi, 'no asistió'],
    [/\bno\s+quiso\b/gi, 'manifestó que no asistiría por decisión personal'],
    [/\bpor\s+que\b/gi, 'porque'],
    [/\bx\s+WhatsApp\b/gi, 'por WhatsApp'],
    [/\bpor\s+WhatsApp\b/gi, 'por WhatsApp'],
    [/\bpor\s+mensaje\s+de\s+WhatsApp\b/gi, 'por WhatsApp'],
    [/\bmensaje\s+por\s+WhatsApp\b/gi, 'mensaje por WhatsApp'],
    [/\benvio\s+mensaje\b/gi, 'envió mensaje'],
    [/\benvió\s+mensaje\s+por\s+WhatsApp\b/gi, 'informó por WhatsApp'],
    [/\bavisó\s+por\s+WhatsApp\b/gi, 'informó por WhatsApp'],
    [/\blo\s+avisó\s+por\s+WhatsApp\b/gi, 'lo informó por WhatsApp'],
    [/\bse\s+recibio\b/gi, 'se recibió'],
    [/\bse\s+recibió\s+excusa\b/gi, 'se recibió excusa'],
    [/\bsin\s+informacion\b/gi, 'sin información'],
    [/\bcita\s+medica\b/gi, 'cita médica'],
    [/\bincapacidad\s+medica\b/gi, 'incapacidad médica'],
    [/\bcalamidad\s+domestica\b/gi, 'calamidad doméstica'],
    [/\bjurado\s+de\s+votacion\b/gi, 'jurado de votación'],
    [/\bpermiso\s+sindical\b/gi, 'permiso sindical'],
    [/\bremision\s+medica\b/gi, 'remisión médica'],
    [/\breunion\s+institucional\b/gi, 'reunión institucional'],
    [/\bcompromiso\s+institucional\b/gi, 'compromiso institucional'],
    [/\bexcusa\s+medica\b/gi, 'excusa médica'],
    [/\bsoporte\s+medico\b/gi, 'soporte médico']
  ];

  function preserveBasicCase(original, replacement) {
    if (!original) return replacement;
    if (original === original.toUpperCase() && original.length > 1 && replacement.length <= 4) return replacement.toUpperCase();
    if (/^[A-ZÁÉÍÓÚÑ]/.test(original) && replacement !== 'WhatsApp' && replacement !== 'EPS') return capitalizeFirst(replacement);
    return replacement;
  }

  function applyObservationDictionary(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';

    value = value
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])(?=\S)/g, '$1 ');

    value = value.replace(/\b[\p{L}\p{N}_@.-]+\b/gu, token => {
      const normalized = normalizeForDictionary(token).replace(/^@/, '');
      const replacement = OBSERVATION_WORD_CORRECTIONS[normalized];
      return replacement ? preserveBasicCase(token, replacement) : token;
    });

    OBSERVATION_PHRASE_CORRECTIONS.forEach(([pattern, replacement]) => {
      value = value.replace(pattern, replacement);
    });

    value = value
      .replace(/\bno asistió porque manifestó que no asistiría por decisión personal\b/gi, 'no asistió porque manifestó que no asistiría por decisión personal')
      .replace(/\bno asistió porque informó\b/gi, 'no asistió e informó')
      .replace(/\bavisó que\b/gi, 'informó que')
      .replace(/\bdice que\b/gi, 'informa que')
      .replace(/\bme informó\b/gi, 'informó')
      .replace(/\bme avisó\b/gi, 'informó')
      .replace(/\bpor decisión personal por WhatsApp\b/gi, 'por decisión personal e informó por WhatsApp')
      .replace(/\s+/g, ' ')
      .trim();

    return cleanObservationText(capitalizeSentences(value));
  }

  function capitalizeSentences(text) {
    return String(text || '').replace(/(^|[.!?]\s+)([a-záéíóúñ])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  }

  function appendDictationText(current, addition) {
    const existing = String(current || '').trim();
    const added = cleanObservationText(addition);
    if (!existing) return added;
    return `${existing}${/[.!?]$/.test(existing) ? ' ' : '. '}${capitalizeFirst(added)}`.replace(/\s+/g, ' ').trim();
  }

  function showModal() {
    const modal = $('#modal');
    modal.classList.remove('closing');
    if (!modal.open) modal.showModal();
  }

  function closeModal() {
    const modal = $('#modal');
    if (!modal.open) return;
    modal.classList.add('closing');
    window.setTimeout(() => {
      if (modal.open) modal.close();
      modal.classList.remove('closing');
    }, 170);
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
    bindModalControls();
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

    $('#logoutBtn')?.addEventListener('click', async () => {
      if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
      await Api.logout();
      state.session = null;
      showLogin();
    });

    $('#syncBtn')?.addEventListener('click', syncNow);
  }

  function showLoginMsg(text, isError = true) {
    const msg = $('#loginMsg');
    msg.textContent = text;
    msg.style.background = isError ? '' : 'color-mix(in srgb, var(--success) 14%, var(--surface))';
    msg.classList.remove('hidden');
  }

  function bindModalControls() {
    $('#modalCloseBtn').addEventListener('click', closeModal);
    $('#modal').addEventListener('cancel', event => {
      event.preventDefault();
      closeModal();
    });
    $('#modal').addEventListener('click', event => {
      if (event.target === $('#modal')) closeModal();
    });
  }

  async function loadApp() {
    showMain();
    try {
      const data = await Api.bootstrap();
      Object.assign(state, data);
      state.settings = data.settings || defaultSettings();
      if ((!data.teachers?.length || !data.types?.length) && Api.apiErrors?.length) {
        const first = Api.apiErrors[0];
        toast(`Supabase no entregó datos de ${first.table}: ${first.message}. Ejecuta el parche SQL de permisos.` , 7000);
      }
      await fetchWeather();
      applyTheme();
      renderAll();
      await processPendingLocalCorrections({ silent: true, refresh: true });
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
      local_correction_enabled: true,
      save_original_observation: true
    };
  }

  function renderAll() {
    applyTheme();
    renderTopMonthSelector();
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
    $('#globalMonthSelect')?.addEventListener('change', event => {
      state.viewDate = parseMonthValue(event.target.value);
      state.pdfDate = new Date(state.viewDate);
      renderAll();
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
    const btn = $('#syncBtn') || $('#settingsSyncBtn');
    if (btn) btn.disabled = true;
    const result = await Api.syncQueue();
    const correctionResult = result.ok ? await processPendingLocalCorrections({ silent: true, refresh: false }) : { corrected: 0, failed: 0 };
    if (btn) btn.disabled = false;
    if (!result.ok && result.message) return toast(result.message);
    if (result.failed) return toast(`Sincronización parcial: ${result.synced} ok, ${result.failed} pendientes.`);
    await refreshData();

    const syncText = result.synced ? `Sincronizado: ${result.synced} cambios.` : 'Todo está sincronizado.';
    const correctionText = correctionResult.corrected ? ` Se corrigieron ${correctionResult.corrected} observación(es).` : '';
    const correctionFail = correctionResult.failed ? ` ${correctionResult.failed} corrección(es) siguen pendientes.` : '';
    toast(`${syncText}${correctionText}${correctionFail}`);
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

  function monthRecords(date = state.viewDate) {
    const y = date.getFullYear();
    const m = date.getMonth();
    return state.records.filter(r => !r.deleted_at && isSameMonth(r.date, y, m));
  }

  function monthDays(date = state.viewDate) {
    const y = date.getFullYear();
    const m = date.getMonth();
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

  function attachmentsForRecord(recordId) {
    return (state.attachments || []).filter(a => a.attendance_record_id === recordId);
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function supportFileSummary(files) {
    const list = [...(files || [])];
    if (!list.length) return 'Ningún soporte adjunto.';
    return list.map(f => `${f.name}${f.size ? ` (${formatFileSize(f.size)})` : ''}`).join(' · ');
  }

  async function uploadRecordSupports(recordPayload, files) {
    const selected = [...(files || [])];
    if (!selected.length) return { uploaded: 0, failed: 0 };
    if (!navigator.onLine) throw new Error('Los soportes solo se pueden subir con conexión.');

    let uploaded = 0;
    let failed = 0;
    for (const file of selected) {
      if (file.size > MAX_SUPPORT_FILE_SIZE) {
        failed += 1;
        console.warn('Soporte omitido por tamaño:', file.name);
        continue;
      }
      try {
        await Api.uploadAttachment({
          recordId: recordPayload.id,
          date: recordPayload.date,
          file,
          caption: `Soporte de ${recordPayload.date}`
        });
        uploaded += 1;
      } catch (err) {
        failed += 1;
        console.warn('No se pudo subir soporte:', file.name, err);
      }
    }
    return { uploaded, failed };
  }

  function computeStats(date = state.viewDate) {
    const records = monthRecords(date);
    const days = monthDays(date);
    const byTeacher = new Map();
    const byType = new Map();
    records.forEach(r => {
      byTeacher.set(r.teacher_id, (byTeacher.get(r.teacher_id) || 0) + 1);
      byType.set(r.absence_code, (byType.get(r.absence_code) || 0) + 1);
    });
    const topTeacherEntry = [...byTeacher.entries()].sort((a, b) => b[1] - a[1])[0];
    const topTypeEntry = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    const institutionalDays = days.filter(d => d.status === 'institucional').length;
    const pendingDays = pendingSchoolDays(date).length;
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

  function pendingSchoolDays(date = state.viewDate) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const targetMonthStart = new Date(y, m, 1);
    if (targetMonthStart > currentMonthStart) return [];
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

      <div class="grid three summary-three">
        <div class="stat-card"><small>Inasistencias del mes</small><strong>${stats.total}</strong><span>${MONTHS[state.viewDate.getMonth()]} ${state.viewDate.getFullYear()}</span></div>
        <div class="stat-card"><small>Días institucionales</small><strong>${stats.institutionalDays}</strong><span>Paro, asamblea, reunión, etc.</span></div>
        <div class="stat-card"><small>Días pendientes</small><strong>${stats.pendingDays}</strong><span>Por confirmar</span></div>
      </div>

      <div class="panel" style="margin-top:12px;">
        <h3>Docente con más novedades</h3>
        <p class="muted">${escapeHtml(stats.topTeacher)}</p>
      </div>

      <div class="panel" style="margin-top:12px;">
        <h3>Inasistencias por día</h3>
        ${renderDailyAbsenceChart(state.viewDate)}
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


  function renderDailyAbsenceChart(date = state.viewDate) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const byDay = new Map();
    state.records.filter(r => !r.deleted_at && isSameMonth(r.date, y, m)).forEach(r => {
      if (!byDay.has(r.date)) byDay.set(r.date, new Set());
      byDay.get(r.date).add(r.teacher_id);
    });
    const values = Array.from({ length: last }, (_, i) => {
      const iso = new Date(y, m, i + 1).toISOString().slice(0, 10);
      return byDay.get(iso)?.size || 0;
    });
    const max = Math.max(1, ...values);
    const hasData = values.some(v => v > 0);
    if (!hasData) return '<p class="muted">Todavía no hay registros este mes.</p>';
    return `<div class="daily-chart" role="img" aria-label="Docentes ausentes por día del mes">
      <div class="daily-axis-y"><span>${max}</span><span>0</span></div>
      <div class="daily-bars">
        ${values.map((value, i) => {
          const h = Math.max(value ? 10 : 0, Math.round((value / max) * 100));
          return `<div class="daily-bar-wrap" title="Día ${i + 1}: ${value} docente${value === 1 ? '' : 's'}"><div class="daily-bar" style="height:${h}%"><span>${value || ''}</span></div><small>${i + 1}</small></div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderCalendario() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const title = `${MONTHS[month]} ${year}`;
    const stats = computeStats();
    $('#tabCalendario').innerHTML = `
      <div class="calendar-title-row">
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="calendar-grid">
        ${['D','L','M','M','J','V','S'].map(d => `<div class="weekday">${d}</div>`).join('')}
        ${calendarCells(year, month)}
      </div>
      <div class="grid three summary-three" style="margin-top:12px;">
        <div class="stat-card"><small>Registros</small><strong>${stats.total}</strong></div>
        <div class="stat-card"><small>Institucionales</small><strong>${stats.institutionalDays}</strong></div>
        <div class="stat-card"><small>Pendientes</small><strong>${stats.pendingDays}</strong></div>
      </div>
      <div class="panel calendar-month-list-panel" style="margin-top:12px;">
        <h3>Detalle del mes</h3>
        <p class="tiny muted">Registros organizados desde la fecha más reciente hasta la más antigua.</p>
        ${renderCalendarMonthDetailList(year, month)}
      </div>
    `;
    $$('.day-cell:not(.out)', $('#tabCalendario')).forEach(cell => cell.addEventListener('click', () => openDayModal(cell.dataset.date)));
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
      const pill = classes.includes('pending')
        ? '<span class="day-pill pending-bubble">PENDIENTE</span>'
        : count
          ? `<span class="day-pill count-pill">${count}</span>`
          : dayRec?.status === 'institucional'
            ? `<span class="day-mini-note event-note">${escapeHtml(dayRec.institutional_type || dayRec.institutional_title || 'Evento')}</span>`
            : dayRec?.status === 'sin_novedades'
              ? '<span class="day-mini-note">Sin nov.</span>'
              : (isWeekend(iso) || holidaySet.has(iso)) ? '<span class="day-mini-note">No laboral</span>' : '';
      html += `<button class="${classes.join(' ')}" data-date="${iso}" data-count="${count}"><span class="day-num">${day}</span>${pill}</button>`;
    }
    return html;
  }

  function renderCalendarMonthDetailList(year, month) {
    const records = state.records
      .filter(r => !r.deleted_at && isSameMonth(r.date, year, month))
      .sort((a, b) => b.date.localeCompare(a.date) || (teacherById(a.teacher_id)?.full_name || '').localeCompare(teacherById(b.teacher_id)?.full_name || '', 'es'));
    const dayEvents = state.days
      .filter(d => isSameMonth(d.date, year, month) && (d.status === 'institucional' || d.status === 'no_laboral'))
      .map(d => ({ ...d, __kind: 'day' }));

    const grouped = new Map();
    [...records, ...dayEvents].forEach(item => {
      const key = item.date;
      if (!grouped.has(key)) grouped.set(key, { records: [], events: [] });
      if (item.__kind === 'day') grouped.get(key).events.push(item);
      else grouped.get(key).records.push(item);
    });

    const dates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
    if (!dates.length) return '<p class="muted">Este mes todavía no tiene registros ni eventos institucionales.</p>';

    return `<div class="calendar-detail-list">${dates.map(date => {
      const group = grouped.get(date);
      return `<section class="calendar-date-group">
        <h4>${escapeHtml(fmtLong(date))}</h4>
        ${group.events.map(ev => `<div class="calendar-detail-item institutional-line"><span class="badge blue">${escapeHtml(ev.institutional_type || 'Evento')}</span><strong>${escapeHtml(ev.institutional_title || ev.institutional_type || 'Evento institucional')}</strong>${ev.observation ? `<p>${escapeHtml(ev.observation)}</p>` : ''}</div>`).join('')}
        ${group.records.map(r => {
          const teacher = teacherById(r.teacher_id)?.full_name || 'Docente';
          return `<div class="calendar-detail-item">
            <div class="calendar-detail-title"><span class="badge fuchsia">${escapeHtml(r.absence_code)}</span><strong>${escapeHtml(teacher)}</strong></div>
            <p>${escapeHtml(r.observation_final || 'Sin observación.')}${r.replacement_name ? `<br><strong>Reemplazo:</strong> ${escapeHtml(r.replacement_name)}` : ''}</p>
          </div>`;
        }).join('')}
      </section>`;
    }).join('')}</div>`;
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
      <div class="day-actions-list">
        <button type="button" class="report-btn report-card-btn" id="addRecordBtn"><strong>Registrar novedad docente</strong><span>Agrega una inasistencia, permiso, reemplazo u otra novedad del día.</span></button>
        <button type="button" class="report-btn report-card-btn" id="dayNoNewsBtn"><strong>Marcar sin novedades</strong><span>Confirma que este día fue revisado y no hubo novedades docentes.</span></button>
        <button type="button" class="report-btn report-card-btn" id="institutionalBtn"><strong>Evento institucional</strong><span>Registra paro, asamblea, reunión, comisión, festivo u otro evento del colegio.</span></button>
      </div>
      ${day && (day.status === 'institucional' || day.status === 'no_laboral' || day.observation) ? `<div class="panel">${day.institutional_type ? `<strong>${escapeHtml(day.institutional_type)}</strong><br>` : ''}<span class="muted">${escapeHtml(day.observation || day.institutional_title || '')}</span></div>` : ''}
      <h3>Registros del día</h3>
      ${records.length ? `<div class="list">${records.map(r => recordListItem(r)).join('')}</div>` : '<p class="muted">Sin registros de docentes en este día.</p>'}
    `;
    showModal();
    $('#addRecordBtn').addEventListener('click', () => openAttendanceForm(dateStr));
    $('#dayNoNewsBtn').addEventListener('click', () => markNoNews(dateStr));
    $('#institutionalBtn').addEventListener('click', () => openInstitutionalForm(dateStr));
    $$('[data-view-supports]', content).forEach(b => b.addEventListener('click', () => openSupportsModal(b.dataset.viewSupports)));
    $$('[data-edit-record]', content).forEach(b => b.addEventListener('click', () => openAttendanceForm(dateStr, b.dataset.editRecord)));
    $$('[data-delete-record]', content).forEach(b => b.addEventListener('click', () => deleteRecord(b.dataset.deleteRecord)));
  }

  function recordListItem(r) {
    const t = teacherById(r.teacher_id);
    const type = typeByCode(r.absence_code);
    const supportCount = attachmentsForRecord(r.id).length;
    const supportBadge = r.has_attachments || supportCount ? `<span class="badge blue">📎 ${supportCount || 'Soporte'}</span>` : '';
    const supportButton = r.has_attachments || supportCount ? `<button type="button" class="ghost-btn" data-view-supports="${r.id}">Ver soportes</button>` : '';
    return `<div class="list-item">
      <div class="item-title"><span>${escapeHtml(t?.full_name || 'Docente')}</span><span>${supportBadge}<span class="badge fuchsia">${escapeHtml(r.absence_code)}</span></span></div>
      <div class="item-meta">${escapeHtml(type?.name || r.absence_code)}${r.replacement_name ? ` · Reemplazo: ${escapeHtml(r.replacement_name)}` : ''}<br>${escapeHtml(r.observation_final || '')}</div>
      <div class="item-actions">${supportButton}<button type="button" class="secondary-btn" data-edit-record="${r.id}">Editar</button><button type="button" class="danger-btn" data-delete-record="${r.id}">Eliminar</button></div>
    </div>`;
  }

  function openSupportsModal(recordId) {
    const record = state.records.find(r => r.id === recordId);
    const teacher = record ? teacherById(record.teacher_id) : null;
    const supports = attachmentsForRecord(recordId);
    $('#modalContent').innerHTML = `
      <h2>Soportes adjuntos</h2>
      <p class="muted">${escapeHtml(teacher?.full_name || 'Docente')} · ${record?.date ? escapeHtml(fmtShort(record.date)) : ''}</p>
      ${supports.length ? `<div class="list">${supports.map(a => `
        <div class="list-item">
          <div class="item-title"><span>${escapeHtml(a.file_name || 'Soporte')}</span><span class="badge blue">${escapeHtml(formatFileSize(a.file_size) || 'Archivo')}</span></div>
          <div class="item-meta">${escapeHtml(a.mime_type || 'Archivo adjunto')}${a.caption ? `<br>${escapeHtml(a.caption)}` : ''}</div>
          <div class="item-actions"><button type="button" class="secondary-btn" data-open-support="${escapeHtml(a.storage_path)}">Abrir</button></div>
        </div>`).join('')}</div>` : '<p class="muted">Este registro está marcado con soporte, pero no se encontraron archivos asociados en la caché local. Sincroniza y vuelve a intentar.</p>'}
    `;
    showModal();
    $$('[data-open-support]', $('#modalContent')).forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const url = await Api.getAttachmentUrl(btn.dataset.openSupport);
          window.open(url, '_blank', 'noopener');
        } catch (err) {
          console.error(err);
          toast('No se pudo abrir el soporte. Revisa conexión/permisos del bucket.');
        }
      });
    });
  }

  function correctionStatus(text, active = false) {
    const status = $('#correctionStatus');
    if (!status) return;
    status.textContent = text;
    status.classList.remove('hidden');
    status.classList.toggle('listening', !!active);
  }

  async function pendingLocalCorrections() {
    const queue = await LocalDB.get(LOCAL_CORRECTION_QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  }

  async function queueLocalCorrection(item) {
    const queue = await pendingLocalCorrections();
    const nextItem = {
      id: item.id,
      raw: String(item.raw || '').trim(),
      payload: item.payload,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const idx = queue.findIndex(q => q.id === nextItem.id);
    if (idx >= 0) queue[idx] = { ...queue[idx], ...nextItem };
    else queue.push(nextItem);
    await LocalDB.set(LOCAL_CORRECTION_QUEUE_KEY, queue);
  }

  async function removeLocalCorrection(id) {
    const queue = await pendingLocalCorrections();
    await LocalDB.set(LOCAL_CORRECTION_QUEUE_KEY, queue.filter(q => q.id !== id));
  }

  function correctObservationLocal(rawText) {
    return applyObservationDictionary(rawText);
  }

  async function processPendingLocalCorrections({ silent = false, refresh = false } = {}) {
    const queue = await pendingLocalCorrections();
    if (!queue.length) return { corrected: 0, failed: 0 };

    let correctedCount = 0;
    let failedCount = 0;

    for (const item of queue.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
      try {
        const raw = String(item.raw || item.payload?.observation_original || item.payload?.observation_final || '').trim();
        if (!raw) {
          await removeLocalCorrection(item.id);
          continue;
        }

        const corrected = correctObservationLocal(raw);
        const payload = {
          ...item.payload,
          id: item.id,
          observation_original: raw,
          observation_corrected: corrected,
          observation_final: corrected
        };

        const result = await Api.saveAttendance(payload);
        if (result?.queued) {
          failedCount += 1;
          await queueLocalCorrection({ ...item, payload });
          continue;
        }

        await removeLocalCorrection(item.id);
        correctedCount += 1;
      } catch (err) {
        failedCount += 1;
        console.warn('No se pudo aplicar la corrección local pendiente:', err);
      }
    }

    if (correctedCount && refresh) await refreshData();
    if (correctedCount && !silent) toast(`Se corrigieron ${correctedCount} observación(es) pendiente(s).`);
    if (failedCount && !silent) toast(`${failedCount} corrección(es) siguen pendientes por sincronización.`);
    return { corrected: correctedCount, failed: failedCount };
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
        <label class="field"><span>Observación</span><textarea id="recObservation" placeholder="Ej: no vino xq avisó por wasap que tenía cita médica.">${escapeHtml(record?.observation_final || record?.observation_original || '')}</textarea></label>
        <input id="supportInput" type="file" accept="${SUPPORT_FILE_ACCEPT}" multiple hidden>
        <div class="actions-row" style="margin:0;">
          <button type="button" class="secondary-btn" id="attachSupportBtn">Adjuntar soportes</button>
        </div>
        <p class="tiny muted" id="supportSummary">${record?.has_attachments ? 'Este registro ya tiene soporte(s) guardado(s). Puedes adjuntar más si hace falta.' : 'Ningún soporte adjunto.'}</p>
        <div id="correctionStatus" class="voice-status hidden" aria-live="polite"></div>
        <p class="tiny muted">El botón corrige localmente abreviaturas, tildes, mayúsculas y palabras comunes antes de guardar. No requiere conexión. Los soportes sí requieren conexión para subirse.</p>
        <button type="button" class="primary-btn" id="saveRecordBtn">Corregir y enviar</button>
      </div>
    `;
    const recType = $('#recType');
    const replacementField = $('#replacementField');
    const toggleReplacement = () => replacementField.style.display = recType.value === 'RM' ? 'grid' : 'none';
    recType.addEventListener('change', toggleReplacement);
    toggleReplacement();

    let selectedSupportFiles = [];
    $('#attachSupportBtn')?.addEventListener('click', () => $('#supportInput')?.click());
    $('#supportInput')?.addEventListener('change', event => {
      const files = [...(event.target.files || [])];
      const valid = [];
      const tooLarge = [];
      files.forEach(file => {
        if (file.size > MAX_SUPPORT_FILE_SIZE) tooLarge.push(file.name);
        else valid.push(file);
      });
      selectedSupportFiles = valid;
      $('#supportSummary').textContent = supportFileSummary(valid);
      if (tooLarge.length) toast(`Soporte(s) omitido(s) por superar 10 MB: ${tooLarge.join(', ')}`, 6000);
    });

    $('#saveRecordBtn').addEventListener('click', async () => {
      const btn = $('#saveRecordBtn');
      const rawObservation = $('#recObservation').value.trim();
      const recordIdValue = record?.id || crypto.randomUUID();
      const basePayload = {
        id: recordIdValue,
        date: $('#recDate').value,
        teacher_id: $('#recTeacher').value,
        absence_code: $('#recType').value,
        observation_original: rawObservation || null,
        observation_corrected: null,
        observation_final: cleanObservationText(rawObservation),
        replacement_name: $('#recType').value === 'RM' ? $('#recReplacement').value.trim() : null,
        has_attachments: record?.has_attachments || false
      };

      if (!basePayload.date || !basePayload.teacher_id || !basePayload.absence_code) return toast('Faltan datos obligatorios.');
      if (!rawObservation) return toast('Escribe una observación.');

      btn.disabled = true;
      correctionStatus('Corrigiendo observación...', true);
      const corrected = correctObservationLocal(rawObservation);
      $('#recObservation').value = corrected;

      const payload = {
        ...basePayload,
        observation_corrected: corrected,
        observation_final: corrected
      };

      correctionStatus('Corrección lista. Guardando novedad...', false);
      const saveResult = await Api.saveAttendance(payload);
      await Api.saveDayRecord({ date: payload.date, status: 'con_novedades', is_school_day: true });
      if (saveResult?.queued) await queueLocalCorrection({ id: recordIdValue, raw: rawObservation, payload });

      let supportResult = { uploaded: 0, failed: 0 };
      if (selectedSupportFiles.length) {
        if (saveResult?.queued || !navigator.onLine) {
          supportResult.failed = selectedSupportFiles.length;
          toast('La novedad se guardó, pero los soportes necesitan conexión para subirse.', 6000);
        } else {
          correctionStatus('Subiendo soporte(s)...', true);
          supportResult = await uploadRecordSupports(payload, selectedSupportFiles);
          if (supportResult.uploaded) {
            await Api.saveAttendance({ ...payload, has_attachments: true });
          }
        }
      }

      btn.disabled = false;
      closeModal();
      await refreshData();

      if (saveResult?.queued) toast('Novedad corregida localmente y guardada en cola para sincronizar.');
      else if (selectedSupportFiles.length) toast(`Novedad guardada. Soportes subidos: ${supportResult.uploaded}. Fallidos: ${supportResult.failed}.`, 6000);
      else toast('Novedad corregida y guardada.');
    });
  }

  async function markNoNews(dateStr) {
    await Api.saveDayRecord({ date: dateStr, status: 'sin_novedades', is_school_day: true, observation: 'Día registrado sin novedades.' });
    closeModal();
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
      closeModal();
      await refreshData();
      toast('Evento institucional guardado.');
    });
  }

  async function deleteRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    const name = teacherById(rec.teacher_id)?.full_name || 'Docente';
    const type = typeByCode(rec.absence_code)?.name || rec.absence_code;
    $('#modalContent').innerHTML = `
      <h2>¿Eliminar esta novedad?</h2>
      <div class="panel danger-panel">
        <p><strong>Docente:</strong> ${escapeHtml(name)}</p>
        <p><strong>Fecha:</strong> ${escapeHtml(fmtShort(rec.date))}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(type)} (${escapeHtml(rec.absence_code)})</p>
        <p class="muted">La novedad no se borra físicamente: queda marcada como eliminada para poder auditarla después.</p>
      </div>
      <div class="actions-row">
        <button type="button" class="secondary-btn" id="cancelDeleteBtn">Cancelar</button>
        <button type="button" class="danger-btn" id="confirmDeleteBtn">Eliminar</button>
      </div>`;
    showModal();
    $('#cancelDeleteBtn').addEventListener('click', () => openDayModal(rec.date));
    $('#confirmDeleteBtn').addEventListener('click', async () => {
      await Api.softDeleteAttendance(id);
      closeModal();
      await refreshData();
      toast('Novedad eliminada.');
    });
  }

  function renderDocentes() {
    if (state.selectedTeacherId) {
      const t = state.teachers.find(x => x.id === state.selectedTeacherId);
      if (!t) state.selectedTeacherId = null;
      else {
        const recs = state.records.filter(r => !r.deleted_at && r.teacher_id === t.id).sort((a, b) => b.date.localeCompare(a.date));
        const selectedYear = state.viewDate.getFullYear();
        $('#tabDocentes').innerHTML = teacherDetailHtml(t, recs, selectedYear);
        bindTeacherDetailEvents(t, recs, selectedYear);
        return;
      }
    }

    const rows = [...state.teachers].sort((a, b) => (b.active === true) - (a.active === true) || a.full_name.localeCompare(b.full_name, 'es'));
    const counts = new Map();
    monthRecords(state.viewDate).forEach(r => counts.set(r.teacher_id, (counts.get(r.teacher_id) || 0) + 1));
    $('#tabDocentes').innerHTML = `
      <div class="section-title-row docentes-title-row">
        <div>
          <h2>Docentes</h2>
          <p class="tiny muted">Novedades de ${escapeHtml(fmtMonthYear(state.viewDate))}. Cambia el mes desde la barra superior.</p>
        </div>
        <button class="primary-btn" id="newTeacherBtn">Agregar docente</button>
      </div>
      <div class="search-row"><input id="teacherSearch" placeholder="Buscar docente..."></div>
      <div class="list" id="teacherList">
        ${rows.map(t => teacherItem(t, counts.get(t.id) || 0)).join('')}
      </div>`;
    $('#newTeacherBtn').addEventListener('click', () => openTeacherForm());
    $('#teacherSearch').addEventListener('input', e => {
      const q = normalizeText(e.target.value);
      $$('.teacher-row').forEach(row => row.style.display = normalizeText(row.dataset.name).includes(q) ? '' : 'none');
    });
    $$('.teacher-row').forEach(row => row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openTeacherDetail(row.dataset.openTeacherRow);
    }));
    $$('.teacher-row [data-open-teacher]').forEach(btn => btn.addEventListener('click', () => openTeacherDetail(btn.dataset.openTeacher)));
    $$('.teacher-row [data-edit-teacher]').forEach(btn => btn.addEventListener('click', () => openTeacherForm(btn.dataset.editTeacher)));
  }

  function teacherItem(t, count) {
    return `<div class="list-item teacher-row clickable-row" data-name="${escapeHtml(t.full_name)}" data-open-teacher-row="${t.id}">
      <div class="item-title"><span>${escapeHtml(t.full_name)}</span><span class="badge ${t.active ? 'green' : 'gray'}">${t.active ? 'Activa' : 'Inactiva'}</span></div>
      <div class="item-meta">${escapeHtml(t.role)} · ${escapeHtml(t.campus)} · ${count} novedad${count === 1 ? '' : 'es'} en ${escapeHtml(fmtMonthYear(state.viewDate))}</div>
      <div class="item-actions"><button class="secondary-btn" data-open-teacher="${t.id}">Ver detalle</button><button class="ghost-btn" data-edit-teacher="${t.id}">Editar</button></div>
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
    showModal();
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
      closeModal();
      await refreshData();
      toast('Docente guardado.');
    });
  }

  function openTeacherDetail(id) {
    const t = state.teachers.find(x => x.id === id);
    if (!t) return toast('No encontré ese docente.');
    state.selectedTeacherId = id;
    if (state.currentTab !== 'tabDocentes') switchTab('tabDocentes', false);
    renderDocentes();
  }

  function getTeacherRecordYears(recs) {
    const years = [...new Set(recs.map(r => new Date(r.date + 'T00:00:00').getFullYear()))].sort((a, b) => b - a);
    const currentYear = state.viewDate.getFullYear();
    return years.length ? years : [currentYear];
  }

  function teacherDetailHtml(t, recs, selectedYear) {
    const first = recs.length ? recs[recs.length - 1].date : null;
    const last = recs.length ? recs[0].date : null;
    const yearRecs = recs.filter(r => new Date(r.date + 'T00:00:00').getFullYear() === selectedYear);
    const monthRecs = yearRecs.filter(r => isSameMonth(r.date, state.viewDate.getFullYear(), state.viewDate.getMonth()));
    return `
      <div class="teacher-page-head">
        <button class="secondary-btn" id="backTeachersBtn">← Volver</button>
        <button class="ghost-btn" id="editTeacherFromDetailBtn">Editar docente</button>
      </div>
      <div class="panel teacher-detail-page">
        <h2>${escapeHtml(t.full_name)}</h2>
        <div class="teacher-detail-grid teacher-info-only">
          <div class="info-chip"><small>Cargo</small><strong>${escapeHtml(t.role || 'Docente')}</strong></div>
          <div class="info-chip"><small>Sede</small><strong>${escapeHtml(t.campus || 'Sin sede')}</strong></div>
          <div class="info-chip"><small>Estado</small><strong>${t.active !== false ? 'Activa' : 'Inactiva'}</strong></div>
        </div>
        ${t.notes ? `<div class="compact-panel"><h3>Notas</h3><p>${escapeHtml(t.notes)}</p></div>` : ''}
      </div>

      <div class="panel compact-panel">
        <div class="section-title-row one-col-title">
          <div>
            <h3>Inasistencias por mes</h3>
          </div>
        </div>
        <div id="teacherMonthlyChartWrap">${renderTeacherMonthlyChart(recs, selectedYear)}</div>
      </div>

      <div class="panel compact-panel">
        <h3>Tabla mes a mes con detalle</h3>
        <div id="teacherMonthlyTableWrap">${renderTeacherMonthlyTable(recs, selectedYear)}</div>
      </div>`;
  }

  function bindTeacherDetailEvents(t, recs, selectedYear) {
    $('#backTeachersBtn')?.addEventListener('click', () => {
      state.selectedTeacherId = null;
      renderDocentes();
    });
    $('#editTeacherFromDetailBtn')?.addEventListener('click', () => openTeacherForm(t.id));
  }

  function teacherMonthlyCounts(recs, year) {
    const counts = Array(12).fill(0);
    recs.forEach(r => {
      const d = new Date(r.date + 'T00:00:00');
      if (d.getFullYear() === year) counts[d.getMonth()] += 1;
    });
    return counts;
  }

  function renderTeacherMonthlyChart(recs, year) {
    const counts = teacherMonthlyCounts(recs, year);
    const max = Math.max(1, ...counts);
    const hasData = counts.some(v => v > 0);
    if (!hasData) return `<p class="muted">Este docente no tiene inasistencias registradas en ${year}.</p>`;
    return `<div class="teacher-month-chart" role="img" aria-label="Inasistencias mensuales de ${year}">
      <div class="teacher-axis-y"><span>${max}</span><span>0</span></div>
      <div class="teacher-month-bars">
        ${counts.map((value, i) => {
          const h = Math.max(value ? 12 : 0, Math.round((value / max) * 100));
          const label = MONTHS[i].slice(0, 3);
          return `<div class="teacher-month-bar-wrap" title="${escapeHtml(MONTHS[i])}: ${value} inasistencia${value === 1 ? '' : 's'}"><div class="teacher-month-bar" style="height:${h}%"><span>${value || ''}</span></div><small>${escapeHtml(label)}</small></div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderTeacherMonthlyTable(recs, year) {
    const rows = Array.from({ length: 12 }, (_, month) => {
      const monthRecs = recs
        .filter(r => {
          const d = new Date(r.date + 'T00:00:00');
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      const details = monthRecs.length
        ? `<div class="teacher-month-detail-list">${monthRecs.map(r => `
            <div class="teacher-month-detail-item">
              <div class="teacher-detail-line"><span class="badge fuchsia">${escapeHtml(r.absence_code)}</span><strong>${escapeHtml(fmtShort(r.date))}</strong></div>
              <p>${escapeHtml(r.observation_final || 'Sin observación.')}${r.replacement_name ? `<br><strong>Reemplazo:</strong> ${escapeHtml(r.replacement_name)}` : ''}</p>
            </div>`).join('')}</div>`
        : '<span class="muted">Sin inasistencias</span>';
      return `<tr><td>${escapeHtml(MONTHS[month])}</td><td><strong>${monthRecs.length}</strong></td><td>${details}</td></tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="mini-table teacher-combined-table"><thead><tr><th>Mes</th><th>Total</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderPdf() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    const stats = computeStats(state.viewDate);
    $('#tabPdf').innerHTML = `
      <div class="panel">
        <h2>Reportes</h2>
        <div class="grid three summary-three">
          <div class="stat-card"><small>Registros</small><strong>${stats.total}</strong></div>
          <div class="stat-card"><small>Pendientes</small><strong>${stats.pendingDays}</strong></div>
          <div class="stat-card"><small>Institucionales</small><strong>${stats.institutionalDays}</strong></div>
        </div>
        <div class="pdf-actions-list">
          <button class="report-btn report-card-btn" id="printPlanilla"><strong>Planilla mensual</strong><span>Calendario oficial del mes: docentes por filas, días por columnas, códigos, totales, observaciones, leyenda y firmas.</span></button>
          <button class="report-btn report-card-btn" id="printDetalle"><strong>Detalle mensual</strong><span>Listado vertical fila a fila con fecha, docente, tipo de inasistencia, observación y reemplazo si aplica.</span></button>
          <button class="report-btn report-card-btn" id="printResumen"><strong>Resumen por docente</strong><span>Informe vertical organizado por docente, con sus novedades del mes agrupadas para revisión individual.</span></button>
        </div>
        <div class="report-separator"></div>
        <button class="report-btn report-card-btn report-all-btn full" id="printTodo"><strong>Generar todo en uno</strong><span>Une planilla mensual, detalle mensual y resumen por docente en un solo documento listo para imprimir o guardar como PDF.</span></button>
      </div>`;
    $('#printPlanilla').addEventListener('click', () => printReport('planilla'));
    $('#printDetalle').addEventListener('click', () => printReport('detalle'));
    $('#printResumen').addEventListener('click', () => printReport('resumen'));
    $('#printTodo').addEventListener('click', () => printReport('todo'));
  }

  function reportData() {
    const y = state.viewDate.getFullYear();
    const m = state.viewDate.getMonth();
    return { settings: state.settings, teachers: state.teachers, types: state.types, records: monthRecords(state.viewDate), days: monthDays(state.viewDate), holidays: state.holidays, year: y, monthIndex: m };
  }

  function printReport(kind) {
    const data = reportData();
    if (kind === 'planilla') ReportPDF.printPlanilla(data);
    if (kind === 'detalle') ReportPDF.printDetalle(data);
    if (kind === 'resumen') ReportPDF.printResumenDocente(data);
    if (kind === 'todo') ReportPDF.printTodo(data);
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
          <button class="secondary-btn" id="settingsSyncBtn">Actualizar / sincronizar</button>
          <button class="secondary-btn" id="testNotificationBtn">Notificación de prueba</button>
          <button class="ghost-btn" id="exportBackupBtn">Exportar respaldo JSON</button>
          <button class="danger-btn" id="settingsLogoutBtn">Cerrar sesión en este dispositivo</button>
        </div>
        <p class="tiny muted">El botón de notificación solo prueba permisos e iconos en este dispositivo. Las push automáticas reales van luego con VAPID + Supabase Edge Functions.</p>
      </div>`;
    $('#saveSettingsBtn').addEventListener('click', saveSettings);
    $('#settingsSyncBtn').addEventListener('click', syncNow);
    $('#settingsLogoutBtn').addEventListener('click', async () => {
      if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
      await Api.logout();
      state.session = null;
      showLogin();
    });
    $('#testNotificationBtn').addEventListener('click', sendTestNotification);
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

  async function sendTestNotification() {
    if (!('Notification' in window)) return toast('Este navegador no soporta notificaciones.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('No se pudo enviar la notificación de prueba.');

    const options = {
      body: 'Prueba correcta: las notificaciones de Asistencia GGM se ven en este dispositivo.',
      icon: APP_ICON_URL,
      badge: NOTIFICATION_BADGE_URL,
      data: { url: './' }
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg?.showNotification) await reg.showNotification('Asistencia GGM', options);
        else new Notification('Asistencia GGM', options);
      } else {
        new Notification('Asistencia GGM', options);
      }
      toast('Notificación de prueba enviada.');
    } catch (err) {
      console.warn('No se pudo mostrar la notificación de prueba:', err);
      toast('Permiso concedido, pero la prueba no se pudo mostrar.');
    }
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
      email_recipients: state.recipients,
      attachments: state.attachments
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
