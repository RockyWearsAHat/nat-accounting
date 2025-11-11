import XLSX, { WorkBook, WorkSheet } from "xlsx";
import XLSX_CALC from "xlsx-calc";
import type { PricingRateOverride } from "../models/PricingSettings";
import { PricingWorkbookModel, type IPricingWorkbook } from "../models/PricingWorkbook";
import {
	DEFAULT_PRICING_WORKBOOK_MAPPING,
	mergeWorkbookMapping,
	PricingWorkbookMapping,
} from "./workbookMapping";
import {
	mapServicesByRow,
	mergeBlueprintWithOverrides,
} from "./blueprintOverrides";
import type { PricingBlueprint, PricingServiceBlueprint } from "./blueprint";

export type ClientSize = "Solo/Startup" | "Small Business" | "Mid-Market";
export type PricePoint = "Low" | "Midpoint" | "High";

export interface PricingRateColumns {
	soloStartup?: { low?: string; high?: string; maintenance?: string };
	smallBusiness?: { low?: string; high?: string; maintenance?: string };
	midMarket?: { low?: string; high?: string; maintenance?: string };
}

export interface PricingLineMetadata {
	id: string;
	row: number;
	tier: string;
	service: string;
	billing: string;
	description?: string;
	type: "Monthly" | "One-time/Non-monthly" | string;
	chargeType: "recurring" | "one-time"; // Source of truth for subtotal calculation
	defaultSelected: boolean;
	defaultQuantity: number;
	baseRates: PricingRateOverride;
	cellRefs?: {
		select: string;
		quantity: string;
		unitPrice: string;
		lineTotal: string;
		type: string;
	};
	rateColumns: PricingRateColumns;
	// AI Blueprint flexible rate structure (for pricing tables)
	rateBands?: Record<string, Record<string, number>>;
}

export interface PricingMetadata {
	clientSizes: ClientSize[];
	pricePoints: PricePoint[];
	lineItems: PricingLineMetadata[];
	totals: {
		monthlySubtotal: string;
		oneTimeSubtotal: string;
		maintenanceSubtotal?: string;
		grandTotal: string;
		ongoingMonthly?: string;
	};
	workbookPath: string;
	workbookLastModified: number;
	workbookMapping: PricingWorkbookMapping;
}

export interface PricingLineSelection {
	lineId: string;
	selected?: boolean;
	quantity?: number;
	overridePrice?: number | null;
	rateOverrides?: PricingRateOverride;
}

export interface QuoteDetails {
	clientName?: string;
	companyName?: string;
	preparedBy?: string;
	preparedForEmail?: string;
	notes?: string;
}

export interface PricingCalculationInput {
	clientSize: ClientSize;
	pricePoint: PricePoint;
	selections: PricingLineSelection[];
	quoteDetails?: QuoteDetails;
}

export interface PricingLineResult {
	id: string;
	service: string;
	tier: string;
	billing: string;
	selected: boolean;
	quantity: number;
	unitPrice: number;
	overridePrice?: number | null;
	effectiveUnitPrice: number;
	lineTotal: number;
	type: string;
}

export interface PricingTotals {
	monthlySubtotal: number;
	oneTimeSubtotal: number;
	grandTotalMonthOne: number;
	ongoingMonthly: number;
	maintenanceSubtotal?: number;
}

export interface PricingCalculationResult {
	metadata: PricingMetadata;
	lines: PricingLineResult[];
	totals: PricingTotals;
	workbook: WorkBook;
}

const DEFAULT_WORKBOOK_MIME =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface WorkbookBinary {
	buffer: Buffer;
	updatedAt: number;
	filename: string;
	mimeType: string;
}

let workbookBinaryCache: WorkbookBinary | null = null;

const CLIENT_SIZE_OPTIONS: ClientSize[] = [
	"Solo/Startup",
	"Small Business",
	"Mid-Market",
];

const PRICE_POINT_OPTIONS: PricePoint[] = ["Low", "Midpoint", "High"];

async function loadWorkbookBinaryFromStore(): Promise<WorkbookBinary> {
	// Don't use .lean() - let Mongoose handle Binary conversion
	const doc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });

	if (!doc) {
		throw new Error(
			"Pricing workbook not found. Upload a workbook through the admin panel."
		);
	}

	console.log("[pricing] Document retrieved:", {
		hasDoc: !!doc,
		filename: doc.filename,
		hasData: !!doc.data,
		dataIsBuffer: Buffer.isBuffer(doc.data),
		dataLength: doc.data ? (Buffer.isBuffer(doc.data) ? doc.data.length : "not a buffer") : 0,
	});

	if (!doc.data || !Buffer.isBuffer(doc.data)) {
		console.warn(
			"[pricing] Stored workbook document exists but data field is not a valid Buffer."
		);
		throw new Error(
			"Pricing workbook data is corrupted. Upload a new workbook through the admin panel."
		);
	}

	const buffer = Buffer.from(doc.data);

	if (buffer.length === 0) {
		console.warn("[pricing] Buffer length is zero after conversion.");
		throw new Error(
			"Pricing workbook data is empty. Upload a new workbook through the admin panel."
		);
	}

	console.log(
		`[pricing] Successfully loaded workbook binary: ${buffer.length} bytes, filename: ${doc.filename}`
	);

	return {
		buffer,
		updatedAt: doc.uploadedAt ? doc.uploadedAt.getTime() : Date.now(),
		filename: doc.filename || "pricing-workbook.xlsx",
		mimeType: doc.mimeType || DEFAULT_WORKBOOK_MIME,
	};
}

