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
import type { PricingBlueprint } from "./blueprint";

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
	defaultSelected: boolean;
	defaultQuantity: number;
	defaultMaintenance: boolean;
	baseRates: PricingRateOverride;
	maintenanceAmount?: number | null;
	cellRefs: {
		select: string;
		quantity: string;
		maintenance: string;
		unitPrice: string;
		lineTotal: string;
		maintenanceTotal?: string;
		type: string;
	};
	rateColumns: PricingRateColumns;
}

export interface PricingMetadata {
	clientSizes: ClientSize[];
	pricePoints: PricePoint[];
	lineItems: PricingLineMetadata[];
	totals: {
		monthlySubtotal: string;
		oneTimeSubtotal: string;
		maintenanceSubtotal: string;
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
	includeMaintenance?: boolean;
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
	includeMaintenance: boolean;
	unitPrice: number;
	overridePrice?: number | null;
	effectiveUnitPrice: number;
	lineTotal: number;
	maintenanceAmount: number;
	type: string;
}

export interface PricingTotals {
	monthlySubtotal: number;
	oneTimeSubtotal: number;
	maintenanceSubtotal: number;
	grandTotalMonthOne: number;
	ongoingMonthly: number;
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
	const doc = await PricingWorkbookModel.findOne()
		.sort({ uploadedAt: -1 })
		.lean<
			| {
				filename: string;
				mimeType?: string;
				data: Buffer;
				size?: number;
				uploadedAt?: Date;
				uploadedBy?: string;
			}
			| null
		>();

	if (doc?.data) {
		const buffer = Buffer.isBuffer(doc.data)
			? Buffer.from(doc.data)
			: Buffer.from(doc.data as unknown as ArrayBuffer);
		if (buffer.length) {
			return {
				buffer,
				updatedAt: doc.uploadedAt ? doc.uploadedAt.getTime() : Date.now(),
				filename: doc.filename || "pricing-workbook.xlsx",
				mimeType: doc.mimeType || DEFAULT_WORKBOOK_MIME,
			};
		}

		console.warn(
			"[pricing] Stored workbook document exists but contains no data. Upload a new workbook to enable the calculator."
		);
	}

	throw new Error(
		"Pricing workbook not found. Upload a workbook through the admin panel."
	);
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

	const optionalCell = (column: string | undefined, row: number): string | null =>
		column ? makeCell(column, row) : null;

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
		const maintenanceCell = getCell(columns.maintenanceToggle, row);
		const unitPriceCell = getCell(columns.unitPrice, row);
		const lineTotalCell = getCell(columns.lineTotal, row);
		const maintenanceTotalCell = optionalCell(columns.maintenanceTotal, row);
		const typeCell = getCell(columns.type, row);

		const defaultQuantityValue = ensureNumber(readNumber(sheet, quantityCell), 1) || 1;

