import type { PricingRateOverride } from "../models/PricingSettings";

export type PricingClientSegment = string; // Flexible: "Solo/Startup" | "Small Business" | "Enterprise" | etc.

export type PricingChargeType = "recurring" | "one-time";

// Flexible rate structure - AI discovers the actual price point names in the workbook
// Could be: { low: 100, high: 200, maintenance: 50 }
// Or: { bronze: 100, silver: 200, gold: 300 }
// Or: { startup: 100, growth: 200, enterprise: 300 }
export type PricingRateBand = Record<string, number | null>;

export interface PricingServiceComponent {
  id: string;
  label: string;
  description?: string;
  coverage?: string[];
}

export interface PricingServiceBlueprint {
  id: string;
  sourceRow?: number;
  tier?: string;
  name: string;
  billingCadence: string; // Descriptive label: "Monthly", "Project", "Session", "One-time", etc.
  chargeType: PricingChargeType; // True timing: recurring | one-time | setup
  description?: string;
  defaultSelected?: boolean;
  defaultQuantity?: number;
  rateBands: Partial<Record<PricingClientSegment, PricingRateBand>>; // Now supports ANY price point names
  estimatedEffortNotes?: string;
  components?: PricingServiceComponent[];
  tags?: string[];
  override?: PricingRateOverride;
}

export interface PricingModifierBlueprint {
  id: string;
  label: string;
  description?: string;
  inputType: "number" | "boolean" | "select" | "multiselect";
  defaultValue?: number | boolean | string | string[];
  options?: Array<{ value: string; label: string; description?: string }>;
  affects: string[];
}

export interface PricingBlueprintMetadata {
  workbookFilename?: string;
  workbookVersion?: string;
  generatedAt: string;
  generatedBy?: string;
  notes?: string;
  columnMapping?: {
    select?: string;         // Column containing checkbox/selection (e.g., "A")
    quantity?: string;        // Column containing quantity input (e.g., "B")
    tier?: string;           // Column containing tier/category (e.g., "D")
    service?: string;        // Column containing service name (e.g., "E")
    billing?: string;        // Column containing billing cadence (e.g., "F")
    unitPrice?: string;      // Column containing calculated unit price (e.g., "N")
    lineTotal?: string;      // Column containing calculated line total (e.g., "O")
    type?: string;           // Column containing type/category (e.g., "T")
  };
  headerRow?: number;        // Row number containing column headers
  dataStartRow?: number;     // First row of actual service data
  dataEndRow?: number;       // Last row of actual service data
}

export interface PricingBlueprint {
  id: string;
  metadata: PricingBlueprintMetadata;
  clientSegments: PricingClientSegment[];
  pricePoints: string[];
  services: PricingServiceBlueprint[];
  modifiers?: PricingModifierBlueprint[];
}

export interface PricingServiceBlueprintOverride {
  serviceId: string;
  name?: string;
  tier?: string;
  billingCadence?: string;
  description?: string;
  defaultSelected?: boolean;
  defaultQuantity?: number;
  rateBands?: Partial<Record<PricingClientSegment, PricingRateBand>>;
  estimatedEffortNotes?: string;
  tags?: string[];
}

export interface PricingBlueprintOverrides {
  services?: PricingServiceBlueprintOverride[];
  metadataNotes?: string;
}

export interface PricingSnapshotRow {
  rowIndex: number;
  values: Array<string | number | boolean | null>;
}

export interface PricingWorksheetSnapshot {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: Array<{ columnIndex: number; label: string; rowIndex: number }>;
  data: PricingSnapshotRow[];
  validations?: Record<string, { type: string; formula?: string; options?: string[] }>;
}

export interface PricingWorkbookSnapshot {
  workbookFilename?: string;
  generatedAt: string;
  sheets: PricingWorksheetSnapshot[];
}
