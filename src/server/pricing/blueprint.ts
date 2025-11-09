import type { PricingRateOverride } from "../models/PricingSettings";

export type PricingClientSegment = "Solo/Startup" | "Small Business" | "Mid-Market" | string;

export interface PricingRateBand {
  low?: number | null;
  high?: number | null;
  maintenance?: number | null;
}

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
  billingCadence: string;
  description?: string;
  defaultSelected?: boolean;
  defaultQuantity?: number;
  defaultMaintenance?: boolean;
  rateBands: Partial<Record<PricingClientSegment, PricingRateBand>>;
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
  defaultMaintenance?: boolean;
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
