import mongoose, { Schema } from "mongoose";
import type { PricingWorkbookMapping } from "../pricing/workbookMapping";

export interface PricingRateOverride {
  soloStartup?: { low?: number; high?: number; maintenance?: number };
  smallBusiness?: { low?: number; high?: number; maintenance?: number };
  midMarket?: { low?: number; high?: number; maintenance?: number };
}

export interface PricingLineOverride {
  lineId: string;
  defaultSelected?: boolean;
  defaultQuantity?: number;
  customRates?: PricingRateOverride;
  notes?: string;
}

export interface IPricingSettings {
  defaultClientSize: "Solo/Startup" | "Small Business" | "Mid-Market";
  defaultPricePoint: "Low" | "Midpoint" | "High";
  lineOverrides: PricingLineOverride[];
  lastUpdatedBy?: string;
  updatedAt: Date;
  exportedEmailRecipients?: string[];
  workbookMapping?: PricingWorkbookMapping;
}

const rateOverrideSchema = new Schema<PricingRateOverride>({
  soloStartup: {
    low: Number,
    high: Number,
    maintenance: Number,
  },
  smallBusiness: {
    low: Number,
    high: Number,
    maintenance: Number,
  },
  midMarket: {
    low: Number,
    high: Number,
    maintenance: Number,
  },
}, { _id: false, minimize: true });

const lineOverrideSchema = new Schema<PricingLineOverride>({
  lineId: { type: String, required: true },
  defaultSelected: { type: Boolean },
  defaultQuantity: { type: Number },
  customRates: { type: rateOverrideSchema, default: undefined },
  notes: { type: String },
}, { _id: false, minimize: true });

const rateColumnSetSchema = new Schema({
  low: { type: String },
  high: { type: String },
  maintenance: { type: String },
}, { _id: false, minimize: true });

const rateColumnsSchema = new Schema({
  soloStartup: { type: rateColumnSetSchema },
  smallBusiness: { type: rateColumnSetSchema },
  midMarket: { type: rateColumnSetSchema },
}, { _id: false, minimize: true });

const columnMappingSchema = new Schema({
  select: String,
  quantity: String,
  description: String,
  tier: String,
  service: String,
  billing: String,
  type: String,
  unitPrice: String,
  lineTotal: String,
  rateColumns: { type: rateColumnsSchema },
}, { _id: false, minimize: true });

const totalsSchema = new Schema({
  monthlySubtotal: String,
  oneTimeSubtotal: String,
  maintenanceSubtotal: String,
  grandTotal: String,
  ongoingMonthly: String,
}, { _id: false, minimize: true });

const lineRangeSchema = new Schema({
  startRow: Number,
  endRow: Number,
  maxEmptyRows: Number,
}, { _id: false, minimize: true });

const quoteFieldsSchema = new Schema({
  clientName: String,
  companyName: String,
  preparedBy: String,
  preparedForEmail: String,
  notes: String,
  clientSize: String,
  pricePoint: String,
}, { _id: false, minimize: true });

const workbookMappingSchema = new Schema({
  calculatorSheet: String,
  quoteSheet: String,
  clientSizeCell: String,
  pricePointCell: String,
  ongoingMonthlyCell: String,
  totals: { type: totalsSchema },
  lineItemsRange: { type: lineRangeSchema },
  columns: { type: columnMappingSchema },
  quoteFields: { type: quoteFieldsSchema },
}, { _id: false, minimize: true });

const pricingSettingsSchema = new Schema<IPricingSettings>({
  defaultClientSize: {
    type: String,
    enum: ["Solo/Startup", "Small Business", "Mid-Market"],
    default: "Solo/Startup",
  },
  defaultPricePoint: {
    type: String,
    enum: ["Low", "Midpoint", "High"],
    default: "Midpoint",
  },
  lineOverrides: {
    type: [lineOverrideSchema],
    default: [],
  },
  exportedEmailRecipients: {
    type: [String],
    default: [],
  },
  workbookMapping: {
    type: workbookMappingSchema,
    default: undefined,
  },
  lastUpdatedBy: String,
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

pricingSettingsSchema.index({}, { unique: true, sparse: true });

export const PricingSettingsModel =
  mongoose.models.PricingSettings ||
  mongoose.model<IPricingSettings>("PricingSettings", pricingSettingsSchema);
