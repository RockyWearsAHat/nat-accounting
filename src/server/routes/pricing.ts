import { Router } from "express";
import type { HydratedDocument } from "mongoose";
import { requireAdmin, requireAuth } from "../middleware/auth";
import {
  calculatePricing,
  getPricingMetadata,
  PricingCalculationInput,
  PricingLineSelection,
  invalidatePricingWorkbookCache,
  workbookToBuffer,
  workbookToCsv,
} from "../pricing/parser";
import {
  IPricingSettings,
  PricingSettingsModel,
  PricingLineOverride,
} from "../models/PricingSettings";
import { PricingWorkbookModel, type IPricingWorkbook } from "../models/PricingWorkbook";
import type { ClientSize, PricePoint, PricingMetadata, QuoteDetails } from "../pricing/parser";
import { sendPricingQuoteEmail } from "../services/MailService";
import { mergeWorkbookMapping } from "../pricing/workbookMapping";
import type { PricingWorkbookMapping } from "../pricing/workbookMapping";
import { extractWorkbookSnapshotFromBuffer } from "../pricing/workbookAnalyzer";
import { generatePricingBlueprintWithAI } from "../pricing/aiBlueprintGenerator";
import { generateDeterministicPricingBlueprint } from "../pricing/deterministicBlueprint";
import {
  mergeBlueprintWithOverrides,
  sanitizeBlueprintOverrides,
} from "../pricing/blueprintOverrides";
import type { PricingBlueprintOverrides } from "../pricing/blueprint";

const router = Router();

const WORKBOOK_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function serializeWorkbook(doc: IPricingWorkbook | null) {
  if (!doc) return null;
  const mergedBlueprint = mergeBlueprintWithOverrides(
    doc.blueprint ?? null,
    doc.blueprintOverrides ?? undefined
  );
  return {
    filename: doc.filename,
    size: doc.size,
    uploadedAt: doc.uploadedAt?.toISOString?.() || null,
    blueprint: doc.blueprint,
    blueprintModel: doc.blueprintModel || null,
    blueprintGeneratedAt: doc.blueprintGeneratedAt?.toISOString?.() || null,
    blueprintError: doc.blueprintError ?? null,
    blueprintOverrides: doc.blueprintOverrides ?? null,
    blueprintMerged: mergedBlueprint,
    snapshot: doc.snapshot,
  };
}

type PricingWorkbookDocument = HydratedDocument<IPricingWorkbook>;

function workbookHasBinary(doc: PricingWorkbookDocument | null): boolean {
  if (!doc) return false;
  const data = doc.data as Buffer | undefined;
  return Boolean(data && data.length);
}

async function runWorkbookAnalysis(
  doc: PricingWorkbookDocument | null,
  mapping?: PricingWorkbookMapping
): Promise<{ doc: PricingWorkbookDocument | null; error?: string }> {
  if (!doc || !doc.data || !doc.data.length) {
    return { doc, error: "Workbook data is not available for analysis." };
  }

  const attemptedModel = process.env.OPENAI_PRICING_MODEL || "gpt-4.1";
  const resolvedMapping = mapping ?? mergeWorkbookMapping();

  let snapshot;
  try {
    snapshot = extractWorkbookSnapshotFromBuffer(doc.data);
  } catch (error: any) {
    const message =
      error?.message ||
      (typeof error === "string" ? error : "Failed to read pricing workbook snapshot.");
    doc.blueprint = undefined;
    doc.blueprintModel = attemptedModel;
    doc.blueprintGeneratedAt = new Date();
    doc.blueprintError = message;
    console.error("[pricing] Workbook snapshot extraction failed", error);
    await doc.save();
    return { doc, error: message };
  }

  doc.snapshot = snapshot;

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  let aiError: string | undefined;

  if (hasApiKey) {
    try {
      const blueprint = await generatePricingBlueprintWithAI(snapshot, {
        model: attemptedModel,
      });
      doc.blueprint = blueprint;
      doc.blueprintModel = attemptedModel;
      doc.blueprintGeneratedAt = new Date();
      doc.blueprintError = null;
      await doc.save();
      return { doc };
    } catch (error: any) {
      aiError =
        error?.message ||
        (typeof error === "string" ? error : "Failed to generate pricing blueprint.");
      console.error("[pricing] AI blueprint generation failed", error);
    }
  }

  const fallbackBlueprint = generateDeterministicPricingBlueprint(snapshot, resolvedMapping, {
    workbookFilename: doc.filename,
  });

  doc.blueprint = fallbackBlueprint;
  doc.blueprintModel = hasApiKey ? `${attemptedModel} (fallback)` : "deterministic-summary";
  doc.blueprintGeneratedAt = new Date();
  doc.blueprintError = hasApiKey ? aiError ?? null : null;

  await doc.save();
  return { doc, error: hasApiKey ? aiError : undefined };
}