async function getWorkbookBinary(forceReload = false): Promise<WorkbookBinary> {
	if (!workbookBinaryCache || forceReload) {
		workbookBinaryCache = await loadWorkbookBinaryFromStore();
	}
	return workbookBinaryCache;
}

export function invalidatePricingWorkbookCache(): void {
	workbookBinaryCache = null;
	metadataCache = null;
	metadataMtime = 0;
	metadataMappingKey = "";
	metadataBaseLineItems = null;
}

let metadataCache: PricingMetadata | null = null;
let metadataMtime = 0;
let metadataMappingKey = "";
let metadataBaseLineItems: PricingLineMetadata[] | null = null;

function getSheet(workbook: WorkBook, name: string): WorkSheet {
	const sheet = workbook.Sheets[name];
	if (!sheet) {
		throw new Error(`Sheet "${name}" not found in pricing workbook.`);
	}
	return sheet;
}

function readString(sheet: WorkSheet, address: string): string {
	const cell = sheet[address];
	if (!cell) return "";
	if (typeof cell.v === "string") return cell.v.trim();
	if (typeof cell.w === "string") return cell.w.trim();
	if (typeof cell.v === "number") return String(cell.v);
	return "";
}

function readNumber(sheet: WorkSheet, address: string): number {
	const cell = sheet[address];
	if (!cell) return 0;
	if (typeof cell.v === "number") return cell.v;
	if (typeof cell.v === "string") {
		const parsed = Number(cell.v.replace(/[^0-9.-]/g, ""));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (typeof cell.w === "string") {
		const parsed = Number(cell.w.replace(/[^0-9.-]/g, ""));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function readBoolean(sheet: WorkSheet, address: string, fallback = false): boolean {
	const cell = sheet[address];
	if (!cell) return fallback;
	if (typeof cell.v === "boolean") return cell.v;
	if (typeof cell.v === "number") return cell.v === 1;
	if (typeof cell.v === "string") return ["1", "TRUE", "true"].includes(cell.v);
	return fallback;
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function makeCell(column: string, row: number): string {
	return `${column}${row}`;
}

function ensureNumber(value: number | null | undefined, fallback = 0): number {
	return Number.isFinite(value ?? NaN) ? (value as number) : fallback;
}

function extractLineItems(
	sheet: WorkSheet,
	mapping: PricingWorkbookMapping
): PricingLineMetadata[] {
	const items: PricingLineMetadata[] = [];
	const { lineItemsRange, columns } = mapping;
	const startRow = Math.max(1, lineItemsRange.startRow ?? 1);
	const endRow = Math.max(startRow, lineItemsRange.endRow ?? startRow);
	const maxEmptyRows = lineItemsRange.maxEmptyRows ?? 3;
	let emptyRows = 0;

	const getCell = (column: string | undefined, row: number): string => {
		if (!column) {
			throw new Error(
				`Workbook mapping is missing a required column definition while processing row ${row}.`
			);
		}
		return makeCell(column, row);
	};

	for (let row = startRow; row <= endRow; row++) {
		const tier = readString(sheet, getCell(columns.tier, row));
		const service = readString(sheet, getCell(columns.service, row));
		const billing = readString(sheet, getCell(columns.billing, row));
		const type = readString(sheet, getCell(columns.type, row));

		if (!service && !tier && !billing) {
			emptyRows += 1;
			if (emptyRows >= maxEmptyRows) break;
			continue;
		}

		emptyRows = 0;

		const description = columns.description
			? readString(sheet, getCell(columns.description, row))
			: undefined;

		const idBase = service || tier || `row-${row}`;
		const id = `${slugify(idBase)}-${row}`;

		const selectCell = getCell(columns.select, row);
		const quantityCell = getCell(columns.quantity, row);
		const unitPriceCell = getCell(columns.unitPrice, row);
		const lineTotalCell = getCell(columns.lineTotal, row);
		const typeCell = getCell(columns.type, row);

		const defaultQuantityValue = ensureNumber(readNumber(sheet, quantityCell), 1) || 1;

		// Derive chargeType from type field (for legacy compatibility)
		const chargeType: "recurring" | "one-time" =
			type && /monthly/i.test(type) && !type.toLowerCase().includes("non-monthly")
				? "recurring"
				: "one-time";

		const item: PricingLineMetadata = {
			id,
			row,
			tier,
			service,
			billing,
			description,
			type: type || "Monthly",
			chargeType,
			defaultSelected: readBoolean(sheet, selectCell, false),
			defaultQuantity: defaultQuantityValue,
			baseRates: {
				soloStartup: {
					low:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.soloStartup.low, row))
						) || undefined,
					high:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.soloStartup.high, row))
						) || undefined,
					maintenance: columns.rateColumns.soloStartup.maintenance
						? ensureNumber(
							readNumber(
								sheet,
								getCell(columns.rateColumns.soloStartup.maintenance, row)
							)
						) || undefined
						: undefined,
				},
				smallBusiness: {
					low:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.smallBusiness.low, row))
						) || undefined,
					high:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.smallBusiness.high, row))
						) || undefined,
					maintenance: columns.rateColumns.smallBusiness.maintenance
						? ensureNumber(
							readNumber(
								sheet,
								getCell(columns.rateColumns.smallBusiness.maintenance, row)
							)
						) || undefined
						: undefined,
				},
				midMarket: {
					low:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.midMarket.low, row))
						) || undefined,
					high:
						ensureNumber(
							readNumber(sheet, getCell(columns.rateColumns.midMarket.high, row))
						) || undefined,
					maintenance: columns.rateColumns.midMarket.maintenance
						? ensureNumber(
							readNumber(
								sheet,
								getCell(columns.rateColumns.midMarket.maintenance, row)
							)
						) || undefined
						: undefined,
				},
			},
			cellRefs: {
				select: selectCell,
				quantity: quantityCell,
				unitPrice: unitPriceCell,
				lineTotal: lineTotalCell,
				type: typeCell,
			},
			rateColumns: {
				soloStartup: {
					low: getCell(columns.rateColumns.soloStartup.low, row),
					high: getCell(columns.rateColumns.soloStartup.high, row),
					maintenance: columns.rateColumns.soloStartup.maintenance
						? getCell(columns.rateColumns.soloStartup.maintenance, row)
						: undefined,
				},
				smallBusiness: {
					low: getCell(columns.rateColumns.smallBusiness.low, row),
					high: getCell(columns.rateColumns.smallBusiness.high, row),
					maintenance: columns.rateColumns.smallBusiness.maintenance
						? getCell(columns.rateColumns.smallBusiness.maintenance, row)
						: undefined,
				},
				midMarket: {
					low: getCell(columns.rateColumns.midMarket.low, row),
					high: getCell(columns.rateColumns.midMarket.high, row),
					maintenance: columns.rateColumns.midMarket.maintenance
						? getCell(columns.rateColumns.midMarket.maintenance, row)
						: undefined,
				},
			},
		};

		items.push(item);
	}

	return items;
}

