(function () {
  const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const WEEK = ['D','L','M','M','J','V','S'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function typeName(code, types) {
    return types.find(t => t.code === code)?.name || code;
  }

  function teacherName(id, teachers) {
    return teachers.find(t => t.id === id)?.full_name || 'Docente';
  }

  function monthTitle(year, monthIndex) {
    return `${MONTHS[monthIndex]} ${year}`;
  }

  function reportHeader(settings, title) {
    const s = settings || {};
    return `
      <div style="text-align:center; margin-bottom:12px;">
        <h2 style="font-size:14px; margin:0; font-weight:900;">${escapeHtml(s.letterhead_bold || s.institution_name || 'INSTITUCIÓN EDUCATIVA DEPARTAMENTAL GABRIEL GARCÍA MÁRQUEZ')}</h2>
        <div style="font-size:11px; margin-top:3px;">${escapeHtml(s.letterhead_normal || 'ARACATACA - MAGDALENA')}</div>
        <div style="font-size:10px; margin-top:3px;">NIT. ${escapeHtml(s.nit || '800096058-1')} &nbsp; DANE ${escapeHtml(s.dane || '147053000151')}</div>
        <h1 style="font-size:15px; margin:12px 0 0; font-weight:900;">${escapeHtml(title)}</h1>
      </div>
    `;
  }

  function signatures(settings) {
    const s = settings || {};
    return `
      <div class="report-signatures">
        <div>
          <strong>${escapeHtml(s.coordinator_name || 'Madeleine Blanco Manotas')}</strong><br>
          <span>${escapeHtml(s.coordinator_title || 'Coordinadora')}</span>
        </div>
        <div>
          <strong>${escapeHtml(s.rector_name || 'Shirly Luna')}</strong><br>
          <span>${escapeHtml(s.rector_title || 'Rectora')}</span>
        </div>
      </div>
    `;
  }

  function openPrintWindow(html, title) {
    const win = window.open('', '_blank');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        @page { size: landscape; margin: 8mm; }
        body { font-family: Montserrat, Arial, sans-serif; margin: 0; color: #111; }
        .report-page { background: #fff; padding: 0; }
        .report-table { width: 100%; border-collapse: collapse; font-size: 8.7px; }
        .report-table th, .report-table td { border: 1px solid #333; padding: 2px 3px; vertical-align: top; }
        .report-table th { background: #f1f1f1; font-weight: 900; }
        .weekend { background: #ddd !important; }
        .institutional { background: #fff3aa !important; }
        .vertical { writing-mode: vertical-rl; transform: rotate(180deg); max-height: 70px; overflow:hidden; font-size: 7px; font-weight: 800; }
        .report-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; margin-top: 36px; text-align: center; font-size: 11px; }
        .report-signatures div { border-top: 1px solid #111; padding-top: 6px; }
        .legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 9px; }
        .page-break { page-break-before: always; }
        @media print { button { display: none; } }
      </style></head><body>${html}<script>setTimeout(function(){window.print()},300)</script></body></html>`);
    win.document.close();
  }

  function buildPlanilla({ settings, teachers, types, records, days, holidays, year, monthIndex }) {
    const title = `ASISTENCIA DOCENTES MES ${monthTitle(year, monthIndex)}`;
    const last = new Date(year, monthIndex + 1, 0).getDate();
    const activeTeachers = teachers.filter(t => t.active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
    const byTeacherDate = new Map();
    records.filter(r => !r.deleted_at).forEach(r => byTeacherDate.set(`${r.teacher_id}|${r.date}`, [...(byTeacherDate.get(`${r.teacher_id}|${r.date}`) || []), r]));
    const dayMap = new Map(days.map(d => [d.date, d]));
    const holidaySet = new Set(holidays.map(h => h.date));

    const headDays = Array.from({ length: last }, (_, i) => {
      const day = i + 1;
      const d = new Date(year, monthIndex, day);
      const iso = d.toISOString().slice(0, 10);
      const dayRec = dayMap.get(iso);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(iso) || dayRec?.status === 'no_laboral';
      const isInst = dayRec?.status === 'institucional';
      const cls = isWeekend ? 'weekend' : isInst ? 'institutional' : '';
      const label = isInst ? (dayRec.institutional_type || dayRec.institutional_title || 'Evento') : WEEK[d.getDay()];
      return `<th class="${cls}"><div>${day}</div><div>${escapeHtml(WEEK[d.getDay()])}</div>${isInst ? `<div class="vertical">${escapeHtml(label)}</div>` : ''}</th>`;
    }).join('');

    const body = activeTeachers.map(t => {
      const counts = {};
      const obs = [];
      const cells = Array.from({ length: last }, (_, i) => {
        const day = i + 1;
        const d = new Date(year, monthIndex, day);
        const iso = d.toISOString().slice(0, 10);
        const dayRec = dayMap.get(iso);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(iso) || dayRec?.status === 'no_laboral';
        const isInst = dayRec?.status === 'institucional';
        const recs = byTeacherDate.get(`${t.id}|${iso}`) || [];
        const codeText = recs.map(r => r.absence_code).join(' / ');
        recs.forEach(r => {
          counts[r.absence_code] = (counts[r.absence_code] || 0) + 1;
          if (r.observation_final) obs.push(`${r.observation_final}${r.replacement_name ? ' Reemplazo: ' + r.replacement_name : ''}.`);
        });
        return `<td class="${isWeekend ? 'weekend' : isInst ? 'institutional' : ''}" style="text-align:center;font-weight:800;">${escapeHtml(codeText)}</td>`;
      }).join('');
      const summary = Object.entries(counts).map(([code, count]) => `${code}: ${count}`).join('<br>') || '0';
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return `<tr><td style="font-weight:800;min-width:120px;">${escapeHtml(t.full_name)}</td>${cells}<td>${summary}</td><td style="text-align:center;font-weight:900;">${total}</td><td style="min-width:180px;">${escapeHtml(obs.join(' '))}</td></tr>`;
    }).join('');

    const legend = types.map(t => `<span><strong>${escapeHtml(t.code)}:</strong> ${escapeHtml(t.name)}</span>`).join('');
    return `<div class="report-page">${reportHeader(settings, title)}<table class="report-table"><thead><tr><th>DOCENTE</th>${headDays}<th>RESUMEN</th><th>T</th><th>OBSERVACIÓN</th></tr></thead><tbody>${body}</tbody></table><div class="legend">${legend}</div>${signatures(settings)}</div>`;
  }

  function buildDetalle({ settings, teachers, types, records, year, monthIndex }) {
    const title = `DETALLE ASISTENCIA DOCENTES MES ${monthTitle(year, monthIndex)}`;
    const rows = records.filter(r => !r.deleted_at).sort((a, b) => (a.date || '').localeCompare(b.date || '') || teacherName(a.teacher_id, teachers).localeCompare(teacherName(b.teacher_id, teachers), 'es')).map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${escapeHtml(teacherName(r.teacher_id, teachers))}</td>
        <td>${escapeHtml(typeName(r.absence_code, types))}</td>
        <td>${escapeHtml(r.observation_final || '')}${r.replacement_name ? `<br><strong>Reemplazo:</strong> ${escapeHtml(r.replacement_name)}` : ''}</td>
      </tr>`).join('');
    return `<div class="report-page">${reportHeader(settings, title)}<table class="report-table" style="font-size:10px;"><thead><tr><th>FECHA</th><th>DOCENTE</th><th>INASISTENCIA</th><th>OBSERVACIÓN</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin registros en el mes.</td></tr>'}</tbody></table>${signatures(settings)}</div>`;
  }

  function buildResumenDocente({ settings, teachers, types, records, year, monthIndex }) {
    const title = `RESUMEN POR DOCENTE MES ${monthTitle(year, monthIndex)}`;
    const grouped = new Map();
    records.filter(r => !r.deleted_at).forEach(r => {
      const name = teacherName(r.teacher_id, teachers);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(r);
    });
    const sections = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, recs]) => `
      <h3 style="font-size:12px;margin:16px 0 5px;">${escapeHtml(name)} · Total: ${recs.length}</h3>
      <table class="report-table" style="font-size:9px;"><thead><tr><th>FECHA</th><th>TIPO</th><th>OBSERVACIÓN</th></tr></thead><tbody>
        ${recs.sort((a, b) => a.date.localeCompare(b.date)).map(r => `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(typeName(r.absence_code, types))}</td><td>${escapeHtml(r.observation_final || '')}${r.replacement_name ? ` Reemplazo: ${escapeHtml(r.replacement_name)}` : ''}</td></tr>`).join('')}
      </tbody></table>`).join('');
    return `<div class="report-page">${reportHeader(settings, title)}${sections || '<p>Sin registros en el mes.</p>'}${signatures(settings)}</div>`;
  }

  window.ReportPDF = {
    printPlanilla(data) { openPrintWindow(buildPlanilla(data), 'Planilla mensual'); },
    printDetalle(data) { openPrintWindow(buildDetalle(data), 'Detalle mensual'); },
    printResumenDocente(data) { openPrintWindow(buildResumenDocente(data), 'Resumen por docente'); },
    buildPlanilla,
    buildDetalle,
    buildResumenDocente
  };
})();
