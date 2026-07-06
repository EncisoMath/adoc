(function () {
  const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const MONTHS_FILE = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const WEEK = ['D','L','M','M','J','V','S'];
  let logoDataUrlPromise = null;

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

  function reportFileName(prefix, year, monthIndex) {
    return `${prefix}_Asistencia_GGM_${MONTHS_FILE[monthIndex]}_${year}.pdf`;
  }

  function getJsPdf() {
    const Ctor = window.jspdf?.jsPDF;
    if (!Ctor) throw new Error('jsPDF no esta cargado. Revisa la conexion a jsdelivr o el orden de scripts.');
    return Ctor;
  }

  function hasAutoTable(doc) {
    return typeof doc.autoTable === 'function';
  }

  function hexToRgb(hex) {
    const value = String(hex || '').replace('#', '').trim();
    if (value.length !== 6) return null;
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function absenceAlertColor(total) {
    if (total >= 9) return '#f87171';
    if (total > 6) return '#fb923c';
    if (total > 3) return '#fde047';
    return '';
  }

  function dayClassesForPdf(date, dayRec, holidaySet) {
    const iso = date.toISOString().slice(0, 10);
    const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidaySet.has(iso) || dayRec?.status === 'no_laboral' || dayRec?.institutional_type === 'Festivo';
    const isInst = dayRec?.status === 'institucional';
    if (isInst) return { label: dayRec.institutional_type || dayRec.institutional_title || 'Evento institucional', institutional: true, bg: '#bdd7ee' };
    if (isHoliday) return { label: WEEK[date.getDay()], institutional: false, bg: '#d9d9d9' };
    if (isWeekendDay) return { label: WEEK[date.getDay()], institutional: false, bg: '#d9d9d9' };
    return { label: WEEK[date.getDay()], institutional: false, bg: '' };
  }

  function imageToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function loadLogoDataUrl() {
    if (!logoDataUrlPromise) {
      const url = new URL('icons/logocole.png', window.location.href).href;
      logoDataUrlPromise = fetch(url)
        .then(res => res.ok ? res.blob() : null)
        .then(blob => blob ? imageToDataUrl(blob) : null)
        .catch(() => null);
    }
    return logoDataUrlPromise;
  }

  function createDoc(orientation = 'landscape') {
    const JsPdf = getJsPdf();
    const format = orientation === 'landscape' ? [330, 215] : [215, 330];
    return new JsPdf({ orientation, unit: 'mm', format });
  }

  function drawHeader(doc, settings, title, logoDataUrl, orientation = 'landscape') {
    const s = settings || {};
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = orientation === 'landscape' ? 7 : 9;
    const logoSize = orientation === 'landscape' ? 20 : 22;
    const top = orientation === 'landscape' ? 7 : 10;

    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', left, top, logoSize, logoSize); } catch (err) { console.warn('Logo PDF', err); }
    }

    doc.setTextColor(17, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 10.5 : 11.5);
    doc.text(s.letterhead_bold || s.institution_name || 'INSTITUCION EDUCATIVA DEPARTAMENTAL GABRIEL GARCIA MARQUEZ', pageWidth / 2, top + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(orientation === 'landscape' ? 8.4 : 9.2);
    doc.text(s.letterhead_normal || 'ARACATACA - MAGDALENA', pageWidth / 2, top + 13, { align: 'center' });
    doc.setFontSize(orientation === 'landscape' ? 7.8 : 8.4);
    doc.text(`NIT. ${s.nit || '800096058-1'}   DANE ${s.dane || '147053000151'}`, pageWidth / 2, top + 18, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 12 : 13);
    doc.text(title, pageWidth / 2, top + 30, { align: 'center' });
    return top + 36;
  }

  function addSignatures(doc, settings, y) {
    const s = settings || {};
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 36) {
      doc.addPage(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? [330, 215] : [215, 330], doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? 'landscape' : 'portrait');
      y = 52;
    }
    const x1 = pageWidth * 0.28;
    const x2 = pageWidth * 0.72;
    const lineW = 70;
    doc.setDrawColor(17, 17, 17);
    doc.setLineWidth(0.2);
    doc.line(x1 - lineW / 2, y, x1 + lineW / 2, y);
    doc.line(x2 - lineW / 2, y, x2 + lineW / 2, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(s.coordinator_name || 'Madeleine Blanco Manotas', x1, y + 5, { align: 'center' });
    doc.text(s.rector_name || 'Shirly Luna', x2, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(s.coordinator_title || 'Coordinadora', x1, y + 10, { align: 'center' });
    doc.text(s.rector_title || 'Rectora', x2, y + 10, { align: 'center' });
    return y + 14;
  }

  function addPageNumbers(doc) {
    const count = doc.getNumberOfPages();
    for (let i = 1; i <= count; i++) {
      doc.setPage(i);
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(`Pagina ${i} de ${count}`, w - 10, h - 5, { align: 'right' });
    }
  }

  function buildPlanillaModel({ teachers, records, days, holidays, year, monthIndex }) {
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

    const rows = activeTeachers.map(t => {
      const counts = {};
      const obs = [];
      const dayValues = {};
      dayMeta.forEach((meta, i) => {
        const recs = byTeacherDate.get(`${t.id}|${meta.iso}`) || [];
        const codeText = recs.map(r => r.absence_code).join(' / ');
        recs.forEach(r => {
          counts[r.absence_code] = (counts[r.absence_code] || 0) + 1;
          if (r.observation_final) obs.push(`${r.observation_final}${r.replacement_name ? ' Reemplazo: ' + r.replacement_name : ''}.`);
        });
        dayValues[`d${i + 1}`] = codeText;
      });
      const summary = Object.entries(counts).map(([code, count]) => `${code}: ${count}`).join('\n') || '0';
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        teacher: t.full_name,
        summary,
        total: String(total),
        obs: obs.join(' '),
        alert: absenceAlertColor(total),
        ...dayValues
      };
    });

    return { dayMeta, rows };
  }

  function addPlanilla(doc, data, logoDataUrl, isFirstPage = true) {
    if (!isFirstPage) doc.addPage([330, 215], 'landscape');
    const title = `ASISTENCIA DOCENTES MES ${monthTitle(data.year, data.monthIndex)}`;
    const startY = drawHeader(doc, data.settings, title, logoDataUrl, 'landscape');
    const model = buildPlanillaModel(data);
    const dayCount = model.dayMeta.length;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usable = pageWidth - 14;
    const teacherW = 48;
    const summaryW = 20;
    const totalW = 9;
    const obsW = 70;
    const dayW = Math.max(4.8, (usable - teacherW - summaryW - totalW - obsW) / dayCount);

    const head = [[
      'DOCENTE',
      ...model.dayMeta.map(meta => `${meta.day}\n${WEEK[meta.date.getDay()]}${meta.institutional ? '\n' + String(meta.label || '').slice(0, 8) : ''}`),
      'RESUMEN',
      'T',
      'OBSERVACION'
    ]];

    const body = model.rows.map(r => [
      r.teacher,
      ...model.dayMeta.map((_, i) => r[`d${i + 1}`] || ''),
      r.summary,
      r.total,
      r.obs
    ]);

    const columnStyles = { 0: { cellWidth: teacherW, halign: 'left', fontStyle: 'bold' } };
    for (let i = 0; i < dayCount; i++) columnStyles[i + 1] = { cellWidth: dayW, halign: 'center', fontStyle: 'bold' };
    columnStyles[dayCount + 1] = { cellWidth: summaryW, halign: 'left' };
    columnStyles[dayCount + 2] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' };
    columnStyles[dayCount + 3] = { cellWidth: obsW, halign: 'left' };

    doc.autoTable({
      startY,
      head,
      body,
      theme: 'grid',
      margin: { left: 7, right: 7, top: startY, bottom: 12 },
      tableWidth: usable,
      styles: {
        font: 'helvetica',
        fontSize: 5.7,
        cellPadding: 0.65,
        lineColor: [51, 51, 51],
        lineWidth: 0.12,
        textColor: [17, 17, 17],
        valign: 'middle',
        overflow: 'linebreak'
      },
      headStyles: {
        fontStyle: 'bold',
        fontSize: 5.9,
        fillColor: [241, 241, 241],
        textColor: [17, 17, 17],
        halign: 'center',
        minCellHeight: 7
      },
      columnStyles,
      didParseCell: hook => {
        const { cell, row, column, section } = hook;
        const col = column.index;
        if (section === 'head' && col > 0 && col <= dayCount) {
          const meta = model.dayMeta[col - 1];
          const rgb = hexToRgb(meta.bg);
          if (rgb) cell.styles.fillColor = rgb;
        }
        if (section === 'body') {
          const record = model.rows[row.index];
          if (col === 0 && record.alert) cell.styles.fillColor = hexToRgb(record.alert);
          if (col > 0 && col <= dayCount) {
            const value = record[`d${col}`];
            const meta = model.dayMeta[col - 1];
            const color = value ? record.alert : meta.bg;
            const rgb = hexToRgb(color);
            if (rgb) cell.styles.fillColor = rgb;
          }
          if (col === dayCount + 2 && record.alert) {
            cell.styles.fillColor = hexToRgb(record.alert);
            cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    const finalY = doc.lastAutoTable?.finalY || startY;
    const legendY = Math.min(finalY + 5, doc.internal.pageSize.getHeight() - 25);
    const legend = data.types.map(t => `${t.code}: ${t.name}`).join('   ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text(doc.splitTextToSize(legend, usable), 7, legendY);
    addSignatures(doc, data.settings, legendY + 18);
  }

  function addDetalle(doc, data, logoDataUrl, isFirstPage = true) {
    if (!isFirstPage) doc.addPage([215, 330], 'portrait');
    const title = `DETALLE ASISTENCIA DOCENTES MES ${monthTitle(data.year, data.monthIndex)}`;
    const startY = drawHeader(doc, data.settings, title, logoDataUrl, 'portrait');
    const rows = data.records.filter(r => !r.deleted_at)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || teacherName(a.teacher_id, data.teachers).localeCompare(teacherName(b.teacher_id, data.teachers), 'es'))
      .map(r => [
        fmtDate(r.date),
        teacherName(r.teacher_id, data.teachers),
        typeName(r.absence_code, data.types),
        `${r.observation_final || ''}${r.replacement_name ? '\nReemplazo: ' + r.replacement_name : ''}`
      ]);

    doc.autoTable({
      startY,
      head: [['FECHA', 'DOCENTE', 'INASISTENCIA', 'OBSERVACION']],
      body: rows.length ? rows : [['', '', '', 'Sin registros en el mes.']],
      theme: 'grid',
      margin: { left: 9, right: 9, top: startY, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 1.5, lineColor: [51, 51, 51], lineWidth: 0.12, overflow: 'linebreak' },
      headStyles: { fillColor: [241, 241, 241], textColor: [17, 17, 17], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 56 }, 2: { cellWidth: 45 }, 3: { cellWidth: 'auto' } }
    });
    addSignatures(doc, data.settings, (doc.lastAutoTable?.finalY || startY) + 28);
  }

  function addResumenDocente(doc, data, logoDataUrl, isFirstPage = true) {
    if (!isFirstPage) doc.addPage([215, 330], 'portrait');
    const title = `RESUMEN POR DOCENTE MES ${monthTitle(data.year, data.monthIndex)}`;
    let y = drawHeader(doc, data.settings, title, logoDataUrl, 'portrait');
    const grouped = new Map();
    data.records.filter(r => !r.deleted_at).forEach(r => {
      const name = teacherName(r.teacher_id, data.teachers);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(r);
    });

    if (!grouped.size) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Sin registros en el mes.', 9, y + 6);
      addSignatures(doc, data.settings, y + 42);
      return;
    }

    [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).forEach(([name, recs]) => {
      if (y > 292) {
        doc.addPage([215, 330], 'portrait');
        y = drawHeader(doc, data.settings, title, logoDataUrl, 'portrait');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.text(`${name} - Total: ${recs.length}`, 9, y + 3);
      const rows = recs.sort((a, b) => a.date.localeCompare(b.date)).map(r => [
        fmtDate(r.date),
        typeName(r.absence_code, data.types),
        `${r.observation_final || ''}${r.replacement_name ? ' Reemplazo: ' + r.replacement_name : ''}`
      ]);
      doc.autoTable({
        startY: y + 6,
        head: [['FECHA', 'TIPO', 'OBSERVACION']],
        body: rows,
        theme: 'grid',
        margin: { left: 9, right: 9, top: 48, bottom: 14 },
        styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.15, lineColor: [51, 51, 51], lineWidth: 0.12, overflow: 'linebreak' },
        headStyles: { fillColor: [241, 241, 241], textColor: [17, 17, 17], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 44 }, 2: { cellWidth: 'auto' } }
      });
      y = (doc.lastAutoTable?.finalY || y) + 8;
    });
    addSignatures(doc, data.settings, y + 20);
  }

  async function saveDoc(doc, fileName) {
    addPageNumbers(doc);
    doc.save(fileName);
  }

  async function generate(kind, data) {
    try {
      const logo = await loadLogoDataUrl();
      const doc = createDoc(kind === 'planilla' ? 'landscape' : 'portrait');
      if (!hasAutoTable(doc)) throw new Error('jsPDF AutoTable no esta cargado.');
      if (kind === 'planilla') {
        addPlanilla(doc, data, logo, true);
        return saveDoc(doc, reportFileName('planilla_mensual', data.year, data.monthIndex));
      }
      if (kind === 'detalle') {
        addDetalle(doc, data, logo, true);
        return saveDoc(doc, reportFileName('detalle_mensual', data.year, data.monthIndex));
      }
      if (kind === 'resumen') {
        addResumenDocente(doc, data, logo, true);
        return saveDoc(doc, reportFileName('resumen_docente', data.year, data.monthIndex));
      }
      if (kind === 'todo') {
        addPlanilla(doc, data, logo, true);
        addDetalle(doc, data, logo, false);
        addResumenDocente(doc, data, logo, false);
        return saveDoc(doc, reportFileName('reportes_completos', data.year, data.monthIndex));
      }
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert(`No se pudo generar el PDF: ${err.message || err}`);
    }
  }

  // Compatibilidad: se conservan nombres antiguos usados por app.js.
  window.ReportPDF = {
    printPlanilla(data) { return generate('planilla', data); },
    printDetalle(data) { return generate('detalle', data); },
    printResumenDocente(data) { return generate('resumen', data); },
    printTodo(data) { return generate('todo', data); },
    buildPlanilla(data) { return buildPlanillaModel(data); },
    buildDetalle(data) { return data; },
    buildResumenDocente(data) { return data; }
  };
})();
