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
    systemPrompt = "You are a financial operations assistant that extracts pricing services from accounting workbooks.",
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
            text: "Extract services, tiers, billing cadence, and price bands from the following workbook snapshot. Return only valid JSON that satisfies the provided schema.",
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
              ],
              properties: {
                workbookFilename: { type: "string", nullable: true },
                workbookVersion: { type: "string", nullable: true },
                generatedAt: { type: "string" },
                generatedBy: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
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
                  "description",
                  "defaultSelected",
                  "defaultQuantity",
                  "defaultMaintenance",
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
                  description: { type: "string", nullable: true },
                  defaultSelected: { type: "boolean", nullable: true },
                  defaultQuantity: { type: "number", nullable: true },
                  defaultMaintenance: { type: "boolean", nullable: true },
                  rateBands: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["segment", "low", "high", "maintenance"],
                      properties: {
                        segment: { type: "string" },
                        low: { type: "number", nullable: true },
                        high: { type: "number", nullable: true },
                        maintenance: { type: "number", nullable: true },
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

      for (const entry of rateBandsEntries) {
        if (!entry || typeof entry !== "object") continue;
        const segment = toNullableString(entry.segment);
        if (!segment) continue;

        rateBands[segment] = {
          low: toNullableNumber(entry.low) ?? null,
          high: toNullableNumber(entry.high) ?? null,
          maintenance: toNullableNumber(entry.maintenance) ?? null,
        };
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

      return {
        id: toNullableString(service?.id) ?? `service-${index}`,
        sourceRow: toNullableNumber(service?.sourceRow),
        tier: toNullableString(service?.tier),
        name: toNullableString(service?.name) ?? `Service ${index + 1}`,
        billingCadence: toNullableString(service?.billingCadence) ?? "Monthly",
        description: toNullableString(service?.description),
        defaultSelected: toBooleanOrUndefined(service?.defaultSelected),
        defaultQuantity: toNullableNumber(service?.defaultQuantity),
        defaultMaintenance: toBooleanOrUndefined(service?.defaultMaintenance),
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
