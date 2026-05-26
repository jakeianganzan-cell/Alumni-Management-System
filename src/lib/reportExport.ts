import ExcelJS from "exceljs";
import schoolLogo from "@/assets/salay.png";

export interface ReportColumn<T> {
  key: keyof T;
  label: string;
}

export interface ReportExportOptions<T extends Record<string, string | number | null | undefined>> {
  title: string;
  filename: string;
  columns: Array<ReportColumn<T>>;
  rows: T[];
  preparedBy?: string | null;
  summary?: Array<{ label: string; value: string | number }>;
}

const SCHOOL_NAME = "Salay Community College";

const formatGeneratedDate = () =>
  new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const getLogoDataUrl = async () => {
  const response = await fetch(schoolLogo);
  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const sanitizeSheetName = (value: string) => value.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report";

export const downloadBrandedExcel = async <T extends Record<string, string | number | null | undefined>>(options: ReportExportOptions<T>) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL_NAME;
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sanitizeSheetName(options.title), {
    views: [{ state: "frozen", ySplit: 8 }],
  });

  worksheet.properties.defaultRowHeight = 20;
  worksheet.mergeCells("B1:F1");
  worksheet.getCell("B1").value = SCHOOL_NAME;
  worksheet.getCell("B1").font = { bold: true, size: 16, color: { argb: "FF550000" } };
  worksheet.mergeCells("B2:F2");
  worksheet.getCell("B2").value = options.title;
  worksheet.getCell("B2").font = { bold: true, size: 13 };
  worksheet.getCell("B3").value = "Date Generated";
  worksheet.getCell("C3").value = formatGeneratedDate();
  worksheet.getCell("B4").value = "Prepared By";
  worksheet.getCell("C4").value = options.preparedBy || "System Administrator";

  try {
    const logoDataUrl = await getLogoDataUrl();
    const logoId = workbook.addImage({ base64: logoDataUrl, extension: "png" });
    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
  } catch {
    worksheet.getCell("A1").value = SCHOOL_NAME;
  }

  let rowIndex = 6;
  if (options.summary?.length) {
    worksheet.getCell(rowIndex, 1).value = "Summary";
    worksheet.getCell(rowIndex, 1).font = { bold: true, color: { argb: "FF550000" } };
    rowIndex += 1;
    options.summary.forEach((item) => {
      worksheet.getCell(rowIndex, 1).value = item.label;
      worksheet.getCell(rowIndex, 2).value = item.value;
      worksheet.getRow(rowIndex).font = { bold: true };
      rowIndex += 1;
    });
    rowIndex += 1;
  }

  const headerRowIndex = rowIndex;
  const headerRow = worksheet.getRow(headerRowIndex);
  options.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF550000" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  options.rows.forEach((row, rowOffset) => {
    const excelRow = worksheet.getRow(headerRowIndex + rowOffset + 1);
    options.columns.forEach((column, index) => {
      excelRow.getCell(index + 1).value = row[column.key] ?? "";
    });
  });

  const lastRow = headerRowIndex + options.rows.length;
  for (let row = headerRowIndex; row <= lastRow; row += 1) {
    worksheet.getRow(row).eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }

  options.columns.forEach((column, index) => {
    const values = [column.label, ...options.rows.map((row) => String(row[column.key] ?? ""))];
    worksheet.getColumn(index + 1).width = Math.min(Math.max(...values.map((value) => value.length), 12) + 3, 36);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${options.filename}.xlsx`,
  );
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const openPrintableReport = <T extends Record<string, string | number | null | undefined>>(options: ReportExportOptions<T>) => {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!reportWindow) throw new Error("Allow pop-ups to open the printable report.");

  const summaryHtml = options.summary?.length
    ? `<section class="summary">${options.summary
        .map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
        .join("")}</section>`
    : "";
  const headerHtml = options.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const bodyHtml = options.rows
    .map((row) => `<tr>${options.columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`)
    .join("");

  reportWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 10px; color: #555; } }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #172033; margin: 0; font-size: 12px; }
    header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #550000; padding-bottom: 14px; margin-bottom: 18px; }
    header img { width: 64px; height: 64px; object-fit: contain; }
    h1 { margin: 0; color: #550000; font-size: 22px; }
    h2 { margin: 4px 0 0; font-size: 16px; }
    .meta { margin-top: 4px; color: #555; line-height: 1.5; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
    .summary div { border: 1px solid #d8dde6; padding: 9px; background: #f8fafc; }
    .summary span { display: block; color: #5b6472; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .summary strong { display: block; margin-top: 4px; font-size: 14px; color: #172033; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #550000; color: #fff; font-size: 11px; padding: 8px; border: 1px solid #550000; text-align: left; }
    td { padding: 7px; border: 1px solid #d8dde6; vertical-align: top; word-wrap: break-word; }
    tr:nth-child(even) td { background: #fafafa; }
    footer { margin-top: 16px; color: #555; font-size: 10px; text-align: right; }
    @media print { button { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <img src="${schoolLogo}" alt="${SCHOOL_NAME}" />
    <div>
      <h1>${SCHOOL_NAME}</h1>
      <h2>${escapeHtml(options.title)}</h2>
      <div class="meta">
        Date Generated: ${escapeHtml(formatGeneratedDate())}<br />
        Prepared By: ${escapeHtml(options.preparedBy || "System Administrator")}
      </div>
    </div>
  </header>
  ${summaryHtml}
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${options.columns.length}">No records available.</td></tr>`}</tbody>
  </table>
  <footer>Generated by Alumni Management System</footer>
  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body>
</html>`);
  reportWindow.document.close();
};
