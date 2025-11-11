import type {
  PricingBlueprint,
  PricingBlueprintOverrides,
  PricingClientSegment,
  PricingRateBand,
  PricingServiceBlueprint,
  PricingServiceBlueprintOverride,
} from "./blueprint";

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeRateBand(band: PricingRateBand | null | undefined): PricingRateBand | undefined {
  if (!band) return undefined;
  const next: PricingRateBand = {};
  if (band.low != null && Number.isFinite(Number(band.low))) {
    next.low = Number(band.low);
  }
  if (band.high != null && Number.isFinite(Number(band.high))) {
    next.high = Number(band.high);
  }
  if (band.maintenance != null && Number.isFinite(Number(band.maintenance))) {
    next.maintenance = Number(band.maintenance);
  }
  return Object.keys(next).length ? next : undefined;
}

function sanitizeServiceOverride(
  override: PricingServiceBlueprintOverride
): PricingServiceBlueprintOverride {
  const cleaned: PricingServiceBlueprintOverride = {
    serviceId: override.serviceId,
  };

  if (override.name != null && override.name.trim()) {
    cleaned.name = override.name.trim();
  }
  if (override.tier != null && override.tier.trim()) {
    cleaned.tier = override.tier.trim();
  }
  if (override.billingCadence != null && override.billingCadence.trim()) {
    cleaned.billingCadence = override.billingCadence.trim();
  }
  if (override.description != null && override.description.trim()) {
    cleaned.description = override.description.trim();
  }
  if (override.estimatedEffortNotes != null && override.estimatedEffortNotes.trim()) {
    cleaned.estimatedEffortNotes = override.estimatedEffortNotes.trim();
  }
  if (override.tags && override.tags.length) {
    cleaned.tags = override.tags.map((tag) => tag.trim()).filter(Boolean);
  }

  if (override.defaultSelected != null) {
    cleaned.defaultSelected = Boolean(override.defaultSelected);
  }
  if (override.defaultQuantity != null && Number.isFinite(Number(override.defaultQuantity))) {
    cleaned.defaultQuantity = Number(override.defaultQuantity);
  }

  if (override.rateBands) {
    const rateBandsEntries = Object.entries(override.rateBands)
      .map(([segment, band]) => {
        const sanitizedBand = sanitizeRateBand(band);
        if (!sanitizedBand) return null;
        return [segment, sanitizedBand] as [PricingClientSegment, PricingRateBand];
      })
      .filter((entry): entry is [PricingClientSegment, PricingRateBand] => Boolean(entry));

    if (rateBandsEntries.length) {
      cleaned.rateBands = Object.fromEntries(rateBandsEntries);
    }
  }

  return cleaned;
}

export function sanitizeBlueprintOverrides(
  overrides: PricingBlueprintOverrides | null | undefined
): PricingBlueprintOverrides | undefined {
  if (!overrides) return undefined;
  const sanitized: PricingBlueprintOverrides = {};

  if (overrides.metadataNotes && overrides.metadataNotes.trim()) {
    sanitized.metadataNotes = overrides.metadataNotes.trim();
  }

  if (overrides.services && overrides.services.length) {
    sanitized.services = overrides.services
      .map((service) => sanitizeServiceOverride(service))
      .filter((service) => Boolean(service.serviceId));
  }

  return Object.keys(sanitized).length ? sanitized : undefined;
}

function applyServiceOverride(
  service: PricingServiceBlueprint,
  override: PricingServiceBlueprintOverride
): PricingServiceBlueprint {
  const next = { ...service };
  if (override.name) next.name = override.name;
  if (override.tier) next.tier = override.tier;
  if (override.billingCadence) next.billingCadence = override.billingCadence;
  if (override.description) next.description = override.description;
  if (override.estimatedEffortNotes) next.estimatedEffortNotes = override.estimatedEffortNotes;
  if (override.tags) next.tags = [...override.tags];

  if (override.defaultSelected != null) {
    next.defaultSelected = override.defaultSelected;
  }
  if (override.defaultQuantity != null) {
    next.defaultQuantity = override.defaultQuantity;
  }

  if (override.rateBands && Object.keys(override.rateBands).length) {
    const mergedBands = { ...(next.rateBands || {}) };
    Object.entries(override.rateBands).forEach(([segment, band]) => {
      const existing = mergedBands[segment as PricingClientSegment] || {};
      mergedBands[segment as PricingClientSegment] = {
        ...existing,
        ...band,
      };
    });
    next.rateBands = mergedBands;
  }

  return next;
}

export function mergeBlueprintWithOverrides(
  blueprint: PricingBlueprint | null | undefined,
  overrides: PricingBlueprintOverrides | null | undefined
): PricingBlueprint | null {
  if (!blueprint) return null;
  if (!overrides || !overrides.services?.length) {
    if (overrides?.metadataNotes) {
      const cloned = clone(blueprint);
      cloned.metadata = { ...cloned.metadata, notes: overrides.metadataNotes };
      return cloned;
    }
    return blueprint;
  }

  const merged = clone(blueprint);
  const servicesById = new Map(merged.services.map((service) => [service.id, service]));

  overrides.services.forEach((override) => {
    const target = servicesById.get(override.serviceId);
    if (!target) return;
    const updated = applyServiceOverride(target, override);
    servicesById.set(override.serviceId, updated);
  });

  merged.services = Array.from(servicesById.values());

  if (overrides.metadataNotes) {
    merged.metadata = { ...merged.metadata, notes: overrides.metadataNotes };
  }

  return merged;
}

export function mapServicesByRow(
  blueprint: PricingBlueprint | null | undefined
): Map<number, PricingServiceBlueprint> {
  const map = new Map<number, PricingServiceBlueprint>();
  if (!blueprint) return map;
  blueprint.services.forEach((service) => {
    if (typeof service.sourceRow === "number" && Number.isFinite(service.sourceRow)) {
      map.set(service.sourceRow, service);
    }
  });
  return map;
}