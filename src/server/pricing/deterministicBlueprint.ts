import type {
  PricingBlueprint,
  PricingClientSegment,
  PricingServiceBlueprint,
  PricingWorkbookSnapshot,
  PricingSnapshotRow,
} from "./blueprint";
import type {
  PricingWorkbookMapping,
  PricingWorkbookRateColumns,
} from "./workbookMapping";

const SEGMENT_KEYS: Array<keyof PricingWorkbookRateColumns> = [
  "soloStartup",
  "smallBusiness",
  "midMarket",
];

const SEGMENT_LABELS: Record<keyof PricingWorkbookRateColumns, PricingClientSegment> = {
  soloStartup: "Solo/Startup",
  smallBusiness: "Small Business",
  midMarket: "Mid-Market",
};

interface DeterministicBlueprintOptions {
  workbookFilename?: string | null;
}

function columnToIndex(column?: string): number | null {
  if (!column) return null;
  const match = column.match(/[A-Za-z]+/);
  if (!match) return null;
  const normalized = match[0].toUpperCase();
  let index = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    if (charCode < 65 || charCode > 90) {
      return null;
    }
    index = index * 26 + (charCode - 64);
  }
  return index - 1;
}

function getCellValue(row: PricingSnapshotRow, column?: string): unknown {
  const index = columnToIndex(column);
  if (index == null || index < 0) return undefined;
  return index < row.values.length ? row.values[index] : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    let sanitized = trimmed.replace(/[^0-9.,()\-]/g, "");
    if (!sanitized) return undefined;
    sanitized = sanitized.replace(/,/g, "");
    let multiplier = 1;
    if (sanitized.startsWith("(") && sanitized.endsWith(")")) {
      sanitized = sanitized.slice(1, -1);
      multiplier = -1;
    }
    sanitized = sanitized.replace(/[^0-9.+\-]/g, "");
    if (!sanitized.length) return undefined;
    const parsed = Number(sanitized);
    if (!Number.isNaN(parsed)) {
      return parsed * multiplier;
    }
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["true", "yes", "y", "1", "on", "selected", "checked", "x", "✓"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n", "0", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function normalizeBilling(value: string | undefined): string {
  if (!value) return "Recurring";
  const normalized = value.trim();
  if (!normalized) return "Recurring";
  const lower = normalized.toLowerCase();
  if (lower.includes("one")) return "One-Time";
  if (lower.includes("annual") || lower.includes("year")) return "Annual";
  if (lower.includes("quarter")) return "Quarterly";
  if (lower.includes("hour")) return "Hourly";
  if (lower.includes("project")) return "Project";
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Determine chargeType from billing cadence string
function determineChargeType(billing: string): "recurring" | "one-time" {
  const lower = billing.toLowerCase();

  // Check for recurring indicators
  if (
    lower.includes("month") ||
    lower.includes("quarter") ||
    lower.includes("annual") ||
    lower.includes("year") ||
    lower.includes("retainer") ||
    lower.includes("ongoing") ||
    lower.includes("recurring")
  ) {
    return "recurring";
  }

  // Default to one-time for project/session/setup/etc
  return "one-time";
}

function buildServices(
  sheet: PricingWorkbookSnapshot["sheets"][number],
  mapping: PricingWorkbookMapping
): PricingServiceBlueprint[] {
  const services: PricingServiceBlueprint[] = [];
  const startRow = Math.max(mapping.lineItemsRange.startRow - 1, 0);
  const endRow = Math.max(mapping.lineItemsRange.endRow - 1, startRow);
  const maxEmpty = mapping.lineItemsRange.maxEmptyRows ?? 0;
  let emptyRun = 0;

  for (const row of sheet.data) {
    if (row.rowIndex < startRow) continue;
    if (row.rowIndex > endRow) break;

    const serviceName = asString(getCellValue(row, mapping.columns.service));
    if (!serviceName) {
      emptyRun += 1;
      if (maxEmpty && emptyRun >= maxEmpty) {
        break;
      }
      continue;
    }
    emptyRun = 0;

    const tier = asString(getCellValue(row, mapping.columns.tier));
    const billing = normalizeBilling(asString(getCellValue(row, mapping.columns.billing)));
    const chargeType = determineChargeType(billing);
    const description = mapping.columns.description
      ? asString(getCellValue(row, mapping.columns.description))
      : undefined;
    const quantity = parseNumber(getCellValue(row, mapping.columns.quantity));
    const defaultSelected = parseBoolean(getCellValue(row, mapping.columns.select));

    // Build rate bands with flexible structure (new format)
    const rateBands: PricingServiceBlueprint["rateBands"] = {};
    for (const key of SEGMENT_KEYS) {
      const columnSet = mapping.columns.rateColumns[key];
      const low = parseNumber(getCellValue(row, columnSet.low));
      const high = parseNumber(getCellValue(row, columnSet.high));
      const maintenance = columnSet.maintenance
        ? parseNumber(getCellValue(row, columnSet.maintenance))
        : undefined;

      if (low != null || high != null || maintenance != null) {
        // NEW: Flexible rate structure - build object with discovered price point names
        const pricePoints: Record<string, number | null> = {};
        if (low != null) pricePoints.low = low;
        if (high != null) pricePoints.high = high;
        if (maintenance != null) pricePoints.maintenance = maintenance;

        rateBands[SEGMENT_LABELS[key]] = pricePoints;
      }
    }

    services.push({
      id: `row-${row.rowIndex + 1}`,
      sourceRow: row.rowIndex + 1,
      tier: tier || undefined,
      name: serviceName,
      billingCadence: billing,
      chargeType, // NEW: Add chargeType
      description,
      defaultSelected,
      defaultQuantity: quantity,
      rateBands,
    });
  }

  return services;
}

export function generateDeterministicPricingBlueprint(
  snapshot: PricingWorkbookSnapshot,
  mapping: PricingWorkbookMapping,
  options: DeterministicBlueprintOptions = {}
): PricingBlueprint {
  const generatedAt = new Date().toISOString();
  const sheet = snapshot.sheets.find((candidate) => candidate.name === mapping.calculatorSheet);
  const targetSheet = sheet ?? snapshot.sheets[0];

  const services = targetSheet ? buildServices(targetSheet, mapping) : [];
  const serviceCount = services.length;

  const notes = targetSheet
    ? serviceCount
      ? `Detected ${serviceCount} services from ${mapping.calculatorSheet} using deterministic analysis.`
      : `No services detected in ${mapping.calculatorSheet} with the current mapping.`
    : "No calculator sheet found in workbook snapshot.";

  return {
    id: `deterministic-${Date.now()}`,
    metadata: {
      workbookFilename: options.workbookFilename ?? snapshot.workbookFilename,
      workbookVersion: undefined,
      generatedAt,
      generatedBy: "deterministic-summary",
      notes,
      // Populate columnMapping from the provided mapping so parser doesn't fail
      columnMapping: {
        select: mapping.columns.select,
        quantity: mapping.columns.quantity,
        tier: mapping.columns.tier,
        service: mapping.columns.service,
        billing: mapping.columns.billing,
        unitPrice: mapping.columns.unitPrice,
        lineTotal: mapping.columns.lineTotal,
        type: mapping.columns.type,
      },
      headerRow: mapping.lineItemsRange.startRow - 1, // Header is one row before data
      dataStartRow: mapping.lineItemsRange.startRow,
      dataEndRow: mapping.lineItemsRange.endRow,
    },
    clientSegments: SEGMENT_KEYS.map((key) => SEGMENT_LABELS[key]),
    pricePoints: ["Low", "High"],
    services,
    modifiers: undefined,
  };
}
