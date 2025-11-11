import XLSX, { WorkBook, WorkSheet } from "xlsx";
import type {
  PricingSnapshotRow,
  PricingWorkbookSnapshot,
  PricingWorksheetSnapshot,
} from "./blueprint";

interface ExtractWorkbookOptions {
  maxRows?: number;
  maxColumns?: number;
  sheetNames?: string[];
}

const DEFAULT_MAX_ROWS = 250;
const DEFAULT_MAX_COLUMNS = 64;

function normalizeValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function readSheetSnapshot(
  sheetName: string,
  sheet: WorkSheet,
  options: ExtractWorkbookOptions
): PricingWorksheetSnapshot {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const rowEnd = Math.min(range.e.r, options.maxRows! - 1);
  const columnEnd = Math.min(range.e.c, options.maxColumns! - 1);

  const data: PricingSnapshotRow[] = [];
  const headers: PricingWorksheetSnapshot["headers"] = [];

  for (let r = range.s.r; r <= rowEnd; r += 1) {
    const rowValues: Array<string | number | boolean | null> = [];
    let isHeaderRow = false;
    for (let c = range.s.c; c <= columnEnd; c += 1) {
      const cellAddress = { c, r };
      const cellRef = XLSX.utils.encode_cell(cellAddress);
      const cell = sheet[cellRef];
      const value = cell?.v ?? cell?.w ?? null;
      const normalized = normalizeValue(value);
      rowValues.push(normalized);
      if (normalized && typeof normalized === "string") {
        if (r === range.s.r) {
          headers.push({ columnIndex: c, label: normalized, rowIndex: r });
          isHeaderRow = true;
        } else if (/tier|service|fees|price|billing|qty|quantity/i.test(normalized)) {
          headers.push({ columnIndex: c, label: normalized, rowIndex: r });
          isHeaderRow = true;
        }
      }
    }
    data.push({ rowIndex: r, values: rowValues });

    if (isHeaderRow && headers.length > columnEnd - range.s.c + 1) {
      // Reduce header noise by keeping unique column indices only
      const deduped = new Map<number, { columnIndex: number; label: string; rowIndex: number }>();
      headers.forEach((header) => {
        if (!deduped.has(header.columnIndex)) {
          deduped.set(header.columnIndex, header);
        }
      });
      headers.length = 0;
      headers.push(...deduped.values());
    }
  }

  const validations: PricingWorksheetSnapshot["validations"] = {};
  const dataValidations = (sheet as any)["!dataValidations"] ?? (sheet as any)["!dv"];
  if (dataValidations && Array.isArray(dataValidations)) {
    dataValidations.forEach((validation: any) => {
      const rangeRef = validation?.sqref || validation?.sqRef || validation?.ref;
      if (!rangeRef) return;
      const type = validation?.type || validation?.Type || "unknown";
      const formula = validation?.formula1 || validation?.Formula1;
      validations[String(rangeRef)] = {
        type,
        formula: typeof formula === "string" ? formula : undefined,
      };
    });
  }

  return {
    name: sheetName,
    rowCount: rowEnd - range.s.r + 1,
    columnCount: columnEnd - range.s.c + 1,
    headers,
    data,
    validations: Object.keys(validations).length ? validations : undefined,
  };
}

export function extractWorkbookSnapshot(
  workbook: WorkBook,
  options: ExtractWorkbookOptions = {}
): PricingWorkbookSnapshot {
  const safeOptions: Required<Omit<ExtractWorkbookOptions, "sheetNames">> = {
    maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
    maxColumns: options.maxColumns ?? DEFAULT_MAX_COLUMNS,
  };

  const requestedSheets = options.sheetNames?.filter(Boolean).map((name) => name.trim());
  const sheetNames = requestedSheets && requestedSheets.length
    ? requestedSheets.filter((name) => workbook.SheetNames.includes(name))
    : workbook.SheetNames;

  const sheets: PricingWorksheetSnapshot[] = sheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return readSheetSnapshot(sheetName, sheet, safeOptions);
  });

  return {
    workbookFilename: (workbook.Props && (workbook.Props as any).Title) || undefined,
    generatedAt: new Date().toISOString(),
    sheets,
  };
}

export function extractWorkbookSnapshotFromBuffer(
  buffer: Buffer,
  options: ExtractWorkbookOptions = {}
): PricingWorkbookSnapshot {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: true,
    cellDates: true,
    cellHTML: false,
    cellStyles: false,
  });
  return extractWorkbookSnapshot(workbook, options);
}
