import React from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import SpreadsheetPreview, { SpreadsheetHighlight } from "./SpreadsheetPreview";
import styles from "./WorkbookMappingWizard.module.css";
import type {
  PricingBlueprint,
  PricingBlueprintOverrides,
  PricingRateBand,
  PricingServiceBlueprint,
  PricingServiceBlueprintOverride,
  PricingWorkbookMapping,
  PricingWorkbookRateColumns,
  PricingWorkbookRateColumnSet,
  PricingWorkbookColumnMapping,
  PricingWorkbookTotalsMapping,
  PricingWorkbookLineRange,
  PricingWorkbookQuoteFields,
  PricingWorkbookUploadPayload,
} from "../types/pricing";

const DEFAULT_WORKBOOK_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_ROWS_PREVIEW = 120;
const MAX_COLUMNS_PREVIEW = 50;

interface UsedRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface DropdownMeta {
  options: string[];
  source?: string;
}

interface SheetMetadata {
  usedRange: UsedRange;
  dropdowns: Record<string, DropdownMeta>;
}

interface WizardWorkbook {
  name: string;
  sheets: string[];
  data: Record<string, string[][]>;
  meta: Record<string, SheetMetadata>;
}

type PrimaryField = "clientSizeCell" | "pricePointCell" | "ongoingMonthlyCell";
type TotalField = keyof PricingWorkbookTotalsMapping;
type ColumnField = Exclude<keyof PricingWorkbookColumnMapping, "rateColumns">;
type RateSegment = keyof PricingWorkbookRateColumns;
type RateField = keyof PricingWorkbookRateColumnSet;
type LineField = keyof PricingWorkbookLineRange;
type QuoteField = keyof PricingWorkbookQuoteFields;

type Selection =
  | { category: "primary"; field: PrimaryField; sheet: "calculator"; label: string }
  | { category: "total"; field: TotalField; sheet: "calculator"; label: string }
  | { category: "column"; field: ColumnField; sheet: "calculator"; label: string }
  | {
      category: "rate";
      segment: RateSegment;
      field: RateField;
      sheet: "calculator";
      label: string;
    }
  | { category: "line"; field: LineField; sheet: "calculator"; label: string }
  | { category: "quote"; field: QuoteField; sheet: "quote"; label: string };

interface ServiceDraft {
  serviceId: string;
  name: string;
  tier: string;
  billingCadence: string;
  defaultSelected: boolean;
  defaultQuantity: number;
  defaultMaintenance: boolean;
  rateBands: Record<string, PricingRateBand>;
}

type ServiceDraftMap = Record<string, ServiceDraft>;

type Step = { id: "upload" | "map" | "configure"; title: string };

const STEPS: Step[] = [
  { id: "upload", title: "Upload" },
  { id: "map", title: "Map Calculator" },
  { id: "configure", title: "Configure & Rules" },
];

const DEFAULT_SEGMENT_ORDER = ["Solo/Startup", "Small Business", "Mid-Market"];

const primaryFields: Array<{
  key: PrimaryField;
  label: string;
  optional?: boolean;
  helper?: string;
}> = [
  {
    key: "clientSizeCell",
    label: "Client Size Cell",
    helper: "Cell that controls which pricing segment is active.",
  },
  {
    key: "pricePointCell",
    label: "Price Point Cell",
    helper: "Cell that drives the price point (low/mid/high).",
  },
  {
    key: "ongoingMonthlyCell",
    label: "Ongoing Monthly Cell",
    optional: true,
    helper: "Optional field for ongoing monthly overrides.",
  },
];

const totalFields: Array<{
  key: TotalField;
  label: string;
  optional?: boolean;
  helper?: string;
}> = [
  {
    key: "monthlySubtotal",
    label: "Monthly Subtotal",
    helper: "Month-one recurring subtotal (monthly fees).",
  },
  {
    key: "oneTimeSubtotal",
    label: "One-Time Subtotal",
    helper: "Total of all one-time fees.",
  },
  {
    key: "maintenanceSubtotal",
    label: "Maintenance Subtotal",
    helper: "Monthly maintenance total for selected services.",
  },
  {
    key: "grandTotal",
    label: "Month-One Grand Total",
    helper: "Combined total for one-time and monthly amounts.",
  },
  {
    key: "ongoingMonthly",
    label: "Ongoing Monthly",
    optional: true,
    helper: "Recurring total after month one.",
  },
];

const columnFields: Array<{
  key: ColumnField;
  label: string;
  optional?: boolean;
  helper?: string;
}> = [
  { key: "select", label: "Select Column", optional: true, helper: "Checkbox or selector column." },
  { key: "quantity", label: "Quantity Column", optional: true, helper: "Editable quantity column." },
  {
    key: "maintenanceToggle",
    label: "Maintenance Toggle",
    optional: true,
    helper: "Optional column that toggles maintenance on/off.",
  },
  {
    key: "description",
    label: "Description Column",
    optional: true,
    helper: "Optional long-form service description column.",
  },
  { key: "tier", label: "Tier Column", helper: "Tier or package name column." },
  { key: "service", label: "Service Column", helper: "Primary service name column." },
  { key: "billing", label: "Billing Column", helper: "Billing cadence (monthly/one-time)." },
  { key: "type", label: "Type Column", helper: "Type classification used by the calculator." },
  { key: "unitPrice", label: "Unit Price Column", helper: "Calculated unit price column." },
  { key: "lineTotal", label: "Line Total Column", helper: "Total amount per line." },
  {
    key: "maintenanceTotal",
    label: "Maintenance Total",
    optional: true,
    helper: "Optional maintenance total column (if separate).",
  },
];

const rateSegments: RateSegment[] = ["soloStartup", "smallBusiness", "midMarket"];

const rateColumnLabels: Record<RateSegment, string> = {
  soloStartup: "Solo / Startup",
  smallBusiness: "Small Business",
  midMarket: "Mid-Market",
};

const rateFieldLabels: Record<RateField, string> = {
  low: "Low",
  high: "High",
  maintenance: "Maintenance",
};

const rateFieldHelpers: Partial<Record<RateField, string>> = {
  maintenance: "Optional column for maintenance pricing in this segment.",
};

const quoteFields: Array<{
  key: QuoteField;
  label: string;
  optional?: boolean;
  helper?: string;
}> = [
  { key: "clientName", label: "Client Name" },
  { key: "companyName", label: "Company Name" },
  { key: "preparedBy", label: "Prepared By" },
  { key: "preparedForEmail", label: "Client Email", optional: true },
  { key: "clientSize", label: "Client Size", optional: true },
  { key: "pricePoint", label: "Price Point", optional: true },
  { key: "notes", label: "Notes", optional: true },
];

interface SelectionDescription {
  preview: string;
}

interface WorkbookMappingWizardProps {
  isOpen: boolean;
  mapping: PricingWorkbookMapping;
  blueprint: PricingBlueprint | null;
  mergedBlueprint: PricingBlueprint | null;
  overrides: PricingBlueprintOverrides | null;
  onClose: () => void;
  onSubmit: (
    mapping: PricingWorkbookMapping,
    workbook: PricingWorkbookUploadPayload | null | undefined,
    overrides: PricingBlueprintOverrides | null | undefined
  ) => Promise<void> | void;
  onRequestReanalyze?: () => Promise<void> | void;
}

