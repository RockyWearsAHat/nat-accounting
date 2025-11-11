import { useEffect, useState } from "react";
import styles from "./calendar.module.css";
import { http } from "../lib/http";

interface User {
  _id: string;
  email: string;
  company?: string;
}

interface ServiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Subscription {
  _id?: string;
  userId: string;
  userEmail: string;
  recurringServices: ServiceItem[];
  billingDay: number;
  status: "active" | "paused" | "cancelled";
  lastInvoiceDate?: string;
  monthlyRecurringTotal: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PendingService {
  _id?: string;
  userId: string;
  userEmail: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  serviceDate: string;
  billingMonth: string;
  invoiced: boolean;
  invoiceId?: string;
}

interface InvoicePreview {
  billingMonth: string;
  displayMonth: string;
  lineItems: Array<ServiceItem & { type: "recurring" | "one-time" }>;
  recurringSubtotal: number;
  oneTimeSubtotal: number;
  subtotal: number;
  tax: number;
  total: number;
}

export default function SubscriptionManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for subscription
  const [billingDay, setBillingDay] = useState<number>(15);
  const [recurringServices, setRecurringServices] = useState<ServiceItem[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "paused" | "cancelled">("active");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");

  // Form state for new service
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceQuantity, setNewServiceQuantity] = useState(1);
  const [newServiceUnitPrice, setNewServiceUnitPrice] = useState(0);

  // Form state for pending service
  const [pendingServiceDescription, setPendingServiceDescription] = useState("");
  const [pendingServiceQuantity, setPendingServiceQuantity] = useState(1);
  const [pendingServiceUnitPrice, setPendingServiceUnitPrice] = useState(0);
  const [pendingServiceDate, setPendingServiceDate] = useState(new Date().toISOString().split("T")[0]);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Load subscription data when user is selected
  useEffect(() => {
    if (selectedUserId) {
      loadSubscriptionData();
    }
  }, [selectedUserId]);

  const loadUsers = async () => {
    try {
      const response = await http.get<User[]>("/api/subscriptions/admin/users");
      setUsers(response);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    }
  };

