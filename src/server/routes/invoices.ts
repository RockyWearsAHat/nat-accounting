import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { InvoiceModel } from "../models/Invoice.js";
import { User } from "../models/User.js";
import { sendInvoiceEmail } from "../services/MailService.js";
import { ServiceSubscriptionModel } from "../models/RecurringInvoice.js";
import { PendingServiceModel } from "../models/PendingService.js";

const router = Router();

// ==================== ADMIN INVOICE MANAGEMENT ====================

// Get all invoices (admin)
router.get("/admin/invoices", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId, status, billingMonth } = req.query;
        const filter: any = {};

        if (userId) filter.userId = userId;
        if (status) filter.status = status;
        if (billingMonth) filter.billingMonth = billingMonth;

        const invoices = await InvoiceModel.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json(invoices);
    } catch (error: any) {
        console.error("[Invoices] Error fetching invoices:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get single invoice (admin)
router.get("/admin/invoices/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const invoice = await InvoiceModel.findById(req.params.id).lean();

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        res.json(invoice);
    } catch (error: any) {
        console.error("[Invoices] Error fetching invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Create/save draft invoice from pricing calculator (admin)
router.post("/admin/invoices", requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            userId,
            userEmail,
            lineItems,
            subtotal,
            tax,
            total,
            dueDate,
            notes,
            billingMonth,
            customName,
            status = "admin-draft"
        } = req.body;

        // Validate required fields
        if (!userId || !userEmail || !lineItems || !subtotal || !total || !billingMonth) {
            return res.status(400).json({
                error: "Missing required fields: userId, userEmail, lineItems, subtotal, total, billingMonth"
            });
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Create invoice
        const invoice = await InvoiceModel.create({
            userId,
            userEmail,
            lineItems,
            subtotal,
            tax: tax || 0,
            total,
            dueDate: dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Default 15 days
            notes,
            billingMonth,
            customName,
            status
        });

        res.json({ success: true, invoice });
    } catch (error: any) {
        console.error("[Invoices] Error creating invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update invoice (admin)
router.put("/admin/invoices/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            lineItems,
            subtotal,
            tax,
            total,
            dueDate,
            notes,
            customName,
            status
        } = req.body;

        const invoice = await InvoiceModel.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Update fields if provided
        if (lineItems !== undefined) invoice.lineItems = lineItems;
        if (subtotal !== undefined) invoice.subtotal = subtotal;
        if (tax !== undefined) invoice.tax = tax;
        if (total !== undefined) invoice.total = total;
        if (dueDate !== undefined) invoice.dueDate = dueDate;
        if (notes !== undefined) invoice.notes = notes;
        if (customName !== undefined) invoice.customName = customName;
        if (status !== undefined) invoice.status = status;

        await invoice.save();

        res.json({ success: true, invoice });
    } catch (error: any) {
        console.error("[Invoices] Error updating invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Send/approve invoice (changes status from draft to sent)
router.post("/admin/invoices/:id/send", requireAuth, requireAdmin, async (req, res) => {
    try {
        const invoice = await InvoiceModel.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Update status to sent
        invoice.status = "sent";
        await invoice.save();

        // Send email notification
        await sendInvoiceEmail({
            to: invoice.userEmail,
            invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}`,
            billingMonth: invoice.billingMonth,
            lineItems: invoice.lineItems,
            subtotal: invoice.subtotal,
            tax: invoice.tax,
            total: invoice.total,
            dueDate: invoice.dueDate.toISOString(),
        });

        res.json({ success: true, invoice });
    } catch (error: any) {
        console.error("[Invoices] Error sending invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Publish invoice directly (skip approval, send immediately)
router.post("/admin/invoices/:id/publish", requireAuth, requireAdmin, async (req, res) => {
    try {
        const invoice = await InvoiceModel.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Update status to sent
        invoice.status = "sent";
        await invoice.save();

        // Send email notification
        await sendInvoiceEmail({
            to: invoice.userEmail,
            invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}`,
            billingMonth: invoice.billingMonth,
            lineItems: invoice.lineItems,
            subtotal: invoice.subtotal,
            tax: invoice.tax,
            total: invoice.total,
            dueDate: invoice.dueDate.toISOString(),
        });

        res.json({ success: true, invoice });
    } catch (error: any) {
        console.error("[Invoices] Error publishing invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete invoice (admin)
router.delete("/admin/invoices/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const invoice = await InvoiceModel.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Only allow deletion of draft or cancelled invoices
        if (invoice.status !== "admin-draft" && invoice.status !== "pending-approval" && invoice.status !== "cancelled") {
            return res.status(400).json({
                error: "Can only delete draft or cancelled invoices. Cancel the invoice first."
            });
        }

        await InvoiceModel.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: "Invoice deleted successfully" });
    } catch (error: any) {
        console.error("[Invoices] Error deleting invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's current subscription and latest invoice for prefilling calculator (admin)
router.get("/admin/user/:userId/current", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        // Get user's subscription
        const subscription = await ServiceSubscriptionModel.findOne({ userId }).lean();

        // Get user's latest invoice
        const latestInvoice = await InvoiceModel.findOne({ userId })
            .sort({ createdAt: -1 })
            .lean();

        // Get pending one-time services
        const pendingServices = await PendingServiceModel.find({
            userId,
            invoiced: false
        }).lean();

        res.json({
            subscription: subscription || null,
            latestInvoice: latestInvoice || null,
            pendingServices: pendingServices || []
        });
    } catch (error: any) {
        console.error("[Invoices] Error fetching user current data:", error);
        res.status(500).json({ error: error.message });
    }
});// ==================== CLIENT INVOICE ACCESS ====================

// Get user's own invoices (client)
router.get("/", requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user.id;

        // Show pending-approval, sent, paid, overdue to clients (hide admin-draft)
        const invoices = await InvoiceModel.find({
            userId,
            status: { $ne: "admin-draft" }
        })
            .sort({ createdAt: -1 })
            .lean();

        res.json(invoices);
    } catch (error: any) {
        console.error("[Invoices] Error fetching client invoices:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get single invoice (client - own only)
router.get("/:id", requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const invoice = await InvoiceModel.findOne({
            _id: req.params.id,
            userId
        }).lean();

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Don't show admin-draft invoices to clients
        if (invoice.status === "admin-draft") {
            return res.status(403).json({ error: "Access denied" });
        }

        res.json(invoice);
    } catch (error: any) {
        console.error("[Invoices] Error fetching invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Approve pending invoice (client)
router.post("/:id/approve", requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const invoice = await InvoiceModel.findOne({
            _id: req.params.id,
            userId
        });

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Can only approve pending-approval invoices
        if (invoice.status !== "pending-approval") {
            return res.status(400).json({
                error: "Can only approve invoices with pending-approval status"
            });
        }

        // Change status to sent
        invoice.status = "sent";
        await invoice.save();

        // Send confirmation email
        await sendInvoiceEmail({
            to: invoice.userEmail,
            invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}`,
            billingMonth: invoice.billingMonth,
            lineItems: invoice.lineItems,
            subtotal: invoice.subtotal,
            tax: invoice.tax,
            total: invoice.total,
            dueDate: invoice.dueDate.toISOString(),
        });

        res.json({ success: true, invoice });
    } catch (error: any) {
        console.error("[Invoices] Error approving invoice:", error);
        res.status(500).json({ error: error.message });
    }
}); export default router;
