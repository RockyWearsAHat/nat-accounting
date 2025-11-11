import React, { useEffect, useState } from "react";
import { http } from "../lib/http";
import { ClientScheduleModal } from "../components/ClientScheduleModal";
import { ServiceRequestModal } from "../components/ServiceRequestModal";
import { Folder, File, ChevronRight } from "lucide-react";
import styles from "./ClientProfile.module.css";

interface User {
  id: string;
  email: string;
  role: string;
  company?: string;
  website?: string;
}

interface Appointment {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  videoUrl?: string;
  status: "scheduled" | "completed" | "cancelled";
}

interface ServiceRequest {
  id: string;
  services: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  notes?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: "admin-draft" | "pending-approval" | "sent" | "paid" | "overdue" | "cancelled";
  dueDate: string;
  createdAt: string;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  notes?: string;
}

interface FileDocument {
  _id: string;
  filename: string;
  uploadDate: string;
  length: number;
  contentType: string;
  metadata: {
    userId: string;
    uploadedBy: string;
    description?: string;
  };
  folder?: string | null;
  folderColor?: string | null;
}

interface Folder {
  name: string;
  color: string | null;
  count: number;
}

export const ClientProfile: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<FileDocument[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null); // null = root
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#4a9eff");
  const [activeTab, setActiveTab] = useState<"appointments" | "services" | "documents" | "invoices">("appointments");
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false);
  
  // Services tab state
  const [subscription, setSubscription] = useState<any>(null);
  const [pendingServices, setPendingServices] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      // Load user info
      const meData = await http.get<{ user: User | null }>("/api/auth/me");
      if (meData.user) {
        setUser(meData.user);
      }

      // Load appointments
      const appts = await http.get<Appointment[]>("/api/client/appointments");
      setAppointments(appts);

      // Load service requests
      const requests = await http.get<ServiceRequest[]>("/api/client/requests");
      setServiceRequests(requests);

      // Load invoices
      const invs = await http.get<Invoice[]>("/api/invoices");
      setInvoices(invs);

      // Load documents
      const docs = await http.get<FileDocument[]>("/api/client/documents");
      setDocuments(docs);

      // Load folders
      if (meData.user) {
        const foldersData = await http.get<Folder[]>(`/api/client/documents/folders?userId=${meData.user.id}`);
        setFolders(foldersData);
      }

      // Load subscription data
      try {
        const sub = await http.get<any>("/api/subscriptions/subscription");
        setSubscription(sub);
      } catch (err) {
        console.log("No subscription found");
      }

      // Load pending services
      try {
        const pending = await http.get<any[]>("/api/subscriptions/pending-services");
        setPendingServices(pending);
      } catch (err) {
        console.log("No pending services found");
      }
    } catch (err) {
      console.error("Failed to load user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getUpcomingAppointments = () => {
    const now = new Date();
    return appointments
      .filter(apt => new Date(apt.start) > now && apt.status === "scheduled")
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  const getPastAppointments = () => {
    const now = new Date();
    return appointments
      .filter(apt => new Date(apt.start) <= now || apt.status !== "scheduled")
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const description = prompt("Enter a description for this file (optional):");
    let folder: string | null = null;
    let folderColor: string | null = null;

    // Ask if user wants to put file in a folder
    if (folders.length > 0) {
      const useFolder = confirm("Would you like to organize this file into a folder?");
      if (useFolder) {
        const folderChoice = prompt(
          `Enter folder name (existing: ${folders.map(f => f.name).join(", ")}) or create new:`
        );
        if (folderChoice && folderChoice.trim()) {
          folder = folderChoice.trim();
          // Use existing folder color if available
          const existingFolder = folders.find(f => f.name === folder);
          if (existingFolder && existingFolder.color) {
            folderColor = existingFolder.color;
          } else {
            folderColor = "#4a9eff"; // Default color for new folders
          }
        }
      }
    }

    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append("file", file);
      if (description) {
        formData.append("description", description);
      }
      if (folder) {
        formData.append("folder", folder);
        formData.append("folderColor", folderColor || "#4a9eff");
      }

      console.log("[ClientProfile] Uploading file:", file.name, file.size, "bytes");
      const response = await fetch("/api/client/documents/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      console.log("[ClientProfile] Upload response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("[ClientProfile] Upload failed:", errorData);
        throw new Error(errorData.error || "Upload failed");
      }

      const result = await response.json();
      console.log("[ClientProfile] Upload success:", result);
      alert("File uploaded successfully!");
      // Reload documents and folders
      await loadUserData();
    } catch (err) {
      console.error("Failed to upload file:", err);
      alert(`Failed to upload file: ${err instanceof Error ? err.message : "Please try again"}`);
    } finally {
      setUploadingFile(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleDownloadFile = async (fileId: string, filename: string) => {
    try {
      const response = await fetch(`/api/client/documents/${fileId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download file:", err);
      alert("Failed to download file. Please try again.");
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) {
      return;
    }

    try {
      await http.del(`/api/client/documents/${fileId}`);
      alert("File deleted successfully");
      // Reload documents
      const docs = await http.get<FileDocument[]>("/api/client/documents");
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to delete file:", err);
      alert("Failed to delete file. Please try again.");
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleMoveToFolder = async () => {
    if (selectedFiles.size === 0) {
      alert("Please select files to move");
      return;
    }

    if (!newFolderName.trim()) {
      alert("Please enter a folder name");
      return;
    }

    try {
      await http.post("/api/client/documents/folder/move", {
        fileIds: Array.from(selectedFiles),
        folder: newFolderName.trim(),
        folderColor: newFolderColor,
      });

      setShowFolderModal(false);
      setNewFolderName("");
      setNewFolderColor("#4a9eff");
      setSelectedFiles(new Set());
      alert("Files moved successfully!");

      // Reload documents and folders
      await loadUserData();
    } catch (err: any) {
      console.error("Move to folder error:", err);
      alert(err.message || "Failed to move files");
    }
  };

  const getFilteredDocuments = () => {
    // Show only files in current folder (or root if currentFolder is null)
    return documents.filter((doc) => doc.folder === currentFolder);
  };

  const getCurrentFolders = () => {
    // Get all unique folders in current directory (supports nested folders with '/' separator)
    const currentPath = currentFolder || "";
    const currentDepth = currentPath ? currentPath.split("/").length : 0;
    
    const foldersInCurrentDir = new Map<string, { name: string; color: string | null; count: number }>();
    
    folders.forEach((folder) => {
      const folderPath = folder.name;
      
      // Check if this folder is in current directory or a subdirectory
      if (currentPath === "") {
        // At root: show top-level folders
        const firstSegment = folderPath.includes("/") ? folderPath.split("/")[0] : folderPath;
        if (!foldersInCurrentDir.has(firstSegment)) {
          foldersInCurrentDir.set(firstSegment, {
            name: firstSegment,
            color: folder.color,
            count: 0,
          });
        }
        foldersInCurrentDir.get(firstSegment)!.count += folder.count;
      } else if (folderPath.startsWith(currentPath + "/")) {
        // Inside a folder: show immediate subfolders
        const relativePath = folderPath.substring(currentPath.length + 1);
        const nextSegment = relativePath.includes("/") ? relativePath.split("/")[0] : relativePath;
        const fullPath = currentPath + "/" + nextSegment;
        
        if (!foldersInCurrentDir.has(fullPath)) {
          foldersInCurrentDir.set(fullPath, {
            name: fullPath,
            color: folder.color,
            count: 0,
          });
        }
        foldersInCurrentDir.get(fullPath)!.count += folder.count;
      }
    });
    
    return Array.from(foldersInCurrentDir.values());
  };

  const handleFolderClick = (folderPath: string) => {
    setCurrentFolder(folderPath);
    setSelectedFiles(new Set());
  };

  const handleBackToRoot = () => {
    setCurrentFolder(null);
    setSelectedFiles(new Set());
  };

  const handleNavigateUp = () => {
    if (!currentFolder) return;
    const segments = currentFolder.split("/");
    if (segments.length === 1) {
      setCurrentFolder(null);
    } else {
      setCurrentFolder(segments.slice(0, -1).join("/"));
    }
    setSelectedFiles(new Set());
  };

  const getBreadcrumbs = () => {
    if (!currentFolder) return [];
    return currentFolder.split("/");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      alert("Please enter a folder name");
      return;
    }

    try {
      // Create folder via API
      await http.post("/api/client/documents/folder/create", {
        name: newFolderName.trim(),
        color: newFolderColor,
      });

      // Refresh folders list
      await loadUserData();

      // Close modal and reset form
      setShowCreateFolderModal(false);
      setNewFolderName("");
      setNewFolderColor("#4a9eff");

      alert(`Folder "${newFolderName.trim()}" created successfully!`);
    } catch (err: any) {
      console.error("Failed to create folder:", err);
      alert(err.error || "Failed to create folder. Please try again.");
    }
  };

  const filteredDocs = getFilteredDocuments();
  const currentFolders = getCurrentFolders();

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm("Are you sure you want to cancel this appointment?")) {
      return;
    }

    try {
      await http.del(`/api/client/appointments/${appointmentId}`);
      // Reload appointments
      const appts = await http.get<Appointment[]>("/api/client/appointments");
      setAppointments(appts);
      alert("Appointment cancelled successfully");
    } catch (err) {
      console.error("Failed to cancel appointment:", err);
      alert("Failed to cancel appointment. Please try again.");
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    // TODO: Integrate with payment processor
    try {
      await http.post(`/api/client/invoices/${invoiceId}/pay`, {
        paymentMethod: "card",
      });
      // Reload invoices
      const invs = await http.get<Invoice[]>("/api/invoices");
      setInvoices(invs);
      alert("Payment processed successfully!");
    } catch (err) {
      console.error("Failed to process payment:", err);
      alert("Failed to process payment. Please try again.");
    }
  };

  const handleApproveInvoice = async (invoiceId: string) => {
    if (!confirm("Approve this invoice? It will become a sent invoice and you'll receive a confirmation email.")) {
      return;
    }

    try {
      await http.post(`/api/invoices/${invoiceId}/approve`);
      // Reload invoices
      const invs = await http.get<Invoice[]>("/api/invoices");
      setInvoices(invs);
      alert("Invoice approved successfully! You'll receive a confirmation email.");
    } catch (err) {
      console.error("Failed to approve invoice:", err);
      alert("Failed to approve invoice. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading your profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Please log in to view your profile.</div>
      </div>
    );
  }

  const upcomingAppointments = getUpcomingAppointments();
  const pastAppointments = getPastAppointments();

  return (
    <div className={styles.container}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.userInfo}>
          <h1 className={styles.title}>Welcome, {user.company || user.email}</h1>
          <p className={styles.email}>{user.email}</p>
          {user.website && (
            <a href={user.website} target="_blank" rel="noopener noreferrer" className={styles.website}>
              {user.website}
            </a>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "appointments" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("appointments")}
        >
          Appointments
          {upcomingAppointments.length > 0 && (
            <span className={styles.badge}>{upcomingAppointments.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "services" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("services")}
        >
          My Services
          {pendingServices.filter(s => !s.invoiced).length > 0 && (
            <span className={styles.badge}>{pendingServices.filter(s => !s.invoiced).length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "documents" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          Documents
          {documents.length > 0 && (
            <span className={styles.badge}>{documents.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "invoices" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("invoices")}
        >
          Invoices
          {invoices.filter(inv => inv.status === "sent" || inv.status === "overdue").length > 0 && (
            <span className={styles.badge}>
              {invoices.filter(inv => inv.status === "sent" || inv.status === "overdue").length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {/* Appointments Tab */}
        {activeTab === "appointments" && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Upcoming Appointments</h2>
                <button 
                  className={styles.primaryButton}
                  onClick={() => setShowScheduleModal(true)}
                >
                  Schedule New Appointment
                </button>
              </div>

              {upcomingAppointments.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No upcoming appointments</p>
                  <button 
                    className={styles.primaryButton}
                    onClick={() => setShowScheduleModal(true)}
                  >
                    Schedule Your First Meeting
                  </button>
                </div>
              ) : (
                <div className={styles.appointmentsList}>
                  {upcomingAppointments.map(apt => (
                    <div key={apt.id} className={styles.appointmentCard}>
                      <div className={styles.appointmentInfo}>
                        <h3 className={styles.appointmentTitle}>{apt.title}</h3>
                        {apt.description && (
                          <p className={styles.appointmentDesc}>{apt.description}</p>
                        )}
                        <div className={styles.appointmentMeta}>
                          <span className={styles.appointmentTime}>
                            📅 {formatDateTime(apt.start)}
                          </span>
                          {apt.location && (
                            <span className={styles.appointmentLocation}>📍 {apt.location}</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.appointmentActions}>
                        {apt.videoUrl && (
                          <a
                            href={apt.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.joinButton}
                          >
                            Join Meeting
                          </a>
                        )}
                        <button className={styles.secondaryButton}>Reschedule</button>
                        <button 
                          className={styles.dangerButton}
                          onClick={() => handleCancelAppointment(apt.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pastAppointments.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Past Appointments</h2>
                <div className={styles.appointmentsList}>
                  {pastAppointments.slice(0, 5).map(apt => (
                    <div key={apt.id} className={`${styles.appointmentCard} ${styles.pastAppointment}`}>
                      <div className={styles.appointmentInfo}>
                        <h3 className={styles.appointmentTitle}>{apt.title}</h3>
                        <div className={styles.appointmentMeta}>
                          <span className={styles.appointmentTime}>
                            📅 {formatDateTime(apt.start)}
                          </span>
                          <span className={styles.statusBadge}>
                            {apt.status === "completed" ? "✓ Completed" : "✗ Cancelled"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Services Tab */}
        {activeTab === "services" && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>My Services</h2>
                <p className={styles.sectionDescription}>
                  View your recurring services and one-time services scheduled for invoicing. 
                  To make changes, please schedule an appointment with us.
                </p>
              </div>

              {/* Recurring Services */}
              {subscription ? (
                <div className={styles.card} style={{ marginBottom: "2rem" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Monthly Recurring Services</h3>
                  <div style={{ 
                    padding: "1rem", 
                    backgroundColor: "#f8f9fa", 
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    border: "1px solid #e9ecef"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: "600", color: "#495057" }}>Billing Day:</span>
                      <span style={{ color: "#212529" }}>{subscription.billingDay} of each month</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: "600", color: "#495057" }}>Status:</span>
                      <span style={{
                        padding: "0.25rem 0.75rem",
                        backgroundColor: subscription.status === "active" ? "#d4edda" : "#f8d7da",
                        color: subscription.status === "active" ? "#155724" : "#721c24",
                        borderRadius: "12px",
                        fontSize: "0.875rem",
                        fontWeight: "500"
                      }}>
                        {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                      </span>
                    </div>
                    {subscription.lastInvoiceDate && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: "600", color: "#495057" }}>Last Invoice:</span>
                        <span style={{ color: "#212529" }}>
                          {new Date(subscription.lastInvoiceDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Service Description</th>
                        <th style={{ textAlign: "center", width: "100px" }}>Quantity</th>
                        <th style={{ textAlign: "right", width: "150px" }}>Unit Price</th>
                        <th style={{ textAlign: "right", width: "150px" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscription.recurringServices.map((service: any, index: number) => (
                        <tr key={index}>
                          <td>{service.description}</td>
                          <td style={{ textAlign: "center" }}>{service.quantity}</td>
                          <td style={{ textAlign: "right" }}>${service.unitPrice.toFixed(2)}</td>
                          <td style={{ textAlign: "right" }}>${service.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: "600", backgroundColor: "#f8f9fa" }}>
                        <td colSpan={3} style={{ textAlign: "right" }}>Monthly Total:</td>
                        <td style={{ textAlign: "right" }}>${subscription.monthlyRecurringTotal.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {subscription.notes && (
                    <div style={{ 
                      marginTop: "1rem", 
                      padding: "0.75rem", 
                      backgroundColor: "#e7f3ff",
                      borderLeft: "4px solid #0066cc",
                      borderRadius: "4px"
                    }}>
                      <strong style={{ color: "#0066cc" }}>Notes:</strong> {subscription.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No recurring services subscription found.</p>
                  <p style={{ fontSize: "0.875rem", color: "#6c757d", marginTop: "0.5rem" }}>
                    Contact us to set up a monthly service package.
                  </p>
                </div>
              )}

              {/* Pending One-Time Services */}
              <div className={styles.card}>
                <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Upcoming One-Time Services</h3>
                
                {pendingServices.filter(s => !s.invoiced).length > 0 ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Service Description</th>
                        <th style={{ textAlign: "center", width: "120px" }}>Service Date</th>
                        <th style={{ textAlign: "center", width: "100px" }}>Quantity</th>
                        <th style={{ textAlign: "right", width: "150px" }}>Amount</th>
                        <th style={{ textAlign: "center", width: "120px" }}>Billing Month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingServices.filter(s => !s.invoiced).map((service: any) => (
                        <tr key={service._id}>
                          <td>{service.description}</td>
                          <td style={{ textAlign: "center" }}>
                            {new Date(service.serviceDate).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: "center" }}>{service.quantity}</td>
                          <td style={{ textAlign: "right" }}>${service.amount.toFixed(2)}</td>
                          <td style={{ textAlign: "center" }}>
                            {new Date(service.billingMonth + "-01").toLocaleDateString(undefined, { 
                              year: 'numeric', 
                              month: 'long' 
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.emptyState}>
                    <p>No pending one-time services.</p>
                    <p style={{ fontSize: "0.875rem", color: "#6c757d", marginTop: "0.5rem" }}>
                      When we perform additional services for you, they'll appear here before being invoiced.
                    </p>
                  </div>
                )}
              </div>

              {/* Help Section */}
              <div style={{ 
                marginTop: "2rem",
                padding: "1.5rem",
                backgroundColor: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "8px"
              }}>
                <h4 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#856404" }}>
                  Need to Update Your Services?
                </h4>
                <p style={{ margin: 0, color: "#856404", fontSize: "0.875rem" }}>
                  To add, remove, or modify services in your subscription, please schedule an appointment with us. 
                  We'll discuss your needs and update your service package accordingly.
                </p>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className={styles.primaryButton}
                  style={{ marginTop: "1rem" }}
                >
                  Schedule Appointment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  {currentFolder ? (
                    <div className={styles.breadcrumb}>
                      <button onClick={handleBackToRoot} className={styles.breadcrumbLink}>
                        <Folder size={18} style={{ marginRight: "4px" }} />
                        My Documents
                      </button>
                      {getBreadcrumbs().map((segment, index) => {
                        const path = getBreadcrumbs().slice(0, index + 1).join("/");
                        const isLast = index === getBreadcrumbs().length - 1;
                        return (
                          <React.Fragment key={path}>
                            <ChevronRight size={16} className={styles.breadcrumbSeparator} />
                            {isLast ? (
                              <span className={styles.breadcrumbCurrent}>{segment}</span>
                            ) : (
                              <button
                                onClick={() => setCurrentFolder(path)}
                                className={styles.breadcrumbLink}
                              >
                                {segment}
                              </button>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <h2 className={styles.sectionTitle}>
                      <Folder size={24} style={{ marginRight: "8px", verticalAlign: "middle" }} />
                      My Documents
                    </h2>
                  )}
                </div>
                <div className={styles.headerActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setShowCreateFolderModal(true)}
                  >
                    <Folder size={16} style={{ marginRight: "4px" }} />
                    New Folder
                  </button>
                  {selectedFiles.size > 0 && (
                    <button
                      className={styles.primaryButton}
                      onClick={() => setShowFolderModal(true)}
                    >
                      <Folder size={16} style={{ marginRight: "4px" }} />
                      Move {selectedFiles.size} to Folder
                    </button>
                  )}
                  <label className={styles.primaryButton} style={{ cursor: "pointer" }}>
                    Upload Document
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                    />
                  </label>
                </div>
              </div>

              {documents.length === 0 && folders.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No documents uploaded yet</p>
                  <label className={styles.primaryButton} style={{ cursor: "pointer" }}>
                    Upload Your First Document
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                    />
                  </label>
                </div>
              ) : (
                <div className={styles.driveView}>
                  {/* Folders Section */}
                  {currentFolders.length > 0 && (
                    <div className={styles.foldersGrid}>
                      {currentFolders.map((folder) => {
                        const displayName = folder.name.split("/").pop() || folder.name;
                        const folderColor = folder.color || "#4a9eff";
                        return (
                          <div
                            key={folder.name}
                            className={styles.folderItem}
                            onClick={() => handleFolderClick(folder.name)}
                          >
                            <input
                              type="checkbox"
                              className={styles.itemCheckbox}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                // TODO: Implement folder selection
                              }}
                            />
                            <div className={styles.folderIcon}>
                              <Folder size={48} color={folderColor} fill={folderColor} fillOpacity={0.2} />
                            </div>
                            <div className={styles.folderDetails}>
                              <div className={styles.folderName}>{displayName}</div>
                              <div className={styles.folderCount}>{folder.count} files</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Files Section */}
                  {filteredDocs.length === 0 && currentFolder !== null ? (
                    <div className={styles.emptyFolder}>
                      <p>This folder is empty</p>
                    </div>
                  ) : filteredDocs.length > 0 ? (
                    <div className={styles.filesGrid}>
                      {filteredDocs.map((doc) => (
                        <div key={doc._id} className={styles.fileItem}>
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(doc._id)}
                            onChange={() => toggleFileSelection(doc._id)}
                            className={styles.itemCheckbox}
                          />
                          <div className={styles.fileIcon}>
                            <File size={48} color="#64748b" />
                          </div>
                          <div className={styles.fileDetails}>
                            <div className={styles.fileName}>{doc.filename}</div>
                            <div className={styles.fileMeta}>
                              {formatFileSize(doc.length)} • {new Date(doc.uploadDate).toLocaleDateString()}
                            </div>
                          </div>
                          <div className={styles.fileActions}>
                            <button
                              className={styles.actionButton}
                              onClick={() => handleDownloadFile(doc._id, doc.filename)}
                              title="Download"
                            >
                              ⬇
                            </button>
                            <button
                              className={styles.actionButton}
                              onClick={() => handleDeleteFile(doc._id)}
                              title="Delete"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === "invoices" && (
          <div className={styles.tabContent}>
            {/* Pending Approval Section */}
            {invoices.some(inv => inv.status === "pending-approval") && (
              <div className={styles.section} style={{ marginBottom: "2rem" }}>
                <h2 className={styles.sectionTitle}>
                  Pending Your Approval
                  <span className={styles.badge} style={{ marginLeft: "0.5rem", backgroundColor: "#f59e0b" }}>
                    {invoices.filter(inv => inv.status === "pending-approval").length}
                  </span>
                </h2>
                <div className={styles.invoicesList}>
                  {invoices
                    .filter(inv => inv.status === "pending-approval")
                    .map(inv => (
                      <div key={inv.id} className={styles.invoiceCard} style={{ borderLeft: "4px solid #f59e0b" }}>
                        <div className={styles.invoiceInfo}>
                          <h3 className={styles.invoiceNumber}>Invoice #{inv.invoiceNumber || "DRAFT"}</h3>
                          <p className={styles.invoiceAmount}>{formatCurrency(inv.total || inv.amount)}</p>
                          <div className={styles.invoiceMeta}>
                            <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>
                            <span className={styles.statusBadge} style={{ backgroundColor: "#f59e0b", color: "#000" }}>
                              AWAITING APPROVAL
                            </span>
                          </div>
                          {inv.notes && (
                            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#999" }}>
                              {inv.notes}
                            </p>
                          )}
                          {inv.lineItems && inv.lineItems.length > 0 && (
                            <details style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                              <summary style={{ cursor: "pointer", color: "#4a9eff" }}>View Line Items</summary>
                              <div style={{ marginTop: "0.5rem", paddingLeft: "1rem" }}>
                                {inv.lineItems.map((item, idx) => (
                                  <div key={idx} style={{ marginBottom: "0.25rem", color: "#ccc" }}>
                                    {item.description} - {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.amount)}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        <div className={styles.invoiceActions}>
                          <button 
                            className={styles.primaryButton}
                            onClick={() => handleApproveInvoice(inv.id)}
                            style={{ backgroundColor: "#2a7f3e" }}
                          >
                            ✅ Approve
                          </button>
                          <button 
                            className={styles.secondaryButton}
                            onClick={() => setShowScheduleModal(true)}
                            title="Request changes by scheduling a consultation"
                          >
                            Request Changes
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Regular Invoices Section */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Your Invoices</h2>

              {invoices.filter(inv => inv.status !== "pending-approval").length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No invoices yet</p>
                </div>
              ) : (
                <div className={styles.invoicesList}>
                  {invoices
                    .filter(inv => inv.status !== "pending-approval")
                    .map(inv => (
                      <div key={inv.id} className={styles.invoiceCard}>
                        <div className={styles.invoiceInfo}>
                          <h3 className={styles.invoiceNumber}>Invoice #{inv.invoiceNumber}</h3>
                          <p className={styles.invoiceAmount}>{formatCurrency(inv.total || inv.amount)}</p>
                          <div className={styles.invoiceMeta}>
                            <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>
                            <span className={`${styles.statusBadge} ${styles[inv.status]}`}>
                              {inv.status.toUpperCase().replace("-", " ")}
                            </span>
                          </div>
                          {inv.notes && (
                            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#999" }}>
                              {inv.notes}
                            </p>
                          )}
                          {inv.lineItems && inv.lineItems.length > 0 && (
                            <details style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                              <summary style={{ cursor: "pointer", color: "#4a9eff" }}>View Line Items</summary>
                              <div style={{ marginTop: "0.5rem", paddingLeft: "1rem" }}>
                                {inv.lineItems.map((item, idx) => (
                                  <div key={idx} style={{ marginBottom: "0.25rem", color: "#ccc" }}>
                                    {item.description} - {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.amount)}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        <div className={styles.invoiceActions}>
                          <button className={styles.secondaryButton}>View</button>
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <button 
                              className={styles.primaryButton}
                              onClick={() => handlePayInvoice(inv.id)}
                            >
                              Pay Now
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Appointment Modal */}
      {showScheduleModal && (
        <ClientScheduleModal
          onClose={() => setShowScheduleModal(false)}
          onSuccess={() => {
            loadUserData();
          }}
        />
      )}

      {/* Service Request Modal */}
      {showServiceRequestModal && (
        <ServiceRequestModal
          onClose={() => setShowServiceRequestModal(false)}
          onSuccess={() => {
            loadUserData();
          }}
        />
      )}

      {/* Move to Folder Modal */}
      {showFolderModal && (
        <div className={styles.modal} onClick={() => setShowFolderModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Move to Folder</h3>
            <p className={styles.modalDescription}>
              Move {selectedFiles.size} selected file{selectedFiles.size > 1 ? "s" : ""} to a folder.
              Use "/" to create nested folders (e.g., "Tax/2024").
            </p>
            <div className={styles.folderSelect}>
              <label>Folder Name</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name (e.g., Tax/2024)"
                className={styles.input}
              />
            </div>
            <div className={styles.folderSelect}>
              <label>Folder Color</label>
              <input
                type="color"
                value={newFolderColor}
                onChange={(e) => setNewFolderColor(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            {folders.length > 0 && (
              <div className={styles.existingFolders}>
                <label>Select existing folder:</label>
                <div className={styles.existingFoldersList}>
                  {folders.map((folder) => (
                    <button
                      key={folder.name}
                      className={styles.existingFolderBtn}
                      onClick={() => {
                        setNewFolderName(folder.name);
                        setNewFolderColor(folder.color || "#4a9eff");
                      }}
                    >
                      <Folder size={16} color={folder.color || "#4a9eff"} style={{ marginRight: "4px" }} />
                      {folder.name} ({folder.count})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.modalActions}>
              <button onClick={() => setShowFolderModal(false)} className={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleMoveToFolder} className={styles.confirmButton}>
                Move Files
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className={styles.modal} onClick={() => setShowCreateFolderModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Create New Folder</h3>
            <p className={styles.modalDescription}>
              Create a new empty folder. Use "/" for nested folders (e.g., "Tax/2024").
              The folder will appear immediately even if empty.
            </p>
            <div className={styles.folderSelect}>
              <label>Folder Name</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name (e.g., Tax/2024)"
                className={styles.input}
                autoFocus
              />
            </div>
            <div className={styles.folderSelect}>
              <label>Folder Color</label>
              <input
                type="color"
                value={newFolderColor}
                onChange={(e) => setNewFolderColor(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => {
                setShowCreateFolderModal(false);
                setNewFolderName("");
                setNewFolderColor("#4a9eff");
              }} className={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleCreateFolder} className={styles.confirmButton}>
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
