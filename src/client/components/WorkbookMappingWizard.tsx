import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

import SpreadsheetPreview, { SpreadsheetHighlight } from "./SpreadsheetPreview";
import styles from "./WorkbookMappingWizard.module.css";

import type {
  PricingBlueprint,
  PricingBlueprintOverrides,
  PricingWorkbookInfo,
  PricingWorkbookMapping,
  PricingWorkbookRateColumns,
  PricingWorkbookUpdateResponse,
  PricingWorkbookUploadPayload,
} from "../types/pricing";

const DEFAULT_WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_ROWS_PREVIEW = 120;
const MAX_COLUMNS_PREVIEW = 50;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"];

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

interface WorkbookMappingWizardProps {
  isOpen: boolean;
  mapping: PricingWorkbookMapping;
  blueprint: PricingBlueprint | null;
  mergedBlueprint: PricingBlueprint | null;
  overrides: PricingBlueprintOverrides | null;
  onClose: () => void;
  onSubmit?: (
    mapping: PricingWorkbookMapping,
    workbook: PricingWorkbookUploadPayload | null | undefined,
    overrides: PricingBlueprintOverrides | null | undefined
  ) => Promise<void> | void;
  onUploadWorkbook?: (
    mapping: PricingWorkbookMapping,
    workbook: PricingWorkbookUploadPayload
  ) => Promise<PricingWorkbookUpdateResponse | void>;
  onRequestReanalyze?: () => Promise<void> | void;
}

const EMPTY_HIGHLIGHT: SpreadsheetHighlight = { columns: [], rows: [], cells: [] };

const RATE_SEGMENTS: Array<keyof PricingWorkbookRateColumns> = [
  "soloStartup",
  "smallBusiness",
  "midMarket",
];

const RATE_LABELS: Record<keyof PricingWorkbookRateColumns, string> = {
  soloStartup: "Solo / Startup",
  smallBusiness: "Small Business",
  midMarket: "Mid-Market",
};

export function createEmptyWorkbookMapping(): PricingWorkbookMapping {
  return {
    calculatorSheet: "",
    quoteSheet: "",
    clientSizeCell: "",
    pricePointCell: "",
    ongoingMonthlyCell: "",
    totals: {
      monthlySubtotal: "",
      oneTimeSubtotal: "",
      maintenanceSubtotal: "",
      grandTotal: "",
      ongoingMonthly: "",
    },
    lineItemsRange: {
      startRow: 2,
      endRow: 60,
      maxEmptyRows: 10,
    },
    columns: {
      select: "",
      quantity: "",
      description: "",
      tier: "",
      service: "",
      billing: "",
      type: "",
      unitPrice: "",
      lineTotal: "",
      rateColumns: {
        soloStartup: { low: "", high: "", maintenance: "" },
        smallBusiness: { low: "", high: "", maintenance: "" },
        midMarket: { low: "", high: "", maintenance: "" },
      },
    },
    quoteFields: {
      clientName: "",
      companyName: "",
      preparedBy: "",
      preparedForEmail: "",
      notes: "",
      clientSize: "",
      pricePoint: "",
    },
  };
}

