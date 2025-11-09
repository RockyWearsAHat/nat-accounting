export type ClientSize = "Solo/Startup" | "Small Business" | "Mid-Market";
export type PricePoint = "Low" | "Midpoint" | "High";

export interface PricingRateValues {
  low?: number | null;
  high?: number | null;
  maintenance?: number | null;
}

export interface PricingRateOverride {
  soloStartup?: PricingRateValues;
  smallBusiness?: PricingRateValues;
  midMarket?: PricingRateValues;
}

export interface PricingLineMetadata {
  id: string;
  row: number;
  tier: string;
  service: string;
  billing: string;
  description?: string;
  type: string;
  defaultSelected: boolean;
  defaultQuantity: number;
  defaultMaintenance: boolean;
  baseRates: PricingRateOverride;
}

export interface PricingWorkbookRateColumnSet {
  low: string;
  high: string;
  maintenance?: string;
}

export interface PricingWorkbookRateColumns {
  soloStartup: PricingWorkbookRateColumnSet;
  smallBusiness: PricingWorkbookRateColumnSet;
  midMarket: PricingWorkbookRateColumnSet;
}

export interface PricingWorkbookColumnMapping {
  select: string;
  quantity: string;
  maintenanceToggle: string;
  description?: string;
  tier: string;
  service: string;
  billing: string;
  type: string;
  unitPrice: string;
  lineTotal: string;
  maintenanceTotal?: string;
  rateColumns: PricingWorkbookRateColumns;
}

export interface PricingWorkbookTotalsMapping {
  monthlySubtotal: string;
  oneTimeSubtotal: string;
  maintenanceSubtotal: string;
  grandTotal: string;
  ongoingMonthly?: string;
}

export interface PricingWorkbookLineRange {
  startRow: number;
  endRow: number;
  maxEmptyRows?: number;
}

export interface PricingWorkbookQuoteFields {
  clientName?: string;
  companyName?: string;
  preparedBy?: string;
  preparedForEmail?: string;
  notes?: string;
  clientSize?: string;
  pricePoint?: string;
}

export interface PricingWorkbookMapping {
  calculatorSheet: string;
  quoteSheet?: string;
  clientSizeCell: string;
  pricePointCell: string;
  ongoingMonthlyCell?: string;
  totals: PricingWorkbookTotalsMapping;
  lineItemsRange: PricingWorkbookLineRange;
  columns: PricingWorkbookColumnMapping;
  quoteFields?: PricingWorkbookQuoteFields;
}

export interface PricingWorkbookUploadPayload {
  filename: string;
  contentType: string;
  data: string;
  size: number;
}

export type PricingClientSegment = "Solo/Startup" | "Small Business" | "Mid-Market" | string;

export interface PricingRateBand {
  low?: number | null;
  high?: number | null;
  maintenance?: number | null;
}

export interface PricingServiceComponentBlueprint {
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
  components?: PricingServiceComponentBlueprint[];
  tags?: string[];
  override?: PricingRateOverride;
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

export interface PricingModifierBlueprintOption {
  value: string;
  label: string;
  description?: string;
}

export interface PricingModifierBlueprint {
  id: string;
  label: string;
  description?: string;
  inputType: "number" | "boolean" | "select" | "multiselect";
  defaultValue?: number | boolean | string | string[];
  options?: PricingModifierBlueprintOption[];
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

export interface PricingWorkbookInfo {
  filename: string;
  size: number;
  uploadedAt: string | null;
  blueprint?: PricingBlueprint;
  blueprintModel?: string | null;
  blueprintGeneratedAt?: string | null;
  blueprintError?: string | null;
  snapshot?: PricingWorkbookSnapshot;
  blueprintOverrides?: PricingBlueprintOverrides | null;
  blueprintMerged?: PricingBlueprint | null;
}

export interface PricingBlueprintResponse {
  workbook: PricingWorkbookInfo | null;
  blueprint: PricingBlueprint | null;
  overrides: PricingBlueprintOverrides | null;
  merged: PricingBlueprint | null;
}

export interface PricingBlueprintUpdateResponse {
  overrides: PricingBlueprintOverrides | null;
  mergedBlueprint: PricingBlueprint | null;
}

export interface PricingBlueprintReanalyzeResponse {
  workbook: PricingWorkbookInfo | null;
  error?: string | null;
}

export interface PricingWorkbookUpdateResponse {
  mapping: PricingWorkbookMapping;
  workbook?: PricingWorkbookInfo | null;
  settings?: PricingSettings | null;
  analysisError?: string | null;
}

export interface PricingTotals {
  monthlySubtotal: number;
  oneTimeSubtotal: number;
  maintenanceSubtotal: number;
  grandTotalMonthOne: number;
  ongoingMonthly: number;
}

export interface PricingLineResult {
  id: string;
  service: string;
  tier: string;
  billing: string;
  selected: boolean;
  quantity: number;
  includeMaintenance: boolean;
  unitPrice: number;
  overridePrice?: number | null;
  effectiveUnitPrice: number;
  lineTotal: number;
  maintenanceAmount: number;
  type: string;
}

export interface PricingMetadata {
  clientSizes: ClientSize[];
  pricePoints: PricePoint[];
  lineItems: PricingLineMetadata[];
  workbookMapping: PricingWorkbookMapping;
}

export interface PricingBootstrapResponse {
  metadata: PricingMetadata | null;
  settings: PricingSettings | null;
  defaults: PricingFormPayload | null;
  workbook?: PricingWorkbookInfo | null;
  mapping: PricingWorkbookMapping;
  setupRequired?: boolean;
  message?: string | null;
}

export interface PricingSettings {
  defaultClientSize: ClientSize;
  defaultPricePoint: PricePoint;
  lineOverrides: Array<{
    lineId: string;
    defaultSelected?: boolean;
    defaultQuantity?: number;
    defaultMaintenance?: boolean;
    customRates?: PricingRateOverride;
    notes?: string;
  }>;
  exportedEmailRecipients?: string[];
  workbookMapping?: PricingWorkbookMapping;
}

export interface QuoteDetails {
  clientName?: string;
  companyName?: string;
  preparedBy?: string;
  preparedForEmail?: string;
  notes?: string;
}

export interface LineSelection {
  lineId: string;
  selected?: boolean;
  quantity?: number;
  includeMaintenance?: boolean;
  overridePrice?: number | null;
  rateOverrides?: PricingRateOverride;
}

export interface PricingFormPayload {
  clientSize: ClientSize;
  pricePoint: PricePoint;
  quoteDetails?: QuoteDetails;
  selections: LineSelection[];
}

export interface PricingCalculationResponse {
  input: PricingFormPayload;
  result: {
    lines: PricingLineResult[];
    totals: PricingTotals;
  };
}

export interface PricingExportResponse {
  filename: string;
  contentType: string;
  data: string;
  result: {
    lines: PricingLineResult[];
    totals: PricingTotals;
  };
}