function cloneRateOverride(source: PricingRateOverride | undefined): PricingRateOverride {
	if (!source) {
		return {
			soloStartup: undefined,
			smallBusiness: undefined,
			midMarket: undefined,
		};
	}
	return {
		soloStartup: source.soloStartup ? { ...source.soloStartup } : undefined,
		smallBusiness: source.smallBusiness ? { ...source.smallBusiness } : undefined,
		midMarket: source.midMarket ? { ...source.midMarket } : undefined,
	};
}

function cloneLineMetadata(line: PricingLineMetadata): PricingLineMetadata {
	return {
		...line,
		baseRates: cloneRateOverride(line.baseRates),
	};
}

type RateSegmentKey = keyof PricingRateOverride;

function resolveRateSegmentKey(segment: string): RateSegmentKey | null {
	const normalized = segment.toLowerCase();
	if (normalized.includes("solo") || normalized.includes("startup")) {
		return "soloStartup";
	}
	if (normalized.includes("small")) {
		return "smallBusiness";
	}
	if (normalized.includes("mid")) {
		return "midMarket";
	}
	return null;
}

function mergeRatesFromService(
	base: PricingRateOverride,
	service: { rateBands?: PricingBlueprint["services"][number]["rateBands"]; override?: PricingRateOverride }
): PricingRateOverride {
	const next: PricingRateOverride = {
		soloStartup: base.soloStartup ? { ...base.soloStartup } : undefined,
		smallBusiness: base.smallBusiness ? { ...base.smallBusiness } : undefined,
		midMarket: base.midMarket ? { ...base.midMarket } : undefined,
	};

	const applyBand = (
		segment: string,
		band?: { low?: number | null; high?: number | null; maintenance?: number | null }
	) => {
		if (!band) return;
		const key = resolveRateSegmentKey(segment);
		if (!key) return;
		const target = next[key] ? { ...next[key] } : {};
		const low = band.low != null ? Number(band.low) : undefined;
		if (low != null && Number.isFinite(low)) {
			target.low = low;
		}
		const high = band.high != null ? Number(band.high) : undefined;
		if (high != null && Number.isFinite(high)) {
			target.high = high;
		}
		const maintenance = band.maintenance != null ? Number(band.maintenance) : undefined;
		if (maintenance != null && Number.isFinite(maintenance)) {
			target.maintenance = maintenance;
		}
		next[key] = target;
	};

	if (service.rateBands) {
		Object.entries(service.rateBands).forEach(([segment, band]) => applyBand(segment, band));
	}

	if (service.override) {
		const mergeOverride = (
			segment: RateSegmentKey,
			values?: { low?: number | null; high?: number | null; maintenance?: number | null }
		) => {
			if (!values) return;
			const target = next[segment] ? { ...next[segment] } : {};
			if (values.low != null && Number.isFinite(Number(values.low))) {
				target.low = Number(values.low);
			}
			if (values.high != null && Number.isFinite(Number(values.high))) {
				target.high = Number(values.high);
			}
			if (values.maintenance != null && Number.isFinite(Number(values.maintenance))) {
				target.maintenance = Number(values.maintenance);
			}
			next[segment] = target;
		};

		mergeOverride("soloStartup", service.override.soloStartup);
		mergeOverride("smallBusiness", service.override.smallBusiness);
		mergeOverride("midMarket", service.override.midMarket);
	}

	return next;
}

