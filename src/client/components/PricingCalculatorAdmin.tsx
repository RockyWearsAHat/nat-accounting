import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./PricingCalculatorAdmin.module.css";
import WorkbookMappingWizard, { createEmptyWorkbookMapping } from "./WorkbookMappingWizard";

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
  minimumFractionDigits: 2,
});

const rateColumnLabels: Record<keyof PricingWorkbookRateColumns, string> = {
  soloStartup: "Solo / Startup",
  smallBusiness: "Small Business",
  midMarket: "Mid-Market",
};

const rateSegments = Object.keys(rateColumnLabels) as Array<
  keyof PricingWorkbookRateColumns
>;

const clientSizeRateKey: Record<ClientSize, keyof PricingWorkbookRateColumns> = {
  "Solo/Startup": "soloStartup",
  "Small Business": "smallBusiness",
  "Mid-Market": "midMarket",
};

function toNumeric(value?: number | null): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function resolveBaseUnitPrice(
  line: PricingLineMetadata,
  clientSize: ClientSize,
  pricePoint: PricePoint
): number {
  const segmentKey = clientSizeRateKey[clientSize];
  const segmentRates = line.baseRates[segmentKey];
  if (!segmentRates) return 0;

  const low = toNumeric(segmentRates.low ?? undefined);
  const high = toNumeric(segmentRates.high ?? undefined);

  switch (pricePoint) {
    case "Low":
      return low ?? high ?? 0;
    case "High":
      return high ?? low ?? 0;
    case "Midpoint":
      if (low != null && high != null) {
        return (low + high) / 2;
      }
      return low ?? high ?? 0;
    default:
      return 0;
  }
}

interface LineState {
  selected: boolean;
  quantity: number;
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
        state.quantity !== line.defaultQuantity;

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
  const [users, setUsers] = useState<Array<{ _id: string; email: string; company?: string }>>([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [userInvoices, setUserInvoices] = useState<Array<{
    _id: string;
    invoiceNumber: string;
    customName?: string;
    status: string;
    total: number;
    createdAt: string;
    billingMonth: string;
  }>>([]);
  const [billingDay, setBillingDay] = useState(15);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [mappingExpanded, setMappingExpanded] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState<any | null>(null);
  const [invoiceMode, setInvoiceMode] = useState<'replace' | 'merge'>('replace');
  const basePriceKey = form ? `${form.clientSize}|${form.pricePoint}` : "none";

  const applyWorkbookResponse = useCallback((response: PricingWorkbookUpdateResponse) => {
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

    return response;
  }, []);

  const loadBootstrap = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) {
        setLoading(true);
      }

      try {
        console.log("[PricingCalculator] Fetching bootstrap data...");
        const bootstrap = await http.get<PricingBootstrapResponse>("/api/pricing");
        console.log("[PricingCalculator] Bootstrap received:", {
          hasMetadata: !!bootstrap.metadata,
          hasDefaults: !!bootstrap.defaults,
          setupRequired: bootstrap.setupRequired,
          message: bootstrap.message
        });

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
          console.log("[PricingCalculator] Creating form state with metadata");
          setForm(createFormState(bootstrap.metadata, bootstrap.defaults));
        } else {
          console.log("[PricingCalculator] No metadata/defaults, setting form to null");
          setForm(null);
        }

        setCalculation(null);
        setEmailRecipient((bootstrap.settings?.exportedEmailRecipients || []).join(", "));
        setSetupRequired(Boolean(bootstrap.setupRequired || !bootstrap.metadata));

        console.log("[PricingCalculator] State updated, setupRequired:", Boolean(bootstrap.setupRequired || !bootstrap.metadata));

        if (bootstrap.message) {
          setStatus(bootstrap.message);
        } else if (!bootstrap.metadata) {
          setStatus("Upload a pricing workbook to enable the calculator.");
        } else {
          setStatus(null);
        }

        return bootstrap;
      } catch (error: any) {
        console.error("[PricingCalculator] Failed to load bootstrap", error);
        setStatus(error?.data?.error || "Failed to load pricing calculator.");
        return null;
      } finally {
        if (withSpinner) {
          console.log("[PricingCalculator] Setting loading to false");
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadBootstrap(true);
  }, [loadBootstrap]);