const WorkbookMappingWizard: React.FC<WorkbookMappingWizardProps> = ({
  isOpen,
  mapping,
  blueprint,
  mergedBlueprint,
  overrides,
  onClose,
  onSubmit,
  onRequestReanalyze,
}) => {
  const [activeStep, setActiveStep] = React.useState<number>(0);
  const [localMapping, setLocalMapping] = React.useState<PricingWorkbookMapping>(
    () => cloneMapping(mapping)
  );
  const [selectedCalculatorSheet, setSelectedCalculatorSheet] = React.useState<string>(
    () => mapping.calculatorSheet
  );
  const [selectedQuoteSheet, setSelectedQuoteSheet] = React.useState<string>(
    () => mapping.quoteSheet ?? ""
  );
  const [workbook, setWorkbook] = React.useState<WizardWorkbook | null>(null);
  const [pendingWorkbook, setPendingWorkbook] = React.useState<PricingWorkbookUploadPayload | null>(
    null
  );
  const [workbookError, setWorkbookError] = React.useState<string | null>(null);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [previewMode, setPreviewMode] = React.useState<"calculator" | "quote">("calculator");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [reanalyzing, setReanalyzing] = React.useState<boolean>(false);
  const [isDragOver, setIsDragOver] = React.useState<boolean>(false);
  const [incomingFile, setIncomingFile] = React.useState<File | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = React.useState<boolean>(false);
  const [notesDraft, setNotesDraft] = React.useState<string>(overrides?.metadataNotes ?? "");
  const [overrideDrafts, setOverrideDrafts] = React.useState<ServiceDraftMap>({});

  const mergedServices = React.useMemo(
    () => mergedBlueprint?.services ?? blueprint?.services ?? [],
    [mergedBlueprint, blueprint]
  );

  const baseServiceDrafts = React.useMemo(() => {
    const map = new Map<string, ServiceDraft>();
    mergedServices.forEach((service) => {
      map.set(service.id, buildServiceDraft(service));
    });
    return map;
  }, [mergedServices]);

  const persistedServiceDrafts = React.useMemo(() => {
    const map = new Map<string, ServiceDraft>();
    if (!overrides?.services?.length) {
      return map;
    }
    overrides.services.forEach((override) => {
      const baseDraft = baseServiceDrafts.get(override.serviceId);
      if (!baseDraft) return;
      map.set(override.serviceId, applyOverrideToDraft(baseDraft, override));
    });
    return map;
  }, [overrides, baseServiceDrafts]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveStep(0);
    setSelection(null);
    setSubmissionError(null);
    setWorkbookError(null);
    setPreviewMode("calculator");
    setLocalMapping(cloneMapping(mapping));
    setSelectedCalculatorSheet(mapping.calculatorSheet);
    setSelectedQuoteSheet(mapping.quoteSheet ?? "");
    setNotesDraft(overrides?.metadataNotes ?? "");
    setPendingWorkbook(null);
    setIncomingFile(null);
    setShowOverwriteConfirm(false);

    const nextDrafts: ServiceDraftMap = {};
    persistedServiceDrafts.forEach((draft, serviceId) => {
      nextDrafts[serviceId] = cloneServiceDraft(draft);
    });
    setOverrideDrafts(nextDrafts);
  }, [isOpen, mapping, overrides, persistedServiceDrafts]);

  const segmentOrder = React.useMemo(() => {
    if (mergedBlueprint?.clientSegments?.length) {
      return mergedBlueprint.clientSegments;
    }
    if (blueprint?.clientSegments?.length) {
      return blueprint.clientSegments;
    }
    return DEFAULT_SEGMENT_ORDER;
  }, [mergedBlueprint, blueprint]);

  const calculatorSheetData = React.useMemo(() => {
    if (!workbook) return [] as string[][];
    const sheetName = selectedCalculatorSheet || localMapping.calculatorSheet;
    if (!sheetName) return [];
    return workbook.data[sheetName] || [];
  }, [workbook, selectedCalculatorSheet, localMapping.calculatorSheet]);

  const quoteSheetData = React.useMemo(() => {
    if (!workbook) return [] as string[][];
    const sheetName = selectedQuoteSheet || localMapping.quoteSheet;
    if (!sheetName) return [];
    return workbook.data[sheetName] || [];
  }, [workbook, selectedQuoteSheet, localMapping.quoteSheet]);

  const calculatorSheetMeta = React.useMemo(() => {
    const sheetName = selectedCalculatorSheet || localMapping.calculatorSheet;
    if (!sheetName || !workbook) return null;
    return workbook.meta[sheetName] || null;
  }, [workbook, selectedCalculatorSheet, localMapping.calculatorSheet]);

  const quoteSheetMeta = React.useMemo(() => {
    const sheetName = selectedQuoteSheet || localMapping.quoteSheet;
    if (!sheetName || !workbook) return null;
    return workbook.meta[sheetName] || null;
  }, [workbook, selectedQuoteSheet, localMapping.quoteSheet]);

  const calculatorHighlight = React.useMemo<SpreadsheetHighlight>(() => {
    const columns: number[] = [];
    const rows: number[] = [];
    const cells: Array<{ row: number; column: number }> = [];

    columnFields.forEach(({ key }) => {
      const value = localMapping.columns[key];
      if (!value) return;
      const index = columnLetterToIndex(value as string);
      if (index != null && !columns.includes(index)) {
        columns.push(index);
      }
    });

    rateSegments.forEach((segment) => {
      const config = localMapping.columns.rateColumns[segment];
      (Object.keys(config) as RateField[]).forEach((field) => {
        const value = config[field];
        if (!value) return;
        const index = columnLetterToIndex(value as string);
        if (index != null && !columns.includes(index)) {
          columns.push(index);
        }
      });
    });

    const primaryCells: Array<string | undefined> = [
      localMapping.clientSizeCell,
      localMapping.pricePointCell,
      localMapping.ongoingMonthlyCell,
      localMapping.totals.monthlySubtotal,
      localMapping.totals.oneTimeSubtotal,
      localMapping.totals.maintenanceSubtotal,
      localMapping.totals.grandTotal,
      localMapping.totals.ongoingMonthly,
    ];

    primaryCells.forEach((cell) => {
      const parsed = parseCellAddress(cell);
      if (!parsed) return;
      if (!cells.some((item) => item.row === parsed.row && item.column === parsed.column)) {
        cells.push(parsed);
      }
    });

    const { startRow, endRow } = localMapping.lineItemsRange;
    if (typeof startRow === "number" && typeof endRow === "number") {
      for (let row = Math.max(0, startRow - 1); row <= Math.max(startRow - 1, endRow - 1); row += 1) {
        if (!rows.includes(row)) {
          rows.push(row);
        }
      }
    }

    return { columns, rows, cells };
  }, [localMapping]);

  const quoteHighlight = React.useMemo<SpreadsheetHighlight>(() => {
    const cells: Array<{ row: number; column: number }> = [];
    const fields = localMapping.quoteFields;
    if (!fields) return { cells };
    Object.values(fields).forEach((address) => {
      const parsed = parseCellAddress(address);
      if (parsed && !cells.some((cell) => cell.row === parsed.row && cell.column === parsed.column)) {
        cells.push(parsed);
      }
    });
    return { cells };
  }, [localMapping.quoteFields]);

  const activeMode = React.useMemo(() => {
    if (!selection) return null;
    if (selection.category === "column" || selection.category === "rate") {
      return "column" as const;
    }
    if (selection.category === "line") {
      return "row" as const;
    }
    return "cell" as const;
  }, [selection]);

  const selectionPrompts = React.useMemo<SelectionDescription>(() => describeSelection(selection), [
    selection,
  ]);

  const calculatorInstructions = React.useMemo(() => {
    if (selection?.sheet === "calculator") return selectionPrompts.preview;
    return "Review the calculator sheet preview. Use Select buttons to map cells, columns, or rows.";
  }, [selection, selectionPrompts]);

  const quoteInstructions = React.useMemo(() => {
    if (selection?.sheet === "quote") return selectionPrompts.preview;
    return "Switch to the quote sheet to pick cells for quote fields.";
  }, [selection, selectionPrompts]);

  const calculatorPreviewMeta = React.useMemo(() => {
    if (!calculatorSheetMeta) return undefined;
    const dropdowns = Object.fromEntries(
      Object.entries(calculatorSheetMeta.dropdowns).map(([address, info]) => [
        address,
        { options: info.options, source: info.source },
      ])
    );
    return { usedRange: calculatorSheetMeta.usedRange, dropdowns };
  }, [calculatorSheetMeta]);

  const quotePreviewMeta = React.useMemo(() => {
    if (!quoteSheetMeta) return undefined;
    const dropdowns = Object.fromEntries(
      Object.entries(quoteSheetMeta.dropdowns).map(([address, info]) => [
        address,
        { options: info.options, source: info.source },
      ])
    );
    return { usedRange: quoteSheetMeta.usedRange, dropdowns };
  }, [quoteSheetMeta]);

  const calculatorColumnSuggestions = React.useMemo(() => {
    if (calculatorSheetMeta) {
      const { startColumn, endColumn } = calculatorSheetMeta.usedRange;
      return Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
        columnIndexToLetter(startColumn + index)
      );
    }
    if (!calculatorSheetData.length) return [] as string[];
    const maxColumns = calculatorSheetData.reduce(
      (max, row) => Math.max(max, row.length),
      0
    );
    return Array.from({ length: maxColumns }, (_, index) => columnIndexToLetter(index));
  }, [calculatorSheetData, calculatorSheetMeta]);

  const quoteColumnSuggestions = React.useMemo(() => {
    if (quoteSheetMeta) {
      const { startColumn, endColumn } = quoteSheetMeta.usedRange;
      return Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
        columnIndexToLetter(startColumn + index)
      );
    }
    if (!quoteSheetData.length) return [] as string[];
    const maxColumns = quoteSheetData.reduce((max, row) => Math.max(max, row.length), 0);
    return Array.from({ length: maxColumns }, (_, index) => columnIndexToLetter(index));
  }, [quoteSheetData, quoteSheetMeta]);

  const hasExistingConfiguration = React.useMemo(() => {
    if (workbook || pendingWorkbook) return true;
    if (mapping?.calculatorSheet) return true;
    if (mapping?.columns?.service) return true;
    if (overrides?.services?.length) return true;
    if (overrides?.metadataNotes && overrides.metadataNotes.trim()) return true;
    return false;
  }, [mapping, overrides, workbook, pendingWorkbook]);

  const calculatorSheetSuggestions = workbook?.sheets || [];
  const quoteSheetSuggestions = workbook?.sheets || [];

  const isCalculatorStepValid = React.useMemo(() => {
    const requiredColumns: ColumnField[] = [
      "service",
      "tier",
      "billing",
      "type",
      "unitPrice",
      "lineTotal",
    ];
    const hasColumns = requiredColumns.every((field) => localMapping.columns[field]);
    const hasTotals =
      localMapping.totals.monthlySubtotal &&
      localMapping.totals.oneTimeSubtotal &&
      localMapping.totals.maintenanceSubtotal &&
      localMapping.totals.grandTotal;
    const hasLineRange =
      typeof localMapping.lineItemsRange.startRow === "number" &&
      typeof localMapping.lineItemsRange.endRow === "number";
    return Boolean(localMapping.calculatorSheet && hasColumns && hasTotals && hasLineRange);
  }, [localMapping]);

  const isQuoteStepValid = React.useMemo(() => {
    if (!localMapping.quoteSheet || !localMapping.quoteFields) return true;
    const requiredFields: QuoteField[] = [
      "clientName",
      "companyName",
      "preparedBy",
      "clientSize",
      "pricePoint",
    ];
    return requiredFields.every((field) => localMapping.quoteFields?.[field]);
  }, [localMapping.quoteFields, localMapping.quoteSheet]);

  const canProceed = React.useMemo(() => {
    if (activeStep === 1) return isCalculatorStepValid;
    if (activeStep === 2) return isQuoteStepValid;
    return true;
  }, [activeStep, isCalculatorStepValid, isQuoteStepValid]);

  const handleNext = () => {
    if (activeStep >= STEPS.length - 1) return;
    if (!canProceed) return;
    setActiveStep((prev) => prev + 1);
    setSelection(null);
    setSubmissionError(null);
  };

  const handleBack = () => {
    if (activeStep <= 0) return;
    setActiveStep((prev) => prev - 1);
    setSelection(null);
    setSubmissionError(null);
  };

  const handleCellSelection = (rowIndex: number, columnIndex: number) => {
    if (!selection || selection.category === "column" || selection.category === "rate") return;
    const address = `${columnIndexToLetter(columnIndex)}${rowIndex + 1}`;
    switch (selection.category) {
      case "primary":
        updatePrimaryField(selection.field, address);
        break;
      case "total":
        updateTotalField(selection.field, address);
        break;
      case "quote":
        updateQuoteField(selection.field, address);
        break;
      case "line":
        updateLineField(selection.field, rowIndex + 1);
        break;
      default:
        break;
    }
    setSelection(null);
  };

  const handleColumnSelection = (columnIndex: number) => {
    if (!selection) return;
    const letter = columnIndexToLetter(columnIndex);
    if (selection.category === "column") {
      updateColumnField(selection.field, letter);
      setSelection(null);
    } else if (selection.category === "rate") {
      updateRateField(selection.segment, selection.field, letter);
      setSelection(null);
    }
  };

  const handleRowSelection = (rowIndex: number) => {
    if (!selection || selection.category !== "line") return;
    updateLineField(selection.field, rowIndex + 1);
    setSelection(null);
  };

  const handleSelectCalculatorSheet = (sheet: string) => {
    const normalized = normalizeSheetName(sheet);
    if (!normalized) return;
    setSelectedCalculatorSheet(normalized);
    setLocalMapping((prev) => ({ ...prev, calculatorSheet: normalized }));
  };

  const handleSelectQuoteSheet = (sheet: string) => {
    const normalized = normalizeSheetName(sheet);
    if (!normalized) {
      setSelectedQuoteSheet("");
      setLocalMapping((prev) => ({ ...prev, quoteSheet: undefined, quoteFields: undefined }));
      return;
    }
    setSelectedQuoteSheet(normalized);
    setLocalMapping((prev) => ({ ...prev, quoteSheet: normalized }));
  };

  const handlePrimarySelection = (field: PrimaryField, label: string) => {
    setSelection({ category: "primary", field, label, sheet: "calculator" });
    setPreviewMode("calculator");
  };

  const handleTotalSelection = (field: TotalField, label: string) => {
    setSelection({ category: "total", field, label, sheet: "calculator" });
    setPreviewMode("calculator");
  };

  const handleColumnSelect = (field: ColumnField, label: string) => {
    setSelection({ category: "column", field, label, sheet: "calculator" });
    setPreviewMode("calculator");
  };

  const handleRateSelect = (segment: RateSegment, field: RateField, label: string) => {
    setSelection({
      category: "rate",
      segment,
      field,
      label,
      sheet: "calculator",
    });
    setPreviewMode("calculator");
  };

  const handleLineSelect = (field: LineField, label: string) => {
    setSelection({ category: "line", field, label, sheet: "calculator" });
    setPreviewMode("calculator");
  };

  const handleQuoteSelect = (field: QuoteField, label: string) => {
    setSelection({ category: "quote", field, label, sheet: "quote" });
    setPreviewMode("quote");
  };

  const updatePrimaryField = (field: PrimaryField, value?: string) => {
    setLocalMapping((prev) => ({
      ...prev,
      [field]: value || (field === "ongoingMonthlyCell" ? undefined : ""),
    }));
  };

  const updateTotalField = (field: TotalField, value?: string) => {
    setLocalMapping((prev) => ({
      ...prev,
      totals: {
        ...prev.totals,
        [field]: value || (field === "ongoingMonthly" ? undefined : ""),
      },
    }));
  };

  const updateColumnField = (field: ColumnField, value?: string) => {
    setLocalMapping((prev) => ({
      ...prev,
      columns: {
        ...prev.columns,
        [field]: value
          ? value
          : field === "description" || field === "maintenanceTotal"
          ? undefined
          : "",
      },
    }));
  };

  const updateRateField = (segment: RateSegment, field: RateField, value?: string) => {
    setLocalMapping((prev) => ({
      ...prev,
      columns: {
        ...prev.columns,
        rateColumns: {
          ...prev.columns.rateColumns,
          [segment]: {
            ...prev.columns.rateColumns[segment],
            [field]: value ? value : field === "maintenance" ? undefined : "",
          },
        },
      },
    }));
  };

  const updateQuoteField = (field: QuoteField, value?: string) => {
    setLocalMapping((prev) => {
      const next = { ...(prev.quoteFields ?? {}) } as PricingWorkbookQuoteFields;
      if (value) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return {
        ...prev,
        quoteFields: Object.keys(next).length ? next : undefined,
      };
    });
  };

  const updateLineField = (field: LineField, value?: number) => {
    setLocalMapping((prev) => {
      const nextRange = { ...prev.lineItemsRange };
      if (value != null) {
        const sanitized = Math.max(1, Math.floor(value));
        nextRange[field] = sanitized;
        if (field === "startRow" && nextRange.endRow != null && sanitized > nextRange.endRow) {
          nextRange.endRow = sanitized;
        }
        if (field === "endRow" && nextRange.startRow != null && sanitized < nextRange.startRow) {
          nextRange.startRow = sanitized;
        }
      }
      return {
        ...prev,
        lineItemsRange: nextRange,
      };
    });
  };

  const updateServiceOverride = React.useCallback(
    (serviceId: string, updater: (draft: ServiceDraft) => ServiceDraft) => {
      setOverrideDrafts((prev) => {
        const baseline =
          prev[serviceId] ??
          persistedServiceDrafts.get(serviceId) ??
          baseServiceDrafts.get(serviceId);
        if (!baseline) return prev;
        const nextDraft = updater(cloneServiceDraft(baseline));
        return { ...prev, [serviceId]: nextDraft };
      });
    },
    [baseServiceDrafts, persistedServiceDrafts]
  );

  const handleNameChange = (serviceId: string, value: string) => {
    updateServiceOverride(serviceId, (draft) => ({ ...draft, name: value }));
  };

  const handleTierChange = (serviceId: string, value: string) => {
    updateServiceOverride(serviceId, (draft) => ({ ...draft, tier: value }));
  };

  const handleBillingChange = (serviceId: string, value: string) => {
    updateServiceOverride(serviceId, (draft) => ({ ...draft, billingCadence: value }));
  };

  const handleSelectedToggle = (serviceId: string, checked: boolean) => {
    updateServiceOverride(serviceId, (draft) => ({ ...draft, defaultSelected: checked }));
  };

  const handleMaintenanceToggle = (serviceId: string, checked: boolean) => {
    updateServiceOverride(serviceId, (draft) => ({ ...draft, defaultMaintenance: checked }));
  };

  const handleQuantityChange = (serviceId: string, value: string) => {
    const numeric = value.trim() ? Number(value) : null;
    updateServiceOverride(serviceId, (draft) => ({
      ...draft,
      defaultQuantity: Number.isFinite(Number(numeric)) ? Number(numeric) : draft.defaultQuantity,
    }));
  };

  const handleRateChange = (
    serviceId: string,
    segment: string,
    field: keyof PricingRateBand,
    value: string
  ) => {
    updateServiceOverride(serviceId, (draft) => {
      const next = cloneServiceDraft(draft);
      const rateBands = { ...next.rateBands };
      const target = { ...(rateBands[segment] || {}) } as PricingRateBand;
      const numeric = cleanNumber(value);
      if (numeric == null) {
        delete target[field];
      } else {
        target[field] = numeric;
      }
      if (Object.keys(target).length) {
        rateBands[segment] = target;
      } else {
        delete rateBands[segment];
      }
      next.rateBands = rateBands;
      return next;
    });
  };

  const handleUndoChanges = (serviceId: string) => {
    setOverrideDrafts((prev) => {
      if (persistedServiceDrafts.has(serviceId)) {
        return {
          ...prev,
          [serviceId]: cloneServiceDraft(persistedServiceDrafts.get(serviceId)!),
        };
      }
      const next = { ...prev };
      delete next[serviceId];
      return next;
    });
  };

  const handleUseBaseValues = (serviceId: string) => {
    setOverrideDrafts((prev) => {
      const next = { ...prev };
      delete next[serviceId];
      return next;
    });
  };

  const handleReanalyzeBlueprint = async () => {
    if (!onRequestReanalyze) return;
    setSubmissionError(null);
    try {
      setReanalyzing(true);
      await onRequestReanalyze();
    } catch (error: any) {
      console.error("Failed to reanalyze pricing blueprint", error);
      setSubmissionError(error?.message || "Failed to run AI analysis. Try again later.");
    } finally {
      setReanalyzing(false);
    }
  };

  const handleIncomingFile = (file: File) => {
    setWorkbookError(null);
    setSubmissionError(null);

    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      setWorkbookError("Please select an Excel workbook (.xlsx).");
      return;
    }

    if (hasExistingConfiguration) {
      setIncomingFile(file);
      setShowOverwriteConfirm(true);
      return;
    }

    void processWorkbook(file);
  };

  const handleConfirmOverwrite = () => {
    if (!incomingFile) return;
    const file = incomingFile;
    setIncomingFile(null);
    setShowOverwriteConfirm(false);
    void processWorkbook(file);
  };

  const handleCancelOverwrite = () => {
    setIncomingFile(null);
    setShowOverwriteConfirm(false);
  };

  const processWorkbook = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbookData = XLSX.read(buffer, { type: "array" });
      const sheets = workbookData.SheetNames;
      const data: Record<string, string[][]> = {};
      const meta: Record<string, SheetMetadata> = {};

      sheets.forEach((sheetName) => {
        const sheet = workbookData.Sheets[sheetName];
        if (!sheet) return;
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          blankrows: true,
          defval: "",
        }) as unknown as string[][];
        const sanitized = rows
          .slice(0, MAX_ROWS_PREVIEW)
          .map((row) =>
            row
              .slice(0, MAX_COLUMNS_PREVIEW)
              .map((value) => (value == null ? "" : String(value)))
          );
        data[sheetName] = sanitized;
        meta[sheetName] = {
          usedRange: parseSheetRange((sheet as any)["!ref"], sanitized),
          dropdowns: extractDropdowns(sheet, sanitized),
        };
      });

      setPendingWorkbook({
        filename: file.name,
        contentType: file.type || DEFAULT_WORKBOOK_MIME,
        data: arrayBufferToBase64(buffer),
        size: buffer.byteLength,
      });

      setWorkbook({ name: file.name, sheets, data, meta });
      setSelection(null);
      setPreviewMode("calculator");
      setActiveStep((prev) => (prev === 0 ? 1 : prev));

      if (sheets.length) {
        const calculatorCandidate =
          sheets.find((sheetName) => sheetName === localMapping.calculatorSheet) || sheets[0];
        let quoteCandidate = "";
        if (localMapping.quoteSheet && sheets.includes(localMapping.quoteSheet)) {
          quoteCandidate = localMapping.quoteSheet;
        } else if (sheets.includes("Quote Builder")) {
          quoteCandidate = "Quote Builder";
        }

        setSelectedCalculatorSheet(calculatorCandidate);
        setSelectedQuoteSheet(quoteCandidate);

        const calcMeta = meta[calculatorCandidate];
        setLocalMapping((prev) => {
          const next = {
            ...prev,
            calculatorSheet: calculatorCandidate,
            quoteSheet: quoteCandidate || undefined,
          };
          if (calcMeta) {
            const { startRow, endRow } = calcMeta.usedRange;
            const updatedRange = { ...next.lineItemsRange };
            if (!prev.lineItemsRange.startRow) {
              updatedRange.startRow = startRow + 1;
            }
            if (!prev.lineItemsRange.endRow) {
              updatedRange.endRow = endRow + 1;
            }
            next.lineItemsRange = updatedRange;
          }
          return next;
        });
      }
    } catch (error: any) {
      console.error("Failed to parse workbook", error);
      setWorkbook(null);
      setPendingWorkbook(null);
      setWorkbookError(
        error?.message || "Unable to read workbook. Ensure the file is a valid Excel document."
      );
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleIncomingFile(file);
    }
  };

  const buildOverridesPayload = React.useCallback(() => {
    if (!mergedServices.length) {
      const trimmedNotes = notesDraft.trim();
      if (!trimmedNotes) {
        if (
          (overrides?.services && overrides.services.length) ||
          (overrides?.metadataNotes && overrides.metadataNotes.trim())
        ) {
          return null;
        }
        return undefined;
      }
      return { metadataNotes: trimmedNotes } satisfies PricingBlueprintOverrides;
    }

    const overridesList: PricingServiceBlueprintOverride[] = [];

    mergedServices.forEach((service) => {
      const baseDraft = baseServiceDrafts.get(service.id);
      if (!baseDraft) return;
      const persistedDraft = persistedServiceDrafts.get(service.id);
      const draft = overrideDrafts[service.id]
        ? cloneServiceDraft(overrideDrafts[service.id])
        : persistedDraft
        ? cloneServiceDraft(persistedDraft)
        : cloneServiceDraft(baseDraft);
      const diff = diffServiceDraft(service.id, baseDraft, draft);
      if (diff) {
        overridesList.push(diff);
      }
    });

    const trimmedNotes = notesDraft.trim();
    const hasNotes = Boolean(trimmedNotes);
    const hadExistingNotes = Boolean(overrides?.metadataNotes && overrides.metadataNotes.trim());
    const hadExistingServices = Boolean(overrides?.services && overrides.services.length);

    if (overridesList.length || hasNotes) {
      const payload: PricingBlueprintOverrides = {};
      if (overridesList.length) {
        payload.services = overridesList;
      }
      if (hasNotes) {
        payload.metadataNotes = trimmedNotes;
      }
      return payload;
    }

    if (hadExistingServices || hadExistingNotes) {
      return null;
    }

    return undefined;
  }, [
    mergedServices,
    baseServiceDrafts,
    persistedServiceDrafts,
    overrideDrafts,
    notesDraft,
    overrides,
  ]);

  const handleFinish = async () => {
    if (isSubmitting) return;
    setSubmissionError(null);

    const sanitizedMapping: PricingWorkbookMapping = {
      ...localMapping,
      calculatorSheet: normalizeSheetName(localMapping.calculatorSheet),
      quoteSheet: localMapping.quoteSheet ? normalizeSheetName(localMapping.quoteSheet) : undefined,
      clientSizeCell: normalizeCellAddress(localMapping.clientSizeCell),
      pricePointCell: normalizeCellAddress(localMapping.pricePointCell),
      ongoingMonthlyCell: localMapping.ongoingMonthlyCell
        ? normalizeCellAddress(localMapping.ongoingMonthlyCell)
        : undefined,
      totals: {
        ...localMapping.totals,
        monthlySubtotal: normalizeCellAddress(localMapping.totals.monthlySubtotal),
        oneTimeSubtotal: normalizeCellAddress(localMapping.totals.oneTimeSubtotal),
        maintenanceSubtotal: normalizeCellAddress(localMapping.totals.maintenanceSubtotal),
        grandTotal: normalizeCellAddress(localMapping.totals.grandTotal),
        ongoingMonthly: localMapping.totals.ongoingMonthly
          ? normalizeCellAddress(localMapping.totals.ongoingMonthly)
          : undefined,
      },
      columns: {
        ...localMapping.columns,
        select: localMapping.columns.select
          ? normalizeCellAddress(localMapping.columns.select)
          : localMapping.columns.select,
        quantity: localMapping.columns.quantity
          ? normalizeCellAddress(localMapping.columns.quantity)
          : localMapping.columns.quantity,
        maintenanceToggle: localMapping.columns.maintenanceToggle
          ? normalizeCellAddress(localMapping.columns.maintenanceToggle)
          : localMapping.columns.maintenanceToggle,
        description: localMapping.columns.description
          ? normalizeCellAddress(localMapping.columns.description)
          : undefined,
        maintenanceTotal: localMapping.columns.maintenanceTotal
          ? normalizeCellAddress(localMapping.columns.maintenanceTotal)
          : undefined,
        tier: normalizeCellAddress(localMapping.columns.tier),
        service: normalizeCellAddress(localMapping.columns.service),
        billing: normalizeCellAddress(localMapping.columns.billing),
        type: normalizeCellAddress(localMapping.columns.type),
        unitPrice: normalizeCellAddress(localMapping.columns.unitPrice),
        lineTotal: normalizeCellAddress(localMapping.columns.lineTotal),
        rateColumns: {
          soloStartup: {
            low: normalizeCellAddress(localMapping.columns.rateColumns.soloStartup.low),
            high: normalizeCellAddress(localMapping.columns.rateColumns.soloStartup.high),
            maintenance: localMapping.columns.rateColumns.soloStartup.maintenance
              ? normalizeCellAddress(localMapping.columns.rateColumns.soloStartup.maintenance)
              : undefined,
          },
          smallBusiness: {
            low: normalizeCellAddress(localMapping.columns.rateColumns.smallBusiness.low),
            high: normalizeCellAddress(localMapping.columns.rateColumns.smallBusiness.high),
            maintenance: localMapping.columns.rateColumns.smallBusiness.maintenance
              ? normalizeCellAddress(localMapping.columns.rateColumns.smallBusiness.maintenance)
              : undefined,
          },
          midMarket: {
            low: normalizeCellAddress(localMapping.columns.rateColumns.midMarket.low),
            high: normalizeCellAddress(localMapping.columns.rateColumns.midMarket.high),
            maintenance: localMapping.columns.rateColumns.midMarket.maintenance
              ? normalizeCellAddress(localMapping.columns.rateColumns.midMarket.maintenance)
              : undefined,
          },
        },
      },
      quoteFields: cloneQuoteFields(localMapping.quoteFields),
    };

    try {
      setIsSubmitting(true);
      const overridesPayload = buildOverridesPayload();
      await onSubmit(sanitizedMapping, pendingWorkbook, overridesPayload);
      setPendingWorkbook(null);
    } catch (error: any) {
      console.error("Failed to save workbook mapping", error);
      const message =
        error?.data?.error || error?.message || "Failed to save workbook mapping.";
      setSubmissionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreviewPane = (options: {
    title: string;
    subtitle?: string;
    allowModeSwitch?: boolean;
    emptyMessage: string;
  }) => {
    const allowQuotePreview = Boolean(
      selectedQuoteSheet || (localMapping.quoteSheet && quoteSheetData.length)
    );
    const modeForPreview =
      previewMode === "quote" && !allowQuotePreview ? "calculator" : previewMode;

    const sheetName =
      modeForPreview === "calculator"
        ? selectedCalculatorSheet || localMapping.calculatorSheet
        : selectedQuoteSheet || localMapping.quoteSheet || selectedCalculatorSheet || localMapping.calculatorSheet;

    const previewData =
      modeForPreview === "calculator" ? calculatorSheetData : quoteSheetData;

    const highlight =
      modeForPreview === "calculator" ? calculatorHighlight : quoteHighlight;

    const instructions =
      modeForPreview === "calculator" ? calculatorInstructions : quoteInstructions;

    const metadata =
      modeForPreview === "calculator" ? calculatorPreviewMeta : quotePreviewMeta;

    const hasData = previewData && previewData.length;

    const handleModeClick = (mode: "calculator" | "quote") => {
      if (mode === "quote" && !allowQuotePreview) return;
      setPreviewMode(mode);
    };

    return (
      <div className={styles.previewColumn}>
        <div className={styles.previewHeader}>
          <div>
            <h5>{options.title}</h5>
            {options.subtitle ? <p>{options.subtitle}</p> : null}
          </div>
          {options.allowModeSwitch ? (
            <div className={styles.previewToggle}>
              <button
                type="button"
                className={
                  modeForPreview === "calculator"
                    ? `${styles.previewToggleButton} ${styles.previewToggleActive}`
                    : styles.previewToggleButton
                }
                onClick={() => handleModeClick("calculator")}
              >
                Calculator
              </button>
              <button
                type="button"
                className={
                  modeForPreview === "quote"
                    ? `${styles.previewToggleButton} ${styles.previewToggleActive}`
                    : styles.previewToggleButton
                }
                onClick={() => handleModeClick("quote")}
                disabled={!allowQuotePreview}
              >
                Quote
              </button>
            </div>
          ) : null}
        </div>
        {hasData ? (
          <SpreadsheetPreview
            sheetName={sheetName || "Workbook"}
            data={previewData}
            onCellClick={handleCellSelection}
            onColumnClick={handleColumnSelection}
            onRowClick={handleRowSelection}
            highlight={highlight}
            activeMode={activeMode}
            instructions={instructions}
            metadata={metadata}
          />
        ) : (
          <div className={styles.previewEmpty}>{options.emptyMessage}</div>
        )}
      </div>
    );
  };

  const renderUploadStep = () => (
    <div className={styles.stepContent}>
      <div className={styles.mappingSection}>
        <div
          className={
            isDragOver ? `${styles.dropZone} ${styles.dropZoneActive}` : styles.dropZone
          }
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <h5>Upload Workbook</h5>
          <p>
            Drag & drop your latest pricing workbook (.xlsx) here or click the button below to
            browse. Uploading a new workbook overwrites the current calculator mapping and triggers
            a fresh AI analysis.
          </p>
          <label className={styles.uploadButton}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleIncomingFile(file);
                }
              }}
            />
            Upload new XLSX calculator file
          </label>
          {workbook && (
            <div className={styles.uploadMeta}>
              <div>
                <strong>File:</strong> {workbook.name}
              </div>
              <div>
                <strong>Sheets:</strong> {workbook.sheets.length}
              </div>
            </div>
          )}
          {workbookError && <div className={styles.errorText}>{workbookError}</div>}
        </div>

        {workbook?.sheets?.length ? (
          <div className={styles.sheetList}>
            <h5>Detected Sheets</h5>
            <div className={styles.sheetChips}>
              {workbook.sheets.map((sheet) => (
                <button
                  key={sheet}
                  type="button"
                  className={
                    sheet === selectedCalculatorSheet
                      ? `${styles.sheetChip} ${styles.sheetChipActive}`
                      : styles.sheetChip
                  }
                  onClick={() => handleSelectCalculatorSheet(sheet)}
                >
                  {sheet}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {renderPreviewPane({
        title: "Workbook Preview",
        subtitle:
          selectedCalculatorSheet || localMapping.calculatorSheet
            ? `Sheet: ${selectedCalculatorSheet || localMapping.calculatorSheet}`
            : undefined,
        allowModeSwitch: Boolean(selectedQuoteSheet || localMapping.quoteSheet),
        emptyMessage: "Upload a workbook to view it here.",
      })}
    </div>
  );

  const renderMapStep = () => (
    <div className={styles.stepContent}>
      <div className={styles.mappingSection}>
        <FieldSection
          title="Calculator Sheet"
          description="Select the worksheet that contains the pricing logic."
        >
          <div className={styles.sheetControls}>
            <input
              className={styles.textInput}
              value={selectedCalculatorSheet}
              onChange={(event) => handleSelectCalculatorSheet(event.target.value)}
              placeholder="Calculator"
            />
            {calculatorSheetSuggestions.length ? (
              <div className={styles.sheetChipsCompact}>
                {calculatorSheetSuggestions.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    className={
                      sheet === selectedCalculatorSheet
                        ? `${styles.sheetChip} ${styles.sheetChipActive}`
                        : styles.sheetChip
                    }
                    onClick={() => handleSelectCalculatorSheet(sheet)}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </FieldSection>

        <FieldSection
          title="Control Cells"
          description="Map the single-cell controls that drive the calculator."
        >
          <div className={styles.fieldGrid}>
            {primaryFields.map(({ key, label, optional, helper }) => (
              <MappingField
                key={key}
                label={label}
                helper={helper}
                value={localMapping[key] || ""}
                optional={optional}
                onSelect={() => handlePrimarySelection(key, label)}
                onClear={() => updatePrimaryField(key, undefined)}
                onChange={(value) => updatePrimaryField(key, value)}
              />
            ))}
          </div>
        </FieldSection>

        <FieldSection
          title="Totals & Summaries"
          description="Identify the summary cells the system reads after calculations run."
        >
          <div className={styles.fieldGrid}>
            {totalFields.map(({ key, label, optional, helper }) => (
              <MappingField
                key={key}
                label={label}
                helper={helper}
                value={localMapping.totals[key] || ""}
                optional={optional}
                onSelect={() => handleTotalSelection(key, label)}
                onClear={() => updateTotalField(key, undefined)}
                onChange={(value) => updateTotalField(key, value)}
              />
            ))}
          </div>
        </FieldSection>

        <FieldSection
          title="Pricing Table Range"
          description="Confirm the rows that contain service line items."
        >
          <div className={styles.rangeRow}>
            <MappingField
              label="Start Row"
              helper="Row number where service lines begin."
              value={localMapping.lineItemsRange.startRow?.toString() || ""}
              onSelect={() => handleLineSelect("startRow", "Pricing Table Start")}
              onClear={() => updateLineField("startRow", undefined)}
              onChange={(value) => updateLineField("startRow", Number(value) || undefined)}
              type="number"
            />
            <MappingField
              label="End Row"
              helper="Row number where service lines end."
              value={localMapping.lineItemsRange.endRow?.toString() || ""}
              onSelect={() => handleLineSelect("endRow", "Pricing Table End")}
              onClear={() => updateLineField("endRow", undefined)}
              onChange={(value) => updateLineField("endRow", Number(value) || undefined)}
              type="number"
            />
            <MappingField
              label="Max Empty Rows"
              helper="Optional allowance for blank rows inside the table."
              value={localMapping.lineItemsRange.maxEmptyRows?.toString() || ""}
              optional
              disableSelect
              onClear={() => updateLineField("maxEmptyRows", undefined)}
              onChange={(value) => updateLineField("maxEmptyRows", Number(value) || undefined)}
              type="number"
            />
          </div>
        </FieldSection>

        <FieldSection
          title="Service Columns"
          description="Match workbook columns to their roles in the pricing table."
        >
          <div className={styles.fieldGrid}>
            {columnFields.map(({ key, label, optional, helper }) => (
              <MappingField
                key={key}
                label={label}
                helper={helper}
                value={(localMapping.columns[key] as string | undefined) || ""}
                optional={optional}
                onSelect={() => handleColumnSelect(key, label)}
                onClear={() => updateColumnField(key, undefined)}
                onChange={(value) => updateColumnField(key, value)}
                suggestions={calculatorColumnSuggestions}
              />
            ))}
          </div>
        </FieldSection>

        <FieldSection
          title="Rate Columns"
          description="Map rate columns for each client segment (if applicable)."
        >
          <div className={styles.rateGrid}>
            {rateSegments.map((segment) => (
              <div key={segment} className={styles.rateGroup}>
                <div className={styles.rateHeader}>{rateColumnLabels[segment]}</div>
                {(Object.keys(localMapping.columns.rateColumns[segment]) as RateField[]).map(
                  (field) => (
                    <MappingField
                      key={field}
                      label={rateFieldLabels[field]}
                      helper={rateFieldHelpers[field]}
                      value={
                        (localMapping.columns.rateColumns[segment][field] as string | undefined) ||
                        ""
                      }
                      optional={field === "maintenance"}
                      onSelect={() => handleRateSelect(segment, field, `${rateColumnLabels[segment]} ${rateFieldLabels[field]}`)}
                      onClear={() => updateRateField(segment, field, undefined)}
                      onChange={(value) => updateRateField(segment, field, value)}
                      suggestions={calculatorColumnSuggestions}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </FieldSection>
      </div>

      {renderPreviewPane({
        title: "Workbook Preview",
        subtitle:
          selectedCalculatorSheet || localMapping.calculatorSheet
            ? `Sheet: ${selectedCalculatorSheet || localMapping.calculatorSheet}`
            : undefined,
        allowModeSwitch: Boolean(selectedQuoteSheet || localMapping.quoteSheet),
        emptyMessage: "Upload a workbook to view it here.",
      })}
    </div>
  );

  const renderServiceRules = () => {
    if (!mergedServices.length) {
      return (
        <div className={styles.rulesEmpty}>
          <h5>No service rules yet</h5>
          <p>
            Upload your workbook and run the AI analysis to unlock editable defaults for each service
            line.
          </p>
          {onRequestReanalyze ? (
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={() => void handleReanalyzeBlueprint()}
              disabled={reanalyzing}
            >
              {reanalyzing ? "Analyzing…" : "Analyze with AI"}
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className={styles.rulesContainer}>
        <div className={styles.rulesToolbar}>
          <span className={styles.rulesStat}>Detected services: {mergedServices.length}</span>
          {onRequestReanalyze ? (
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => void handleReanalyzeBlueprint()}
              disabled={reanalyzing}
            >
              {reanalyzing ? "Regenerating…" : "Regenerate with AI"}
            </button>
          ) : null}
        </div>
        <div className={styles.rulesTable}>
          <div className={`${styles.rulesRow} ${styles.rulesRowHead}`}>
            <div className={styles.rulesCellService}>Service</div>
            <div className={styles.rulesCellToggle}>Default</div>
            <div className={styles.rulesCellQuantity}>Quantity</div>
            <div className={styles.rulesCellToggle}>Maintenance</div>
            <div className={styles.rulesCellRates}>Rate Bands</div>
            <div className={styles.rulesCellActions}>Actions</div>
          </div>
          <div className={styles.rulesBody}>
            {mergedServices.map((service) => {
              const baseDraft = baseServiceDrafts.get(service.id);
              if (!baseDraft) return null;
              const persistedDraft = persistedServiceDrafts.get(service.id);
              const draft = overrideDrafts[service.id] ?? persistedDraft ?? baseDraft;

              const segmentLabels = Array.from(
                new Set([
                  ...segmentOrder,
                  ...Object.keys(baseDraft.rateBands),
                  ...Object.keys(persistedDraft?.rateBands || {}),
                  ...Object.keys(draft.rateBands),
                ])
              );

              return (
                <div key={service.id} className={styles.rulesRow}>
                  <div className={styles.rulesCellService}>
                    <label className={styles.rulesLabel}>Name</label>
                    <input
                      className={styles.textInput}
                      value={draft.name}
                      onChange={(event) => handleNameChange(service.id, event.target.value)}
                    />
                    <div className={styles.rulesInlineInputs}>
                      <div>
                        <label className={styles.rulesLabel}>Tier</label>
                        <input
                          className={styles.textInput}
                          value={draft.tier}
                          onChange={(event) => handleTierChange(service.id, event.target.value)}
                        />
                      </div>
                      <div>
                        <label className={styles.rulesLabel}>Billing</label>
                        <input
                          className={styles.textInput}
                          value={draft.billingCadence}
                          onChange={(event) => handleBillingChange(service.id, event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={styles.rulesCellToggle}>
                    <label className={styles.switchLabel}>
                      <input
                        type="checkbox"
                        checked={draft.defaultSelected}
                        onChange={(event) => handleSelectedToggle(service.id, event.target.checked)}
                      />
                      <span>Included</span>
                    </label>
                  </div>
                  <div className={styles.rulesCellQuantity}>
                    <input
                      className={styles.textInput}
                      type="number"
                      value={draft.defaultQuantity}
                      onChange={(event) => handleQuantityChange(service.id, event.target.value)}
                    />
                  </div>
                  <div className={styles.rulesCellToggle}>
                    <label className={styles.switchLabel}>
                      <input
                        type="checkbox"
                        checked={draft.defaultMaintenance}
                        onChange={(event) =>
                          handleMaintenanceToggle(service.id, event.target.checked)
                        }
                      />
                      <span>Maintenance</span>
                    </label>
                  </div>
                  <div className={styles.rulesCellRates}>
                    {segmentLabels.map((segment) => {
                      const band = draft.rateBands[segment] || {};
                      return (
                        <div key={segment} className={styles.rateRow}>
                          <span className={styles.rateSegment}>{segment}</span>
                          <div className={styles.rateInputs}>
                            <input
                              className={styles.textInput}
                              type="number"
                              placeholder="Low"
                              value={formatNumber(band.low)}
                              onChange={(event) =>
                                handleRateChange(service.id, segment, "low", event.target.value)
                              }
                            />
                            <input
                              className={styles.textInput}
                              type="number"
                              placeholder="High"
                              value={formatNumber(band.high)}
                              onChange={(event) =>
                                handleRateChange(service.id, segment, "high", event.target.value)
                              }
                            />
                            <input
                              className={styles.textInput}
                              type="number"
                              placeholder="Maint"
                              value={formatNumber(band.maintenance)}
                              onChange={(event) =>
                                handleRateChange(
                                  service.id,
                                  segment,
                                  "maintenance",
                                  event.target.value
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.rulesCellActions}>
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      onClick={() => handleUndoChanges(service.id)}
                      disabled={!overrideDrafts[service.id] && !persistedServiceDrafts.has(service.id)}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      onClick={() => handleUseBaseValues(service.id)}
                      disabled={!persistedServiceDrafts.has(service.id) && !overrideDrafts[service.id]}
                    >
                      Use Base
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.rulesNotes}>
          <label className={styles.rulesLabel}>Internal Notes</label>
          <textarea
            className={styles.textArea}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Optional internal context for this ruleset"
          />
        </div>
      </div>
    );
  };

  const renderConfigureStep = () => (
    <div className={styles.stepContent}>
      <div className={styles.configureForms}>
        <div className={styles.mappingSection}>
          <FieldSection
            title="Quote Sheet"
            description="Optional: map fields for the client-facing quote builder."
          >
            <div className={styles.sheetControls}>
              <input
                className={styles.textInput}
                value={selectedQuoteSheet}
                onChange={(event) => handleSelectQuoteSheet(event.target.value)}
                placeholder="Quote Builder"
              />
              <div className={styles.sheetChipsCompact}>
                <button
                  type="button"
                  className={!selectedQuoteSheet ? `${styles.sheetChip} ${styles.sheetChipActive}` : styles.sheetChip}
                  onClick={() => handleSelectQuoteSheet("")}
                >
                  None
                </button>
                {quoteSheetSuggestions.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    className={
                      sheet === selectedQuoteSheet
                        ? `${styles.sheetChip} ${styles.sheetChipActive}`
                        : styles.sheetChip
                    }
                    onClick={() => handleSelectQuoteSheet(sheet)}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </div>
          </FieldSection>

          {selectedQuoteSheet ? (
            <FieldSection
              title="Quote Fields"
              description="Map cells that populate the quote template."
            >
              <div className={styles.fieldGrid}>
                {quoteFields.map(({ key, label, optional, helper }) => (
                  <MappingField
                    key={key}
                    label={label}
                    helper={helper}
                    value={(localMapping.quoteFields?.[key] as string | undefined) || ""}
                    optional={optional}
                    onSelect={() => handleQuoteSelect(key, label)}
                    onClear={() => updateQuoteField(key, undefined)}
                    onChange={(value) => updateQuoteField(key, value)}
                    suggestions={quoteColumnSuggestions}
                  />
                ))}
              </div>
            </FieldSection>
          ) : (
            <div className={styles.note}>
              Quote sheet mapping is skipped when no quote worksheet is selected.
            </div>
          )}
        </div>

        <div className={styles.rulesWrapper}>{renderServiceRules()}</div>
      </div>

      {renderPreviewPane({
        title: "Live Workbook",
        subtitle:
          previewMode === "quote" && (selectedQuoteSheet || localMapping.quoteSheet)
            ? `Sheet: ${selectedQuoteSheet || localMapping.quoteSheet}`
            : `Sheet: ${selectedCalculatorSheet || localMapping.calculatorSheet || "—"}`,
        allowModeSwitch: Boolean(selectedQuoteSheet || localMapping.quoteSheet),
        emptyMessage: "Upload a workbook to configure mappings.",
      })}
    </div>
  );

  if (!isOpen) {
    return null;
  }

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.wizard}>
        <div className={styles.header}>
          <div>
            <h3>Workbook Mapping Wizard</h3>
            <p>
              Upload your pricing workbook, map key cells, and tailor service defaults before saving
              the configuration.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.stepper}>
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`${styles.step} ${index === activeStep ? styles.stepActive : ""} ${
                index < activeStep ? styles.stepComplete : ""
              }`}
            >
              <span className={styles.stepIndex}>{index + 1}</span>
              <span>{step.title}</span>
            </div>
          ))}
        </div>

        <div className={styles.body}>
          {activeStep === 0 && renderUploadStep()}
          {activeStep === 1 && renderMapStep()}
          {activeStep === 2 && renderConfigureStep()}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {submissionError ? (
              <span className={styles.footerError}>{submissionError}</span>
            ) : selection ? (
              <span>Selecting: {selection.label}</span>
            ) : null}
          </div>
          <div className={styles.footerRight}>
            <button type="button" className={styles.buttonGhost} onClick={onClose}>
              Cancel
            </button>
            {activeStep > 0 && (
              <button type="button" className={styles.buttonGhost} onClick={handleBack}>
                Back
              </button>
            )}
            {activeStep < STEPS.length - 1 ? (
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={handleNext}
                disabled={!canProceed || isSubmitting}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={handleFinish}
                disabled={!isCalculatorStepValid || !isQuoteStepValid || isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Save Mapping"}
              </button>
            )}
          </div>
        </div>

        {showOverwriteConfirm ? (
          <div className={styles.warningOverlay}>
            <div className={styles.warningCard}>
              <h4>Replace existing workbook?</h4>
              <p>
                Uploading a new workbook will overwrite the current calculator configuration and
                trigger a fresh AI analysis. Existing mappings and service rules may change based on
                the new template.
              </p>
              {incomingFile ? (
                <p className={styles.warningFilename}>New file: {incomingFile.name}</p>
              ) : null}
              <div className={styles.warningActions}>
                <button type="button" className={styles.buttonGhost} onClick={handleCancelOverwrite}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  onClick={handleConfirmOverwrite}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

const FieldSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className={styles.fieldSection}>
    <div className={styles.fieldSectionHeader}>
      <h6>{title}</h6>
      {description ? <p>{description}</p> : null}
    </div>
    <div className={styles.fieldSectionBody}>{children}</div>
  </section>
);

interface MappingFieldProps {
  label: string;
  value: string;
  optional?: boolean;
  helper?: string;
  onSelect?: () => void;
  onClear?: () => void;
  onChange: (value: string) => void;
  type?: "text" | "number";
  disableSelect?: boolean;
  suggestions?: string[];
}

const DropdownIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    viewBox="0 0 12 12"
    className={styles.dropdownIcon}
    data-open={open ? "true" : "false"}
    aria-hidden="true"
  >
    <path
      d="M6 8.25a.75.75 0 0 1-.53-.22l-3-3a.75.75 0 1 1 1.06-1.06L6 6.94l2.47-2.97a.75.75 0 0 1 1.06 1.06l-3 3A.75.75 0 0 1 6 8.25Z"
      fill="currentColor"
    />
  </svg>
);

const MappingField: React.FC<MappingFieldProps> = ({
  label,
  value,
  optional,
  helper,
  onSelect,
  onClear,
  onChange,
  type = "text",
  disableSelect,
  suggestions,
}) => {
  const enableSuggestions = type !== "number" && suggestions && suggestions.length > 0;
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!enableSuggestions) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [enableSuggestions]);

  const closeSuggestions = React.useCallback(() => {
    if (showSuggestions) {
      setShowSuggestions(false);
    }
  }, [showSuggestions]);

  const handleSelectClick = () => {
    closeSuggestions();
    onSelect?.();
  };

  const handleClearClick = () => {
    closeSuggestions();
    onClear?.();
  };

  return (
    <div className={styles.fieldCard} ref={containerRef}>
      <div className={styles.fieldLabel}>
        <span>{label}</span>
        {!optional && <span className={styles.required}>*</span>}
      </div>
      <div className={styles.fieldControls}>
        <div
          className={
            enableSuggestions
              ? `${styles.inputWrapper} ${styles.withDropdown}`
              : styles.inputWrapper
          }
        >
          <input
            className={styles.textInput}
            type={type}
            value={value}
            inputMode={type === "number" ? "numeric" : undefined}
            onFocus={() => enableSuggestions && setShowSuggestions(true)}
            onChange={(event) => {
              onChange(event.target.value);
              if (enableSuggestions) {
                setShowSuggestions(true);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeSuggestions();
                (event.target as HTMLInputElement).blur();
              }
            }}
            placeholder={optional ? "Optional" : ""}
            autoComplete="off"
          />
          {enableSuggestions ? (
            <>
              <button
                type="button"
                className={styles.dropdownButton}
                aria-label="Show suggestions"
                aria-expanded={showSuggestions}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setShowSuggestions((prev) => !prev);
                }}
              >
                <DropdownIcon open={showSuggestions} />
              </button>
              {showSuggestions ? (
                <div className={styles.suggestionPanel} role="listbox">
                  {suggestions!.map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={
                        option === value
                          ? `${styles.suggestionItem} ${styles.suggestionItemActive}`
                          : styles.suggestionItem
                      }
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onChange(option);
                        setShowSuggestions(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className={styles.fieldButtons}>
          {!disableSelect && onSelect && (
            <button type="button" className={styles.buttonGhost} onClick={handleSelectClick}>
              Select
            </button>
          )}
          {onClear && (
            <button type="button" className={styles.clearButton} onClick={handleClearClick}>
              Clear
            </button>
          )}
        </div>
      </div>
      {helper && <div className={styles.helper}>{helper}</div>}
    </div>
  );
};

function cloneMapping(mapping: PricingWorkbookMapping): PricingWorkbookMapping {
  return JSON.parse(JSON.stringify(mapping)) as PricingWorkbookMapping;
}

function cloneQuoteFields(
  fields?: PricingWorkbookQuoteFields
): PricingWorkbookQuoteFields | undefined {
  if (!fields) return undefined;
  return { ...fields };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function normalizeSheetName(sheet?: string): string {
  if (!sheet) return "";
  return sheet.trim();
}

function normalizeCellAddress(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const match = /^([A-Za-z]+)(\d+)$/.exec(trimmed);
  if (!match) {
    return trimmed.toUpperCase();
  }
  return `${match[1].toUpperCase()}${match[2]}`;
}

function parseCellAddress(value?: string | null): { row: number; column: number } | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^([A-Za-z]+)(\d+)$/.exec(trimmed);
  if (!match) return null;
  const column = columnLetterToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (column == null || Number.isNaN(row)) return null;
  return { column, row };
}

function columnLetterToIndex(letter?: string | null): number | null {
  if (!letter) return null;
  const normalized = letter.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    if (charCode < 65 || charCode > 90) return null;
    index = index * 26 + (charCode - 64);
  }
  return index - 1;
}

function columnIndexToLetter(index: number): string {
  let dividend = index + 1;
  let columnLabel = "";
  while (dividend > 0) {
    const modulo = ((dividend - 1) % 26) + 1;
    columnLabel = String.fromCharCode(64 + modulo) + columnLabel;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnLabel;
}

function parseSheetRange(ref: string | undefined, data: string[][]): UsedRange {
  const defaultRange: UsedRange = {
    startRow: 0,
    endRow: Math.max(data.length - 1, 0),
    startColumn: 0,
    endColumn: Math.max((data[0]?.length ?? 0) - 1, 0),
  };

  if (!ref) {
    return defaultRange;
  }

  const match = /^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!match) {
    return defaultRange;
  }

  const startColumn = columnLetterToIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endColumn = columnLetterToIndex(match[3]);
  const endRow = Number(match[4]) - 1;

  if (
    startColumn == null ||
    endColumn == null ||
    Number.isNaN(startRow) ||
    Number.isNaN(endRow)
  ) {
    return defaultRange;
  }

  return {
    startColumn: Math.min(startColumn, endColumn),
    endColumn: Math.max(startColumn, endColumn),
    startRow: Math.max(Math.min(startRow, endRow), 0),
    endRow: Math.max(startRow, endRow, defaultRange.endRow),
  };
}

function expandSqref(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => expandRange(part));
}

function expandRange(range: string): string[] {
  const trimmed = range.trim();
  if (!trimmed) return [];
  if (!trimmed.includes(":")) {
    const normalized = normalizeCellAddress(trimmed);
    return normalized ? [normalized] : [];
  }
  const [start, end] = trimmed.split(":");
  const startParsed = parseCellAddress(start);
  const endParsed = parseCellAddress(end);
  if (!startParsed || !endParsed) {
    const normalized = normalizeCellAddress(trimmed);
    return normalized ? [normalized] : [];
  }
  const startRow = Math.min(startParsed.row, endParsed.row);
  const endRow = Math.max(startParsed.row, endParsed.row);
  const startColumn = Math.min(startParsed.column, endParsed.column);
  const endColumn = Math.max(startParsed.column, endParsed.column);
  const addresses: string[] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      addresses.push(`${columnIndexToLetter(column)}${row + 1}`);
    }
  }
  return addresses;
}

function parseDropdownFormula(formula?: string): DropdownMeta {
  if (!formula) return { options: [] };
  const trimmed = formula.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    const inner = trimmed.slice(1, -1);
    const options = inner
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    return { options };
  }
  if (trimmed.startsWith("=")) {
    return { options: [], source: trimmed.slice(1) };
  }
  return { options: [], source: trimmed };
}

function extractDropdowns(sheet: XLSX.WorkSheet, data: string[][]): Record<string, DropdownMeta> {
  const dropdowns: Record<string, DropdownMeta> = {};
  const validations = (sheet as any)["!dataValidation"];
  if (!Array.isArray(validations)) {
    return dropdowns;
  }
  validations.forEach((validation: any) => {
    if (!validation) return;
    const type = (validation.type || validation.ValidationType || "").toLowerCase();
    if (type && type !== "list" && type !== "dropdown") return;
    const sqref = validation.sqref || validation.ranges;
    if (!sqref) return;
    const addresses = expandSqref(String(sqref));
    if (!addresses.length) return;
    const meta = parseDropdownFormula(validation.formula1 || validation.Formula1);
    addresses.forEach((address) => {
      dropdowns[address] = meta;
    });
  });
  return dropdowns;
}

function describeSelection(selection: Selection | null): SelectionDescription {
  if (!selection) {
    return { preview: "" };
  }
  switch (selection.category) {
    case "primary":
      return {
        preview: `Click a cell in the calculator preview to assign ${selection.label}.`,
      };
    case "total":
      return {
        preview: `Click a summary cell in the calculator preview for ${selection.label}.`,
      };
    case "column":
      return {
        preview: `Click a column header in the calculator preview to assign ${selection.label}.`,
      };
    case "rate":
      return {
        preview: `Click a column header for ${selection.label}.`,
      };
    case "line":
      return {
        preview: `Click a row header to set ${selection.label}.`,
      };
    case "quote":
      return {
        preview: `Switch to the quote preview and click the target cell for ${selection.label}.`,
      };
    default:
      return { preview: "" };
  }
}

function buildServiceDraft(service: PricingServiceBlueprint): ServiceDraft {
  const rateBands: Record<string, PricingRateBand> = {};
  Object.entries(service.rateBands || {}).forEach(([segment, band]) => {
    rateBands[segment] = { ...band };
  });
  return {
    serviceId: service.id,
    name: service.name,
    tier: service.tier || "",
    billingCadence: service.billingCadence || "",
    defaultSelected: service.defaultSelected ?? false,
    defaultQuantity: service.defaultQuantity ?? 1,
    defaultMaintenance: service.defaultMaintenance ?? false,
    rateBands,
  };
}

function applyOverrideToDraft(
  base: ServiceDraft,
  override: PricingServiceBlueprintOverride
): ServiceDraft {
  const draft = cloneServiceDraft(base);
  if (override.name != null) draft.name = override.name;
  if (override.tier != null) draft.tier = override.tier;
  if (override.billingCadence != null) draft.billingCadence = override.billingCadence;
  if (override.defaultSelected != null) draft.defaultSelected = override.defaultSelected;
  if (override.defaultQuantity != null) draft.defaultQuantity = override.defaultQuantity;
  if (override.defaultMaintenance != null) draft.defaultMaintenance = override.defaultMaintenance;
  if (override.rateBands) {
    const rateBands = cloneRateBands(draft.rateBands);
    Object.entries(override.rateBands).forEach(([segment, band]) => {
      rateBands[segment] = { ...(rateBands[segment] || {}), ...band };
    });
    draft.rateBands = rateBands;
  }
  return draft;
}

function cloneRateBands(rateBands: Record<string, PricingRateBand>): Record<string, PricingRateBand> {
  const next: Record<string, PricingRateBand> = {};
  Object.entries(rateBands).forEach(([segment, band]) => {
    next[segment] = { ...band };
  });
  return next;
}

function cloneServiceDraft(draft: ServiceDraft): ServiceDraft {
  return {
    serviceId: draft.serviceId,
    name: draft.name,
    tier: draft.tier,
    billingCadence: draft.billingCadence,
    defaultSelected: draft.defaultSelected,
    defaultQuantity: draft.defaultQuantity,
    defaultMaintenance: draft.defaultMaintenance,
    rateBands: cloneRateBands(draft.rateBands),
  };
}

function rateBandEquals(a?: PricingRateBand | null, b?: PricingRateBand | null): boolean {
  const lowEqual = (a?.low ?? null) === (b?.low ?? null);
  const highEqual = (a?.high ?? null) === (b?.high ?? null);
  const maintEqual = (a?.maintenance ?? null) === (b?.maintenance ?? null);
  return lowEqual && highEqual && maintEqual;
}

function diffServiceDraft(
  serviceId: string,
  base: ServiceDraft,
  draft: ServiceDraft
): PricingServiceBlueprintOverride | null {
  let changed = false;
  const override: PricingServiceBlueprintOverride = { serviceId };

  if (draft.name.trim() !== base.name.trim()) {
    override.name = draft.name.trim();
    changed = true;
  }
  if (draft.tier.trim() !== base.tier.trim()) {
    override.tier = draft.tier.trim();
    changed = true;
  }
  if (draft.billingCadence.trim() !== base.billingCadence.trim()) {
    override.billingCadence = draft.billingCadence.trim();
    changed = true;
  }
  if (draft.defaultSelected !== base.defaultSelected) {
    override.defaultSelected = draft.defaultSelected;
    changed = true;
  }
  if (draft.defaultQuantity !== base.defaultQuantity) {
    override.defaultQuantity = draft.defaultQuantity;
    changed = true;
  }
  if (draft.defaultMaintenance !== base.defaultMaintenance) {
    override.defaultMaintenance = draft.defaultMaintenance;
    changed = true;
  }

  const segments = new Set([
    ...Object.keys(base.rateBands),
    ...Object.keys(draft.rateBands),
  ]);
  const rateBands: Record<string, PricingRateBand> = {};
  segments.forEach((segment) => {
    const baseBand = base.rateBands[segment] || {};
    const draftBand = draft.rateBands[segment] || {};
    if (!rateBandEquals(baseBand, draftBand)) {
      rateBands[segment] = { ...draftBand };
      changed = true;
    }
  });
  if (Object.keys(rateBands).length) {
    override.rateBands = rateBands;
  }

  return changed ? override : null;
}

function cleanNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

export default WorkbookMappingWizard;