async function applyBlueprintOverridesToLineItems(
	baseLineItems: PricingLineMetadata[]
): Promise<PricingLineMetadata[]> {
	if (!baseLineItems.length) return [];
	const workbookDoc = await PricingWorkbookModel.findOne()
		.sort({ uploadedAt: -1 })
		.lean<IPricingWorkbook | null>();
	if (!workbookDoc) {
		return baseLineItems.map((line) => cloneLineMetadata(line));
	}

	const mergedBlueprint = mergeBlueprintWithOverrides(
		workbookDoc.blueprint ?? null,
		workbookDoc.blueprintOverrides ?? undefined
	);

	if (!mergedBlueprint) {
		return baseLineItems.map((line) => cloneLineMetadata(line));
	}

	const servicesByRow = mapServicesByRow(mergedBlueprint);

	return baseLineItems.map((line) => {
		const draft = cloneLineMetadata(line);
		const service = servicesByRow.get(line.row);
		if (!service) {
			return draft;
		}

		if (service.tier) draft.tier = service.tier;
		if (service.name) draft.service = service.name;
		if (service.billingCadence) draft.billing = service.billingCadence;
		if (service.description) draft.description = service.description;
		if (service.defaultSelected != null) draft.defaultSelected = service.defaultSelected;
		if (service.defaultQuantity != null) draft.defaultQuantity = service.defaultQuantity;

		draft.baseRates = mergeRatesFromService(draft.baseRates, service);

		return draft;
	});
}

