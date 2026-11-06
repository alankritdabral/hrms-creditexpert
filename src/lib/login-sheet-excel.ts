import { LOGIN_SHEET_COLUMNS } from "@/lib/login-sheet";
import { flattenCell } from "@/lib/login-sheet-import";
import type { LoginSheetEntry } from "@/lib/types";

/**
 * Reads and writes real .xlsx files. The Excel library is loaded on demand, so it is only
 * downloaded when someone actually exports or imports (never with the page itself).
 */

const COLUMN_WIDTHS = [24, 13, 14, 14, 12, 20, 22, 16, 16, 10, 12, 12, 14, 8, 12, 30, 20, 14];

async function loadExcelJS() {
  const mod = await import("exceljs");
  return (mod as { default?: typeof import("exceljs") }).default ?? mod;
}

/** The sheet as an .xlsx file: same 18 columns as the screen, real dates and numbers, header frozen with filters. */
export async function entriesToXlsx(entries: LoginSheetEntry[]): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Login Sheet", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = LOGIN_SHEET_COLUMNS.map((header, i) => ({ header: header.toUpperCase(), key: String(i), width: COLUMN_WIDTHS[i] }));

  for (const e of entries) {
    const [y, m, d] = e.date.split("-").map(Number);
    const [hh, mm] = (e.time || "").split(":").map(Number);
    ws.addRow([
      e.customerName,
      e.panNo ?? null,
      e.phone ? Number(e.phone) : null,
      e.location ?? null,
      new Date(Date.UTC(y, m - 1, d)),
      e.empName,
      e.bankName,
      e.dsaName ?? null,
      e.loginId ?? null,
      e.product ?? null,
      e.branch ?? null,
      e.file ?? null,
      e.amount,
      e.time && !Number.isNaN(hh) ? (hh * 60 + mm) / 1440 : null,
      e.status,
      e.remarks ?? null,
      e.insuranceDetails ?? null,
      e.amount2 ?? null,
    ]);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle" };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  });
  ws.getColumn(3).numFmt = "0";
  ws.getColumn(5).numFmt = "dd-mm-yyyy";
  ws.getColumn(13).numFmt = "#,##0";
  ws.getColumn(14).numFmt = "hh:mm";
  ws.getColumn(18).numFmt = "#,##0";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: LOGIN_SHEET_COLUMNS.length } };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** The first worksheet of an .xlsx file as a grid of cell values (formulas resolved to their results). */
export async function xlsxToGrid(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(flattenCell(row.getCell(c).value));
    grid[rowNumber - 1] = cells;
  });
  return Array.from(grid, (r) => r ?? []);
}
