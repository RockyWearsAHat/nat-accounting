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
    totals: { monthlySubtotal, maintenanceSubtotal, oneTimeSubtotal, grandTotalMonthOne, ongoingMonthly },
  } = context;

  const parts: string[] = [];
  parts.push(`<p>New pricing quote generated.</p>`);
  parts.push(`<p><strong>Client Size:</strong> ${clientSize} &nbsp;|&nbsp; <strong>Price Point:</strong> ${pricePoint}</p>`);

  if (quoteDetails?.clientName || quoteDetails?.companyName) {
    parts.push(
      `<p><strong>Client:</strong> ${quoteDetails.clientName || "N/A"}${
        quoteDetails.companyName ? ` &nbsp;|&nbsp; ${quoteDetails.companyName}` : ""
      }</p>`
    );
  }

  parts.push(
    `<ul>
      <li><strong>Monthly Subtotal:</strong> ${formatCurrency(monthlySubtotal)}</li>
      <li><strong>Maintenance:</strong> ${formatCurrency(maintenanceSubtotal)}</li>
      <li><strong>One-time Subtotal:</strong> ${formatCurrency(oneTimeSubtotal)}</li>
      <li><strong>Grand Total (Month 1):</strong> ${formatCurrency(grandTotalMonthOne)}</li>
      <li><strong>Ongoing Monthly:</strong> ${formatCurrency(ongoingMonthly)}</li>
    </ul>`
  );

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

export { isEmailConfigured };
