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

  function dayClassesForPdf(date, dayRec, holidaySet) {
    const iso = date.toISOString().slice(0, 10);
    const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidaySet.has(iso) || dayRec?.status === 'no_laboral' || dayRec?.institutional_type === 'Festivo';
    const isInst = dayRec?.status === 'institucional';
    if (isInst) return { cell: 'institutional day-col', col: 'institutional-col', label: dayRec.institutional_type || dayRec.institutional_title || 'Evento institucional', institutional: true, bg: '#bdd7ee' };
    if (isHoliday) return { cell: 'holiday day-col', col: 'holiday-col', label: WEEK[date.getDay()], institutional: false, bg: '#d9d9d9' };
    if (isWeekendDay) return { cell: 'weekend day-col', col: 'weekend-col', label: WEEK[date.getDay()], institutional: false, bg: '#d9d9d9' };
    return { cell: 'day-col', col: 'day-col', label: WEEK[date.getDay()], institutional: false, bg: '' };
  }

  function bgStyle(meta) {
    return meta.bg ? ` style="background-color:${meta.bg} !important;"` : '';
  }

  function absenceAlertColor(total) {
    if (total >= 9) return '#f87171';
    if (total > 6) return '#fb923c';
    if (total > 3) return '#fde047';
    return '';
  }

  function cellBgStyle(color) {
    return color ? `background-color:${color} !important;` : '';
  }

  function reportHeader(settings, title) {
    const s = settings || {};
    const logoSrc = new URL('icons/logocole.png', window.location.href).href;
    return `
      <div style="text-align:center; margin-bottom:12px;">
        <img src="${logoSrc}" alt="Logo institucional" style="width:74px;height:74px;object-fit:contain;display:block;margin:0 auto 6px;">
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

  function basePrintStyles() {
    return `
        @page landscape-page { size: 330mm 215mm; margin: 7mm; }
        @page portrait-page { size: 215mm 330mm; margin: 11mm 9mm; }
        @page { size: 330mm 215mm; margin: 7mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: Calibri, Arial, sans-serif; margin: 0; color: #111; background: #fff; }
        .report-page { background: #fff; padding: 0; page-break-after: always; }
        .report-page:last-child { page-break-after: auto; }
        .report-page.landscape { page: landscape-page; }
        .report-page.portrait { page: portrait-page; }
        .report-table { width: 100%; border-collapse: collapse; font-size: 8.4px; }
        .report-table th, .report-table td { border: 1px solid #333; padding: 2px 3px; vertical-align: middle; }
        .report-table th { background-color: #f1f1f1 !important; font-weight: 900; }
        .planilla-table { table-layout: fixed; }
        .planilla-table th, .planilla-table td { overflow-wrap: anywhere; }
        .teacher-col { width: 96px; }
        .day-col { width: 18px; min-width: 18px; max-width: 18px; text-align: center; }
        .summary-col { width: 58px; }
        .total-col { width: 20px; text-align: center; }
        .obs-col { width: 168px; }
        col.weekend-col, col.holiday-col { background-color: #d9d9d9 !important; }
        col.institutional-col { background-color: #bdd7ee !important; }
        .weekend, .holiday { background-color: #d9d9d9 !important; }
        .institutional { background-color: #bdd7ee !important; }
        .vertical { writing-mode: vertical-rl; transform: rotate(180deg); height: 76px; margin: 2px auto 0; overflow:hidden; font-size: 6.7px; font-weight: 900; text-align:center; color:#0f172a; }
        .report-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 95px; margin-top: 78px; text-align: center; font-size: 11px; break-inside: avoid; }
        .report-signatures div { border-top: 1px solid #111; padding-top: 8px; min-height: 52px; }
        .legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; font-size: 9px; }
        .page-break { page-break-before: always; }
        .portrait .report-table { font-size: 10px; }

        .resumen-docente-table { table-layout: fixed; width: 100%; }
        .resumen-date-col { width: 26mm; }
        .resumen-type-col { width: 42mm; }
        .resumen-obs-col { width: auto; }
        .portrait h3 { break-after: avoid; }
        @media print { button { display: none; } }
    `;
  }

  function openPrintWindow(html, title, mode = 'landscape') {
    const win = window.open('', '_blank');
    const pageClass = mode === 'portrait' ? 'portrait' : 'landscape';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>${basePrintStyles()}</style></head><body class="${pageClass}">${html}<script>setTimeout(function(){window.print()},300)</script></body></html>`);
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

    const dayMeta = Array.from({ length: last }, (_, i) => {
      const day = i + 1;
      const d = new Date(year, monthIndex, day);
      const iso = d.toISOString().slice(0, 10);
      const dayRec = dayMap.get(iso);
      return { day, date: d, iso, dayRec, ...dayClassesForPdf(d, dayRec, holidaySet) };
    });

    const headDays = dayMeta.map(meta =>
      `<th class="${meta.cell}"${bgStyle(meta)}><div>${meta.day}</div><div>${escapeHtml(WEEK[meta.date.getDay()])}</div>${meta.institutional ? `<div class="vertical">${escapeHtml(meta.label)}</div>` : ''}</th>`
    ).join('');

    const body = activeTeachers.map(t => {
      const counts = {};
      const obs = [];
      const dayRows = dayMeta.map(meta => {
        const recs = byTeacherDate.get(`${t.id}|${meta.iso}`) || [];
        const codeText = recs.map(r => r.absence_code).join(' / ');
        recs.forEach(r => {
          counts[r.absence_code] = (counts[r.absence_code] || 0) + 1;
          if (r.observation_final) obs.push(`${r.observation_final}${r.replacement_name ? ' Reemplazo: ' + r.replacement_name : ''}.`);
        });
        return { meta, codeText };
      });
      const summary = Object.entries(counts).map(([code, count]) => `${code}: ${count}`).join('<br>') || '0';
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const alertColor = absenceAlertColor(total);
      const cells = dayRows.map(({ meta, codeText }) => {
        const bg = codeText ? alertColor : meta.bg;
        return `<td class="${meta.cell}" style="text-align:center;font-weight:800;${cellBgStyle(bg)}">${escapeHtml(codeText)}</td>`;
      }).join('');
      return `<tr><td class="teacher-col" style="font-weight:800;${cellBgStyle(alertColor)}">${escapeHtml(t.full_name)}</td>${cells}<td class="summary-col">${summary}</td><td class="total-col" style="text-align:center;font-weight:900;">${total}</td><td class="obs-col">${escapeHtml(obs.join(' '))}</td></tr>`;
    }).join('');

    const legend = types.map(t => `<span><strong>${escapeHtml(t.code)}:</strong> ${escapeHtml(t.name)}</span>`).join('');
    const colgroup = `<colgroup><col class="teacher-col">${dayMeta.map(meta => `<col class="${meta.col}">`).join('')}<col class="summary-col"><col class="total-col"><col class="obs-col"></colgroup>`;
    return `<div class="report-page landscape">${reportHeader(settings, title)}<table class="report-table planilla-table">${colgroup}<thead><tr><th class="teacher-col">DOCENTE</th>${headDays}<th class="summary-col">RESUMEN</th><th class="total-col">T</th><th class="obs-col">OBSERVACIÓN</th></tr></thead><tbody>${body}</tbody></table><div class="legend">${legend}</div>${signatures(settings)}</div>`;
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
    return `<div class="report-page portrait">${reportHeader(settings, title)}<table class="report-table" style="font-size:10px;"><thead><tr><th>FECHA</th><th>DOCENTE</th><th>INASISTENCIA</th><th>OBSERVACIÓN</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin registros en el mes.</td></tr>'}</tbody></table>${signatures(settings)}</div>`;
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
      <table class="report-table resumen-docente-table" style="font-size:9px;"><colgroup><col class="resumen-date-col"><col class="resumen-type-col"><col class="resumen-obs-col"></colgroup><thead><tr><th>FECHA</th><th>TIPO</th><th>OBSERVACIÓN</th></tr></thead><tbody>
        ${recs.sort((a, b) => a.date.localeCompare(b.date)).map(r => `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(typeName(r.absence_code, types))}</td><td>${escapeHtml(r.observation_final || '')}${r.replacement_name ? ` Reemplazo: ${escapeHtml(r.replacement_name)}` : ''}</td></tr>`).join('')}
      </tbody></table>`).join('');
    return `<div class="report-page portrait">${reportHeader(settings, title)}${sections || '<p>Sin registros en el mes.</p>'}${signatures(settings)}</div>`;
  }

  window.ReportPDF = {
    printPlanilla(data) { openPrintWindow(buildPlanilla(data), 'Planilla mensual', 'landscape'); },
    printDetalle(data) { openPrintWindow(buildDetalle(data), 'Detalle mensual', 'portrait'); },
    printResumenDocente(data) { openPrintWindow(buildResumenDocente(data), 'Resumen por docente', 'portrait'); },
    printTodo(data) {
      const html = buildPlanilla(data) + buildDetalle(data) + buildResumenDocente(data);
      openPrintWindow(html, 'Asistencia GGM - Reportes del mes', 'mixed');
    },
    buildPlanilla,
    buildDetalle,
    buildResumenDocente
  };
})();