  const loadSubscriptionData = async () => {
    if (!selectedUserId) return;

    setLoading(true);
    setError(null);

    try {
      // Load subscription
      try {
        const subResponse = await http.get<Subscription>(`/api/subscriptions/admin/subscriptions/${selectedUserId}`);
        setSubscription(subResponse);
        setBillingDay(subResponse.billingDay);
        setRecurringServices(subResponse.recurringServices || []);
        setSubscriptionStatus(subResponse.status);
        setSubscriptionNotes(subResponse.notes || "");
      } catch (err: any) {
        if (err.message?.includes("404")) {
          setSubscription(null);
          setRecurringServices([]);
          setBillingDay(15);
          setSubscriptionStatus("active");
          setSubscriptionNotes("");
        } else {
          throw err;
        }
      }

      // Load pending services
      const pendingResponse = await http.get<PendingService[]>(`/api/subscriptions/admin/pending-services/${selectedUserId}`);
      setPendingServices(pendingResponse);
    } catch (err: any) {
      setError(err.message || "Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecurringService = () => {
    if (!newServiceDescription || newServiceUnitPrice <= 0) {
      setError("Please provide a service description and unit price");
      return;
    }

    const amount = newServiceQuantity * newServiceUnitPrice;
    setRecurringServices([
      ...recurringServices,
      {
        description: newServiceDescription,
        quantity: newServiceQuantity,
        unitPrice: newServiceUnitPrice,
        amount,
      },
    ]);

    // Reset form
    setNewServiceDescription("");
    setNewServiceQuantity(1);
    setNewServiceUnitPrice(0);
  };

  const handleRemoveRecurringService = (index: number) => {
    setRecurringServices(recurringServices.filter((_, i) => i !== index));
  };

  const handleSaveSubscription = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }

    const selectedUser = users.find(u => u._id === selectedUserId);
    if (!selectedUser) {
      setError("User not found");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        userId: selectedUserId,
        userEmail: selectedUser.email,
        billingDay,
        recurringServices,
        status: subscriptionStatus,
        notes: subscriptionNotes,
      };

      const response = await http.post<{ subscription: Subscription; updated: boolean }>("/api/subscriptions/admin/subscriptions", payload);

      setSubscription(response.subscription);
      setSuccessMessage(response.updated ? "Subscription updated successfully" : "Subscription created successfully");
      
      // Reload data to get fresh state
      await loadSubscriptionData();
    } catch (err: any) {
      setError(err.message || "Failed to save subscription");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPendingService = async () => {
    if (!selectedUserId || !pendingServiceDescription || pendingServiceUnitPrice <= 0) {
      setError("Please fill in all pending service fields");
      return;
    }

    const selectedUser = users.find(u => u._id === selectedUserId);
    if (!selectedUser) {
      setError("User not found");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const amount = pendingServiceQuantity * pendingServiceUnitPrice;
      const serviceDate = new Date(pendingServiceDate);
      const billingMonth = `${serviceDate.getFullYear()}-${String(serviceDate.getMonth() + 1).padStart(2, "0")}`;

      const payload = {
        userId: selectedUserId,
        userEmail: selectedUser.email,
        description: pendingServiceDescription,
        quantity: pendingServiceQuantity,
        unitPrice: pendingServiceUnitPrice,
        amount,
        serviceDate: pendingServiceDate,
        billingMonth,
      };

      await http.post<{ success: boolean; service: PendingService }>("/api/subscriptions/admin/pending-services", payload);

      setSuccessMessage("One-time service added successfully");
      
      // Reset form
      setPendingServiceDescription("");
      setPendingServiceQuantity(1);
      setPendingServiceUnitPrice(0);
      setPendingServiceDate(new Date().toISOString().split("T")[0]);

      // Reload data
      await loadSubscriptionData();
    } catch (err: any) {
      setError(err.message || "Failed to add pending service");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePendingService = async (serviceId: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await http.del<{ success: boolean; message: string }>(`/api/subscriptions/admin/pending-services/${serviceId}`);

      setSuccessMessage("Service deleted successfully");
      await loadSubscriptionData();
    } catch (err: any) {
      setError(err.message || "Failed to delete service");
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewInvoice = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const preview = await http.get<InvoicePreview>(`/api/subscriptions/admin/invoice/preview/${selectedUserId}?year=${year}&month=${month}`);
      setInvoicePreview(preview);
    } catch (err: any) {
      setError(err.message || "Failed to preview invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }

    if (!confirm("Are you sure you want to generate this invoice? This will mark all pending services as invoiced.")) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      await http.post<{ success: boolean; invoice: any }>("/api/subscriptions/admin/invoice/generate", { 
        userId: selectedUserId, 
        year, 
        month 
      });

      setSuccessMessage("Invoice generated successfully");
      setInvoicePreview(null);
      
      // Reload data
      await loadSubscriptionData();
    } catch (err: any) {
      setError(err.message || "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find(u => u._id === selectedUserId);
  const monthlyRecurringTotal = recurringServices.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Subscription Management</h2>

      {/* Error/Success Messages */}
      {error && (
        <div style={{ 
          padding: "1rem", 
          marginBottom: "1rem", 
          backgroundColor: "#ff000020", 
          border: "1px solid #ff000040", 
          borderRadius: "8px",
          color: "#ff6b6b"
        }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ 
          padding: "1rem", 
          marginBottom: "1rem", 
          backgroundColor: "#00ff0020", 
          border: "1px solid #00ff0040", 
          borderRadius: "8px",
          color: "#51cf66"
        }}>
          {successMessage}
        </div>
      )}

      {/* User Selection */}
      <div style={{ marginBottom: "2rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          Select Client
        </label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: "#1e1e24",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "1rem",
          }}
        >
          <option value="">-- Select a client --</option>
          {users.map(user => (
            <option key={user._id} value={user._id}>
              {user.email} {user.company ? `(${user.company})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Subscription Configuration */}
      {selectedUserId && (
        <>
          <div style={{ 
            marginBottom: "2rem", 
            padding: "1.5rem", 
            backgroundColor: "#1e1e24", 
            borderRadius: "8px" 
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Recurring Services (Monthly Baseline)</h3>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
                Billing Day (1-31)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={billingDay}
                onChange={(e) => setBillingDay(parseInt(e.target.value) || 1)}
                style={{
                  width: "100px",
                  padding: "0.5rem",
                  backgroundColor: "#2a2a32",
                  border: "1px solid #333",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <div style={{ fontSize: "0.875rem", color: "#999", marginTop: "0.25rem" }}>
                Invoice will be generated on this day each month (handles month-end edge cases automatically)
              </div>
            </div>

            {/* Recurring Services List */}
            {recurringServices.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      <th style={{ textAlign: "left", padding: "0.75rem" }}>Description</th>
                      <th style={{ textAlign: "center", padding: "0.75rem", width: "80px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "0.75rem", width: "120px" }}>Unit Price</th>
                      <th style={{ textAlign: "right", padding: "0.75rem", width: "120px" }}>Amount</th>
                      <th style={{ width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringServices.map((service, index) => (
                      <tr key={index} style={{ borderBottom: "1px solid #2a2a32" }}>
                        <td style={{ padding: "0.75rem" }}>{service.description}</td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>{service.quantity}</td>
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>${service.unitPrice.toFixed(2)}</td>
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>${service.amount.toFixed(2)}</td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          <button
                            onClick={() => handleRemoveRecurringService(index)}
                            style={{
                              padding: "0.25rem 0.5rem",
                              backgroundColor: "#ff000020",
                              border: "1px solid #ff000040",
                              borderRadius: "4px",
                              color: "#ff6b6b",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: "600" }}>
                      <td colSpan={3} style={{ padding: "0.75rem", textAlign: "right" }}>Monthly Recurring Total:</td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>${monthlyRecurringTotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Recurring Service Form */}
            <div style={{ 
              padding: "1rem", 
              backgroundColor: "#2a2a32", 
              borderRadius: "8px",
              marginBottom: "1rem"
            }}>
              <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Add Recurring Service</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px auto", gap: "0.5rem", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={newServiceDescription}
                    onChange={(e) => setNewServiceDescription(e.target.value)}
                    placeholder="e.g., Monthly Bookkeeping"
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newServiceQuantity}
                    onChange={(e) => setNewServiceQuantity(parseInt(e.target.value) || 1)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Unit Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newServiceUnitPrice}
                    onChange={(e) => setNewServiceUnitPrice(parseFloat(e.target.value) || 0)}
                    placeholder="500"
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <button
                  onClick={handleAddRecurringService}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    color: "#000",
                    cursor: "pointer",
                    fontWeight: "500",
                    fontSize: "0.875rem",
                  }}
                >
                  Add Service
                </button>
              </div>
            </div>

            {/* Status and Notes */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
                  Status
                </label>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => setSubscriptionStatus(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    backgroundColor: "#2a2a32",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={subscriptionNotes}
                  onChange={(e) => setSubscriptionNotes(e.target.value)}
                  placeholder="Additional notes about this subscription..."
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    backgroundColor: "#2a2a32",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveSubscription}
              disabled={loading || recurringServices.length === 0}
              style={{
                padding: "0.75rem 2rem",
                backgroundColor: recurringServices.length === 0 ? "#555" : "#ffffff",
                border: "none",
                borderRadius: "8px",
                color: "#000",
                cursor: recurringServices.length === 0 ? "not-allowed" : "pointer",
                fontWeight: "600",
                fontSize: "1rem",
              }}
            >
              {loading ? "Saving..." : subscription ? "Update Subscription" : "Create Subscription"}
            </button>

            {subscription && subscription.lastInvoiceDate && (
              <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#999" }}>
                Last Invoice: {new Date(subscription.lastInvoiceDate).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Pending One-Time Services */}
          <div style={{ 
            marginBottom: "2rem", 
            padding: "1.5rem", 
            backgroundColor: "#1e1e24", 
            borderRadius: "8px" 
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem" }}>One-Time Services</h3>

            {/* Pending Services List */}
            {pendingServices.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      <th style={{ textAlign: "left", padding: "0.75rem" }}>Description</th>
                      <th style={{ textAlign: "center", padding: "0.75rem", width: "100px" }}>Date</th>
                      <th style={{ textAlign: "center", padding: "0.75rem", width: "80px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "0.75rem", width: "120px" }}>Amount</th>
                      <th style={{ textAlign: "center", padding: "0.75rem", width: "100px" }}>Status</th>
                      <th style={{ width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingServices.map((service) => (
                      <tr key={service._id} style={{ borderBottom: "1px solid #2a2a32" }}>
                        <td style={{ padding: "0.75rem" }}>{service.description}</td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          {new Date(service.serviceDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>{service.quantity}</td>
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>${service.amount.toFixed(2)}</td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          <span style={{ 
                            padding: "0.25rem 0.5rem", 
                            backgroundColor: service.invoiced ? "#00ff0020" : "#ffaa0020",
                            border: service.invoiced ? "1px solid #00ff0040" : "1px solid #ffaa0040",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            color: service.invoiced ? "#51cf66" : "#ffa500"
                          }}>
                            {service.invoiced ? "Invoiced" : "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          {!service.invoiced && (
                            <button
                              onClick={() => handleDeletePendingService(service._id!)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#ff000020",
                                border: "1px solid #ff000040",
                                borderRadius: "4px",
                                color: "#ff6b6b",
                                cursor: "pointer",
                                fontSize: "0.875rem",
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Pending Service Form */}
            <div style={{ 
              padding: "1rem", 
              backgroundColor: "#2a2a32", 
              borderRadius: "8px" 
            }}>
              <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Add One-Time Service</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 120px auto", gap: "0.5rem", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={pendingServiceDescription}
                    onChange={(e) => setPendingServiceDescription(e.target.value)}
                    placeholder="e.g., Q4 2024 Tax Filing"
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Service Date
                  </label>
                  <input
                    type="date"
                    value={pendingServiceDate}
                    onChange={(e) => setPendingServiceDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={pendingServiceQuantity}
                    onChange={(e) => setPendingServiceQuantity(parseInt(e.target.value) || 1)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    Unit Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pendingServiceUnitPrice}
                    onChange={(e) => setPendingServiceUnitPrice(parseFloat(e.target.value) || 0)}
                    placeholder="1500"
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      backgroundColor: "#1e1e24",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </div>
                <button
                  onClick={handleAddPendingService}
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    color: "#000",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: "500",
                    fontSize: "0.875rem",
                  }}
                >
                  {loading ? "Adding..." : "Add Service"}
                </button>
              </div>
            </div>
          </div>

          {/* Invoice Actions */}
          <div style={{ 
            padding: "1.5rem", 
            backgroundColor: "#1e1e24", 
            borderRadius: "8px",
            marginBottom: "2rem"
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Invoice Actions</h3>

            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
              <button
                onClick={handlePreviewInvoice}
                disabled={loading || !subscription}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: subscription ? "#2a2a32" : "#555",
                  border: "1px solid #444",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: subscription ? "pointer" : "not-allowed",
                  fontWeight: "500",
                }}
              >
                Preview Current Month Invoice
              </button>

              <button
                onClick={handleGenerateInvoice}
                disabled={loading || !subscription}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: subscription ? "#ffffff" : "#555",
                  border: "none",
                  borderRadius: "8px",
                  color: subscription ? "#000" : "#999",
                  cursor: subscription ? "pointer" : "not-allowed",
                  fontWeight: "600",
                }}
              >
                Generate Invoice Now
              </button>
            </div>

            {!subscription && (
              <div style={{ fontSize: "0.875rem", color: "#999" }}>
                Create a subscription first to preview or generate invoices
              </div>
            )}

            {/* Invoice Preview */}
            {invoicePreview && (
              <div style={{ 
                marginTop: "1.5rem",
                padding: "1.5rem",
                backgroundColor: "#2a2a32",
                borderRadius: "8px",
                border: "1px solid #444"
              }}>
                <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>
                  Invoice Preview - {invoicePreview.displayMonth}
                </h4>

                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #444" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Description</th>
                      <th style={{ textAlign: "center", padding: "0.5rem", width: "80px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", width: "120px" }}>Unit Price</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", width: "120px" }}>Amount</th>
                      <th style={{ textAlign: "center", padding: "0.5rem", width: "100px" }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicePreview.lineItems.map((item, index) => (
                      <tr key={index} style={{ borderBottom: "1px solid #333" }}>
                        <td style={{ padding: "0.5rem" }}>{item.description}</td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>{item.quantity}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>${item.unitPrice.toFixed(2)}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>${item.amount.toFixed(2)}</td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          <span style={{
                            padding: "0.25rem 0.5rem",
                            backgroundColor: item.type === "recurring" ? "#0000ff20" : "#ffaa0020",
                            border: item.type === "recurring" ? "1px solid #0000ff40" : "1px solid #ffaa0040",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            color: item.type === "recurring" ? "#6b9cff" : "#ffa500"
                          }}>
                            {item.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ textAlign: "right", fontSize: "0.875rem" }}>
                  <div style={{ marginBottom: "0.5rem", color: "#999" }}>
                    Recurring Subtotal: ${invoicePreview.recurringSubtotal.toFixed(2)}
                  </div>
                  <div style={{ marginBottom: "0.5rem", color: "#999" }}>
                    One-Time Subtotal: ${invoicePreview.oneTimeSubtotal.toFixed(2)}
                  </div>
                  <div style={{ marginBottom: "0.5rem", fontWeight: "500" }}>
                    Subtotal: ${invoicePreview.subtotal.toFixed(2)}
                  </div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    Tax: ${invoicePreview.tax.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "600", color: "#fff" }}>
                    Total: ${invoicePreview.total.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
