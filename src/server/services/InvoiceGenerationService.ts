import { ServiceSubscriptionModel } from "../models/RecurringInvoice.js";
import { PendingServiceModel } from "../models/PendingService.js";
import { InvoiceModel } from "../models/Invoice.js";
import { sendInvoiceEmail } from "./MailService.js";

interface GenerateInvoiceResult {
    success: boolean;
    invoice?: any;
    error?: string;
}

/**
 * Generates a single consolidated monthly invoice for a client
 * Combines recurring services from subscription + one-time pending services
 */
export class InvoiceGenerationService {
    /**
     * Generate invoice for a specific client for a specific month
     * @param userId - The client's user ID
     * @param year - Year (e.g., 2025)
     * @param month - Month (1-12)
     * @returns Generated invoice or error
     */
    static async generateMonthlyInvoice(
        userId: string,
        year: number,
        month: number
    ): Promise<GenerateInvoiceResult> {
        try {
            const billingMonth = `${year}-${String(month).padStart(2, '0')}`; // "2025-01"

            // Check if invoice already exists for this month
            const existingInvoice = await InvoiceModel.findOne({
                userId,
                billingMonth,
            });

            if (existingInvoice) {
                return {
                    success: false,
                    error: `Invoice already exists for ${billingMonth}`,
                };
            }

            // Get client's service subscription (recurring services template)
            const subscription = await ServiceSubscriptionModel.findOne({
                userId,
                status: "active",
            });

            if (!subscription) {
                return {
                    success: false,
                    error: "No active service subscription found for this client",
                };
            }

            // Start with recurring services from subscription
            const lineItems: any[] = subscription.recurringServices.map(service => ({
                description: service.description,
                quantity: service.quantity,
                unitPrice: service.unitPrice,
                amount: service.amount,
            }));

            // Add all pending one-time services for this billing month
            const pendingServices = await PendingServiceModel.find({
                userId,
                billingMonth,
                invoiced: false,
            });

            pendingServices.forEach(service => {
                lineItems.push({
                    description: service.description,
                    quantity: service.quantity,
                    unitPrice: service.unitPrice,
                    amount: service.amount,
                });
            });

            // Calculate totals
            const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
            const tax = 0; // TODO: Add tax calculation logic if needed
            const total = subtotal + tax;

            // Set due date (e.g., 15 days from now)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 15);

            // Create the consolidated invoice
            const invoice = await InvoiceModel.create({
                userId: subscription.userId,
                userEmail: subscription.userEmail,
                status: "sent",
                lineItems,
                subtotal,
                tax,
                total,
                dueDate,
                billingMonth,
                serviceSubscriptionId: subscription._id,
                notes: `Invoice for services provided in ${this.formatMonthYear(year, month)}`,
            });

            // Mark all pending services as invoiced
            await PendingServiceModel.updateMany(
                {
                    userId,
                    billingMonth,
                    invoiced: false,
                },
                {
                    $set: {
                        invoiced: true,
                        invoiceId: invoice._id.toString(),
                    },
                }
            );

            // Update subscription's last invoice date
            subscription.lastInvoiceDate = new Date();
            await subscription.save();

            // Send email notification
            await sendInvoiceEmail({
                to: subscription.userEmail,
                invoiceNumber: invoice.invoiceNumber || `INV-${year}-${String(month).padStart(2, "0")}`,
                billingMonth: this.formatMonthYear(year, month),
                lineItems: invoice.lineItems,
                subtotal: invoice.subtotal,
                tax: invoice.tax,
                total: invoice.total,
                dueDate: invoice.dueDate.toISOString(),
            });

            return {
                success: true,
                invoice,
            };
        } catch (error: any) {
            console.error("[InvoiceGenerationService] Error generating invoice:", error);
            return {
                success: false,
                error: error.message || "Failed to generate invoice",
            };
        }
    }

    /**
     * Generate invoices for all active subscriptions on their billing day
     * This should be run daily as a cron job
     */
    static async generateDueInvoices(): Promise<{ generated: number; errors: string[] }> {
        const now = new Date();
        const today = now.getDate();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const subscriptions = await ServiceSubscriptionModel.find({
            status: "active",
            billingDay: today,
        });

        let generated = 0;
        const errors: string[] = [];

        for (const subscription of subscriptions) {
            const result = await this.generateMonthlyInvoice(
                subscription.userId,
                year,
                month
            );

            if (result.success) {
                generated++;
                console.log(`✅ Generated invoice for ${subscription.userEmail} - ${year}-${month}`);
            } else {
                errors.push(`${subscription.userEmail}: ${result.error}`);
                console.error(`❌ Failed to generate invoice for ${subscription.userEmail}:`, result.error);
            }
        }

        return { generated, errors };
    }

    /**
     * Preview what the invoice would look like without actually creating it
     */
    static async previewMonthlyInvoice(userId: string, year: number, month: number) {
        const billingMonth = `${year}-${String(month).padStart(2, '0')}`;

        const subscription = await ServiceSubscriptionModel.findOne({
            userId,
            status: "active",
        });

        if (!subscription) {
            return { error: "No active subscription found" };
        }

        const lineItems: any[] = subscription.recurringServices.map(service => ({
            description: service.description,
            quantity: service.quantity,
            unitPrice: service.unitPrice,
            amount: service.amount,
            type: "recurring",
        }));

        const pendingServices = await PendingServiceModel.find({
            userId,
            billingMonth,
            invoiced: false,
        });

        pendingServices.forEach(service => {
            lineItems.push({
                description: service.description,
                quantity: service.quantity,
                unitPrice: service.unitPrice,
                amount: service.amount,
                type: "one-time",
                serviceDate: service.serviceDate,
            });
        });

        const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
        const tax = 0;
        const total = subtotal + tax;

        return {
            billingMonth,
            userEmail: subscription.userEmail,
            lineItems,
            subtotal,
            tax,
            total,
            recurringTotal: subscription.monthlyRecurringTotal,
            oneTimeTotal: subtotal - subscription.monthlyRecurringTotal,
        };
    }

    private static formatMonthYear(year: number, month: number): string {
        const date = new Date(year, month - 1, 1);
        return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
}
