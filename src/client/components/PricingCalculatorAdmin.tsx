import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./PricingCalculatorAdmin.module.css";
import WorkbookMappingWizard from "./WorkbookMappingWizard";

import { http } from "../lib/http";

import type {
  ClientSize,
  LineSelection,
  PricePoint,
  PricingBlueprint,
  PricingBlueprintOverrides,
  PricingBlueprintReanalyzeResponse,
  PricingBlueprintUpdateResponse,
  PricingBootstrapResponse,
  PricingCalculationResponse,
  PricingExportResponse,
  PricingFormPayload,
  PricingLineMetadata,
  PricingLineResult,
  PricingMetadata,
  PricingSettings,
  PricingWorkbookInfo,
  PricingWorkbookMapping,
  PricingWorkbookRateColumns,
  PricingWorkbookUploadPayload,
  PricingWorkbookUpdateResponse,
  QuoteDetails,
} from "../types/pricing";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
});

const rateColumnLabels: Record<keyof PricingWorkbookRateColumns, string> = {
  soloStartup: "Solo / Startup",
  smallBusiness: "Small Business",
  midMarket: "Mid-Market",
};

const rateSegments = Object.keys(rateColumnLabels) as Array<
  keyof PricingWorkbookRateColumns
>;

interface LineState {
  selected: boolean;
  quantity: number;
  includeMaintenance: boolean;
  overridePrice: number | null;
  overrideDraft: string;
  rateOverrides?: LineSelection["rateOverrides"];
}

interface FormState {
  clientSize: ClientSize;
  pricePoint: PricePoint;
  quoteDetails: QuoteDetails;
  lines: Record<string, LineState>;
}

type LinePatch = Partial<LineState>;

interface LineOverridePayload {
  lineId: string;
  defaultSelected: boolean;
  defaultQuantity: number;
  defaultMaintenance: boolean;
  customRates?: LineSelection["rateOverrides"];
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function buildLineState(
  meta: PricingLineMetadata,
  selection?: LineSelection | null
): LineState {
  const overridePrice = selection?.overridePrice ?? null;
  return {
    selected: selection?.selected ?? meta.defaultSelected,
    quantity: selection?.quantity ?? meta.defaultQuantity ?? 1,
    includeMaintenance: selection?.includeMaintenance ?? meta.defaultMaintenance,
    overridePrice,
    overrideDraft: overridePrice != null ? String(overridePrice) : "",
    rateOverrides: selection?.rateOverrides,
  };
}

function createFormState(
  metadata: PricingMetadata,
  defaults: PricingFormPayload
): FormState {
  const selectionMap = new Map(defaults.selections.map((entry) => [entry.lineId, entry]));
  const lines: Record<string, LineState> = {};

  for (const line of metadata.lineItems) {
    lines[line.id] = buildLineState(line, selectionMap.get(line.id));
  }

  return {
    clientSize: defaults.clientSize,
    pricePoint: defaults.pricePoint,
    quoteDetails: defaults.quoteDetails ?? {},
    lines,
  };
}

function buildSelections(form: FormState): LineSelection[] {
  return Object.entries(form.lines).map(([lineId, state]) => ({
    lineId,
    selected: state.selected,
    quantity: state.quantity,
    includeMaintenance: state.includeMaintenance,
    overridePrice: state.overridePrice,
    rateOverrides: state.rateOverrides,
  }));
}

function collectLineOverrides(
  metadata: PricingMetadata,
  form: FormState
): LineOverridePayload[] {
  return metadata.lineItems
    .map((line) => {
      const state = form.lines[line.id];
      if (!state) return null;

      const selectionChanged =
        state.selected !== line.defaultSelected ||
        state.quantity !== line.defaultQuantity ||
        state.includeMaintenance !== line.defaultMaintenance;

      const hasRateOverrides = Boolean(
        state.rateOverrides && Object.keys(state.rateOverrides).length > 0
      );

      if (!selectionChanged && !hasRateOverrides) {
        return null;
      }

      const payload: LineOverridePayload = {
        lineId: line.id,
        defaultSelected: state.selected,
        defaultQuantity: state.quantity,
        defaultMaintenance: state.includeMaintenance,
      };

      if (hasRateOverrides && state.rateOverrides) {
        payload.customRates = state.rateOverrides;
      }

      return payload;
    })
    .filter((entry): entry is LineOverridePayload => entry !== null);
}

function downloadExport(file: PricingExportResponse) {
  const bytes = atob(file.data);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }

