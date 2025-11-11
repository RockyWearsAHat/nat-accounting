import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { CachedEventModel } from "../models/CachedEvent.js";
import { ServiceRequestModel } from "../models/ServiceRequest.js";
import { InvoiceModel } from "../models/Invoice.js";
import { DateTime } from "luxon";

const router = Router();
const TIMEZONE = "America/Denver";

// Get client's appointments
router.get("/appointments", requireAuth, async (req, res) => {
    try {
        const userEmail = req.user?.email;
        if (!userEmail) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Get all events that mention this user's email in description or summary
        const events = await CachedEventModel.find({
            deleted: { $ne: true },
            $or: [
                { summary: { $regex: userEmail, $options: "i" } },
                { description: { $regex: userEmail, $options: "i" } },
            ],
        })
            .sort({ start: 1 })
            .lean();

        // Transform events to appointment format
        const appointments = events.map((ev: any) => {
            const startDt = DateTime.fromISO(ev.start, { zone: "utc" }).setZone(TIMEZONE);
            const endDt = ev.end
                ? DateTime.fromISO(ev.end, { zone: "utc" }).setZone(TIMEZONE)
                : startDt.plus({ minutes: 30 });

            // Determine status based on date and any cancellation markers
            let status: "scheduled" | "completed" | "cancelled" = "scheduled";
            if (ev.description?.toLowerCase().includes("cancelled") || ev.summary?.toLowerCase().includes("cancelled")) {
                status = "cancelled";
            } else if (endDt < DateTime.now().setZone(TIMEZONE)) {
                status = "completed";
            }

            // Extract Zoom meeting ID if present
            const zoomMeetingId = ev.customProperties?.["X-ZOOM-MEETING-ID"];

            // Extract video URL from description or use Zoom join URL if meeting ID present
            let videoUrl = ev.description?.match(/https:\/\/[^\s]+zoom[^\s]+/)?.[0];
            if (!videoUrl && zoomMeetingId) {
                videoUrl = `https://zoom.us/j/${zoomMeetingId}`;
            }

            return {
                id: ev._id.toString(),
                title: ev.summary || "Appointment",
                description: ev.description,
                start: startDt.toISO(),
                end: endDt.toISO(),
                location: ev.location,
                videoUrl,
                status,
                zoomMeetingId,
            };
        });

        res.json(appointments);
    } catch (err) {
        console.error("Error fetching client appointments:", err);
        res.status(500).json({ error: "Failed to fetch appointments" });
    }
});

// Cancel an appointment
router.delete("/appointments/:id", requireAuth, async (req, res) => {
    try {
        const userEmail = req.user?.email;
        if (!userEmail) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { id } = req.params;

        // Find the event
        const event = await CachedEventModel.findById(id);
        if (!event) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        // Verify this user is associated with the appointment
        const isUserAppointment =
            event.summary?.toLowerCase().includes(userEmail.toLowerCase()) ||
            event.description?.toLowerCase().includes(userEmail.toLowerCase());

        if (!isUserAppointment) {
            return res.status(403).json({ error: "Not authorized to cancel this appointment" });
        }

        // Mark as cancelled (soft delete)
        event.deleted = true;
        event.description = event.description
            ? `[CANCELLED BY CLIENT]\n\n${event.description}`
            : "[CANCELLED BY CLIENT]";
        await event.save();

        res.json({ success: true, message: "Appointment cancelled successfully" });
    } catch (err) {
        console.error("Error cancelling appointment:", err);
        res.status(500).json({ error: "Failed to cancel appointment" });
    }
});

// Request appointment reschedule (creates a note for admin)
router.post("/appointments/:id/reschedule-request", requireAuth, async (req, res) => {
    try {
        const userEmail = req.user?.email;
        if (!userEmail) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { id } = req.params;
        const { requestedDate, requestedTime, reason } = req.body;

        // Find the event
        const event = await CachedEventModel.findById(id);
        if (!event) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        // Verify this user is associated with the appointment
        const isUserAppointment =
            event.summary?.toLowerCase().includes(userEmail.toLowerCase()) ||
            event.description?.toLowerCase().includes(userEmail.toLowerCase());

        if (!isUserAppointment) {
            return res.status(403).json({ error: "Not authorized to request reschedule for this appointment" });
        }

        // Add reschedule request to description
        const rescheduleNote = `\n\n[RESCHEDULE REQUEST from ${userEmail}]\nRequested: ${requestedDate} at ${requestedTime}\nReason: ${reason || "Not provided"}\nRequested at: ${new Date().toISOString()}`;
        event.description = (event.description || "") + rescheduleNote;
        await event.save();

        // TODO: Send notification to admin via email or create a notification record

        res.json({ success: true, message: "Reschedule request submitted. Our team will contact you shortly." });
    } catch (err) {
        console.error("Error submitting reschedule request:", err);
        res.status(500).json({ error: "Failed to submit reschedule request" });
    }
});

// Get client's service requests
router.get("/requests", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const requests = await ServiceRequestModel.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        res.json(requests);
    } catch (err) {
        console.error("Error fetching service requests:", err);
        res.status(500).json({ error: "Failed to fetch service requests" });
    }
});

// Create new service request
router.post("/requests", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
        if (!userId || !userEmail) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { services, notes } = req.body;

        if (!services || !Array.isArray(services) || services.length === 0) {
            return res.status(400).json({ error: "Please select at least one service" });
        }

        const serviceRequest = new ServiceRequestModel({
            userId,
            userEmail,
            services,
            notes,
            status: "pending",
        });

        await serviceRequest.save();

        res.json(serviceRequest);
    } catch (err) {
        console.error("Error creating service request:", err);
        res.status(500).json({ error: "Failed to create service request" });
    }
});

// Get client's invoices
router.get("/invoices", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const invoices = await InvoiceModel.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        res.json(invoices);
    } catch (err) {
        console.error("Error fetching invoices:", err);
        res.status(500).json({ error: "Failed to fetch invoices" });
    }
});

// Get single invoice details
router.get("/invoices/:id", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { id } = req.params;

        const invoice = await InvoiceModel.findOne({ _id: id, userId }).lean();
        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        res.json(invoice);
    } catch (err) {
        console.error("Error fetching invoice:", err);
        res.status(500).json({ error: "Failed to fetch invoice" });
    }
});

// Mark invoice as paid (simulated payment for now)
router.post("/invoices/:id/pay", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { id } = req.params;
        const { paymentMethod } = req.body;

        const invoice = await InvoiceModel.findOne({ _id: id, userId });
        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        if (invoice.status === "paid") {
            return res.status(400).json({ error: "Invoice is already paid" });
        }

        // TODO: Integrate with actual payment processor (Stripe, etc.)
        invoice.status = "paid";
        invoice.paidDate = new Date();
        invoice.paymentMethod = paymentMethod || "card";
        await invoice.save();

        res.json({ success: true, invoice });
    } catch (err) {
        console.error("Error processing payment:", err);
        res.status(500).json({ error: "Failed to process payment" });
    }
});

export default router;
