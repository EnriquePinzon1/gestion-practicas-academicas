import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import {
  CriterioReporte,
  ReporteGenerado,
  esNumerica,
  formatearValor,
} from './report.model';

// Exporta el reporte a PDF en el navegador (jsPDF +
// autotable). Va en el chunk diferido de /reportes: ya está
// cargado al exportar, así un fallo se puede reintentar.
export async function exportarReportePdf(
  reporte: ReporteGenerado,
  criterios: CriterioReporte[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const azul: [number, number, number] = [16, 35, 63];
  const gris: [number, number, number] = [100, 116, 139];
  let y = 16;

  // Encabezado: sistema, título, criterios y fecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text('Sistema de Gestión de Prácticas Académicas', margin, y);

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...azul);
  doc.text(reporte.titulo, margin, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  const criteriosTexto = criterios.length
    ? criterios.map((c) => `${c.etiqueta}: ${c.valor}`).join('   ·   ')
    : 'Criterios: reporte general (sin filtros)';

  for (const linea of doc.splitTextToSize(criteriosTexto, pageWidth - margin * 2)) {
    doc.text(linea, margin, y);
    y += 4.5;
  }

  doc.setTextColor(...gris);
  doc.text(
    'Generado el ' +
      new Date(reporte.generado_en).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    margin,
    y
  );
  y += 4;

  // Resumen: indicadores en filas de 4
  const indicadores = reporte.resumen.map((i) => [
    i.etiqueta,
    formatearValor(i.valor, i.formato),
  ]);
  const filasResumen: string[][] = [];

  for (let i = 0; i < indicadores.length; i += 4) {
    filasResumen.push(indicadores.slice(i, i + 4).flat());
  }

  autoTable(doc, {
    startY: y + 2,
    body: filasResumen,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: {
      0: { textColor: gris },
      1: { fontStyle: 'bold', textColor: azul },
      2: { textColor: gris },
      3: { fontStyle: 'bold', textColor: azul },
      4: { textColor: gris },
      5: { fontStyle: 'bold', textColor: azul },
      6: { textColor: gris },
      7: { fontStyle: 'bold', textColor: azul },
    },
  });

  y = lastY(doc) + 6;

  // Secciones con tabla (paginación automática)
  for (const seccion of reporte.secciones) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...azul);
    doc.text(seccion.titulo, margin, y);
    y += 2;

    if (seccion.descripcion) {
      y += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...gris);
      doc.text(
        doc.splitTextToSize(seccion.descripcion, pageWidth - margin * 2)[0],
        margin,
        y
      );
    }

    if (seccion.filas.length === 0) {
      y += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...gris);
      doc.text('Sin registros.', margin, y);
      y += 9;
      continue;
    }

    const alineacion: Record<number, { halign: 'right' }> = {};

    seccion.columnas.forEach((c, index) => {
      if (esNumerica(c.formato)) {
        alineacion[index] = { halign: 'right' };
      }
    });

    autoTable(doc, {
      startY: y + 2,
      head: [seccion.columnas.map((c) => c.etiqueta)],
      body: seccion.filas.map((fila) =>
        seccion.columnas.map((c) => formatearValor(fila[c.clave], c.formato))
      ),
      margin: { left: margin, right: margin, bottom: 16 },
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [29, 93, 145], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 251] },
      columnStyles: alineacion,
      // El encabezado de columnas numéricas también a la derecha
      didParseCell: (data) => {
        if (data.section === 'head' && alineacion[data.column.index]) {
          data.cell.styles.halign = 'right';
        }
      },
    });

    y = lastY(doc) + 9;
  }

  // Pie: número de página
  const total = doc.getNumberOfPages();

  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text(
      `Página ${page} de ${total}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  doc.save(nombreArchivo(reporte, criterios));
}

function lastY(doc: unknown): number {
  return (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable
    ?.finalY ?? 20;
}

// reporte-horas-2027-1-2026-11-16.pdf (sin tildes ni espacios)
function nombreArchivo(
  reporte: ReporteGenerado,
  criterios: CriterioReporte[]
): string {
  const periodo = criterios.find((c) => c.etiqueta === 'Período')?.valor;
  const hoy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });

  return (
    ['reporte', reporte.tipo, periodo?.replace(/\s.*$/, ''), hoy]
      .filter(Boolean)
      .join('-') + '.pdf'
  );
}