export async function getPricingMetadata(
	forceReload = false,
	mappingOverrides?: Partial<PricingWorkbookMapping>
): Promise<PricingMetadata> {
	const mapping = mergeWorkbookMapping(mappingOverrides);
	const mappingKey = JSON.stringify(mapping);
	const binary = await getWorkbookBinary(forceReload);

	const shouldReload =
		!metadataCache ||
		forceReload ||
		(binary.updatedAt && binary.updatedAt !== metadataMtime) ||
		mappingKey !== metadataMappingKey;

	if (shouldReload) {
		// Try to use AI blueprint first (if available)
		const workbookDoc = await PricingWorkbookModel.findOne().sort({ uploadedAt: -1 });
		let lineItems: PricingLineMetadata[] = [];

		if (workbookDoc?.blueprint?.services && workbookDoc.blueprint.services.length > 0) {
			console.log("[pricing] Using AI blueprint for metadata (", workbookDoc.blueprint.services.length, "services)");

			// Convert AI blueprint services to line items
			try {
				// Check if this is a calculator sheet (with formulas) or pricing table (reference data only)
				const columnMapping = workbookDoc.blueprint.metadata?.columnMapping;

				if (!columnMapping) {
					// No column mapping = pricing table (not calculator sheet)
					// Convert AI blueprint directly to line items without Excel cell references
					console.log("[pricing] No columnMapping found - treating as pricing table (not calculator sheet)");

					lineItems = workbookDoc.blueprint.services.map((service: PricingServiceBlueprint, index: number) => {
						// Generate consistent ID from service name or use fallback
						const id = service.id || service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `service-${index}`;

						// NEW: Use chargeType from AI instead of manual detection
						const chargeType = service.chargeType || 'recurring';
						const type: "Monthly" | "One-time/Non-monthly" = chargeType === 'recurring' ? "Monthly" : "One-time/Non-monthly";

						// Convert AI rateBands to legacy baseRates structure for frontend compatibility
						const rateBands = service.rateBands || {};
						const baseRates: any = {};
						const rateColumns: any = {};

						for (const [segment, pricePoints] of Object.entries(rateBands)) {
							if (!pricePoints || typeof pricePoints !== 'object') continue;
							const segmentLower = segment.toLowerCase();

							// Map AI-discovered segments to legacy structure
							let targetSegment: 'soloStartup' | 'smallBusiness' | 'midMarket' | null = null;
							if (segmentLower.includes('solo') || segmentLower.includes('startup')) {
								targetSegment = 'soloStartup';
							} else if (segmentLower.includes('small')) {
								targetSegment = 'smallBusiness';
							} else if (segmentLower.includes('mid')) {
								targetSegment = 'midMarket';
							}

							if (targetSegment) {
								// Convert price points to baseRates format (lowercase keys: low, high)
								const baseRatesForSegment: any = {};
								const rateColumnsForSegment: any = {};

								for (const [pricePointName, value] of Object.entries(pricePoints)) {
									const keyLower = pricePointName.toLowerCase();
									// baseRates expects numbers
									baseRatesForSegment[keyLower] = value ?? undefined;
									// rateColumns expects strings
									rateColumnsForSegment[keyLower] = value != null ? String(value) : undefined;
								}

								baseRates[targetSegment] = baseRatesForSegment;
								rateColumns[targetSegment] = rateColumnsForSegment;
							}
						}

						return {
							id, // CRITICAL: Must have ID for selection mapping to work
							row: service.sourceRow || index + 1,
							tier: service.tier || "",
							service: service.name, // CRITICAL: Must be 'service' not 'name' to match interface
							billing: service.billingCadence || "",
							description: service.description || "",
							type, // Required by PricingLineMetadata interface
							chargeType, // Source of truth for subtotal calculation
							defaultSelected: service.defaultSelected ?? false,
							defaultQuantity: service.defaultQuantity ?? 1,
							// Populated from AI rateBands for frontend compatibility
							baseRates,
							rateColumns,
							// AI Blueprint flexible rate structure (for pricing tables)
							rateBands: service.rateBands || {},
						} as PricingLineMetadata;
					});

					console.log("[pricing] Converted", lineItems.length, "AI blueprint services to line items (pricing table mode)");
					// Don't return early - continue to build full metadata object below
				} else {
					// Column mapping exists = calculator sheet with formulas
					console.log("[pricing] columnMapping found - treating as calculator sheet");

					// Validate critical columns are discovered
					const missingColumns: string[] = [];
					if (!columnMapping.unitPrice) missingColumns.push('unitPrice');
					if (!columnMapping.lineTotal) missingColumns.push('lineTotal');
					if (!columnMapping.quantity) missingColumns.push('quantity');

					if (missingColumns.length > 0) {
						throw new Error(
							`AI failed to discover critical columns: ${missingColumns.join(', ')}. ` +
							"Cannot calculate pricing without these columns. " +
							"Please verify the workbook structure and re-run AI analysis."
						);
					}

					const selectCol = columnMapping.select;
					const quantityCol = columnMapping.quantity;
					const unitPriceCol = columnMapping.unitPrice;
					const lineTotalCol = columnMapping.lineTotal;
					const typeCol = columnMapping.type;

					lineItems = workbookDoc.blueprint.services.map((service: PricingServiceBlueprint, index: number) => {
						const id = service.id || `service-${index}`;
						const rateBands = service.rateBands || {};

						// Create rate columns from AI-extracted rate bands (FLEXIBLE format)
						const rateColumns: PricingRateColumns = {};
						const baseRates: PricingRateOverride = {};

						for (const [segment, pricePoints] of Object.entries(rateBands)) {
							if (!pricePoints || typeof pricePoints !== 'object') continue;
							const segmentLower = segment.toLowerCase();

							// Map discovered segment to legacy structure (for backward compatibility)
							// TODO: Remove this mapping when PricingSettings supports flexible segments
							let targetSegment: 'soloStartup' | 'smallBusiness' | 'midMarket' | null = null;
							if (segmentLower.includes('solo') || segmentLower.includes('startup')) {
								targetSegment = 'soloStartup';
							} else if (segmentLower.includes('small')) {
								targetSegment = 'smallBusiness';
							} else if (segmentLower.includes('mid')) {
								targetSegment = 'midMarket';
							}

							if (targetSegment) {
								// Extract ALL discovered price points (not just low/high/maintenance)
								const rateColumnsForSegment: any = {};
								const baseRatesForSegment: any = {};

								for (const [pricePointName, value] of Object.entries(pricePoints)) {
									// rateColumns expects strings
									rateColumnsForSegment[pricePointName] = value != null ? String(value) : undefined;
									// baseRates expects numbers
									baseRatesForSegment[pricePointName] = value ?? undefined;
								}

								rateColumns[targetSegment] = rateColumnsForSegment;
								baseRates[targetSegment] = baseRatesForSegment;
							}
						}

						const rowNum = service.sourceRow ?? index + 10;

						// NEW: Use chargeType from AI instead of manual detection
						const chargeType = service.chargeType || 'recurring';
						const type: "Monthly" | "One-time/Non-monthly" = chargeType === 'recurring' ? "Monthly" : "One-time/Non-monthly";

						return {
							id,
							row: rowNum,
							tier: service.tier || 'Uncategorized',
							service: service.name,
							billing: service.billingCadence || 'Monthly',
							description: service.description || undefined,
							type,
							chargeType, // Source of truth for subtotal calculation
							defaultSelected: service.defaultSelected ?? false,
							defaultQuantity: service.defaultQuantity ?? 1,
							baseRates,
							rateColumns,
							cellRefs: {
								select: selectCol ? `${selectCol}${rowNum}` : undefined,
								quantity: `${quantityCol}${rowNum}`, // Required
								unitPrice: `${unitPriceCol}${rowNum}`, // Required
								lineTotal: `${lineTotalCol}${rowNum}`, // Required
								type: typeCol ? `${typeCol}${rowNum}` : undefined,
							},
						} as PricingLineMetadata;
					});
					console.log("[pricing] Successfully converted", lineItems.length, "services from AI blueprint (calculator mode)");
				} // End else (calculator sheet mode)
			} catch (error) {
				console.error("[pricing] ERROR converting AI blueprint to line items:", error);
				console.error("[pricing] Error stack:", error instanceof Error ? error.stack : 'No stack');
				throw error; // Re-throw to surface the error
			}
		} else {
			// Fallback: use deterministic parser with mapping
			console.log("[pricing] No AI blueprint available, using deterministic parser");
			const workbook = XLSX.read(binary.buffer, {
				type: "buffer",
				cellFormula: true,
				cellHTML: false,
				cellStyles: true,
			});
			const sheet = getSheet(workbook, mapping.calculatorSheet);
			lineItems = extractLineItems(sheet, mapping);
		}

		metadataCache = {
			clientSizes: CLIENT_SIZE_OPTIONS,
			pricePoints: PRICE_POINT_OPTIONS,
			lineItems,
			totals: {
				monthlySubtotal: mapping.totals.monthlySubtotal,
				oneTimeSubtotal: mapping.totals.oneTimeSubtotal,
				maintenanceSubtotal: mapping.totals.maintenanceSubtotal,
				grandTotal: mapping.totals.grandTotal,
				ongoingMonthly: mapping.totals.ongoingMonthly ?? mapping.ongoingMonthlyCell,
			},
			workbookPath: binary.filename,
			workbookLastModified: binary.updatedAt,
			workbookMapping: mapping,
		};
		metadataBaseLineItems = lineItems.map((line) => cloneLineMetadata(line));
		metadataMtime = binary.updatedAt;
	} else if (metadataCache && metadataBaseLineItems) {
		metadataCache = {
			...metadataCache,
			workbookMapping: mapping,
			totals: {
				monthlySubtotal: mapping.totals.monthlySubtotal,
				oneTimeSubtotal: mapping.totals.oneTimeSubtotal,
				maintenanceSubtotal: mapping.totals.maintenanceSubtotal,
				grandTotal: mapping.totals.grandTotal,
				ongoingMonthly: mapping.totals.ongoingMonthly ?? mapping.ongoingMonthlyCell,
			},
		};
	}

	metadataMappingKey = mappingKey;

	if (!metadataCache) {
		throw new Error("Failed to load pricing metadata.");
	}

	if (metadataBaseLineItems) {
		const adjustedLineItems = await applyBlueprintOverridesToLineItems(
			metadataBaseLineItems
		);
		metadataCache = {
			...metadataCache,
			lineItems: adjustedLineItems,
		};
	}

	return metadataCache;
}