router.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[pricing] ${req.method} ${req.originalUrl}`);
  }
  next();
});

function coerceClientSize(value: any, fallback: ClientSize): ClientSize {
  const allowed: ClientSize[] = ["Solo/Startup", "Small Business", "Mid-Market"];
  return allowed.includes(value) ? (value as ClientSize) : fallback;
}

function coercePricePoint(value: any, fallback: PricePoint): PricePoint {
  const allowed: PricePoint[] = ["Low", "Midpoint", "High"];
  return allowed.includes(value) ? (value as PricePoint) : fallback;
}

function mergeLineOverrides(
  metadata: PricingMetadata,
  defaults: PricingLineOverride[],
  incoming?: PricingLineSelection[]
): PricingLineSelection[] {
  const merged: PricingLineSelection[] = [];
  const overrideMap = new Map(defaults.map((o) => [o.lineId, o]));
  const incomingMap = new Map((incoming || []).map((i) => [i.lineId, i]));

  for (const line of metadata.lineItems) {
    const defaultsOverride = overrideMap.get(line.id);
    const incomingSelection = incomingMap.get(line.id);

    merged.push({
      lineId: line.id,
      selected:
        incomingSelection?.selected ??
        defaultsOverride?.defaultSelected ??
        line.defaultSelected,
      quantity:
        incomingSelection?.quantity ??
        defaultsOverride?.defaultQuantity ??
        line.defaultQuantity,
      includeMaintenance:
        incomingSelection?.includeMaintenance ??
        defaultsOverride?.defaultMaintenance ??
        line.defaultMaintenance,
      rateOverrides: incomingSelection?.rateOverrides ?? defaultsOverride?.customRates,
      overridePrice: incomingSelection?.overridePrice ?? null,
    });
  }

  return merged;
}

function buildCalculationInput(
  metadata: PricingMetadata,
  body: any,
  settings: IPricingSettings | null
): PricingCalculationInput {
  const clientSize = coerceClientSize(
    body?.clientSize ?? settings?.defaultClientSize ?? metadata.clientSizes[0],
    metadata.clientSizes[0]
  );
  const pricePoint = coercePricePoint(
    body?.pricePoint ?? settings?.defaultPricePoint ?? metadata.pricePoints[1],
    metadata.pricePoints[1]
  );

  const selections = mergeLineOverrides(
    metadata,
    settings?.lineOverrides || [],
    body?.selections
  );
  const quoteDetails: QuoteDetails | undefined = body?.quoteDetails;

  return {
    clientSize,
    pricePoint,
    selections,
    quoteDetails,
  };
}

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const settings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();
  const workbookMapping = mergeWorkbookMapping(settings?.workbookMapping);

  let metadata: PricingMetadata | null = null;
  let defaults: PricingCalculationInput | null = null;
  let message: string | null = null;

  let workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
  const hasBinary = workbookHasBinary(workbookDoc);
  let setupRequired = !hasBinary;

  try {
    metadata = await getPricingMetadata(false, settings?.workbookMapping);
    defaults = buildCalculationInput(metadata, {}, settings || null);
  } catch (error: any) {
    const errorMessage =
      error?.message ||
      (typeof error === "string" ? error : "Failed to load pricing metadata.");
    message = errorMessage;
    setupRequired = true;
    console.warn("[pricing] Unable to load pricing metadata:", error);
  }

  if (!hasBinary && !message) {
    message = "No pricing workbook found. Upload a workbook to enable the calculator.";
  }

  if (workbookDoc && hasBinary) {
    const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
    const uploadedAt = workbookDoc.uploadedAt?.getTime() ?? 0;
    const generatedAt = workbookDoc.blueprintGeneratedAt?.getTime() ?? 0;
    const needsAnalysis =
      !workbookDoc.blueprintGeneratedAt ||
      (!workbookDoc.blueprint && hasApiKey) ||
      generatedAt < uploadedAt ||
      (workbookDoc.blueprintError && hasApiKey);

    if (needsAnalysis) {
      const analysis = await runWorkbookAnalysis(workbookDoc, workbookMapping);
      workbookDoc = analysis.doc;
      if (analysis.error) {
        console.warn("[pricing] Workbook analysis warning:", analysis.error);
      }
    }
  } else if (workbookDoc && !hasBinary) {
    setupRequired = true;
    message =
      message ??
      "Stored pricing workbook is empty. Upload a fresh workbook to enable the calculator.";
  }

  const workbookInfo = workbookDoc
    ? serializeWorkbook(workbookDoc.toObject() as IPricingWorkbook)
    : null;

  res.json({
    metadata,
    settings,
    defaults: defaults ?? null,
    workbook: workbookInfo,
    mapping: workbookMapping,
    setupRequired,
    message,
  });
});

router.post("/calculate", requireAuth, requireAdmin, async (req, res) => {
  const settings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();

  let metadata: PricingMetadata;
  try {
    metadata = await getPricingMetadata(false, settings?.workbookMapping);
  } catch (error: any) {
    const message =
      error?.message ||
      (typeof error === "string" ? error : "Upload a pricing workbook before calculating.");
    return res.status(400).json({ error: message });
  }

  const calculationInput = buildCalculationInput(metadata, req.body || {}, settings || null);
  const result = await calculatePricing(calculationInput, { metadata });
  res.json({
    input: calculationInput,
    result: {
      lines: result.lines,
      totals: result.totals,
    },
  });
});

router.put("/settings", requireAuth, requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const currentSettings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();

  let metadata: PricingMetadata;
  try {
    metadata = await getPricingMetadata(false, currentSettings?.workbookMapping);
  } catch (error: any) {
    const message =
      error?.message ||
      (typeof error === "string" ? error : "Upload a pricing workbook before saving settings.");
    return res.status(400).json({ error: message });
  }

  const defaultClientSize = coerceClientSize(
    payload.defaultClientSize,
    metadata.clientSizes[0]
  );
  const defaultPricePoint = coercePricePoint(
    payload.defaultPricePoint,
    metadata.pricePoints[1]
  );

  const lineOverrides: PricingLineOverride[] = Array.isArray(payload.lineOverrides)
    ? payload.lineOverrides
        .map((override: any) => ({
          lineId: override.lineId,
          defaultSelected: override.defaultSelected,
          defaultQuantity: override.defaultQuantity,
          defaultMaintenance: override.defaultMaintenance,
          customRates: override.customRates,
          notes: override.notes,
        }))
        .filter((override: PricingLineOverride) => override.lineId)
    : [];

  const exportRecipients: string[] = Array.isArray(payload.exportedEmailRecipients)
    ? payload.exportedEmailRecipients.filter((value: any) => typeof value === "string" && value)
    : [];

  let workbookMapping = currentSettings?.workbookMapping;
  if (payload.workbookMapping) {
    workbookMapping = mergeWorkbookMapping(payload.workbookMapping);
  }

  const document = await PricingSettingsModel.findOneAndUpdate(
    {},
    {
      defaultClientSize,
      defaultPricePoint,
      lineOverrides,
      exportedEmailRecipients: exportRecipients,
      workbookMapping,
      lastUpdatedBy: req.user?.email,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean<IPricingSettings | null>();

  if (document?.workbookMapping) {
    await getPricingMetadata(true, document.workbookMapping);
  }

  res.json({ settings: document });
});

router.put("/workbook", requireAuth, requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.workbookMapping) {
      return res.status(400).json({ error: "workbookMapping is required." });
    }

    const mergedMapping = mergeWorkbookMapping(payload.workbookMapping);
    const workbookPayload = payload.workbook;

    let workbookDoc: PricingWorkbookDocument | null = null;
    let workbookUpdated = false;

    if (workbookPayload?.data) {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(workbookPayload.data, "base64");
      } catch (error) {
        return res.status(400).json({ error: "Invalid workbook data payload." });
      }

      if (!buffer.length) {
        return res.status(400).json({ error: "Workbook file is empty." });
      }

      const filename =
        (typeof workbookPayload.filename === "string" && workbookPayload.filename.trim()) ||
        "pricing-workbook.xlsx";
      const mimeType =
        (typeof workbookPayload.contentType === "string" &&
          workbookPayload.contentType.trim()) ||
        WORKBOOK_CONTENT_TYPE;

      workbookDoc = await PricingWorkbookModel.findOneAndUpdate(
        {},
        {
          filename,
          mimeType,
          data: buffer,
          size: buffer.length,
          uploadedAt: new Date(),
          uploadedBy: req.user?.email,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      workbookUpdated = true;
      invalidatePricingWorkbookCache();
    } else {
      workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
    }

    const updatedSettings = await PricingSettingsModel.findOneAndUpdate(
      {},
      {
        $set: {
          workbookMapping: mergedMapping,
          lastUpdatedBy: req.user?.email,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<IPricingSettings | null>();

    if (workbookUpdated || mergedMapping) {
      await getPricingMetadata(true, mergedMapping);
    }

    if (workbookDoc) {
      const { error: analysisError } = await runWorkbookAnalysis(workbookDoc, mergedMapping);
      if (analysisError) {
        console.warn("[pricing] Workbook analysis completed with warnings:", analysisError);
      }
    }

    const workbookInfo = serializeWorkbook(
      workbookDoc ? (workbookDoc.toObject() as IPricingWorkbook) : null
    );

    res.json({
      mapping: mergedMapping,
      workbook: workbookInfo,
      settings: updatedSettings,
      analysisError: workbookInfo?.blueprintError || null,
    });
  } catch (error: any) {
    console.error("[pricing] Failed to store workbook", error);
    res.status(500).json({
      error: error?.message || "Failed to save workbook mapping.",
    });
  }
});

router.get("/blueprint", requireAuth, requireAdmin, async (_req, res) => {
  const settings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();
  const mapping = mergeWorkbookMapping(settings?.workbookMapping);

  let workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
  if (!workbookDoc || !workbookHasBinary(workbookDoc)) {
    return res.status(404).json({ error: "No pricing workbook has been uploaded." });
  }

  if (!workbookDoc.blueprintGeneratedAt || !workbookDoc.blueprint) {
    const analysis = await runWorkbookAnalysis(workbookDoc, mapping);
    workbookDoc = analysis.doc;
  }

  const workbookInfo = serializeWorkbook(
    workbookDoc ? (workbookDoc.toObject() as IPricingWorkbook) : null
  );

  res.json({
    workbook: workbookInfo,
    blueprint: workbookInfo?.blueprint ?? null,
    overrides: workbookInfo?.blueprintOverrides ?? null,
    merged: workbookInfo?.blueprintMerged ?? null,
  });
});

router.put("/blueprint", requireAuth, requireAdmin, async (req, res) => {
  const overridesPayload = sanitizeBlueprintOverrides(
    (req.body?.overrides as PricingBlueprintOverrides | null | undefined) ?? undefined
  );

  const workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
  if (!workbookDoc || !workbookHasBinary(workbookDoc)) {
    return res.status(400).json({ error: "Upload a pricing workbook before saving rules." });
  }

  if (overridesPayload) {
    workbookDoc.blueprintOverrides = overridesPayload;
  } else {
    workbookDoc.blueprintOverrides = undefined;
  }
  await workbookDoc.save();

  invalidatePricingWorkbookCache();

  const merged = mergeBlueprintWithOverrides(
    workbookDoc.blueprint ?? null,
    workbookDoc.blueprintOverrides ?? undefined
  );

  res.json({
    overrides: workbookDoc.blueprintOverrides ?? null,
    mergedBlueprint: merged,
  });
});

router.post("/blueprint/reanalyze", requireAuth, requireAdmin, async (_req, res) => {
  const settings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();
  const mapping = mergeWorkbookMapping(settings?.workbookMapping);

  const workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
  if (!workbookDoc || !workbookHasBinary(workbookDoc)) {
    return res.status(400).json({ error: "Upload a pricing workbook before running analysis." });
  }

  const analysis = await runWorkbookAnalysis(workbookDoc, mapping);

  invalidatePricingWorkbookCache();

  const workbookInfo = serializeWorkbook(
    analysis.doc ? (analysis.doc.toObject() as IPricingWorkbook) : null
  );

  res.json({
    workbook: workbookInfo,
    error: analysis.error ?? null,
  });
});

router.post("/export", requireAuth, requireAdmin, async (req, res) => {
  const { format = "xlsx", emailTo } = req.body || {};
  const settings = await PricingSettingsModel.findOne().lean<IPricingSettings | null>();

  let metadata: PricingMetadata;
  try {
    metadata = await getPricingMetadata(false, settings?.workbookMapping);
  } catch (error: any) {
    const message =
      error?.message ||
      (typeof error === "string" ? error : "Upload a pricing workbook before exporting quotes.");
    return res.status(400).json({ error: message });
  }
  const calculationInput = buildCalculationInput(metadata, req.body || {}, settings || null);
  const calculation = await calculatePricing(calculationInput, { metadata });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filenameBase = `quote-${calculationInput.clientSize}-${calculationInput.pricePoint}-${timestamp}`;

  let fileBuffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === "csv") {
    const csv = workbookToCsv(calculation.workbook);
    fileBuffer = Buffer.from(csv, "utf8");
    contentType = "text/csv";
    filename = `${filenameBase}.csv`;
  } else {
    fileBuffer = workbookToBuffer(calculation.workbook);
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    filename = `${filenameBase}.xlsx`;
  }

  if (emailTo) {
    try {
      const recipients = Array.isArray(emailTo) ? emailTo : [emailTo];
      if (recipients.length) {
        await sendPricingQuoteEmail({
          to: recipients,
          attachment: {
            filename,
            content: fileBuffer,
            contentType,
          },
          context: {
            clientSize: calculationInput.clientSize,
            pricePoint: calculationInput.pricePoint,
            quoteDetails: calculationInput.quoteDetails,
            totals: calculation.totals,
          },
        });
      }
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || "Failed to send email. Please verify SMTP settings.",
      });
    }
  }

  res.json({
    filename,
    contentType,
    data: fileBuffer.toString("base64"),
    result: {
      lines: calculation.lines,
      totals: calculation.totals,
    },
  });
});

export default router;
export { router };
