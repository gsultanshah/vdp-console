import PDFDocument from 'pdfkit';
import path from 'path';
import { existsSync } from 'fs';
import type { PollingSchemeApiRow } from '@/lib/polling-scheme/row-mapper';

function resolveFont(): string {
  const candidates = [
    path.join(process.cwd(), 'assets/fonts/NotoSansArabic-Regular.ttf'),
    path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'Helvetica';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPrintableHtml(halkaName: string, rows: PollingSchemeApiRow[]): string {
  const tableRows = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(String(row.page ?? ''))}</td>
        <td>${escapeHtml(row.district)}</td>
        <td>${escapeHtml(row.sn)}</td>
        <td dir="auto">${escapeHtml(row.pollingStation)}</td>
        <td dir="auto">${escapeHtml(row.areaType)}</td>
        <td dir="auto">${escapeHtml(row.areaName)}</td>
        <td>${escapeHtml(String(row.blockcode ?? ''))}</td>
        <td>${row.male}</td>
        <td>${row.female}</td>
        <td>${row.total}</td>
        <td>${escapeHtml(row.maleBooth)}</td>
        <td>${escapeHtml(row.femaleBooth)}</td>
        <td>${escapeHtml(row.totalBooth)}</td>
        <td>${escapeHtml(row.rowType)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Polling Scheme — ${escapeHtml(halkaName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: "Noto Sans", "Noto Nastaliq Urdu", Arial, sans-serif; color: #111; margin: 0; padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    td[dir="auto"] { unicode-bidi: plaintext; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 14px;font-weight:600;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <h1>Polling Scheme — ${escapeHtml(halkaName)}</h1>
  <p class="meta">${rows.length.toLocaleString()} rows · Generated ${new Date().toLocaleString()}</p>
  <table>
    <thead>
      <tr>
        <th>Page</th><th>District</th><th>Sl No</th><th>Polling Station</th><th>Area Type</th><th>Area Name</th>
        <th>Roll Code</th><th>Male</th><th>Female</th><th>Total</th><th>M Booth</th><th>F Booth</th><th>T Booth</th><th>Row Type</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
}

export async function buildPollingSchemePdf(
  halkaName: string,
  rows: PollingSchemeApiRow[]
): Promise<Buffer> {
  const fontPath = resolveFont();
  const useCustomFont = fontPath !== 'Helvetica';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 24,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (useCustomFont) {
      doc.font(fontPath);
    }

    doc.fontSize(16).text(`Polling Scheme — ${halkaName}`, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#555').text(`${rows.length} rows · ${new Date().toLocaleString()}`);
    doc.moveDown(0.8);
    doc.fillColor('#000');

    const columns = [
      { label: 'Pg', width: 22 },
      { label: 'Station', width: 130 },
      { label: 'Area', width: 90 },
      { label: 'Code', width: 52 },
      { label: 'M', width: 28 },
      { label: 'F', width: 28 },
      { label: 'T', width: 28 },
      { label: 'Type', width: 52 },
    ];

    const startX = doc.page.margins.left;
    let y = doc.y;

    function drawHeader() {
      let x = startX;
      doc.fontSize(7).fillColor('#333');
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        x += col.width;
      }
      y += 12;
      doc.moveTo(startX, y).lineTo(startX + columns.reduce((s, c) => s + c.width, 0), y).stroke('#ccc');
      y += 4;
    }

    drawHeader();

    for (const row of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }

      const values = [
        String(row.page ?? ''),
        row.pollingStation,
        row.areaName,
        String(row.blockcode ?? ''),
        String(row.male),
        String(row.female),
        String(row.total),
        row.rowType || row.type,
      ];

      let x = startX;
      doc.fontSize(7).fillColor('#111');
      let rowHeight = 10;
      for (let i = 0; i < columns.length; i += 1) {
        const height = doc.heightOfString(values[i], { width: columns[i].width });
        rowHeight = Math.max(rowHeight, height);
        doc.text(values[i], x, y, { width: columns[i].width, lineBreak: true });
        x += columns[i].width;
      }
      y += rowHeight + 4;
    }

    doc.end();
  });
}