function writeBoolean(sheet: WorkSheet, address: string, value: boolean) {
	sheet[address] = {
		t: "n",
		v: value ? 1 : 0,
	};
}

function writeNumber(sheet: WorkSheet, address: string, value: number) {
	sheet[address] = {
		t: "n",
		v: value,
	};
}

function writeString(sheet: WorkSheet, address: string, value: string) {
	sheet[address] = {
		t: "s",
		v: value,
	};
}

function applyRateOverrides(
	sheet: WorkSheet,
	columns: PricingRateColumns,
	overrides?: PricingRateOverride
) {
	if (!overrides) return;

	const map: Array<{
		column?: { low?: string; high?: string; maintenance?: string };
		values?: { low?: number; high?: number; maintenance?: number };
	}> = [
			{ column: columns.soloStartup, values: overrides.soloStartup },
			{ column: columns.smallBusiness, values: overrides.smallBusiness },
			{ column: columns.midMarket, values: overrides.midMarket },
		];

	for (const entry of map) {
		if (!entry.column || !entry.values) continue;
		if (entry.values.low != null && entry.column.low) {
			writeNumber(sheet, entry.column.low, entry.values.low);
		}
		if (entry.values.high != null && entry.column.high) {
			writeNumber(sheet, entry.column.high, entry.values.high);
		}
		if (entry.values.maintenance != null && entry.column.maintenance) {
			writeNumber(sheet, entry.column.maintenance, entry.values.maintenance);
		}
	}
}

function normalizeSelections(
	metadata: PricingMetadata,
	selections: PricingLineSelection[]
) {
	const map = new Map<string, PricingLineSelection>();
	for (const selection of selections) {
		map.set(selection.lineId, selection);
	}
	return metadata.lineItems.map((line) => ({
		line,
		selection: map.get(line.id),
	}));
}

function removeFormulaAndWriteNumber(
	sheet: WorkSheet,
	address: string,
	value: number
) {
	const cell = sheet[address] || {};
	delete cell.f;
	cell.t = "n";
	cell.v = value;
	sheet[address] = cell;
}

let calcFunctionsRegistered = false;

function ensureCalcFunctionsRegistered() {
	if (calcFunctionsRegistered) return;
	try {
		const anchorArray = (...args: any[]) => {
			const [value] = args;
			if (Array.isArray(value)) return value;
			return value ?? null;
		};

		const filterFunction = (array: any, include: any, ifEmpty?: any) => {
			const toRows = (value: any): any[] => {
				if (!Array.isArray(value)) return [[value]];
				if (value.length === 0) return [];
				// Detect 2D arrays (rows)
				if (value.every((item: any) => Array.isArray(item))) {
					return value as any[];
				}
				// Treat 1D array as single column
				return (value as any[]).map((item) => [item]);
			};

			const rows = toRows(array);
			if (rows.length === 0) return ifEmpty ?? [];

			const flattenIncludes = (value: any): boolean[] => {
				if (!Array.isArray(value)) return [Boolean(value)];
				const flattened: boolean[] = [];
				const walk = (val: any) => {
					if (Array.isArray(val)) {
						val.forEach(walk);
					} else {
						flattened.push(Boolean(val));
					}
				};
				walk(value);
				return flattened;
			};

			const includeFlags = flattenIncludes(include);
			const result = rows.filter((_, idx) => includeFlags[idx] ?? false);

			if (result.length === 0) {
				return ifEmpty ?? [];
			}

			// Return in original dimensionality
			const is2DOriginal = Array.isArray(array) && Array.isArray(array[0]);
			if (!is2DOriginal) {
				return result.map((row) => row[0]);
			}
			return result;
		};
		XLSX_CALC.import_functions(
			{
				ANCHORARRAY: anchorArray,
				"_xlfn.ANCHORARRAY": anchorArray,
				FILTER: filterFunction,
				"_xlfn.FILTER": filterFunction,
				"_xlws.FILTER": filterFunction,
			},
			{ override: true }
		);
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[pricing] Failed to register custom Excel functions", error);
		}
	}
	calcFunctionsRegistered = true;
}

/**
 * Intelligently calculate unit price from AI-discovered rate structure.
 * Works with ANY workbook structure by using the AI blueprint's discovered segments and price points.
 */
