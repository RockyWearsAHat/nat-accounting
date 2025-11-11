import OpenAI from "openai";
import type {
  PricingBlueprint,
  PricingModifierBlueprint,
  PricingServiceBlueprint,
  PricingWorkbookSnapshot,
} from "./blueprint";

type OpenAIClient = InstanceType<typeof OpenAI>;

export interface AIBlueprintGeneratorOptions {
  openaiClient?: OpenAIClient;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

export async function generatePricingBlueprintWithAI(
  snapshot: PricingWorkbookSnapshot,
  options: AIBlueprintGeneratorOptions = {}
): Promise<PricingBlueprint> {
  const {
    model = process.env.OPENAI_PRICING_MODEL || "gpt-4.1",
    temperature = 0.1,
    systemPrompt =
    "You are a meticulous financial operations assistant extracting pricing services from accounting workbooks. Always ground every field in the spreadsheet data. Never invent placeholder titles or blank price bands.",
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!options.openaiClient && !apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set the environment variable to enable AI blueprint generation."
    );
  }

  const openaiClient = options.openaiClient ?? new OpenAI({ apiKey: apiKey! });

  const snapshotJson = JSON.stringify(snapshot);

  const requestPayload = {
    model,
    temperature,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "You are analyzing an Excel pricing workbook. Your job is to intelligently discover and extract the COMPLETE pricing structure from the BEST sheet.\n\n" +
              "**STEP 1: INTELLIGENT SHEET DISCOVERY**\n" +
              "- **Examine ALL sheets** in the workbook snapshot\n" +
              "- **Prioritize sheets with CALCULATOR functionality** over static pricing tables:\n" +
              "  * PREFER: Sheets with SELECT/QUANTITY columns (interactive calculator)\n" +
              "  * PREFER: Sheets with FORMULAS in unit price/line total columns\n" +
              "  * PREFER: Sheets named 'Calculator', 'Invoice', 'Quote', 'Pricing Calculator'\n" +
              "  * AVOID: Sheets with only static prices and no selection mechanism\n" +
              "  * AVOID: Sheets named 'Cost Breakdown', 'Price List', 'Reference'\n" +
              "- **Count total service rows** - choose the sheet with MORE comprehensive service listings\n" +
              "- If multiple sheets exist, analyze the calculator sheet FIRST\n\n" +
              "**STEP 2: DISCOVER COLUMN STRUCTURE**\n" +
              "Once you've selected the BEST sheet, discover which columns contain:\n" +
              "  * SELECT checkbox column (column A with TRUE/FALSE or checkboxes)\n" +
              "  * QUANTITY input column (column B with numbers for quantity)\n" +
              "  * TIER/Category column (grouping labels like 'Tier 1', 'Core Services')\n" +
              "  * SERVICE name column (the actual service names)\n" +
              "  * BILLING cadence column ('Monthly', 'Project', 'One-time', etc.)\n" +
              "  * UNIT PRICE column (calculated price - look for formulas referencing rate columns)\n" +
              "  * LINE TOTAL column (calculated total - look for formulas multiplying quantity × unit price)\n" +
              "  * TYPE column (optional - may contain 'Monthly'/'One-time' classifications)\n" +
              "  * RATE COLUMNS (multiple columns with prices for different client segments/price points)\n" +
              "- Detect the header row number (row with column labels like 'Service', 'Tier', 'Billing', prices)\n" +
              "- Find data start row (first row with actual service data after headers)\n" +
              "- **CRITICAL: Find data end row by scanning ALL rows** - don't stop at 25-30, continue until you find the LAST service row (may be row 40+)\n" +
              "- Include maintenance, add-on, and optional service sections\n\n" +
              "- **CRITICAL: Find data end row by scanning ALL rows** - don't stop at 25-30, continue until you find the LAST service row (may be row 40+)\n" +
              "- Include maintenance, add-on, and optional service sections\n\n" +
              "**STEP 3: EXTRACT COLUMN MAPPINGS**\n" +
              "- Return in metadata.columnMapping the LETTER of each discovered column:\n" +
              "  * select: column letter (e.g., 'A')\n" +
              "  * quantity: column letter (e.g., 'B')\n" +
              "  * tier: column letter (e.g., 'D')\n" +
              "  * service: column letter (e.g., 'E')\n" +
              "  * billing: column letter (e.g., 'F')\n" +
              "  * unitPrice: column letter containing CALCULATED unit price formulas (e.g., 'N' or 'R')\n" +
              "  * lineTotal: column letter containing CALCULATED line total formulas (e.g., 'O' or 'S')\n" +
              "  * type: column letter if type classification exists (may be null)\n" +
              "- Also return metadata.headerRow, metadata.dataStartRow, metadata.dataEndRow\n" +
              "- **In metadata.notes, state which sheet you analyzed and WHY you chose it**\n\n" +
              "**STEP 4: EXTRACT ALL SERVICES (DO NOT STOP EARLY)**\n" +
              "- For EVERY row with service data from dataStartRow to dataEndRow, extract:\n" +
              "  * Service name (must be concrete, not blank)\n" +
              "  * Tier/category\n" +
              "  * Billing cadence (descriptive label from workbook)\n" +
              "  * Charge type (recurring | one-time) - **CRITICAL CLASSIFICATION**:\n" +
              "    - **one-time**: Project, Session, Per Project, As Needed, One-time, Setup, Onboarding, Implementation, Initial\n" +
              "      * 'As Needed' means customer pays per-use/per-project, NOT recurring → MUST be 'one-time'\n" +
              "      * 'Project' means one-time project work → MUST be 'one-time'\n" +
              "    - **recurring**: Monthly, Quarterly, Annual, Retainer, Ongoing, Per Month\n" +
              "      * Only use 'recurring' if customer pays on a regular schedule\n" +
              "  * Source row number (the Excel row number for this service)\n" +
              "- **Do NOT skip rows** - if a service exists, include it\n" +
              "- Skip only blank rows and section headers (rows with tier labels but no service names)\n" +
              "- Skip totals/summary rows (typically after all services)\n" +
              "- Use RESOLVED/CALCULATED values from formulas\n" +
              "- **VERIFY: Count services extracted vs. total service rows** - they should match\n\n" +
              "- **VERIFY: Count services extracted vs. total service rows** - they should match\n\n" +
              "**STEP 5: IDENTIFY CLIENT SEGMENTS & EXTRACT PRICES**\n" +
              "- Find rate columns by looking for patterns like 'Solo_Low', 'Solo_High', 'Small_Low', etc. in headers\n" +
              "- Parse column names: segment name (before underscore) + price point name (after underscore)\n" +
              "- Expand abbreviated segment names:\n" +
              "  * 'Solo' → 'Solo/Startup'\n" +
              "  * 'Small' → 'Small Business'\n" +
              "  * 'Mid' → 'Mid-Market'\n" +
              "- For EACH service row, extract NUMERIC VALUES from all rate columns\n" +
              "- Example output for a service:\n" +
              "  rateBands: [\n" +
              "    { segment: 'Solo/Startup', pricePoints: { Low: 500, High: 800 } },\n" +
              "    { segment: 'Small Business', pricePoints: { Low: 900, High: 1500 } },\n" +
              "    { segment: 'Mid-Market', pricePoints: { Low: 1800, High: 2800 } }\n" +
              "  ]\n" +
              "- Extract actual numeric values (not formulas), convert empty/dash/N/A to null\n" +
              "- Use descriptive segment names that match form controls\n\n" +
              "**STEP 6: RETURN COMPLETE BLUEPRINT**\n" +
              "- Include discovered column mappings in metadata.columnMapping\n" +
              "- Include header row and data range in metadata\n" +
              "- **In metadata.notes, document:**\n" +
              "  * Which sheet you analyzed and why\n" +
              "  * Total service count extracted\n" +
              "  * Any sections included (base services, maintenance, add-ons, etc.)\n" +
              "- List ALL services with their data (should be 30+ services if calculator sheet has that many)\n" +
              "- Never invent placeholder data - discover structure from actual workbook\n" +
              "- Never stop at 25 services if more exist\n\n" +
              "Here is the workbook snapshot:",
          },
          {
            type: "input_text",
            text: snapshotJson,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "pricing_blueprint",
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "metadata",
            "clientSegments",
            "pricePoints",
            "services",
            "modifiers",
          ],
          properties: {
            id: { type: "string" },
            metadata: {
              type: "object",
              additionalProperties: false,
              required: [
                "workbookFilename",
                "workbookVersion",
                "generatedAt",
                "generatedBy",
                "notes",
                "columnMapping",
                "headerRow",
                "dataStartRow",
                "dataEndRow",
              ],
              properties: {
                workbookFilename: { type: "string", nullable: true },
                workbookVersion: { type: "string", nullable: true },
                generatedAt: { type: "string" },
                generatedBy: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
                columnMapping: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  required: ["select", "quantity", "tier", "service", "billing", "unitPrice", "lineTotal", "type"],
                  properties: {
                    select: { type: "string", nullable: true },
                    quantity: { type: "string", nullable: true },
                    tier: { type: "string", nullable: true },
                    service: { type: "string", nullable: true },
                    billing: { type: "string", nullable: true },
                    unitPrice: { type: "string", nullable: true },
                    lineTotal: { type: "string", nullable: true },
                    type: { type: "string", nullable: true },
                  },
                },
                headerRow: { type: "number", nullable: true },
                dataStartRow: { type: "number", nullable: true },
                dataEndRow: { type: "number", nullable: true },
              },
            },
            clientSegments: {
              type: "array",
              items: { type: "string" },
            },
            pricePoints: {
              type: "array",
              items: { type: "string" },
            },
            services: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "id",
                  "sourceRow",
                  "tier",
                  "name",
                  "billingCadence",
                  "chargeType",
                  "description",
                  "defaultSelected",
                  "defaultQuantity",
                  "rateBands",
                  "components",
                  "tags",
                ],
                properties: {
                  id: { type: "string" },
                  sourceRow: { type: "number", nullable: true },
                  tier: { type: "string", nullable: true },
                  name: { type: "string" },
                  billingCadence: { type: "string" },
                  chargeType: {
                    type: "string",
                    enum: ["recurring", "one-time"]
                  },
                  description: { type: "string", nullable: true },
                  defaultSelected: { type: "boolean", nullable: true },
                  defaultQuantity: { type: "number", nullable: true },
                  rateBands: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["segment"],
                      properties: {
                        segment: { type: "string" },
                        pricePoints: {
                          type: "object",
                          additionalProperties: {
                            type: "number",
                            nullable: true
                          }
                        }
                      },
                    },
                  },
                  components: {
                    type: "array",
                    nullable: true,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "label", "description", "coverage"],
                      properties: {
                        id: { type: "string" },
                        label: { type: "string" },
                        description: { type: "string", nullable: true },
                        coverage: {
                          type: "array",
                          nullable: true,
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  tags: {
                    type: "array",
                    nullable: true,
                    items: { type: "string" },
                  },
                },
              },
            },
            modifiers: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "id",
                  "label",
                  "description",
                  "inputType",
                  "defaultValue",
                  "options",
                  "affects",
                ],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string", nullable: true },
                  inputType: { type: "string", enum: ["number", "boolean", "select", "multiselect"] },
                  defaultValue: {
                    anyOf: [
                      { type: "number" },
                      { type: "boolean" },
                      { type: "string" },
                      {
                        type: "array",
                        items: { type: "string" },
                      },
                      { type: "null" },
                    ],
                  },
                  options: {
                    type: "array",
                    nullable: true,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["value", "label", "description"],
                      properties: {
                        value: { type: "string" },
                        label: { type: "string" },
                        description: { type: "string", nullable: true },
                      },
                    },
                  },
                  affects: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  } satisfies Record<string, unknown>;

  const response = await openaiClient.responses.create(requestPayload as any);

  const serialized = response.output_text?.trim();

  if (!serialized) {
    throw new Error("AI blueprint generation failed: empty response payload");
  }

  const raw = JSON.parse(serialized) as any;

  const toNullableString = (value: any): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const toNullableNumber = (value: any): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const toBooleanOrUndefined = (value: any): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

  const mapServices = (): PricingServiceBlueprint[] => {
    if (!Array.isArray(raw?.services)) {
      return [];
    }

    return raw.services.map((service: any, index: number) => {
      const rateBandsEntries = Array.isArray(service?.rateBands) ? service.rateBands : [];
      const rateBands: PricingServiceBlueprint["rateBands"] = {};

      // NEW: Handle flexible rate band structure
      for (const entry of rateBandsEntries) {
        if (!entry || typeof entry !== "object") continue;
        const segment = toNullableString(entry.segment);
        if (!segment) continue;

        // Extract all price points (flexible keys like low/high/maintenance OR bronze/silver/gold)
        const pricePoints: Record<string, number | null> = {};
        if (entry.pricePoints && typeof entry.pricePoints === "object") {
          for (const [key, value] of Object.entries(entry.pricePoints)) {
            pricePoints[key] = toNullableNumber(value) ?? null;
          }
        }

        rateBands[segment] = pricePoints;
      }

      let components: PricingServiceBlueprint["components"];
      if (Array.isArray(service?.components)) {
        const normalizedComponents: NonNullable<PricingServiceBlueprint["components"]> = [];
        for (const rawComponent of service.components as unknown[]) {
          if (!rawComponent || typeof rawComponent !== "object") continue;
          const component = rawComponent as Record<string, unknown>;
          const id = toNullableString(component.id);
          const label = toNullableString(component.label);
          if (!id || !label) continue;

          let coverage: string[] | undefined;
          if (Array.isArray(component.coverage)) {
            const collected: string[] = [];
            for (const item of component.coverage as unknown[]) {
              const value = toNullableString(item);
              if (value) collected.push(value);
            }
            coverage = collected.length ? collected : undefined;
          }

          normalizedComponents.push({
            id,
            label,
            description: toNullableString(component.description),
            coverage,
          });
        }

        if (normalizedComponents.length) {
          components = normalizedComponents;
        }
      }

      let tags: string[] | undefined;
      if (Array.isArray(service?.tags)) {
        const collected: string[] = [];
        for (const rawTag of service.tags as unknown[]) {
          const tag = toNullableString(rawTag);
          if (tag) collected.push(tag);
        }
        if (collected.length) {
          tags = collected;
        }
      }

      // NEW: Extract chargeType from AI response, default to recurring if missing
      const chargeType = (toNullableString(service?.chargeType) ?? "recurring") as "recurring" | "one-time";

      return {
        id: toNullableString(service?.id) ?? `service-${index}`,
        sourceRow: toNullableNumber(service?.sourceRow),
        tier: toNullableString(service?.tier),
        name: toNullableString(service?.name) ?? `Service ${index + 1}`,
        billingCadence: toNullableString(service?.billingCadence) ?? "Monthly",
        chargeType, // NEW: Add chargeType from AI
        description: toNullableString(service?.description),
        defaultSelected: toBooleanOrUndefined(service?.defaultSelected),
        defaultQuantity: toNullableNumber(service?.defaultQuantity),
        rateBands,
        components,
        tags,
      } satisfies PricingServiceBlueprint;
    });
  };

  const mapModifiers = (): PricingModifierBlueprint[] | undefined => {
    if (!Array.isArray(raw?.modifiers)) {
      return undefined;
    }

    const modifiers: PricingModifierBlueprint[] = [];

    for (const rawModifier of raw.modifiers as unknown[]) {
      if (!rawModifier || typeof rawModifier !== "object") continue;
      const modifier = rawModifier as Record<string, unknown>;

      const id = toNullableString(modifier.id);
      const label = toNullableString(modifier.label);
      const inputType = toNullableString(modifier.inputType) as PricingModifierBlueprint["inputType"] | undefined;

      if (!id || !label || !inputType) {
        continue;
      }

      let options: PricingModifierBlueprint["options"];
      if (Array.isArray(modifier.options)) {
        const collected: NonNullable<PricingModifierBlueprint["options"]> = [];
        for (const rawOption of modifier.options as unknown[]) {
          if (!rawOption || typeof rawOption !== "object") continue;
          const option = rawOption as Record<string, unknown>;
          const value = toNullableString(option.value);
          const optLabel = toNullableString(option.label);
          if (!value || !optLabel) continue;
          collected.push({
            value,
            label: optLabel,
            description: toNullableString(option.description),
          });
        }
        if (collected.length) {
          options = collected;
        }
      }

      let defaultValue: PricingModifierBlueprint["defaultValue"];
      if (Array.isArray(modifier.defaultValue)) {
        const collected: string[] = [];
        for (const item of modifier.defaultValue as unknown[]) {
          const value = toNullableString(item);
          if (value) collected.push(value);
        }
        defaultValue = collected.length ? collected : undefined;
      } else if (typeof modifier.defaultValue === "string") {
        defaultValue = toNullableString(modifier.defaultValue);
      } else if (typeof modifier.defaultValue === "number") {
        defaultValue = modifier.defaultValue;
      } else if (typeof modifier.defaultValue === "boolean") {
        defaultValue = modifier.defaultValue;
      } else {
        defaultValue = undefined;
      }

      const affects: string[] = [];
      if (Array.isArray(modifier.affects)) {
        for (const value of modifier.affects as unknown[]) {
          const affect = toNullableString(value);
          if (affect) affects.push(affect);
        }
      }

      modifiers.push({
        id,
        label,
        description: toNullableString(modifier.description),
        inputType,
        defaultValue,
        options,
        affects,
      });
    }

    return modifiers.length ? modifiers : undefined;
  };

  const clientSegments: string[] = [];
  if (Array.isArray(raw?.clientSegments)) {
    for (const segment of raw.clientSegments as unknown[]) {
      const value = toNullableString(segment);
      if (value) clientSegments.push(value);
    }
  }

  const pricePoints: string[] = [];
  if (Array.isArray(raw?.pricePoints)) {
    for (const point of raw.pricePoints as unknown[]) {
      const value = toNullableString(point);
      if (value) pricePoints.push(value);
    }
  }

  const blueprint: PricingBlueprint = {
    id: toNullableString(raw?.id) ?? "pricing-blueprint",
    metadata: {
      workbookFilename: toNullableString(raw?.metadata?.workbookFilename),
      workbookVersion: toNullableString(raw?.metadata?.workbookVersion),
      generatedAt: toNullableString(raw?.metadata?.generatedAt) ?? new Date().toISOString(),
      generatedBy: toNullableString(raw?.metadata?.generatedBy),
      notes: toNullableString(raw?.metadata?.notes),
    },
    clientSegments,
    pricePoints,
    services: mapServices(),
    modifiers: mapModifiers(),
  };

  return blueprint;
}