		const item: PricingLineMetadata = {
			id,
			row,
			tier,
			service,
			billing,
			description,
			type: type || "Monthly",
			defaultSelected: readBoolean(sheet, selectCell, false),
			defaultQuantity: defaultQuantityValue,
			defaultMaintenance: readBoolean(sheet, maintenanceCell, false),
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
			maintenanceAmount: maintenanceTotalCell
				? readNumber(sheet, maintenanceTotalCell) || null
				: null,
			cellRefs: {
				select: selectCell,
				quantity: quantityCell,
				maintenance: maintenanceCell,
				unitPrice: unitPriceCell,
				lineTotal: lineTotalCell,
				maintenanceTotal: maintenanceTotalCell ?? undefined,
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

function cloneRateOverride(source: PricingRateOverride): PricingRateOverride {
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
		if (service.defaultMaintenance != null) draft.defaultMaintenance = service.defaultMaintenance;

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
		const workbook = XLSX.read(binary.buffer, {
			type: "buffer",
			cellFormula: true,
			cellHTML: false,
			cellStyles: true,
		});
		const sheet = getSheet(workbook, mapping.calculatorSheet);
		const lineItems = extractLineItems(sheet, mapping);
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

	writeString(sheet, mapping.clientSizeCell, input.clientSize);
	writeString(sheet, mapping.pricePointCell, input.pricePoint);

	const paired = normalizeSelections(metadata, input.selections);

	for (const { line, selection } of paired) {
		const selected = selection?.selected ?? line.defaultSelected;
		const quantity = ensureNumber(selection?.quantity, line.defaultQuantity) || 0;
		const includeMaintenance =
			selection?.includeMaintenance ?? line.defaultMaintenance;

		writeBoolean(sheet, line.cellRefs.select, selected);
		writeNumber(sheet, line.cellRefs.quantity, quantity);
		writeBoolean(sheet, line.cellRefs.maintenance, includeMaintenance);

		applyRateOverrides(sheet, line.rateColumns, selection?.rateOverrides);
	}

	XLSX_CALC(workbook);

	const lines: PricingLineResult[] = [];
	let monthlySubtotal = 0;
	let oneTimeSubtotal = 0;
	let maintenanceSubtotal = 0;

	for (const { line, selection } of paired) {
		const selected = selection?.selected ?? line.defaultSelected;
		const quantity = ensureNumber(selection?.quantity, line.defaultQuantity) || 0;
		const includeMaintenance =
			selection?.includeMaintenance ?? line.defaultMaintenance;
		const overridePrice = selection?.overridePrice ?? null;

		const unitPrice = readNumber(sheet, line.cellRefs.unitPrice);
		const computedLineTotal = readNumber(sheet, line.cellRefs.lineTotal);
		const maintenanceAmountCell = line.cellRefs.maintenanceTotal;
		const maintenanceAmount = includeMaintenance && maintenanceAmountCell
			? readNumber(sheet, maintenanceAmountCell)
			: 0;

		const effectiveUnitPrice = overridePrice ?? unitPrice;
		const lineTotal = selected ? effectiveUnitPrice * quantity : 0;

		const result: PricingLineResult = {
			id: line.id,
			service: line.service,
			tier: line.tier,
			billing: line.billing,
			selected,
			quantity,
			includeMaintenance,
			unitPrice,
			overridePrice,
			effectiveUnitPrice,
			lineTotal,
			maintenanceAmount: includeMaintenance ? maintenanceAmount : 0,
			type: line.type,
		};

		if (selected) {
			if (/monthly/i.test(line.type)) {
				monthlySubtotal += lineTotal;
			} else {
				oneTimeSubtotal += lineTotal;
			}
			if (includeMaintenance) {
				maintenanceSubtotal += maintenanceAmount;
			}
		}

		// Apply override to workbook cells for export accuracy
		if (overridePrice != null) {
			removeFormulaAndWriteNumber(sheet, line.cellRefs.unitPrice, overridePrice);
			removeFormulaAndWriteNumber(sheet, line.cellRefs.lineTotal, lineTotal);
		} else {
			// ensure workbook line total matches computed (for unselected consider 0)
			removeFormulaAndWriteNumber(sheet, line.cellRefs.lineTotal, lineTotal);
		}

		lines.push(result);
	}

	const grandTotalMonthOne = monthlySubtotal + oneTimeSubtotal + maintenanceSubtotal;
	const ongoingMonthly = monthlySubtotal + maintenanceSubtotal;

	removeFormulaAndWriteNumber(sheet, metadata.totals.monthlySubtotal, monthlySubtotal);
	removeFormulaAndWriteNumber(sheet, metadata.totals.oneTimeSubtotal, oneTimeSubtotal);
	removeFormulaAndWriteNumber(sheet, metadata.totals.maintenanceSubtotal, maintenanceSubtotal);
	removeFormulaAndWriteNumber(sheet, metadata.totals.grandTotal, grandTotalMonthOne);

	const ongoingCell =
		metadata.totals.ongoingMonthly ||
		mapping.ongoingMonthlyCell ||
		metadata.totals.monthlySubtotal;
	removeFormulaAndWriteNumber(sheet, ongoingCell, ongoingMonthly);

		const totals: PricingTotals = {
		monthlySubtotal,
		oneTimeSubtotal,
		maintenanceSubtotal,
		grandTotalMonthOne,
		ongoingMonthly,
	};

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