function calculateUnitPriceFromRates(
	line: PricingLineMetadata,
	clientSize: ClientSize,
	pricePoint: PricePoint
): number {
	// AI Blueprint Mode: Use rateBands (flexible, AI-discovered structure)
	if (line.rateBands && Object.keys(line.rateBands).length > 0) {
		// Find the rate band that matches the selected client size
		// Use exact match first, then try case-insensitive match
		let rateBand = line.rateBands[clientSize];

		if (!rateBand) {
			// Try case-insensitive match for flexibility
			const clientSizeLower = clientSize.toLowerCase();
			const matchingKey = Object.keys(line.rateBands).find(
				key => key.toLowerCase() === clientSizeLower
			);
			if (matchingKey) {
				rateBand = line.rateBands[matchingKey];
			}
		}

		if (!rateBand) return 0;

		// Find the price for the selected price point
		// The AI discovers price point names (could be "Low"/"High", "Bronze"/"Gold", "Basic"/"Premium", etc.)
		// Try exact match first, then try common variations
		let price: number | undefined;

		// Direct match (e.g., "Low", "High", "Midpoint")
		if (typeof rateBand[pricePoint] === 'number') {
			price = rateBand[pricePoint];
		}

		// Try lowercase variants
		if (price === undefined) {
			const pricePointLower = pricePoint.toLowerCase();
			const matchingKey = Object.keys(rateBand).find(
				key => key.toLowerCase() === pricePointLower
			);
			if (matchingKey && typeof rateBand[matchingKey] === 'number') {
				price = rateBand[matchingKey];
			}
		}

		// Calculate Midpoint if not found (average of Low and High)
		if (price === undefined && pricePoint === "Midpoint") {
			const low = rateBand['Low'] ?? rateBand['low'];
			const high = rateBand['High'] ?? rateBand['high'];
			if (typeof low === 'number' && typeof high === 'number') {
				price = (low + high) / 2;
			}
		}

		return price ?? 0;
	}

	// Legacy Calculator Sheet Mode: Use rateColumns (backward compatibility)
	if (line.rateColumns) {
		let rateBand: { low?: string | number; high?: string | number } | undefined;

		if (clientSize === "Solo/Startup") {
			rateBand = line.rateColumns.soloStartup;
		} else if (clientSize === "Small Business") {
			rateBand = line.rateColumns.smallBusiness;
		} else if (clientSize === "Mid-Market") {
			rateBand = line.rateColumns.midMarket;
		}

		if (!rateBand) return 0;

		// Convert string rates to numbers (calculator sheets store as strings)
		const low = typeof rateBand.low === 'string' ? parseFloat(rateBand.low) : rateBand.low ?? 0;
		const high = typeof rateBand.high === 'string' ? parseFloat(rateBand.high) : rateBand.high ?? 0;

		if (pricePoint === "Low") {
			return low;
		} else if (pricePoint === "High") {
			return high;
		} else {
			// Midpoint
			return (low + high) / 2;
		}
	}

	return 0;
}

