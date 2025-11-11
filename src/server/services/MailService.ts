import nodemailer, { Transporter } from "nodemailer";
import type { PricingTotals, QuoteDetails } from "../pricing/parser";

interface QuoteEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface QuoteEmailContext {
  clientSize: string;
  pricePoint: string;
  quoteDetails?: QuoteDetails;
  totals: PricingTotals;
}

interface QuoteEmailPayload {
  to: string[];
  attachment: QuoteEmailAttachment;
  context: QuoteEmailContext;
}

let transporter: Transporter | null = null;

function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM
  );
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (!isEmailConfigured()) {
    throw new Error(
      "Email transport is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM environment variables."
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildEmailBody(context: QuoteEmailContext): string {
  const {
    clientSize,
    pricePoint,
    quoteDetails,
    totals: { monthlySubtotal, oneTimeSubtotal, grandTotalMonthOne, ongoingMonthly, maintenanceSubtotal },
  } = context;

  const parts: string[] = [];
  parts.push(`<p>New pricing quote generated.</p>`);
  parts.push(`<p><strong>Client Size:</strong> ${clientSize} &nbsp;|&nbsp; <strong>Price Point:</strong> ${pricePoint}</p>`);

  if (quoteDetails?.clientName || quoteDetails?.companyName) {
    parts.push(
      `<p><strong>Client:</strong> ${quoteDetails.clientName || "N/A"}${quoteDetails.companyName ? ` &nbsp;|&nbsp; ${quoteDetails.companyName}` : ""
      }</p>`
    );
  }

  const summaryItems = [
    `<li><strong>Monthly Subtotal:</strong> ${formatCurrency(monthlySubtotal)}</li>`,
    `<li><strong>One-time Subtotal:</strong> ${formatCurrency(oneTimeSubtotal)}</li>`,
    `<li><strong>Grand Total (Month 1):</strong> ${formatCurrency(grandTotalMonthOne)}</li>`,
    `<li><strong>Ongoing Monthly:</strong> ${formatCurrency(ongoingMonthly)}</li>`,
  ];

  if (maintenanceSubtotal != null) {
    summaryItems.splice(1, 0, `<li><strong>Maintenance:</strong> ${formatCurrency(maintenanceSubtotal)}</li>`);
  }

  parts.push(`<ul>${summaryItems.join("\n")}</ul>`);

  if (quoteDetails?.notes) {
    parts.push(`<p><strong>Notes:</strong><br/>${quoteDetails.notes}</p>`);
  }

  parts.push(`<p>The detailed quote is attached.</p>`);
  return parts.join("\n");
}

export async function sendPricingQuoteEmail(payload: QuoteEmailPayload): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured. Set SMTP_* and EMAIL_FROM environment variables to enable sending.");
  }

  const transport = getTransporter();

  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: payload.to,
    subject: `Pricing Quote – ${payload.context.clientSize} (${payload.context.pricePoint})`,
    html: buildEmailBody(payload.context),
    attachments: [payload.attachment],
  });
}

interface InvoiceEmailPayload {
  to: string;
  invoiceNumber: string;
  billingMonth: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  tax: number;
  total: number;
  dueDate: string;
}

function buildInvoiceEmailBody(payload: InvoiceEmailPayload): string {
  const parts: string[] = [];

  parts.push(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">`);
  parts.push(`<h2 style="color: #333;">Invoice ${payload.invoiceNumber}</h2>`);
  parts.push(`<p style="color: #666;">Billing Period: ${payload.billingMonth}</p>`);
  parts.push(`<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />`);

  parts.push(`<h3 style="color: #333;">Services</h3>`);
  parts.push(`<table style="width: 100%; border-collapse: collapse;">`);
  parts.push(`<thead>`);
  parts.push(`<tr style="background-color: #f8f9fa;">`);
  parts.push(`<th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>`);
  parts.push(`<th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>`);
  parts.push(`<th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Unit Price</th>`);
  parts.push(`<th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>`);
  parts.push(`</tr>`);
  parts.push(`</thead>`);
  parts.push(`<tbody>`);

  payload.lineItems.forEach((item) => {
    parts.push(`<tr>`);
    parts.push(`<td style="padding: 10px; border-bottom: 1px solid #eee;">${item.description}</td>`);
    parts.push(`<td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${item.quantity}</td>`);
    parts.push(`<td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(item.unitPrice)}</td>`);
    parts.push(`<td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(item.amount)}</td>`);
    parts.push(`</tr>`);
  });

  parts.push(`</tbody>`);
  parts.push(`</table>`);

  parts.push(`<div style="margin-top: 20px; text-align: right;">`);
  parts.push(`<p style="margin: 5px 0; color: #666;">Subtotal: <strong>${formatCurrency(payload.subtotal)}</strong></p>`);
  parts.push(`<p style="margin: 5px 0; color: #666;">Tax: <strong>${formatCurrency(payload.tax)}</strong></p>`);
  parts.push(`<p style="margin: 10px 0; font-size: 1.2em; color: #333;">Total: <strong style="color: #0066cc;">${formatCurrency(payload.total)}</strong></p>`);
  parts.push(`<p style="margin: 5px 0; color: #666;">Due Date: <strong>${new Date(payload.dueDate).toLocaleDateString()}</strong></p>`);
  parts.push(`</div>`);

  parts.push(`<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />`);
  parts.push(`<p style="color: #999; font-size: 0.9em;">Thank you for your business!</p>`);
  parts.push(`<p style="color: #999; font-size: 0.9em;">If you have any questions about this invoice, please contact us.</p>`);
  parts.push(`</div>`);

  return parts.join("\n");
}

export async function sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("Email is not configured. Invoice email not sent.");
    return;
  }

  try {
    const transport = getTransporter();

    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: payload.to,
      subject: `Invoice ${payload.invoiceNumber} - ${payload.billingMonth}`,
      html: buildInvoiceEmailBody(payload),
    });

    console.log(`Invoice email sent to ${payload.to} for invoice ${payload.invoiceNumber}`);
  } catch (error) {
    console.error("Failed to send invoice email:", error);
    // Don't throw - we don't want email failures to break invoice generation
  }
}

export { isEmailConfigured };
