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

export const DEFAULT_PRICING_WORKBOOK_MAPPING: PricingWorkbookMapping = {
  calculatorSheet: "Calculator",
  quoteSheet: "Quote Builder",
  clientSizeCell: "D4",
  pricePointCell: "E4",
  ongoingMonthlyCell: "B36",
  totals: {
    monthlySubtotal: "B32",
    oneTimeSubtotal: "B33",
    maintenanceSubtotal: "B34",
    grandTotal: "B35",
    ongoingMonthly: "B36",
  },
  lineItemsRange: {
    startRow: 10,
    endRow: 200,
    maxEmptyRows: 3,
  },
  columns: {
    select: "A",
    quantity: "B",
    maintenanceToggle: "C",
    description: undefined,
    tier: "D",
    service: "E",
    billing: "F",
    type: "T",
    unitPrice: "R",
    lineTotal: "S",
    maintenanceTotal: "U",
    rateColumns: {
      soloStartup: { low: "G", high: "H", maintenance: "I" },
      smallBusiness: { low: "J", high: "K", maintenance: "L" },
      midMarket: { low: "M", high: "N", maintenance: "O" },
    },
  },
  quoteFields: {
    clientName: "B5",
    companyName: "B6",
    preparedBy: "B7",
    preparedForEmail: "E7",
    notes: "B9",
    clientSize: "E5",
    pricePoint: "E6",
  },
};

export function mergeWorkbookMapping(
  overrides?: Partial<PricingWorkbookMapping>
): PricingWorkbookMapping {
  const base = DEFAULT_PRICING_WORKBOOK_MAPPING;
  const o = overrides ?? {};

  const mergeRate = (
    baseSet: PricingWorkbookRateColumnSet,
    overrideSet?: Partial<PricingWorkbookRateColumnSet>
  ): PricingWorkbookRateColumnSet => ({
    low: overrideSet?.low ?? baseSet.low,
    high: overrideSet?.high ?? baseSet.high,
    maintenance: overrideSet?.maintenance ?? baseSet.maintenance,
  });

  return {
    calculatorSheet: o.calculatorSheet ?? base.calculatorSheet,
    quoteSheet: o.quoteSheet ?? base.quoteSheet,
    clientSizeCell: o.clientSizeCell ?? base.clientSizeCell,
    pricePointCell: o.pricePointCell ?? base.pricePointCell,
    ongoingMonthlyCell: o.ongoingMonthlyCell ?? base.ongoingMonthlyCell,
    totals: {
      monthlySubtotal: o.totals?.monthlySubtotal ?? base.totals.monthlySubtotal,
      oneTimeSubtotal: o.totals?.oneTimeSubtotal ?? base.totals.oneTimeSubtotal,
      maintenanceSubtotal:
        o.totals?.maintenanceSubtotal ?? base.totals.maintenanceSubtotal,
      grandTotal: o.totals?.grandTotal ?? base.totals.grandTotal,
      ongoingMonthly:
        o.totals?.ongoingMonthly ??
        o.ongoingMonthlyCell ??
        base.totals.ongoingMonthly,
    },
    lineItemsRange: {
      startRow: o.lineItemsRange?.startRow ?? base.lineItemsRange.startRow,
      endRow: o.lineItemsRange?.endRow ?? base.lineItemsRange.endRow,
      maxEmptyRows: o.lineItemsRange?.maxEmptyRows ?? base.lineItemsRange.maxEmptyRows,
    },
    columns: {
      select: o.columns?.select ?? base.columns.select,
      quantity: o.columns?.quantity ?? base.columns.quantity,
      maintenanceToggle: o.columns?.maintenanceToggle ?? base.columns.maintenanceToggle,
      description: o.columns?.description ?? base.columns.description,
      tier: o.columns?.tier ?? base.columns.tier,
      service: o.columns?.service ?? base.columns.service,
      billing: o.columns?.billing ?? base.columns.billing,
      type: o.columns?.type ?? base.columns.type,
      unitPrice: o.columns?.unitPrice ?? base.columns.unitPrice,
      lineTotal: o.columns?.lineTotal ?? base.columns.lineTotal,
      maintenanceTotal: o.columns?.maintenanceTotal ?? base.columns.maintenanceTotal,
      rateColumns: {
        soloStartup: mergeRate(
          base.columns.rateColumns.soloStartup,
          o.columns?.rateColumns?.soloStartup
        ),
        smallBusiness: mergeRate(
          base.columns.rateColumns.smallBusiness,
          o.columns?.rateColumns?.smallBusiness
        ),
        midMarket: mergeRate(
          base.columns.rateColumns.midMarket,
          o.columns?.rateColumns?.midMarket
        ),
      },
    },
    quoteFields:
      base.quoteFields || o.quoteFields
        ? {
            clientName: o.quoteFields?.clientName ?? base.quoteFields?.clientName,
            companyName: o.quoteFields?.companyName ?? base.quoteFields?.companyName,
            preparedBy: o.quoteFields?.preparedBy ?? base.quoteFields?.preparedBy,
            preparedForEmail:
              o.quoteFields?.preparedForEmail ?? base.quoteFields?.preparedForEmail,
            notes: o.quoteFields?.notes ?? base.quoteFields?.notes,
            clientSize: o.quoteFields?.clientSize ?? base.quoteFields?.clientSize,
            pricePoint: o.quoteFields?.pricePoint ?? base.quoteFields?.pricePoint,
          }
        : undefined,
  };
}
