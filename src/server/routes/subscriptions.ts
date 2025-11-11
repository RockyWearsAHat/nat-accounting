import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { ServiceSubscriptionModel } from "../models/RecurringInvoice.js";
import { PendingServiceModel } from "../models/PendingService.js";
import { InvoiceGenerationService } from "../services/InvoiceGenerationService.js";
import { User } from "../models/User.js";

const router = Router();

// ==================== ADMIN ENDPOINTS ====================

// Get all service subscriptions
router.get("/admin/subscriptions", requireAuth, requireAdmin, async (req, res) => {
    try {
        const subscriptions = await ServiceSubscriptionModel.find().sort({ createdAt: -1 });
        res.json(subscriptions);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching subscriptions:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get subscription for specific user
router.get("/admin/subscriptions/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const subscription = await ServiceSubscriptionModel.findOne({ userId });
        res.json(subscription);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching subscription:", error);
        res.status(500).json({ error: error.message });
    }
});

// Create or update service subscription
router.post("/admin/subscriptions", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId, userEmail, recurringServices, billingDay, notes } = req.body;

        if (!userId || !userEmail || !recurringServices || !billingDay) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Calculate total
        const monthlyRecurringTotal = recurringServices.reduce(
            (sum: number, service: any) => sum + service.amount,
            0
        );

        // Check if subscription already exists
        const existing = await ServiceSubscriptionModel.findOne({ userId });

        if (existing) {
            // Update existing subscription
            existing.recurringServices = recurringServices;
            existing.billingDay = billingDay;
            existing.monthlyRecurringTotal = monthlyRecurringTotal;
            existing.notes = notes;
            existing.userEmail = userEmail;
            await existing.save();

            return res.json({ success: true, subscription: existing, updated: true });
        } else {
            // Create new subscription
            const subscription = await ServiceSubscriptionModel.create({
                userId,
                userEmail,
                recurringServices,
                billingDay,
                monthlyRecurringTotal,
                status: "active",
                notes,
            });

            return res.json({ success: true, subscription, updated: false });
        }
    } catch (error: any) {
        console.error("[Subscriptions] Error creating/updating subscription:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update subscription status (active/paused/cancelled)
router.patch("/admin/subscriptions/:userId/status", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;

        if (!["active", "paused", "cancelled"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const subscription = await ServiceSubscriptionModel.findOne({ userId });
        if (!subscription) {
            return res.status(404).json({ error: "Subscription not found" });
        }

        subscription.status = status;
        await subscription.save();

        res.json({ success: true, subscription });
    } catch (error: any) {
        console.error("[Subscriptions] Error updating subscription status:", error);
        res.status(500).json({ error: error.message });
    }
});

// Add one-time service to pending services
router.post("/admin/pending-services", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId, userEmail, description, quantity, unitPrice, serviceDate, billingMonth, notes } = req.body;

        if (!userId || !userEmail || !description || !unitPrice || !serviceDate || !billingMonth) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const amount = quantity * unitPrice;

        const pendingService = await PendingServiceModel.create({
            userId,
            userEmail,
            description,
            quantity: quantity || 1,
            unitPrice,
            amount,
            serviceDate: new Date(serviceDate),
            billingMonth,
            invoiced: false,
            notes,
        });

        res.json({ success: true, service: pendingService });
    } catch (error: any) {
        console.error("[Subscriptions] Error adding pending service:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get pending services for a user
router.get("/admin/pending-services/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { billingMonth } = req.query;

        const query: any = { userId, invoiced: false };
        if (billingMonth) {
            query.billingMonth = billingMonth;
        }

        const services = await PendingServiceModel.find(query).sort({ serviceDate: -1 });
        res.json(services);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching pending services:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete pending service
router.delete("/admin/pending-services/:serviceId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { serviceId } = req.params;
        await PendingServiceModel.findByIdAndDelete(serviceId);
        res.json({ success: true });
    } catch (error: any) {
        console.error("[Subscriptions] Error deleting pending service:", error);
        res.status(500).json({ error: error.message });
    }
});

// Preview monthly invoice
router.get("/admin/invoice/preview/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({ error: "Year and month are required" });
        }

        const preview = await InvoiceGenerationService.previewMonthlyInvoice(
            userId,
            parseInt(year as string),
            parseInt(month as string)
        );

        res.json(preview);
    } catch (error: any) {
        console.error("[Subscriptions] Error previewing invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Generate monthly invoice manually
router.post("/admin/invoice/generate", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId, year, month } = req.body;

        if (!userId || !year || !month) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const result = await InvoiceGenerationService.generateMonthlyInvoice(userId, year, month);

        if (result.success) {
            res.json({ success: true, invoice: result.invoice });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (error: any) {
        console.error("[Subscriptions] Error generating invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users for dropdown (admin only)
router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: "admin" } })
            .select("_id email company")
            .sort({ email: 1 });
        res.json(users);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching users:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CLIENT ENDPOINTS ====================

// Get current user's subscription
router.get("/subscription", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const subscription = await ServiceSubscriptionModel.findOne({ userId, status: "active" });
        res.json(subscription);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching user subscription:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get current user's pending services
router.get("/pending-services", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const services = await PendingServiceModel.find({ userId, invoiced: false }).sort({ serviceDate: -1 });
        res.json(services);
    } catch (error: any) {
        console.error("[Subscriptions] Error fetching pending services:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