export async function calculatePricing(
	input: PricingCalculationInput,
	options: {
		metadata?: PricingMetadata;
		mappingOverrides?: Partial<PricingWorkbookMapping>;
	} = {}
): Promise<PricingCalculationResult> {
	const metadata =
		options.metadata ?? (await getPricingMetadata(false, options.mappingOverrides));
	const mapping = metadata.workbookMapping || DEFAULT_PRICING_WORKBOOK_MAPPING;
	const binary = await getWorkbookBinary();
	const workbook = XLSX.read(binary.buffer, {
		type: "buffer",
		cellFormula: true,
		cellHTML: false,
		cellStyles: true,
	});
	const sheet = getSheet(workbook, mapping.calculatorSheet);

	ensureCalcFunctionsRegistered();

	// Check if this is a calculator sheet (has cellRefs) or pricing table (no cellRefs)
	const isPricingTable = metadata.lineItems.length > 0 && !metadata.lineItems[0].cellRefs;

	if (!isPricingTable) {
		// Calculator sheet mode: write values to Excel and run formulas
		writeString(sheet, mapping.clientSizeCell, input.clientSize);
		writeString(sheet, mapping.pricePointCell, input.pricePoint);

		const paired = normalizeSelections(metadata, input.selections);

		for (const { line, selection } of paired) {
			const selected = selection?.selected ?? line.defaultSelected;
			const quantity = ensureNumber(selection?.quantity, line.defaultQuantity) || 0;

			if (line.cellRefs) {
				writeBoolean(sheet, line.cellRefs.select, selected);
				writeNumber(sheet, line.cellRefs.quantity, quantity);
			}

			applyRateOverrides(sheet, line.rateColumns, selection?.rateOverrides);
		}

		XLSX_CALC(workbook);
	}

	const paired = normalizeSelections(metadata, input.selections);

	const lines: PricingLineResult[] = [];
	let monthlySubtotal = 0;
	let oneTimeSubtotal = 0;
	const maintenanceSubtotalValue = metadata.totals.maintenanceSubtotal ? 0 : null;

	for (const { line, selection } of paired) {
		const selected = selection?.selected ?? line.defaultSelected;
		const quantity = ensureNumber(selection?.quantity, line.defaultQuantity) || 0;
		const overridePrice = selection?.overridePrice ?? null;

		// Calculate unit price from rate bands instead of reading from Excel
		// This works for both AI-generated and Excel-based line items
		let unitPrice = calculateUnitPriceFromRates(line, input.clientSize, input.pricePoint);

		// If custom rate overrides are provided, recalculate with those
		if (selection?.rateOverrides) {
			const customLine = { ...line, rateColumns: { ...line.rateColumns } };
			// Merge custom rates (convert numbers to strings for rateColumns)
			if (selection.rateOverrides.soloStartup) {
				const override = selection.rateOverrides.soloStartup;
				customLine.rateColumns.soloStartup = {
					...line.rateColumns.soloStartup,
					low: override.low != null ? String(override.low) : line.rateColumns.soloStartup?.low,
					high: override.high != null ? String(override.high) : line.rateColumns.soloStartup?.high,
					maintenance: override.maintenance != null ? String(override.maintenance) : line.rateColumns.soloStartup?.maintenance,
				};
			}
			if (selection.rateOverrides.smallBusiness) {
				const override = selection.rateOverrides.smallBusiness;
				customLine.rateColumns.smallBusiness = {
					...line.rateColumns.smallBusiness,
					low: override.low != null ? String(override.low) : line.rateColumns.smallBusiness?.low,
					high: override.high != null ? String(override.high) : line.rateColumns.smallBusiness?.high,
					maintenance: override.maintenance != null ? String(override.maintenance) : line.rateColumns.smallBusiness?.maintenance,
				};
			}
			if (selection.rateOverrides.midMarket) {
				const override = selection.rateOverrides.midMarket;
				customLine.rateColumns.midMarket = {
					...line.rateColumns.midMarket,
					low: override.low != null ? String(override.low) : line.rateColumns.midMarket?.low,
					high: override.high != null ? String(override.high) : line.rateColumns.midMarket?.high,
					maintenance: override.maintenance != null ? String(override.maintenance) : line.rateColumns.midMarket?.maintenance,
				};
			}
			unitPrice = calculateUnitPriceFromRates(customLine, input.clientSize, input.pricePoint);
		}

		const effectiveUnitPrice = overridePrice ?? unitPrice;
		const lineTotal = selected ? effectiveUnitPrice * quantity : 0;

		const result: PricingLineResult = {
			id: line.id,
			service: line.service,
			tier: line.tier,
			billing: line.billing,
			selected,
			quantity,
			unitPrice,
			overridePrice,
			effectiveUnitPrice,
			lineTotal,
			type: line.type,
		};

		if (selected) {
			// Use chargeType (source of truth) instead of type display string
			if (line.chargeType === "recurring") {
				monthlySubtotal += lineTotal;
			} else {
				oneTimeSubtotal += lineTotal;
			}
		}

		// Apply override to workbook cells for export accuracy (calculator sheets only)
		if (line.cellRefs) {
			if (overridePrice != null) {
				removeFormulaAndWriteNumber(sheet, line.cellRefs.unitPrice, overridePrice);
				removeFormulaAndWriteNumber(sheet, line.cellRefs.lineTotal, lineTotal);
			} else {
				// ensure workbook line total matches computed (for unselected consider 0)
				removeFormulaAndWriteNumber(sheet, line.cellRefs.lineTotal, lineTotal);
			}
		}

		lines.push(result);
	}

	const maintenanceContribution = maintenanceSubtotalValue ?? 0;
	const grandTotalMonthOne = monthlySubtotal + oneTimeSubtotal + maintenanceContribution;
	const ongoingMonthly = monthlySubtotal + maintenanceContribution;

	removeFormulaAndWriteNumber(sheet, metadata.totals.monthlySubtotal, monthlySubtotal);
	removeFormulaAndWriteNumber(sheet, metadata.totals.oneTimeSubtotal, oneTimeSubtotal);
	if (metadata.totals.maintenanceSubtotal) {
		removeFormulaAndWriteNumber(
			sheet,
			metadata.totals.maintenanceSubtotal,
			maintenanceContribution
		);
	}
	removeFormulaAndWriteNumber(sheet, metadata.totals.grandTotal, grandTotalMonthOne);

	const ongoingCell =
		metadata.totals.ongoingMonthly ||
		mapping.ongoingMonthlyCell ||
		metadata.totals.monthlySubtotal;
	removeFormulaAndWriteNumber(sheet, ongoingCell, ongoingMonthly);

	const totals: PricingTotals = {
		monthlySubtotal,
		oneTimeSubtotal,
		ongoingMonthly,
		grandTotalMonthOne,
	};

	if (maintenanceSubtotalValue != null) {
		totals.maintenanceSubtotal = maintenanceContribution;
	}

	if (input.quoteDetails) {
		const quoteSheetName = mapping.quoteSheet;
		const quoteSheet = quoteSheetName ? workbook.Sheets[quoteSheetName] : undefined;
		if (quoteSheet) {
			const { clientName, companyName, preparedBy, preparedForEmail, notes } =
				input.quoteDetails;
			const quoteFields =
				mapping.quoteFields ?? DEFAULT_PRICING_WORKBOOK_MAPPING.quoteFields;
			if (clientName && quoteFields?.clientName) {
				writeString(quoteSheet, quoteFields.clientName, clientName);
			}
			if (companyName && quoteFields?.companyName) {
				writeString(quoteSheet, quoteFields.companyName, companyName);
			}
			if (preparedBy && quoteFields?.preparedBy) {
				writeString(quoteSheet, quoteFields.preparedBy, preparedBy);
			}
			if (quoteFields?.clientSize) {
				writeString(quoteSheet, quoteFields.clientSize, input.clientSize);
			}
			if (quoteFields?.pricePoint) {
				writeString(quoteSheet, quoteFields.pricePoint, input.pricePoint);
			}
			if (preparedForEmail && quoteFields?.preparedForEmail) {
				writeString(quoteSheet, quoteFields.preparedForEmail, preparedForEmail);
			}
			if (notes && quoteFields?.notes) {
				writeString(quoteSheet, quoteFields.notes, notes);
			}
		}
	}

	return {
		metadata,
		lines,
		totals,
		workbook,
	};
}

export function workbookToBuffer(workbook: WorkBook): Buffer {
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function workbookToCsv(
	workbook: WorkBook,
	sheetName = DEFAULT_PRICING_WORKBOOK_MAPPING.calculatorSheet
): string {
	const sheet = getSheet(workbook, sheetName);
	return XLSX.utils.sheet_to_csv(sheet, { FS: ",", strip: true });
}