const WorkbookMappingWizard: React.FC<WorkbookMappingWizardProps> = ({
  isOpen,
  mapping,
  blueprint,
  mergedBlueprint,
  overrides,
  onClose,
  onSubmit,
  onUploadWorkbook,
  onRequestReanalyze,
}) => {
  const baselineMapping = useMemo(() => sanitizeMapping(mapping), [mapping]);

  const [localMapping, setLocalMapping] = useState<PricingWorkbookMapping>(baselineMapping);
  const [preview, setPreview] = useState<WizardWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(
    baselineMapping.calculatorSheet || null
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [workbookError, setWorkbookError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [uploadingWorkbook, setUploadingWorkbook] = useState<boolean>(false);
  const [pendingWorkbook, setPendingWorkbook] = useState<PricingWorkbookUploadPayload | null>(null);
  const [savingMapping, setSavingMapping] = useState<boolean>(false);
  const [reanalyzing, setReanalyzing] = useState<boolean>(false);
  const [incomingFile, setIncomingFile] = useState<File | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState<boolean>(false);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisWorkbook, setAnalysisWorkbook] = useState<PricingWorkbookInfo | null>(null);

  useEffect(() => {
    setLocalMapping(baselineMapping);
    setSelectedSheet(baselineMapping.calculatorSheet || baselineMapping.quoteSheet || null);
  }, [baselineMapping]);

  const hasPreviewSheets = Boolean(preview?.sheets?.length);

  const updateAnalysis = useCallback(
    (info: PricingWorkbookInfo | null, fallbackError: string | null = null) => {
      setAnalysisWorkbook(info);
      const chosenBlueprint = info?.blueprint ?? mergedBlueprint ?? blueprint ?? null;
      const effectiveModel = info?.blueprintModel ?? null;
      const generatedAt = info?.blueprintGeneratedAt ?? null;
      const effectiveError = info?.blueprintError ?? fallbackError ?? null;

      const lines: string[] = [];

      if (effectiveModel) {
        lines.push(`Model: ${effectiveModel}`);
      }

      if (effectiveError) {
        lines.push(`Analysis warning: ${effectiveError}`);
      }

      if (chosenBlueprint) {
        lines.push(`Blueprint JSON:
${JSON.stringify(chosenBlueprint, null, 2)}`);
      } else {
        lines.push("No blueprint data available yet.");
      }

      if (overrides?.services?.length) {
        const count = overrides.services.length;
        lines.push(`Overrides applied: ${count} service${count === 1 ? "" : "s"}.`);
      }

      setAnalysisModel(effectiveModel);
      setAnalysisUpdatedAt(generatedAt ?? null);
      setAnalysisError(effectiveError);
  setAnalysisText(lines.join("\n\n"));
    },
    [blueprint, mergedBlueprint, overrides]
  );

  useEffect(() => {
    if (isOpen) {
      updateAnalysis(analysisWorkbook);
    }
  }, [analysisWorkbook, isOpen, updateAnalysis]);

  const preventDragDefaults = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    preventDragDefaults(event);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleIncomingFile(file);
    }
  };

  const handleIncomingFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isAccepted = ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
    if (!isAccepted) {
      setWorkbookError("Please select an Excel workbook (.xlsx).");
      return;
    }

    if (localMapping.calculatorSheet || localMapping.pricePointCell) {
      setIncomingFile(file);
      setShowOverwriteConfirm(true);
      return;
    }

    void processWorkbook(file);
  };

  const handleConfirmOverwrite = () => {
    if (!incomingFile) {
      setShowOverwriteConfirm(false);
      return;
    }
    const file = incomingFile;
    setIncomingFile(null);
    setShowOverwriteConfirm(false);
    void processWorkbook(file);
  };

  const handleCancelOverwrite = () => {
    setIncomingFile(null);
    setShowOverwriteConfirm(false);
  };

  const processWorkbook = useCallback(
    async (file: File) => {
      setWorkbookError(null);
      setSubmissionError(null);
      setPendingWorkbook(null);
      try {
        const buffer = await file.arrayBuffer();
        const parsedWorkbook = XLSX.read(buffer, { type: "array" });
        const sheets = parsedWorkbook.SheetNames;

        const data: Record<string, string[][]> = {};
        const meta: Record<string, SheetMetadata> = {};

        sheets.forEach((sheetName) => {
          const sheet = parsedWorkbook.Sheets[sheetName] as XLSX.WorkSheet | undefined;
          if (!sheet) return;
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            blankrows: true,
            defval: "",
          });

          const sanitizedRows = rows
            .slice(0, MAX_ROWS_PREVIEW)
            .map((row) =>
              row.slice(0, MAX_COLUMNS_PREVIEW).map((value) =>
                value == null ? "" : typeof value === "string" ? value : String(value)
              )
            );

          data[sheetName] = sanitizedRows;
          meta[sheetName] = {
            usedRange: parseSheetRange(sheet["!ref"] as string | undefined, sanitizedRows),
            dropdowns: extractDropdowns(sheet),
          };
        });

        const workbookPayload: PricingWorkbookUploadPayload = {
          filename: file.name,
          contentType: file.type || DEFAULT_WORKBOOK_MIME,
          data: arrayBufferToBase64(buffer),
          size: buffer.byteLength,
        };

        const previewWorkbook: WizardWorkbook = {
          name: file.name,
          sheets,
          data,
          meta,
        };

        setPreview(previewWorkbook);
        const calculatorCandidate = sheets[0] ?? "";
        setSelectedSheet(calculatorCandidate || null);
        setLocalMapping((previous) => ({
          ...previous,
          calculatorSheet: calculatorCandidate || previous.calculatorSheet,
        }));
        setPendingWorkbook(workbookPayload);
        if (onUploadWorkbook) {
          setStatusMessage(
            `Workbook staged: ${file.name}. Select the calculator sheet, review mappings, then run analysis.`
          );
        } else {
          setStatusMessage("Workbook parsed. Configure an upload handler to persist it.");
        }
      } catch (error: any) {
        console.error("Failed to parse workbook", error);
        setPreview(null);
        setSelectedSheet(null);
        setStatusMessage(null);
        setPendingWorkbook(null);
        setWorkbookError(
          error?.message || "Unable to read workbook. Ensure the file is a valid Excel document."
        );
      }
    },
    [onUploadWorkbook]
  );

  const handleReanalyze = async () => {
    if (!onRequestReanalyze) return;
    setSubmissionError(null);
    setStatusMessage(null);
    try {
      setReanalyzing(true);
      await onRequestReanalyze();
    } catch (error: any) {
      console.error("Failed to run AI analysis", error);
      setSubmissionError(error?.message || "Failed to run AI analysis. Try again later.");
    } finally {
      setReanalyzing(false);
    }
  };

  const analysisSheetData = useMemo(() => {
    if (!preview || !selectedSheet) return [] as string[][];
    return preview.data[selectedSheet] || [];
  }, [preview, selectedSheet]);

  const mappingChanged = useMemo(() => {
    return JSON.stringify(localMapping) !== JSON.stringify(baselineMapping);
  }, [baselineMapping, localMapping]);

  const closeWizard = () => {
    setPendingWorkbook(null);
    setIncomingFile(null);
    setShowOverwriteConfirm(false);
    setStatusMessage(null);
    setWorkbookError(null);
    setSubmissionError(null);
    onClose();
  };

  const handleSheetSelect = (sheet: string) => {
    const normalized = sheet?.trim() ?? "";
    setSelectedSheet(normalized || null);
    setLocalMapping((previous) => ({
      ...previous,
      calculatorSheet: normalized,
    }));
  };

  const handleMappingValueChange = (key: keyof PricingWorkbookMapping, value: string) => {
    setLocalMapping((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleTotalsChange = (
    key: keyof PricingWorkbookMapping["totals"],
    value: string
  ) => {
    setLocalMapping((previous) => ({
      ...previous,
      totals: {
        ...previous.totals,
        [key]: value,
      },
    }));
  };

  const handleLineRangeChange = (
    key: keyof PricingWorkbookMapping["lineItemsRange"],
    value: string
  ) => {
    const parsed = Number(value);
    setLocalMapping((previous) => ({
      ...previous,
      lineItemsRange: {
        ...previous.lineItemsRange,
        [key]: Number.isFinite(parsed) ? parsed : previous.lineItemsRange[key],
      },
    }));
  };

  const handleColumnChange = (
    key: keyof PricingWorkbookMapping["columns"],
    value: string
  ) => {
    if (key === "rateColumns") return;
    setLocalMapping((previous) => ({
      ...previous,
      columns: {
        ...previous.columns,
        [key]: value,
        rateColumns: previous.columns.rateColumns,
      },
    }));
  };

  const handleRateColumnChange = (
    segment: keyof PricingWorkbookRateColumns,
    field: keyof PricingWorkbookRateColumns[keyof PricingWorkbookRateColumns],
    value: string
  ) => {
    setLocalMapping((previous) => ({
      ...previous,
      columns: {
        ...previous.columns,
        rateColumns: {
          ...previous.columns.rateColumns,
          [segment]: {
            ...previous.columns.rateColumns[segment],
            [field]: value,
          },
        },
      },
    }));
  };

  const handleQuoteFieldChange = (
    key: keyof NonNullable<PricingWorkbookMapping["quoteFields"]>,
    value: string
  ) => {
    setLocalMapping((previous) => ({
      ...previous,
      quoteFields: {
        ...(previous.quoteFields || {}),
        [key]: value,
      },
    }));
  };

  const handleAnalyzePendingWorkbook = async () => {
    if (!onUploadWorkbook || !pendingWorkbook) {
      return;
    }

    if (!localMapping.calculatorSheet) {
      setSubmissionError("Select the calculator sheet before running analysis.");
      return;
    }

    setSubmissionError(null);
    setWorkbookError(null);
    setStatusMessage("Uploading workbook and running analysis...");
    setUploadingWorkbook(true);

    try {
      const sanitized = sanitizeMapping(localMapping);
      const response = await onUploadWorkbook(sanitized, pendingWorkbook);
      setLocalMapping(sanitized);
      setPendingWorkbook(null);

      if (response) {
        updateAnalysis(response.workbook ?? null, response.analysisError ?? null);
        if (response.mapping) {
          const normalizedMapping = sanitizeMapping(response.mapping);
          setLocalMapping(normalizedMapping);
        }
        if (response.analysisError) {
          setStatusMessage(`AI analysis reported: ${response.analysisError}`);
        } else {
          setStatusMessage("Workbook uploaded and AI analysis completed.");
        }
      } else {
        updateAnalysis(null);
        setStatusMessage("Workbook uploaded.");
      }
    } catch (error: any) {
      console.error("Failed to upload workbook", error);
      const message = error?.data?.error || error?.message || "Failed to upload workbook.";
      setWorkbookError(message);
      setStatusMessage(null);
      updateAnalysis(null, message);
    } finally {
      setUploadingWorkbook(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!onSubmit) {
      setStatusMessage("No submit handler configured.");
      return;
    }

    setSavingMapping(true);
    setSubmissionError(null);
    try {
      const normalized = sanitizeMapping(localMapping);
      await onSubmit(normalized, null, undefined);
      setLocalMapping(normalized);
      setStatusMessage("Workbook mapping saved.");
    } catch (error: any) {
      console.error("Failed to save workbook mapping", error);
      setSubmissionError(error?.data?.error || error?.message || "Failed to save workbook mapping.");
    } finally {
      setSavingMapping(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const analysisSummary = (
    <div className={styles.analysisSection}>
      <h5>AI Analysis Output</h5>
      <div className={styles.analysisMeta}>
        <span>Model: {analysisModel || "-"}</span>
        <span>
          Generated: {analysisUpdatedAt ? new Date(analysisUpdatedAt).toLocaleString() : "-"}
        </span>
      </div>
      {analysisError ? <div className={styles.errorText}>{analysisError}</div> : null}
      <pre className={styles.analysisOutput}>{analysisText || "No analysis data available."}</pre>
    </div>
  );

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.wizard}>
        <div className={styles.header}>
          <div>
            <h3>Workbook Configuration</h3>
            <p>Upload the pricing workbook, adjust mapping details, and review the latest AI analysis.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={closeWizard}>
            Close
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.stepContent}>
            <div className={styles.mappingSection}>
              <div
                className={styles.dropZone}
                onDragEnter={preventDragDefaults}
                onDragOver={preventDragDefaults}
                onDragLeave={preventDragDefaults}
                onDrop={handleDrop}
              >
                <h5>Upload Workbook</h5>
                <p>
                  Drag and drop the latest pricing workbook (.xlsx) here or select a file. Uploading a new workbook overwrites
                  the current calculator configuration and triggers a fresh AI analysis.
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
                  Upload pricing workbook
                </label>
                {preview && (
                  <div className={styles.uploadMeta}>
                    <div>
                      <strong>File:</strong> {preview.name}
                    </div>
                    <div>
                      <strong>Sheets:</strong> {preview.sheets.length}
                    </div>
                  </div>
                )}
                {uploadingWorkbook && (
                  <div className={styles.uploadStatus}>Uploading workbook and running analysis...</div>
                )}
                {statusMessage && !uploadingWorkbook && (
                  <div className={styles.uploadStatus}>{statusMessage}</div>
                )}
                {workbookError && <div className={styles.errorText}>{workbookError}</div>}
              </div>

              {hasPreviewSheets ? (
                <div className={styles.sheetList}>
                  <h5>Detected Sheets</h5>
                  <div className={styles.sheetChips}>
                    {preview!.sheets.map((sheet) => (
                      <button
                        key={sheet}
                        type="button"
                        className={
                          sheet === selectedSheet
                            ? `${styles.sheetChip} ${styles.sheetChipActive}`
                            : styles.sheetChip
                        }
                        onClick={() => handleSheetSelect(sheet)}
                      >
                        {sheet}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.previewColumn}>
                <div className={styles.previewHeader}>
                  <h5>Workbook Preview</h5>
                  {selectedSheet ? <p>Sheet: {selectedSheet}</p> : <p>Upload a workbook to preview it.</p>}
                </div>
                {selectedSheet && analysisSheetData.length ? (
                  <SpreadsheetPreview
                    sheetName={selectedSheet}
                    data={analysisSheetData}
                    highlight={EMPTY_HIGHLIGHT}
                    metadata={preview?.meta[selectedSheet] ?? undefined}
                  />
                ) : (
                  <div className={styles.previewEmpty}>Upload a workbook to view it here.</div>
                )}
              </div>

              {analysisSummary}
            </div>

            <div className={styles.configureForms}>
              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Workbook Sheets</h5>
                  <p>Select the worksheets that power the calculator and optional quote builder.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldLabel}>
                    Calculator Sheet <span className={styles.required}>*</span>
                    <select
                      className={styles.textInput}
                      value={localMapping.calculatorSheet}
                      onChange={(event) => handleSheetSelect(event.target.value)}
                    >
                      <option value="">Select or type…</option>
                      {preview?.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>
                          {sheet}
                        </option>
                      ))}
                      {preview && !preview.sheets.includes(localMapping.calculatorSheet) &&
                        localMapping.calculatorSheet && (
                          <option value={localMapping.calculatorSheet}>{localMapping.calculatorSheet}</option>
                        )}
                    </select>
                  </label>

                  <label className={styles.fieldLabel}>
                    Quote Builder Sheet
                    <select
                      className={styles.textInput}
                      value={localMapping.quoteSheet ?? ""}
                      onChange={(event) => handleMappingValueChange("quoteSheet", event.target.value)}
                    >
                      <option value="">Not configured</option>
                      {preview?.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>
                          {sheet}
                        </option>
                      ))}
                      {preview && !preview.sheets.includes(localMapping.quoteSheet ?? "") &&
                        localMapping.quoteSheet && (
                          <option value={localMapping.quoteSheet}>{localMapping.quoteSheet}</option>
                        )}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Key Cells</h5>
                  <p>Specify the cells that control client size, price point, and optional ongoing monthly totals.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldLabel}>
                    Client Size Cell <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.clientSizeCell}
                      onChange={(event) => handleMappingValueChange("clientSizeCell", event.target.value)}
                      placeholder="e.g. B5"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Price Point Cell <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.pricePointCell}
                      onChange={(event) => handleMappingValueChange("pricePointCell", event.target.value)}
                      placeholder="e.g. B6"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Ongoing Monthly Cell
                    <input
                      className={styles.textInput}
                      value={localMapping.ongoingMonthlyCell ?? ""}
                      onChange={(event) => handleMappingValueChange("ongoingMonthlyCell", event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Total Cells</h5>
                  <p>Map the subtotal and total cells used when calculating proposals.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldLabel}>
                    Monthly Subtotal <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.totals.monthlySubtotal}
                      onChange={(event) => handleTotalsChange("monthlySubtotal", event.target.value)}
                      placeholder="e.g. B32"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    One-Time Subtotal <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.totals.oneTimeSubtotal}
                      onChange={(event) => handleTotalsChange("oneTimeSubtotal", event.target.value)}
                      placeholder="e.g. B33"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Maintenance Subtotal
                    <input
                      className={styles.textInput}
                      value={localMapping.totals.maintenanceSubtotal ?? ""}
                      onChange={(event) => handleTotalsChange("maintenanceSubtotal", event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Grand Total <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.totals.grandTotal}
                      onChange={(event) => handleTotalsChange("grandTotal", event.target.value)}
                      placeholder="e.g. B35"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Ongoing Monthly Total
                    <input
                      className={styles.textInput}
                      value={localMapping.totals.ongoingMonthly ?? ""}
                      onChange={(event) => handleTotalsChange("ongoingMonthly", event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Line Item Range</h5>
                  <p>Define the rows that contain service line items and how many empty rows are tolerated.</p>
                </div>
                <div className={styles.rangeRow}>
                  <label className={styles.fieldLabel}>
                    Start Row
                    <input
                      className={styles.textInput}
                      type="number"
                      min={1}
                      value={localMapping.lineItemsRange.startRow}
                      onChange={(event) => handleLineRangeChange("startRow", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    End Row
                    <input
                      className={styles.textInput}
                      type="number"
                      min={1}
                      value={localMapping.lineItemsRange.endRow}
                      onChange={(event) => handleLineRangeChange("endRow", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Max Empty Rows
                    <input
                      className={styles.textInput}
                      type="number"
                      min={0}
                      value={localMapping.lineItemsRange.maxEmptyRows ?? 0}
                      onChange={(event) => handleLineRangeChange("maxEmptyRows", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Column Mapping</h5>
                  <p>Map the columns used for selection, tiering, pricing, and totals.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldLabel}>
                    Select Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.select}
                      onChange={(event) => handleColumnChange("select", event.target.value)}
                      placeholder="e.g. A"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Quantity Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.quantity}
                      onChange={(event) => handleColumnChange("quantity", event.target.value)}
                      placeholder="e.g. B"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Description Column
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.description ?? ""}
                      onChange={(event) => handleColumnChange("description", event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Tier Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.tier}
                      onChange={(event) => handleColumnChange("tier", event.target.value)}
                      placeholder="e.g. D"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Service Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.service}
                      onChange={(event) => handleColumnChange("service", event.target.value)}
                      placeholder="e.g. E"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Billing Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.billing}
                      onChange={(event) => handleColumnChange("billing", event.target.value)}
                      placeholder="e.g. F"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Type Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.type}
                      onChange={(event) => handleColumnChange("type", event.target.value)}
                      placeholder="e.g. G"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Unit Price Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.unitPrice}
                      onChange={(event) => handleColumnChange("unitPrice", event.target.value)}
                      placeholder="e.g. R"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Line Total Column <span className={styles.required}>*</span>
                    <input
                      className={styles.textInput}
                      value={localMapping.columns.lineTotal}
                      onChange={(event) => handleColumnChange("lineTotal", event.target.value)}
                      placeholder="e.g. S"
                    />
                  </label>
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Rate Columns</h5>
                  <p>Map the low, high, and optional maintenance columns for each pricing segment.</p>
                </div>
                <div className={styles.rateGrid}>
                  {RATE_SEGMENTS.map((segment) => {
                    const segmentColumns = localMapping.columns.rateColumns[segment];
                    return (
                      <div key={segment} className={styles.rateGroup}>
                        <div className={styles.rateHeader}>{RATE_LABELS[segment]}</div>
                        <label className={styles.fieldLabel}>
                          Low <span className={styles.required}>*</span>
                          <input
                            className={styles.textInput}
                            value={segmentColumns.low}
                            onChange={(event) =>
                              handleRateColumnChange(segment, "low", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          High <span className={styles.required}>*</span>
                          <input
                            className={styles.textInput}
                            value={segmentColumns.high}
                            onChange={(event) =>
                              handleRateColumnChange(segment, "high", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          Maintenance
                          <input
                            className={styles.textInput}
                            value={segmentColumns.maintenance ?? ""}
                            onChange={(event) =>
                              handleRateColumnChange(segment, "maintenance", event.target.value)
                            }
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.sectionHeader}>
                  <h5>Quote Fields</h5>
                  <p>Optional: link quote builder cells for client name, prepared by, and price summary.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldLabel}>
                    Client Name
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.clientName ?? ""}
                      onChange={(event) => handleQuoteFieldChange("clientName", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Company Name
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.companyName ?? ""}
                      onChange={(event) => handleQuoteFieldChange("companyName", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Prepared By
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.preparedBy ?? ""}
                      onChange={(event) => handleQuoteFieldChange("preparedBy", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Client Email
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.preparedForEmail ?? ""}
                      onChange={(event) => handleQuoteFieldChange("preparedForEmail", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Client Size Display
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.clientSize ?? ""}
                      onChange={(event) => handleQuoteFieldChange("clientSize", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Price Point Display
                    <input
                      className={styles.textInput}
                      value={localMapping.quoteFields?.pricePoint ?? ""}
                      onChange={(event) => handleQuoteFieldChange("pricePoint", event.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {submissionError ? <span className={styles.footerError}>{submissionError}</span> : null}
            {!submissionError && statusMessage ? <span>{statusMessage}</span> : null}
          </div>
          <div className={styles.footerRight}>
            {onUploadWorkbook && (pendingWorkbook || uploadingWorkbook) ? (
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={handleAnalyzePendingWorkbook}
                disabled={
                  uploadingWorkbook ||
                  !pendingWorkbook ||
                  !localMapping.calculatorSheet
                }
              >
                {uploadingWorkbook
                  ? "Analyzing..."
                  : `Analyze ${pendingWorkbook?.filename ?? "Workbook"}`}
              </button>
            ) : null}
            {onRequestReanalyze ? (
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={handleReanalyze}
                disabled={reanalyzing || uploadingWorkbook || Boolean(pendingWorkbook)}
              >
                {reanalyzing ? "Reanalyzing..." : "Run Analysis"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={handleSaveMapping}
              disabled={savingMapping || uploadingWorkbook || !mappingChanged}
            >
              {savingMapping ? "Saving…" : mappingChanged ? "Save Mapping" : "No Changes"}
            </button>
            <button type="button" className={styles.buttonGhost} onClick={closeWizard}>
              Close
            </button>
          </div>
        </div>

        {showOverwriteConfirm ? (
          <div className={styles.warningOverlay}>
            <div className={styles.warningCard}>
              <h4>Replace existing workbook?</h4>
              <p>
                Uploading a new workbook overwrites the current calculator configuration and triggers a fresh AI analysis.
                Existing mappings and service rules may change based on the new template.
              </p>
              {incomingFile ? (
                <p className={styles.warningFilename}>New file: {incomingFile.name}</p>
              ) : null}
              <div className={styles.warningActions}>
                <button type="button" className={styles.buttonGhost} onClick={handleCancelOverwrite}>
                  Cancel
                </button>
                <button type="button" className={styles.buttonPrimary} onClick={handleConfirmOverwrite}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

export default WorkbookMappingWizard;
export { WorkbookMappingWizard };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    const chunkArray = Array.from(chunk);
    binary += String.fromCharCode(...chunkArray);
  }
  return btoa(binary);
}

function sanitizeMapping(mapping: PricingWorkbookMapping): PricingWorkbookMapping {
  return {
    ...mapping,
    calculatorSheet: normalizeSheetName(mapping.calculatorSheet),
    quoteSheet: mapping.quoteSheet ? normalizeSheetName(mapping.quoteSheet) : undefined,
    clientSizeCell: normalizeCellAddress(mapping.clientSizeCell),
    pricePointCell: normalizeCellAddress(mapping.pricePointCell),
    ongoingMonthlyCell: mapping.ongoingMonthlyCell
      ? normalizeCellAddress(mapping.ongoingMonthlyCell)
      : undefined,
    totals: {
      monthlySubtotal: normalizeCellAddress(mapping.totals.monthlySubtotal),
      oneTimeSubtotal: normalizeCellAddress(mapping.totals.oneTimeSubtotal),
      maintenanceSubtotal: mapping.totals.maintenanceSubtotal
        ? normalizeCellAddress(mapping.totals.maintenanceSubtotal)
        : undefined,
      grandTotal: normalizeCellAddress(mapping.totals.grandTotal),
      ongoingMonthly: mapping.totals.ongoingMonthly
        ? normalizeCellAddress(mapping.totals.ongoingMonthly)
        : undefined,
    },
    lineItemsRange: {
      startRow: mapping.lineItemsRange.startRow,
      endRow: mapping.lineItemsRange.endRow,
      maxEmptyRows: mapping.lineItemsRange.maxEmptyRows,
    },
    columns: {
      ...mapping.columns,
      select: normalizeCellAddress(mapping.columns.select),
      quantity: normalizeCellAddress(mapping.columns.quantity),
      description: mapping.columns.description
        ? normalizeCellAddress(mapping.columns.description)
        : undefined,
      tier: normalizeCellAddress(mapping.columns.tier),
      service: normalizeCellAddress(mapping.columns.service),
      billing: normalizeCellAddress(mapping.columns.billing),
      type: normalizeCellAddress(mapping.columns.type),
      unitPrice: normalizeCellAddress(mapping.columns.unitPrice),
      lineTotal: normalizeCellAddress(mapping.columns.lineTotal),
      rateColumns: {
        soloStartup: normalizeRateColumns(mapping.columns.rateColumns.soloStartup),
        smallBusiness: normalizeRateColumns(mapping.columns.rateColumns.smallBusiness),
        midMarket: normalizeRateColumns(mapping.columns.rateColumns.midMarket),
      },
    },
    quoteFields: normalizeQuoteFields(mapping.quoteFields),
  };
}

function normalizeRateColumns(columns: PricingWorkbookRateColumns[keyof PricingWorkbookRateColumns]) {
  return {
    low: normalizeCellAddress(columns.low),
    high: normalizeCellAddress(columns.high),
    maintenance: columns.maintenance ? normalizeCellAddress(columns.maintenance) : undefined,
  };
}

function normalizeQuoteFields(
  fields: PricingWorkbookMapping["quoteFields"]
): PricingWorkbookMapping["quoteFields"] | undefined {
  if (!fields) return undefined;
  const normalized: PricingWorkbookMapping["quoteFields"] = {};

  (Object.keys(fields) as Array<keyof NonNullable<PricingWorkbookMapping["quoteFields"]>>).forEach(
    (key) => {
      const value = fields[key];
      if (value && value.trim()) {
        normalized[key] = normalizeCellAddress(value);
      }
    }
  );

  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeSheetName(value?: string): string {
  return value ? value.trim() : "";
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

function columnLetterToIndex(letter?: string | null): number | null {
  if (!letter) return null;
  const normalized = letter.trim().toUpperCase();
  let index = 0;
  for (let position = 0; position < normalized.length; position += 1) {
    const charCode = normalized.charCodeAt(position);
    if (charCode < 65 || charCode > 90) return null;
    index = index * 26 + (charCode - 64);
  }
  return index - 1;
}

function extractDropdowns(sheet: XLSX.WorkSheet): Record<string, DropdownMeta> {
  const dropdowns: Record<string, DropdownMeta> = {};
  const validations = (sheet as unknown as { [key: string]: unknown })["!dataValidation"];
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
