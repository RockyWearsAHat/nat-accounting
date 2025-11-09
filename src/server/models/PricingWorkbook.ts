import mongoose, { Schema } from "mongoose";
import type {
  PricingBlueprint,
  PricingBlueprintOverrides,
  PricingWorkbookSnapshot,
} from "../pricing/blueprint";

export interface IPricingWorkbook {
  filename: string;
  mimeType: string;
  data: Buffer;
  size: number;
  uploadedAt: Date;
  uploadedBy?: string;
  snapshot?: PricingWorkbookSnapshot;
  blueprint?: PricingBlueprint;
  blueprintModel?: string;
  blueprintGeneratedAt?: Date;
  blueprintError?: string | null;
  blueprintOverrides?: PricingBlueprintOverrides;
}

const pricingWorkbookSchema = new Schema<IPricingWorkbook>(
  {
    filename: { type: String, required: true },
    mimeType: {
      type: String,
      default:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: () => new Date() },
    uploadedBy: { type: String },
    snapshot: { type: Schema.Types.Mixed, default: undefined },
    blueprint: { type: Schema.Types.Mixed, default: undefined },
    blueprintModel: { type: String },
    blueprintGeneratedAt: { type: Date },
    blueprintError: { type: String, default: null },
    blueprintOverrides: { type: Schema.Types.Mixed, default: undefined },
  },
  { minimize: true }
);

pricingWorkbookSchema.index({ uploadedAt: -1 });

export const PricingWorkbookModel =
  mongoose.models.PricingWorkbook ||
  mongoose.model<IPricingWorkbook>("PricingWorkbook", pricingWorkbookSchema);