  const blob = new Blob([buffer], { type: file.contentType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const PricingCalculatorAdmin = (): JSX.Element | null => {
  const [metadata, setMetadata] = useState<PricingMetadata | null>(null);
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [mapping, setMapping] = useState<PricingWorkbookMapping | null>(null);
  const [workbookInfo, setWorkbookInfo] = useState<PricingWorkbookInfo | null>(null);
  const [blueprint, setBlueprint] = useState<PricingBlueprint | null>(null);
  const [blueprintOverrides, setBlueprintOverrides] =
    useState<PricingBlueprintOverrides | null>(null);
  const [mergedBlueprint, setMergedBlueprint] = useState<PricingBlueprint | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [calculation, setCalculation] =
    useState<PricingCalculationResponse["result"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");

  const loadBootstrap = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) {
        setLoading(true);
      }

      try {
        const bootstrap = await http.get<PricingBootstrapResponse>("/api/pricing");

        setMetadata(bootstrap.metadata ?? null);
        setSettings(bootstrap.settings ?? null);
        setMapping(bootstrap.mapping ?? null);
        setWorkbookInfo(bootstrap.workbook ?? null);
        setBlueprint(bootstrap.workbook?.blueprint ?? null);
        setBlueprintOverrides(bootstrap.workbook?.blueprintOverrides ?? null);
        setMergedBlueprint(
          bootstrap.workbook?.blueprintMerged ?? bootstrap.workbook?.blueprint ?? null
        );

        if (bootstrap.metadata && bootstrap.defaults) {
          setForm(createFormState(bootstrap.metadata, bootstrap.defaults));
        } else {
          setForm(null);
        }

        setCalculation(null);
        setEmailRecipient((bootstrap.settings?.exportedEmailRecipients || []).join(", "));
        setSetupRequired(Boolean(bootstrap.setupRequired || !bootstrap.metadata));

        if (bootstrap.message) {
          setStatus(bootstrap.message);
        } else if (!bootstrap.metadata) {
          setStatus("Upload a pricing workbook to enable the calculator.");
        } else {
          setStatus(null);
        }

        return bootstrap;
      } catch (error: any) {
        console.error("Failed to load pricing calculator bootstrap", error);
        setStatus(error?.data?.error || "Failed to load pricing calculator.");
        return null;
      } finally {
        if (withSpinner) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadBootstrap(true);
  }, [loadBootstrap]);

  const runRecalculate = useCallback(
    async (state: FormState) => {
      if (!metadata) return;
      setCalculating(true);
      try {
        const payload: PricingFormPayload = {
          clientSize: state.clientSize,
          pricePoint: state.pricePoint,
          quoteDetails: state.quoteDetails,
          selections: buildSelections(state),
        };
        const response = await http.post<PricingCalculationResponse>(
          "/api/pricing/calculate",
          payload
        );
        setCalculation(response.result);
      } catch (error: any) {
        console.error("Failed to recalculate pricing", error);
        setStatus(error?.data?.error || "Failed to recalculate pricing.");
      } finally {
        setCalculating(false);
      }
    },
    [metadata]
  );

  useEffect(() => {
    if (!metadata || !form) return;
    void runRecalculate(form);
  }, [metadata, form, runRecalculate]);

  const handleLineChange = useCallback((lineId: string, patch: LinePatch) => {
    setForm((previous) => {
      if (!previous) return previous;
      const current = previous.lines[lineId];
      if (!current) return previous;
      return {
        ...previous,
        lines: {
          ...previous.lines,
          [lineId]: { ...current, ...patch },
        },
      };
    });
  }, []);

  const handleSelectToggle = useCallback(
    (lineId: string, value: boolean) => {
      handleLineChange(lineId, { selected: value });
    },
    [handleLineChange]
  );

  const handleQuantityChange = useCallback(
    (lineId: string, value: string) => {
      const parsed = Number(value);
      handleLineChange(lineId, {
        quantity: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      });
    },
    [handleLineChange]
  );

  const handleOverrideChange = useCallback(
    (lineId: string, value: string) => {
      const trimmed = value.trim();
      const parsed = Number(trimmed);
      handleLineChange(lineId, {
        overrideDraft: value,
        overridePrice: trimmed === "" || Number.isNaN(parsed) ? null : parsed,
      });
    },
    [handleLineChange]
  );

  const handleSaveDefaults = useCallback(async () => {
    if (!metadata || !form) return;
    setSaving(true);
    setStatus(null);
    try {
      const overrides = collectLineOverrides(metadata, form);
      const recipients = emailRecipient
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const response = await http.put<{ settings: PricingSettings | null }>(
        "/api/pricing/settings",
        {
          defaultClientSize: form.clientSize,
          defaultPricePoint: form.pricePoint,
          lineOverrides: overrides,
          exportedEmailRecipients: recipients,
          workbookMapping: mapping ?? undefined,
        }
      );
      setSettings(response.settings ?? null);
      setStatus("Defaults saved successfully.");
    } catch (error: any) {
      console.error("Failed to save pricing defaults", error);
      setStatus(error?.data?.error || "Failed to save defaults. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [emailRecipient, form, mapping, metadata]);

  const handleExport = useCallback(
    async (format: "csv" | "xlsx", sendEmail = false) => {
      if (!form) return;
      setExporting(true);
      setStatus(null);
      try {
        const manualRecipients = emailRecipient
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        const savedRecipients = settings?.exportedEmailRecipients || [];
        const recipients = sendEmail
          ? Array.from(new Set([...manualRecipients, ...savedRecipients]))
          : [];

        const payload: PricingFormPayload & {
          format: "csv" | "xlsx";
          emailTo?: string[];
        } = {
          clientSize: form.clientSize,
          pricePoint: form.pricePoint,
          quoteDetails: form.quoteDetails,
          selections: buildSelections(form),
          format,
          emailTo: recipients.length ? recipients : undefined,
        };

        const file = await http.post<PricingExportResponse>("/api/pricing/export", payload);
        downloadExport(file);
        setStatus(
          sendEmail ? "Quote exported and emailed successfully." : "Quote exported successfully."
        );
      } catch (error: any) {
        console.error("Failed to export pricing quote", error);
        setStatus(error?.data?.error || "Export failed. Please try again.");
      } finally {
        setExporting(false);
      }
    },
    [emailRecipient, form, settings]
  );

  const handleWorkbookWizardSubmit = useCallback(
    async (
      nextMapping: PricingWorkbookMapping,
      workbookPayload?: PricingWorkbookUploadPayload | null,
      overridesPayload?: PricingBlueprintOverrides | null
    ) => {
      setStatus(null);
      try {
        const payload: {
          workbookMapping: PricingWorkbookMapping;
          workbook?: PricingWorkbookUploadPayload | null;
        } = { workbookMapping: nextMapping };
        if (workbookPayload) {
          payload.workbook = workbookPayload;
        }

        const response = await http.put<PricingWorkbookUpdateResponse>(
          "/api/pricing/workbook",
          payload
        );

        setMapping(response.mapping);
        if (response.workbook) {
          setWorkbookInfo(response.workbook);
          setBlueprint(response.workbook.blueprint ?? null);
          setBlueprintOverrides(response.workbook.blueprintOverrides ?? null);
          setMergedBlueprint(
            response.workbook.blueprintMerged ?? response.workbook.blueprint ?? null
          );
        }
        if (response.settings) {
          setSettings(response.settings);
          setEmailRecipient((response.settings.exportedEmailRecipients || []).join(", "));
        }

        if (overridesPayload !== undefined) {
          const overridesResponse = await http.put<PricingBlueprintUpdateResponse>(
            "/api/pricing/blueprint",
            { overrides: overridesPayload }
          );
          setBlueprintOverrides(overridesResponse.overrides);
          setMergedBlueprint(overridesResponse.mergedBlueprint ?? null);
        }

        await loadBootstrap(true);

        const baseMessage = workbookPayload
          ? "Workbook uploaded and mapping saved."
          : "Workbook mapping saved.";

        const finalMessage = response.analysisError
          ? `${baseMessage} AI analysis reported: ${response.analysisError}`
          : baseMessage;

        setStatus(finalMessage);
        setWizardOpen(false);
      } catch (error: any) {
        console.error("Failed to save workbook mapping", error);
        setStatus(error?.data?.error || "Failed to save workbook mapping. Please try again.");
      }
    },
    [loadBootstrap]
  );

  const handleBlueprintReanalyze = useCallback(async () => {
    setStatus(null);
    try {
      const response = await http.post<PricingBlueprintReanalyzeResponse>(
        "/api/pricing/blueprint/reanalyze",
        {}
      );

      if (response.workbook) {
        setWorkbookInfo(response.workbook);
        setBlueprint(response.workbook.blueprint ?? null);
        setBlueprintOverrides(response.workbook.blueprintOverrides ?? null);
        setMergedBlueprint(
          response.workbook.blueprintMerged ?? response.workbook.blueprint ?? null
        );
      }

      if (response.error) {
        setStatus(response.error);
      } else {
        setStatus("Blueprint regenerated successfully.");
      }

      await loadBootstrap();
    } catch (error: any) {
      console.error("Failed to regenerate pricing blueprint", error);
      setStatus(error?.data?.error || "Failed to regenerate blueprint. Please try again.");
      throw error;
    }
  }, [loadBootstrap]);

  useEffect(() => {
    if (!mapping && wizardOpen) {
      setWizardOpen(false);
    }
  }, [mapping, wizardOpen]);

  const mappingSummary = useMemo(() => {
    if (!mapping) return null;

    const columnFields: Array<{ key: keyof PricingWorkbookMapping["columns"]; label: string }> = [
      { key: "service", label: "Service" },
      { key: "tier", label: "Tier" },
      { key: "billing", label: "Billing" },
      { key: "unitPrice", label: "Unit Price" },
      { key: "lineTotal", label: "Line Total" },
      { key: "maintenanceTotal", label: "Maintenance Total" },
    ];

    const quoteFields: Array<{
      key: keyof NonNullable<PricingWorkbookMapping["quoteFields"]>;
      label: string;
    }> = [
      { key: "clientName", label: "Client Name" },
      { key: "companyName", label: "Company" },
      { key: "preparedBy", label: "Prepared By" },
      { key: "preparedForEmail", label: "Client Email" },
      { key: "clientSize", label: "Client Size" },
      { key: "pricePoint", label: "Price Point" },
    ];

    const blueprintSection = workbookInfo ? (
      <div className={styles.mappingSummaryItem}>
        <div className={styles.mappingSummaryTitle}>AI Blueprint</div>
        {workbookInfo.blueprintError ? (
          <>
            <div className={styles.mappingSummaryWarning}>{workbookInfo.blueprintError}</div>
            <div className={styles.mappingSummaryMuted}>
              Last attempted {formatTimestamp(workbookInfo.blueprintGeneratedAt)} with model {" "}
              {workbookInfo.blueprintModel || "unknown"}.
            </div>
          </>
        ) : workbookInfo.blueprint ? (
          <>
            <div className={styles.mappingSummaryRow}>
              Services detected: {workbookInfo.blueprint.services.length}
            </div>
            <div className={styles.mappingSummaryRow}>
              Client segments: {workbookInfo.blueprint.clientSegments.join(", ") || "—"}
            </div>
            <div className={styles.mappingSummaryMuted}>
              Generated {formatTimestamp(workbookInfo.blueprintGeneratedAt)} with{" "}
              {workbookInfo.blueprintModel || "gpt-4.1"}.
            </div>
          </>
        ) : (
          <div className={styles.mappingSummaryMuted}>
            Blueprint generation pending. Upload a workbook or save mapping to run analysis.
          </div>
        )}
      </div>
    ) : null;

    return (
      <div className={styles.mappingSummaryGrid}>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Workbook</div>
          <div className={styles.mappingSummaryRow}>Calculator sheet: {mapping.calculatorSheet}</div>
          <div className={styles.mappingSummaryRow}>Quote sheet: {mapping.quoteSheet || "—"}</div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Primary Cells</div>
          <div className={styles.mappingSummaryRow}>Client size: {mapping.clientSizeCell}</div>
          <div className={styles.mappingSummaryRow}>Price point: {mapping.pricePointCell}</div>
          <div className={styles.mappingSummaryRow}>
            Ongoing monthly: {mapping.ongoingMonthlyCell || "—"}
          </div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Totals</div>
          <div className={styles.mappingSummaryRow}>Monthly: {mapping.totals.monthlySubtotal}</div>
          <div className={styles.mappingSummaryRow}>One-time: {mapping.totals.oneTimeSubtotal}</div>
          <div className={styles.mappingSummaryRow}>
            Maintenance: {mapping.totals.maintenanceSubtotal}
          </div>
          <div className={styles.mappingSummaryRow}>Grand total: {mapping.totals.grandTotal}</div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Line Items</div>
          <div className={styles.mappingSummaryRow}>
            Rows {mapping.lineItemsRange.startRow} – {mapping.lineItemsRange.endRow}
          </div>
          <div className={styles.mappingSummaryRow}>
            Allow {mapping.lineItemsRange.maxEmptyRows ?? 0} empty rows
          </div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Key Columns</div>
          <div className={styles.mappingChipRow}>
            {columnFields.map(({ key, label }) => (
              <span key={key} className={styles.mappingChip}>
                {label}: {(mapping.columns[key] as string | undefined) || "—"}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Rate Columns</div>
          <div className={styles.mappingChipRow}>
            {rateSegments.map((segment) => {
              const columnSet = mapping.columns.rateColumns[segment];
              const maintenance = columnSet.maintenance ? ` · Maint ${columnSet.maintenance}` : "";
              return (
                <span key={segment} className={styles.mappingChip}>
                  {rateColumnLabels[segment]} · Low {columnSet.low} · High {columnSet.high}
                  {maintenance}
                </span>
              );
            })}
          </div>
        </div>
        <div className={styles.mappingSummaryItem}>
          <div className={styles.mappingSummaryTitle}>Quote Fields</div>
          {mapping.quoteSheet ? (
            <div className={styles.mappingChipRow}>
              {quoteFields.map(({ key, label }) => (
                <span key={key} className={styles.mappingChip}>
                  {label}: {mapping.quoteFields?.[key] || "—"}
                </span>
              ))}
            </div>
          ) : (
            <div className={styles.mappingSummaryRow}>Quote builder not configured.</div>
          )}
        </div>
        {blueprintSection}
      </div>
    );
  }, [mapping, workbookInfo]);

  const calculationMap = useMemo(() => {
    if (!calculation) return new Map<string, PricingLineResult>();
    return new Map(calculation.lines.map((line) => [line.id, line]));
  }, [calculation]);

  const tiers = useMemo(() => {
    if (!metadata) return [] as Array<[string, PricingLineMetadata[]]>;
    const tierMap = new Map<string, PricingLineMetadata[]>();
    for (const line of metadata.lineItems) {
      if (!tierMap.has(line.tier)) {
        tierMap.set(line.tier, []);
      }
      tierMap.get(line.tier)!.push(line);
    }
    return Array.from(tierMap.entries());
  }, [metadata]);

  let content: JSX.Element;

  if (loading) {
    content = <div className={styles.emptyState}>Loading pricing calculator…</div>;
  } else if (!metadata || !form || setupRequired) {
    const emptyMessage =
      status ||
      "No workbook found. Upload the pricing workbook and configure the mapping to begin.";
    const wizardDisabled = !mapping;
    content = (
      <section className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <h3>Smart Pricing Calculator</h3>
          {status && <span className={styles.statusText}>{status}</span>}
        </div>
        <div className={styles.emptyState}>
          <p>{emptyMessage}</p>
          <div className={styles.emptyStateActions}>
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={() => setWizardOpen(true)}
              disabled={wizardDisabled}
            >
              Upload new XLSX calculator file
            </button>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => void loadBootstrap(true)}
            >
              Reload
            </button>
          </div>
          {wizardDisabled && (
            <p className={styles.emptyStateHint}>
              Mapping details are still loading. Try reloading or refresh once the server is ready.
            </p>
          )}
        </div>
      </section>
    );
  } else {
    content = (
      <section className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <h3>Smart Pricing Calculator</h3>
          {status && <span className={styles.statusText}>{status}</span>}
        </div>

        <div className={styles.controlsRow}>
          <div className={styles.controlGroup}>
            <label htmlFor="clientSize">Client Size</label>
            <select
              id="clientSize"
              className={styles.selectInput}
              value={form.clientSize}
              onChange={(event) =>
                setForm((previous) =>
                  previous ? { ...previous, clientSize: event.target.value as ClientSize } : previous
                )
              }
            >
              {metadata.clientSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="pricePoint">Price Point</label>
            <select
              id="pricePoint"
              className={styles.selectInput}
              value={form.pricePoint}
              onChange={(event) =>
                setForm((previous) =>
                  previous ? { ...previous, pricePoint: event.target.value as PricePoint } : previous
                )
              }
            >
              {metadata.pricePoints.map((point) => (
                <option key={point} value={point}>
                  {point}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="clientName">Client Name</label>
            <input
              id="clientName"
              className={styles.textInput}
              placeholder="Client or contact"
              value={form.quoteDetails.clientName || ""}
              onChange={(event) =>
                setForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        quoteDetails: {
                          ...previous.quoteDetails,
                          clientName: event.target.value,
                        },
                      }
                    : previous
                )
              }
            />
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="companyName">Company</label>
            <input
              id="companyName"
              className={styles.textInput}
              placeholder="Company name"
              value={form.quoteDetails.companyName || ""}
              onChange={(event) =>
                setForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        quoteDetails: {
                          ...previous.quoteDetails,
                          companyName: event.target.value,
                        },
                      }
                    : previous
                )
              }
            />
          </div>
        </div>

        <div className={styles.quoteDetailsGrid}>
          <div className={styles.controlGroup}>
            <label htmlFor="preparedBy">Prepared By</label>
            <input
              id="preparedBy"
              className={styles.textInput}
              placeholder="Prepared by"
              value={form.quoteDetails.preparedBy || ""}
              onChange={(event) =>
                setForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        quoteDetails: {
                          ...previous.quoteDetails,
                          preparedBy: event.target.value,
                        },
                      }
                    : previous
                )
              }
            />
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="clientEmail">Client Email</label>
            <input
              id="clientEmail"
              className={styles.textInput}
              placeholder="Optional"
              value={form.quoteDetails.preparedForEmail || ""}
              onChange={(event) =>
                setForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        quoteDetails: {
                          ...previous.quoteDetails,
                          preparedForEmail: event.target.value,
                        },
                      }
                    : previous
                )
              }
            />
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="emailRecipient">Send Copy To</label>
            <input
              id="emailRecipient"
              className={styles.textInput}
              placeholder="team@company.com"
              value={emailRecipient}
              onChange={(event) => setEmailRecipient(event.target.value)}
            />
          </div>
        </div>

        {mapping && (
          <div className={styles.mappingCard}>
            <div className={styles.mappingHeader}>
              <div>
                <h4>Workbook Mapping</h4>
                <p className={styles.mappingHint}>
                  Review the current configuration, then open the wizard to update sheets, cells, and
                  ranges with a live preview.
                </p>
              </div>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => setWizardOpen(true)}
              >
                Upload new XLSX calculator file
              </button>
            </div>
            {mappingSummary}
          </div>
        )}

        {tiers.map(([tierName, lines]) => (
          <div key={tierName} className={styles.tierGroup}>
            <div className={styles.tierHeader}>
              <h4>{tierName}</h4>
              <span className={styles.statusText}>
                {lines.filter((line) => form.lines[line.id]?.selected).length} services selected
              </span>
            </div>
            <table className={styles.linesTable}>
              <thead>
                <tr>
                  <th className={styles.checkboxCell}>Use</th>
                  <th className={styles.lineServiceCell}>Service</th>
                  <th>Billing</th>
                  <th>Qty</th>
                  <th>Maintenance</th>
                  <th>Override</th>
                  <th>Effective</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const state = form.lines[line.id];
                  const computed = calculationMap.get(line.id);
                  return (
                    <tr key={line.id}>
                      <td className={styles.checkboxCell}>
                        <input
                          type="checkbox"
                          checked={state.selected}
                          onChange={(event) => handleSelectToggle(line.id, event.target.checked)}
                        />
                      </td>
                      <td className={styles.lineServiceCell}>
                        <div>{line.service}</div>
                        <div className={styles.rateHint}>{line.billing}</div>
                      </td>
                      <td>{line.billing || "—"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`${styles.numberInput} ${styles.smallInput}`}
                          value={state.quantity}
                          onChange={(event) => handleQuantityChange(line.id, event.target.value)}
                        />
                      </td>
                      <td>
                        <label className={styles.maintenanceToggle}>
                          <input
                            type="checkbox"
                            checked={state.includeMaintenance}
                            onChange={(event) =>
                              handleLineChange(line.id, {
                                includeMaintenance: event.target.checked,
                              })
                            }
                          />
                          Include
                        </label>
                      </td>
                      <td>
                        <input
                          type="text"
                          className={`${styles.numberInput} ${styles.overrideInput}`}
                          placeholder="—"
                          value={state.overrideDraft}
                          onChange={(event) => handleOverrideChange(line.id, event.target.value)}
                        />
                      </td>
                      <td>{computed ? formatCurrency(computed.effectiveUnitPrice) : "—"}</td>
                      <td>{computed ? formatCurrency(computed.lineTotal) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className={styles.summaryCard}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Monthly Subtotal</span>
            <span className={styles.summaryValue}>
              {calculation ? formatCurrency(calculation.totals.monthlySubtotal) : "—"}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>One-Time Subtotal</span>
            <span className={styles.summaryValue}>
              {calculation ? formatCurrency(calculation.totals.oneTimeSubtotal) : "—"}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Maintenance</span>
            <span className={styles.summaryValue}>
              {calculation ? formatCurrency(calculation.totals.maintenanceSubtotal) : "—"}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Grand Total (Month One)</span>
            <span className={styles.summaryValue}>
              {calculation ? formatCurrency(calculation.totals.grandTotalMonthOne) : "—"}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Ongoing Monthly</span>
            <span className={styles.summaryValue}>
              {calculation ? formatCurrency(calculation.totals.ongoingMonthly) : "—"}
            </span>
          </div>
        </div>

        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={handleSaveDefaults}
            disabled={saving || calculating}
          >
            {saving ? "Saving…" : "Save Defaults"}
          </button>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => handleExport("xlsx")}
            disabled={exporting || calculating}
          >
            {exporting ? "Exporting…" : "Export XLSX"}
          </button>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => handleExport("csv")}
            disabled={exporting || calculating}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={styles.buttonGhost}
            onClick={() => handleExport("xlsx", true)}
            disabled={
              exporting ||
              calculating ||
              (!emailRecipient && !(settings?.exportedEmailRecipients?.length))
            }
          >
            Email & Export
          </button>
          {calculating && <span className={styles.statusText}>Recalculating…</span>}
        </div>
      </section>
    );
  }

  return (
    <>
      {content}
      {mapping && (
        <WorkbookMappingWizard
          isOpen={wizardOpen}
          mapping={mapping}
          blueprint={blueprint}
          mergedBlueprint={mergedBlueprint}
          overrides={blueprintOverrides}
          onClose={() => setWizardOpen(false)}
          onSubmit={handleWorkbookWizardSubmit}
          onRequestReanalyze={handleBlueprintReanalyze}
        />
      )}
    </>
  );
};

export default PricingCalculatorAdmin;