  // Load users for client selector
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await http.get<Array<{ _id: string; email: string; company?: string }>>(
          "/api/subscriptions/admin/users"
        );
        setUsers(usersData);
      } catch (error) {
        console.error("[PricingCalculator] Failed to load users:", error);
      }
    };
    void loadUsers();
  }, []);

  // Load user's invoices when client is selected
  useEffect(() => {
    if (!selectedUserId) {
      setUserInvoices([]);
      setSelectedInvoiceId("");
      return;
    }

    const loadUserInvoices = async () => {
      try {
        const invoices = await http.get<Array<{
          _id: string;
          invoiceNumber: string;
          status: string;
          total: number;
          createdAt: string;
          billingMonth: string;
        }>>(`/api/invoices/admin/invoices?userId=${selectedUserId}`);
        setUserInvoices(invoices);
      } catch (error) {
        console.error("[PricingCalculator] Failed to load user invoices:", error);
      }
    };
    void loadUserInvoices();
  }, [selectedUserId]);

  // Load user's current subscription data when client is selected
  useEffect(() => {
    if (!selectedUserId || !metadata) return;

    const loadUserData = async () => {
      try {
        const userData = await http.get<{
          subscription: { recurringServices: Array<{ serviceName: string; quantity: number; unitPrice: number }> } | null;
          latestInvoice: any;
          pendingServices: Array<{ serviceName: string; quantity: number; unitPrice: number }>;
        }>(`/api/invoices/admin/user/${selectedUserId}/current`);

        const selectedUser = users.find(u => u._id === selectedUserId);
        if (!selectedUser) return;

        // Prefill client details
        setForm(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            quoteDetails: {
              ...prev.quoteDetails,
              clientName: selectedUser.company || selectedUser.email,
              companyName: selectedUser.company || "",
              preparedForEmail: selectedUser.email,
            },
          };
        });

        // Prefill recurring services from subscription (if exists)
        const subscription = userData.subscription;
        if (subscription && subscription.recurringServices) {
          setForm(prev => {
            if (!prev) return prev;
            const updatedLines = { ...prev.lines };

            // Check all recurring services in subscription
            for (const service of subscription.recurringServices) {
              const matchingLine = metadata.lineItems.find(
                line => line.service === service.serviceName
              );
              if (matchingLine) {
                updatedLines[matchingLine.id] = {
                  ...updatedLines[matchingLine.id],
                  selected: true,
                  quantity: service.quantity,
                  overridePrice: service.unitPrice,
                  overrideDraft: String(service.unitPrice),
                };
              }
            }

            return { ...prev, lines: updatedLines };
          });
        }

        setStatus(`Loaded data for ${selectedUser.company || selectedUser.email}`);
      } catch (error) {
        console.error("[PricingCalculator] Failed to load user data:", error);
        setStatus("Failed to load client data");
      }
    };

    void loadUserData();
  }, [selectedUserId, metadata, users]);

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

  const defaultPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!metadata || !form) return map;
    for (const line of metadata.lineItems) {
      map.set(line.id, resolveBaseUnitPrice(line, form.clientSize, form.pricePoint));
    }
    return map;
  }, [metadata, basePriceKey]);

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

  const handleSaveInvoiceDraft = useCallback(
    async (status: "admin-draft" | "pending-approval" | "sent") => {
      if (!selectedUserId) {
        setStatus("Please select a client first");
        return;
      }
      if (!calculation) {
        setStatus("Please wait for calculation to complete");
        return;
      }
      if (!form) {
        setStatus("Form data is missing");
        return;
      }

      setSaving(true);
      setStatus(null);

      try {
        const selectedUser = users.find(u => u._id === selectedUserId);
        if (!selectedUser) {
          setStatus("Selected client not found");
          return;
        }

        const now = new Date();
        const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Only include selected services in the invoice
        const selectedLines = calculation.lines.filter(line => {
          const lineState = form.lines[line.id];
          return lineState && lineState.selected;
        });

        // Calculate totals based only on selected items
        const selectedSubtotal = selectedLines.reduce((sum, line) => sum + line.lineTotal, 0);

        let lineItems = selectedLines.map(line => ({
          description: line.service,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.lineTotal,
        }));

        // Check for existing invoice in the same billing month
        const existingInvoices = await http.get<Array<{
          _id: string;
          invoiceNumber: string;
          status: string;
          total: number;
          createdAt: string;
          billingMonth: string;
          lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
          subtotal?: number;
        }>>(`/api/invoices/admin/invoices?userId=${selectedUserId}&billingMonth=${billingMonth}`);

        const existingInvoice = existingInvoices.find(inv => inv.billingMonth === billingMonth && inv.status !== 'cancelled');

        let subtotal = selectedSubtotal;
        let invoiceIdToUpdate = selectedInvoiceId;

        // If there's an existing invoice for this month and we're not already editing it
        if (existingInvoice && existingInvoice._id !== selectedInvoiceId && invoiceMode === 'merge') {
          // Merge mode: combine line items
          const existingLineItems = existingInvoice.lineItems || [];
          
          // Separate one-time and recurring charges
          const existingOneTime: typeof lineItems = [];
          const existingRecurring: typeof lineItems = [];
          
          existingLineItems.forEach(item => {
            // Simple heuristic: if description contains "monthly", "quarterly", "annual", it's recurring
            const isRecurring = /\b(monthly|quarterly|annual|recurring|subscription)\b/i.test(item.description);
            if (isRecurring) {
              existingRecurring.push(item);
            } else {
              existingOneTime.push(item);
            }
          });

          const newOneTime: typeof lineItems = [];
          const newRecurring: typeof lineItems = [];
          
          lineItems.forEach(item => {
            const isRecurring = /\b(monthly|quarterly|annual|recurring|subscription)\b/i.test(item.description);
            if (isRecurring) {
              newRecurring.push(item);
            } else {
              newOneTime.push(item);
            }
          });

          // Merge: keep all one-time charges from both, use new recurring charges
          lineItems = [...existingOneTime, ...newOneTime, ...newRecurring];
          subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
          invoiceIdToUpdate = existingInvoice._id; // Update the existing invoice
          
          setStatus("Merging with existing invoice for this month...");
        } else if (existingInvoice && existingInvoice._id !== selectedInvoiceId && invoiceMode === 'replace') {
          // Replace mode: delete the old invoice and create new one
          await http.del(`/api/invoices/admin/invoices/${existingInvoice._id}`);
          invoiceIdToUpdate = ''; // Force creation of new invoice
          setStatus("Replacing existing invoice for this month...");
        }

        const invoicePayload = {
          userId: selectedUserId,
          userEmail: selectedUser.email,
          lineItems,
          subtotal,
          tax: 0,
          total: subtotal,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          billingMonth,
          notes: form.quoteDetails.notes || "",
          customName: form.quoteDetails.customInvoiceName || "",
          status,
        };

        // Update existing invoice if one is selected, otherwise create new
        if (invoiceIdToUpdate) {
          // Update existing invoice
          await http.put(`/api/invoices/admin/invoices/${invoiceIdToUpdate}`, invoicePayload);
          
          if (status === "admin-draft") {
            setStatus("Draft updated (admin only)");
          } else if (status === "pending-approval") {
            setStatus(`Invoice updated and sent for approval to ${selectedUser.company || selectedUser.email}`);
          } else if (status === "sent") {
            await http.post(`/api/invoices/admin/invoices/${invoiceIdToUpdate}/publish`);
            setStatus(`Invoice updated and published to ${selectedUser.company || selectedUser.email}`);
          }
        } else {
          // Create new invoice
          let endpoint = "/api/invoices/admin/invoices";
          if (status === "sent") {
            // For direct publish, create as admin-draft first, then publish
            const createResponse = await http.post<{ success: boolean; invoice: { _id: string } }>(
              endpoint,
              { ...invoicePayload, status: "admin-draft" }
            );
            
            await http.post(`/api/invoices/admin/invoices/${createResponse.invoice._id}/publish`);
            setSelectedInvoiceId(createResponse.invoice._id);
            
            setStatus(`Invoice published and sent to ${selectedUser.company || selectedUser.email}`);
          } else {
            const createResponse = await http.post<{ success: boolean; invoice: { _id: string } }>(
              endpoint,
              invoicePayload
            );
            setSelectedInvoiceId(createResponse.invoice._id);
            
            if (status === "admin-draft") {
              setStatus("Draft saved (admin only)");
            } else if (status === "pending-approval") {
              setStatus(`Invoice sent for approval to ${selectedUser.company || selectedUser.email}`);
            }
          }
        }

        // Refresh invoice list after saving
        const invoices = await http.get<Array<{
          _id: string;
          invoiceNumber: string;
          status: string;
          total: number;
          createdAt: string;
          billingMonth: string;
        }>>(`/api/invoices/admin/invoices?userId=${selectedUserId}`);
        setUserInvoices(invoices);
      } catch (error: any) {
        console.error("Failed to save invoice draft:", error);
        setStatus(error?.data?.error || "Failed to save invoice. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [selectedUserId, calculation, form, users]
  );

  const handleLoadInvoice = useCallback(
    async (invoiceId: string) => {
      if (!metadata || !form) return;

      setLoading(true);
      setStatus(null);

      try {
        const invoice = await http.get<{
          _id: string;
          userId: string;
          userEmail: string;
          invoiceNumber: string;
          customName?: string;
          status: string;
          lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
          subtotal: number;
          tax: number;
          total: number;
          notes?: string;
        }>(`/api/invoices/admin/invoices/${invoiceId}`);

        console.log("[PricingCalculator] Loading invoice:", invoice.invoiceNumber || invoiceId);

        // Update form with invoice data
        setForm(prev => {
          if (!prev) return prev;

          const updatedLines = { ...prev.lines };

          // First, unselect all lines
          Object.keys(updatedLines).forEach(lineId => {
            updatedLines[lineId] = {
              ...updatedLines[lineId],
              selected: false,
              quantity: 1,
              overridePrice: null,
              overrideDraft: "",
            };
          });

          // Then, select and populate lines from invoice
          invoice.lineItems.forEach(item => {
            const matchingLine = metadata.lineItems.find(
              line => line.service.trim().toLowerCase() === item.description.trim().toLowerCase()
            );
            
            if (matchingLine) {
              updatedLines[matchingLine.id] = {
                ...updatedLines[matchingLine.id],
                selected: true,
                quantity: item.quantity,
                overridePrice: item.unitPrice,
                overrideDraft: String(item.unitPrice),
              };
            }
          });

          return {
            ...prev,
            lines: updatedLines,
            quoteDetails: {
              ...prev.quoteDetails,
              notes: invoice.notes || "",
              customInvoiceName: invoice.customName || "",
            },
          };
        });

        setSelectedInvoiceId(invoiceId);
        setStatus(`Loaded invoice ${invoice.invoiceNumber || invoiceId}`);
      } catch (error: any) {
        console.error("[PricingCalculator] Failed to load invoice:", error);
        setStatus(error?.data?.error || "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    },
    [metadata, form]
  );

  const handleDeleteInvoice = useCallback(
    async (invoiceId: string) => {
      if (!confirm("Are you sure you want to delete this invoice?")) return;
      
      try {
        await http.del(`/api/invoices/admin/invoices/${invoiceId}`);
        
        // If the deleted invoice was selected, clear selection
        if (selectedInvoiceId === invoiceId) {
          setSelectedInvoiceId("");
        }
        
        // Refresh invoice list
        const invoices = await http.get<Array<{
          _id: string;
          invoiceNumber: string;
          customName?: string;
          status: string;
          total: number;
          createdAt: string;
          billingMonth: string;
        }>>(`/api/invoices/admin/invoices?userId=${selectedUserId}`);
        setUserInvoices(invoices);
        
        setStatus("Invoice deleted");
      } catch (error: any) {
        console.error("[PricingCalculator] Failed to delete invoice:", error);
        setStatus(error?.data?.error || "Failed to delete invoice");
      }
    },
    [selectedInvoiceId, selectedUserId]
  );

  const handleCopyInvoice = useCallback(
    async (invoiceId: string) => {
      try {
        const invoice = await http.get<{
          _id: string;
          userId: string;
          userEmail: string;
          invoiceNumber: string;
          customName?: string;
          status: string;
          lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
          subtotal: number;
          tax: number;
          total: number;
          notes?: string;
          billingMonth: string;
        }>(`/api/invoices/admin/invoices/${invoiceId}`);

        // Store invoice data in clipboard state
        setCopiedInvoice({
          lineItems: invoice.lineItems,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
          notes: invoice.notes || "",
          billingMonth: invoice.billingMonth,
          customName: invoice.customName,
          originalInvoiceNumber: invoice.invoiceNumber,
        });

        setStatus("Invoice copied to clipboard");
      } catch (error: any) {
        console.error("[PricingCalculator] Failed to copy invoice:", error);
        setStatus(error?.data?.error || "Failed to copy invoice");
      }
    },
    []
  );

  const handlePasteInvoice = useCallback(
    async () => {
      if (!copiedInvoice || !selectedUserId) {
        setStatus("No invoice in clipboard or no client selected");
        return;
      }

      try {
        const user = users.find(u => u._id === selectedUserId);
        if (!user) {
          setStatus("Selected user not found");
          return;
        }

        const copyPayload = {
          userId: selectedUserId,
          userEmail: user.email,
          lineItems: copiedInvoice.lineItems,
          subtotal: copiedInvoice.subtotal,
          tax: copiedInvoice.tax,
          total: copiedInvoice.total,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          billingMonth: copiedInvoice.billingMonth,
          notes: copiedInvoice.notes,
          customName: `${copiedInvoice.customName || copiedInvoice.originalInvoiceNumber} (Copy)`,
          status: "admin-draft",
        };

        const createResponse = await http.post<{ success: boolean; invoice: { _id: string } }>(
          "/api/invoices/admin/invoices",
          copyPayload
        );

        // Refresh invoice list
        const invoices = await http.get<Array<{
          _id: string;
          invoiceNumber: string;
          customName?: string;
          status: string;
          total: number;
          createdAt: string;
          billingMonth: string;
        }>>(`/api/invoices/admin/invoices?userId=${selectedUserId}`);
        setUserInvoices(invoices);

        // Load the pasted invoice
        handleLoadInvoice(createResponse.invoice._id);
        setStatus("Invoice pasted successfully");
      } catch (error: any) {
        console.error("[PricingCalculator] Failed to paste invoice:", error);
        setStatus(error?.data?.error || "Failed to paste invoice");
      }
    },
    [copiedInvoice, selectedUserId, users, handleLoadInvoice]
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

        applyWorkbookResponse(response);

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
    [applyWorkbookResponse, loadBootstrap]
  );

  const handleWorkbookUploadDuringWizard = useCallback(
    async (nextMapping: PricingWorkbookMapping, workbookPayload: PricingWorkbookUploadPayload) => {
      setStatus(null);
      try {
        // On first upload, send ONLY the workbook binary - no mapping required
        // AI will analyze entire workbook structure automatically
        // Mapping is only for manual fine-tuning after AI analysis
        const response = await http.put<PricingWorkbookUpdateResponse>(
          "/api/pricing/workbook",
          {
            workbook: workbookPayload,
            // workbookMapping: NOT SENT - AI figures it out
          }
        );

        applyWorkbookResponse(response);

        setStatus(
          response.analysisError
            ? `Workbook uploaded. AI analysis reported: ${response.analysisError}`
            : "Workbook uploaded and AI analysis completed."
        );
      } catch (error: any) {
        console.error("Failed to upload workbook during wizard", error);
        const message = error?.data?.error || "Failed to upload workbook. Please try again.";
        setStatus(message);
        throw error;
      }
    },
    [applyWorkbookResponse]
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

  const mappingSummary = useMemo(() => {
    if (!mapping) return null;

    const columnFields: Array<{ key: keyof PricingWorkbookMapping["columns"]; label: string }> = [
      { key: "service", label: "Service" },
      { key: "tier", label: "Tier" },
      { key: "billing", label: "Billing" },
      { key: "unitPrice", label: "Unit Price" },
      { key: "lineTotal", label: "Line Total" },
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
          {mapping.totals.maintenanceSubtotal ? (
            <div className={styles.mappingSummaryRow}>
              Maintenance: {mapping.totals.maintenanceSubtotal}
            </div>
          ) : null}
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

  if (loading || !metadata || !form || setupRequired) {
    const emptyMessage = loading
      ? "Loading pricing calculator..."
      : status || "Upload the pricing workbook and configure the mapping to begin.";
    content = (
      <section className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <h3>Smart Pricing Calculator</h3>
          {status && <span className={styles.statusText}>{status}</span>}
        </div>
        <div className={styles.emptyState}>
          <p>{emptyMessage}</p>
          {!loading && (
            <div className={styles.emptyStateActions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => setWizardOpen(true)}
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

        {/* Top Row: Client Size, Price Point, Client Selector */}
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
            <label htmlFor="clientSelector">Select Client</label>
            <select
              id="clientSelector"
              className={styles.selectInput}
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setSelectedInvoiceId(""); // Reset invoice selection when client changes
              }}
            >
              <option value="">-- New/Custom Quote --</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.company || user.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Invoice Cards - Full width below client selector */}
        {selectedUserId && (
          <div className={styles.invoiceListContainer}>
            <div className={styles.invoiceListScroll}>
              <div
                className={`${styles.newInvoiceCard} ${!selectedInvoiceId ? styles.selected : ''}`}
                onClick={() => setSelectedInvoiceId("")}
              >
                + New Invoice
              </div>
              {copiedInvoice && (
                <div
                  className={styles.pasteInvoiceCard}
                  onClick={handlePasteInvoice}
                  title="Click to paste copied invoice"
                >
                  📋 Paste Invoice
                </div>
              )}
              {userInvoices.map((invoice) => (
                <div
                  key={invoice._id}
                  className={`${styles.invoiceCard} ${selectedInvoiceId === invoice._id ? styles.selected : ''}`}
                  onClick={() => handleLoadInvoice(invoice._id)}
                >
                  <div className={styles.invoiceCardName}>
                    {invoice.customName || invoice.invoiceNumber || `Draft ${invoice._id.slice(-6)}`}
                  </div>
                  <div className={styles.invoiceCardMeta}>
                    <span>{invoice.status.toUpperCase().replace("-", " ")}</span>
                    <span>${invoice.total.toFixed(2)}</span>
                    <span>{new Date(invoice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className={styles.invoiceCardActions}>
                    <button
                      className={styles.invoiceActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyInvoice(invoice._id);
                      }}
                    >
                      Copy
                    </button>
                    <button
                      className={`${styles.invoiceActionBtn} ${styles.danger}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteInvoice(invoice._id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quote Details Row */}
        <div className={styles.controlsRow}>
          {selectedUserId && (
            <div className={styles.controlGroup}>
              <label htmlFor="customInvoiceName">Invoice Name (Optional)</label>
              <input
                id="customInvoiceName"
                className={styles.textInput}
                placeholder="e.g., Q4 2025 Services"
                value={form.quoteDetails.customInvoiceName || ""}
                onChange={(event) =>
                  setForm((previous) =>
                    previous
                      ? {
                          ...previous,
                          quoteDetails: {
                            ...previous.quoteDetails,
                            customInvoiceName: event.target.value,
                          },
                        }
                      : previous
                  )
                }
              />
            </div>
          )}

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
            <div 
              className={styles.mappingHeader}
              onClick={() => setMappingExpanded(!mappingExpanded)}
            >
              <div className={styles.mappingHeaderLeft}>
                <span className={`${styles.mappingToggleIcon} ${mappingExpanded ? styles.open : ''}`}>
                  ▶
                </span>
                <h4>Workbook Configuration</h4>
              </div>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={(e) => {
                  e.stopPropagation();
                  setWizardOpen(true);
                }}
              >
                Edit Mapping
              </button>
            </div>
            <div className={`${styles.mappingContent} ${mappingExpanded ? styles.open : ''}`}>
              {mappingSummary}
            </div>
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
                  <th>Default</th>
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
                        {defaultPriceMap.has(line.id)
                          ? formatCurrency(defaultPriceMap.get(line.id) ?? 0)
                          : "—"}
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
          {calculation?.totals.maintenanceSubtotal != null ? (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Maintenance</span>
              <span className={styles.summaryValue}>
                {formatCurrency(calculation.totals.maintenanceSubtotal)}
              </span>
            </div>
          ) : null}
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

        {/* Invoice Actions - Only shown when client is selected */}
        {selectedUserId && (
          <>
            {/* Invoice Mode Toggle */}
            <div className={styles.invoiceModeSection} style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.9rem" }}>
                <span style={{ fontWeight: 500 }}>If an invoice exists for this month:</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="invoiceMode"
                      value="replace"
                      checked={invoiceMode === 'replace'}
                      onChange={() => setInvoiceMode('replace')}
                    />
                    <span>Replace</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="invoiceMode"
                      value="merge"
                      checked={invoiceMode === 'merge'}
                      onChange={() => setInvoiceMode('merge')}
                    />
                    <span>Merge (keep one-time charges, update recurring)</span>
                  </label>
                </div>
              </label>
            </div>
            
            <div className={styles.actionsRow} style={{ marginTop: "1rem", borderTop: "1px solid #333", paddingTop: "1rem" }}>
              <button
                type="button"
                className={styles.buttonGhost}
                onClick={() => handleSaveInvoiceDraft("admin-draft")}
                disabled={saving || calculating || !calculation}
                title="Save progress (admin only)"
              >
                {saving ? "Saving…" : "💾 Save Progress"}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => handleSaveInvoiceDraft("pending-approval")}
                disabled={saving || calculating || !calculation}
                title="Send to client for approval"
              >
                {saving ? "Sending…" : "📤 Send for Approval"}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => handleSaveInvoiceDraft("sent")}
                disabled={saving || calculating || !calculation}
                title="Publish invoice immediately"
                style={{ backgroundColor: "#2a7f3e" }}
              >
                {saving ? "Publishing…" : "✅ Publish Invoice"}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <>
      {content}
      {wizardOpen && (
        <WorkbookMappingWizard
          isOpen={wizardOpen}
          mapping={mapping ?? createEmptyWorkbookMapping()}
          blueprint={blueprint}
          mergedBlueprint={mergedBlueprint}
          overrides={blueprintOverrides}
          onClose={() => setWizardOpen(false)}
          onSubmit={handleWorkbookWizardSubmit}
          onUploadWorkbook={handleWorkbookUploadDuringWizard}
          onRequestReanalyze={handleBlueprintReanalyze}
        />
      )}
    </>
  );
};

export default PricingCalculatorAdmin;
