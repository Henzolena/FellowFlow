import { Resend } from "resend";
import { generateRegistrationBadgePDF, type BadgeData } from "@/lib/pdf/registration-badge";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured — emails will be skipped");
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "FellowFlow <noreply@fellowflow.com>";

/* ── Shared styles ─────────────────────────────────────────────────── */

const S = {
  body: 'margin:0;padding:0;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;',
  wrapper: 'background:#f0f0f5;padding:40px 16px;',
  card: 'max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);',
  header: 'background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 50%,#8b5cf6 100%);padding:40px 40px 36px;text-align:center;',
  h1: 'margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.3px;',
  headerSub: 'margin:10px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;',
  bodyPad: 'padding:36px 40px 28px;',
  greeting: 'margin:0 0 6px;color:#18181b;font-size:17px;font-weight:600;',
  intro: 'margin:0 0 28px;color:#52525b;font-size:15px;line-height:1.7;',
  sectionTitle: 'margin:0 0 12px;color:#18181b;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;',
  detailBox: 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:0 0 24px;',
  detailPad: 'padding:20px 24px;',
  rowLabel: 'padding:7px 0;color:#64748b;font-size:13px;vertical-align:top;width:40%;',
  rowValue: 'padding:7px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;',
  divider: 'padding:10px 0 0;border-top:1px solid #e2e8f0;',
  codeBox: 'background:linear-gradient(135deg,#f0f9ff,#ede9fe);border:2px dashed #a5b4fc;border-radius:12px;padding:20px;text-align:center;margin:0 0 28px;',
  codeLabel: 'margin:0 0 6px;color:#6366f1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;',
  codeValue: 'margin:0;color:#1e1b4b;font-size:22px;font-weight:800;font-family:"SF Mono",Monaco,Consolas,monospace;letter-spacing:1.5px;',
  amountBox: 'background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;margin:0 0 28px;',
  amountLabel: 'margin:0 0 4px;color:#16a34a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;',
  amountValue: 'margin:0;color:#15803d;font-size:32px;font-weight:800;',
  cta: 'display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(99,102,241,0.35);',
  footer: 'padding:24px 40px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;',
  footerText: 'margin:0;color:#94a3b8;font-size:12px;line-height:1.6;',
  footerBold: 'color:#64748b;font-weight:600;',
} as const;

function detailRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td style="${S.rowLabel}">${label}</td><td style="${S.rowValue}">${value}</td></tr>`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function attendanceLabel(type: string): string {
  switch (type) {
    case "full_conference": return "Full Conference";
    case "partial": return "Partial Attendance";
    case "kote": return "KOTE / Walk-in";
    default: return type;
  }
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "adult": return "Adult";
    case "youth": return "Youth";
    case "child": return "Child";
    case "infant": return "Infant";
    default: return cat;
  }
}

/* ── Solo confirmation email ─────────────────────────────────────── */

export type ConfirmationEmailParams = {
  to: string;
  firstName: string;
  lastName: string;
  eventName: string;
  eventStartDate?: string;
  eventEndDate?: string;
  amount: number;
  isFree: boolean;
  registrationId: string;
  confirmationCode?: string;
  explanationDetail: string | null;
  attendanceType?: string;
  category?: string;
  gender?: string | null;
  city?: string | null;
  churchName?: string | null;
};

export async function sendConfirmationEmail(params: ConfirmationEmailParams) {
  const resend = getResend();
  if (!resend) return;

  const {
    to,
    firstName,
    lastName,
    eventName,
    eventStartDate,
    eventEndDate,
    amount,
    isFree,
    registrationId,
    confirmationCode,
    explanationDetail,
    attendanceType,
    category,
    gender,
    city,
    churchName,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const receiptUrl = `${appUrl}/register/receipt/${registrationId}`;
  const amountDisplay = isFree ? "FREE" : `$${Number(amount).toFixed(2)}`;
  const displayCode = confirmationCode || registrationId;
  const dateRange = eventStartDate && eventEndDate
    ? `${formatDate(eventStartDate)} — ${formatDate(eventEndDate)}`
    : null;

  // Generate PDF badge with barcode
  let pdfAttachment: { filename: string; content: Buffer }[] = [];
  if (displayCode) {
    try {
      const badgeData: BadgeData = {
        firstName,
        lastName,
        confirmationCode: displayCode,
        eventName,
        eventStartDate,
        eventEndDate,
        category,
        attendanceType,
        gender,
        city,
        churchName,
        amount,
        isFree,
      };
      const pdfBytes = await generateRegistrationBadgePDF(badgeData);
      const safeName = `${firstName}_${lastName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      pdfAttachment = [{
        filename: `Registration_Badge_${safeName}.pdf`,
        content: Buffer.from(pdfBytes),
      }];
    } catch (pdfErr) {
      console.error("PDF badge generation failed (continuing without attachment):", pdfErr);
    }
  }

  try {
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Registration Confirmed — ${eventName}`,
      attachments: pdfAttachment.length > 0 ? pdfAttachment : undefined,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" style="${S.wrapper}"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="${S.card}">

  <!-- Header -->
  <tr><td style="${S.header}">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:50%;padding:12px;margin:0 0 16px;">
        <img src="https://img.icons8.com/fluency/48/checked--v1.png" width="32" height="32" alt="" style="display:block;" />
      </div>
    </td></tr></table>
    <h1 style="${S.h1}">Registration Confirmed</h1>
    <p style="${S.headerSub}">${eventName}</p>
    ${dateRange ? `<p style="${S.headerSub}">${dateRange}</p>` : ""}
  </td></tr>

  <!-- Body -->
  <tr><td style="${S.bodyPad}">
    <p style="${S.greeting}">Hello ${firstName}! 👋</p>
    <p style="${S.intro}">Your registration has been confirmed. Please keep this email — you'll need your confirmation code for check-in. Your registration badge is attached as a PDF.</p>

    <!-- Confirmation Code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.codeBox}"><tr><td>
      <p style="${S.codeLabel}">Your Confirmation Code</p>
      <p style="${S.codeValue}">${displayCode}</p>
    </td></tr></table>

    <!-- Amount -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.amountBox}"><tr><td>
      <p style="${S.amountLabel}">Amount ${isFree ? "" : "Paid"}</p>
      <p style="${S.amountValue}">${amountDisplay}</p>
    </td></tr></table>

    <!-- Details -->
    <p style="${S.sectionTitle}">Registration Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.detailBox}"><tr><td style="${S.detailPad}">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow("Name", `${firstName} ${lastName}`)}
        ${detailRow("Event", eventName)}
        ${detailRow("Attendance", attendanceType ? attendanceLabel(attendanceType) : null)}
        ${detailRow("Category", category ? categoryLabel(category) : null)}
        ${detailRow("Gender", gender ? (gender.charAt(0).toUpperCase() + gender.slice(1)) : null)}
        ${detailRow("City", city)}
        ${detailRow("Church", churchName)}
        ${explanationDetail ? detailRow("Pricing", explanationDetail) : ""}
      </table>
    </td></tr></table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 8px;">
      <a href="${receiptUrl}" style="${S.cta}">View Full Receipt &rarr;</a>
    </td></tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="${S.footer}">
    <p style="${S.footerText}">
      <span style="${S.footerBold}">FellowFlow</span> — Conference Registration<br>
      Show your confirmation code at the check-in desk.<br>
      Questions? Reply to this email.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`.trim(),
    });

    if (sendError) {
      console.error(`❌ Resend API error for confirmation to ${to}:`, sendError);
      throw new Error(sendError.message || "Resend API error");
    }

    console.log(`📧 Confirmation email sent to ${to} (id: ${sendResult?.id}) for registration ${registrationId}`);
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
    throw error;
  }
}

/* ── Group receipt email ─────────────────────────────────────────── */

export type GroupMember = {
  firstName: string;
  lastName: string;
  category: string;
  ageAtEvent: number;
  amount: number;
  attendance: string;
  confirmationCode?: string;
  gender?: string | null;
  city?: string | null;
  churchName?: string | null;
};

export type GroupReceiptEmailParams = {
  to: string;
  eventName: string;
  eventStartDate?: string;
  eventEndDate?: string;
  members: GroupMember[];
  subtotal: number;
  surcharge: number;
  surchargeLabel: string | null;
  grandTotal: number;
  isFree: boolean;
  primaryRegistrationId: string;
  primaryConfirmationCode?: string;
};

export async function sendGroupReceiptEmail(params: GroupReceiptEmailParams) {
  const resend = getResend();
  if (!resend) return;

  const {
    to,
    eventName,
    eventStartDate,
    eventEndDate,
    members,
    subtotal,
    surcharge,
    surchargeLabel,
    grandTotal,
    isFree,
    primaryRegistrationId,
    primaryConfirmationCode,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const receiptUrl = `${appUrl}/register/receipt/${primaryRegistrationId}`;
  const totalDisplay = isFree ? "FREE" : `$${grandTotal.toFixed(2)}`;
  const dateRange = eventStartDate && eventEndDate
    ? `${formatDate(eventStartDate)} — ${formatDate(eventEndDate)}`
    : null;

  const memberRows = members
    .map(
      (m, i) => `
      <tr>
        <td style="padding:12px 16px;${i < members.length - 1 ? "border-bottom:1px solid #f1f5f9;" : ""}">
          <div style="font-size:14px;font-weight:700;color:#18181b;margin:0 0 2px;">${m.firstName} ${m.lastName}</div>
          <div style="font-size:12px;color:#64748b;">
            ${categoryLabel(m.category)} · ${m.attendance}
            ${m.gender ? ` · ${m.gender.charAt(0).toUpperCase() + m.gender.slice(1)}` : ""}
            ${m.city ? ` · ${m.city}` : ""}
          </div>
          ${m.churchName ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">⛪ ${m.churchName}</div>` : ""}
          ${m.confirmationCode ? `<div style="font-size:11px;color:#6366f1;font-family:monospace;font-weight:600;margin-top:4px;">Code: ${m.confirmationCode}</div>` : ""}
        </td>
        <td style="padding:12px 16px;text-align:right;vertical-align:top;font-size:15px;font-weight:700;color:${m.amount === 0 ? "#16a34a" : "#18181b"};${i < members.length - 1 ? "border-bottom:1px solid #f1f5f9;" : ""}">
          ${m.amount === 0 ? "FREE" : `$${m.amount.toFixed(2)}`}
        </td>
      </tr>`
    )
    .join("");

  const surchargeRow =
    surcharge > 0
      ? `<tr>
          <td style="padding:8px 16px;color:#64748b;font-size:13px;">${surchargeLabel || "Late Surcharge"}</td>
          <td style="padding:8px 16px;color:#d97706;font-size:14px;text-align:right;font-weight:700;">+$${surcharge.toFixed(2)}</td>
        </tr>`
      : "";

  // Generate PDF badges for each member
  const pdfAttachments: { filename: string; content: Buffer }[] = [];
  for (const m of members) {
    if (!m.confirmationCode) continue;
    try {
      const badgeData: BadgeData = {
        firstName: m.firstName,
        lastName: m.lastName,
        confirmationCode: m.confirmationCode,
        eventName,
        eventStartDate,
        eventEndDate,
        category: m.category,
        attendanceType: m.attendance,
        gender: m.gender,
        city: m.city,
        churchName: m.churchName,
        amount: m.amount,
        isFree,
      };
      const pdfBytes = await generateRegistrationBadgePDF(badgeData);
      const safeName = `${m.firstName}_${m.lastName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      pdfAttachments.push({
        filename: `Registration_Badge_${safeName}.pdf`,
        content: Buffer.from(pdfBytes),
      });
    } catch (pdfErr) {
      console.error(`PDF badge generation failed for ${m.firstName} ${m.lastName}:`, pdfErr);
    }
  }

  try {
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Group Registration Confirmed — ${eventName}`,
      attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" style="${S.wrapper}"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="${S.card}">

  <!-- Header -->
  <tr><td style="${S.header}">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:50%;padding:12px;margin:0 0 16px;">
        <img src="https://img.icons8.com/fluency/48/conference-call.png" width="32" height="32" alt="" style="display:block;" />
      </div>
    </td></tr></table>
    <h1 style="${S.h1}">Group Registration Confirmed</h1>
    <p style="${S.headerSub}">${members.length} registrant${members.length > 1 ? "s" : ""} for ${eventName}</p>
    ${dateRange ? `<p style="${S.headerSub}">${dateRange}</p>` : ""}
  </td></tr>

  <!-- Body -->
  <tr><td style="${S.bodyPad}">
    <p style="${S.intro}">Your group registration has been confirmed. Each member's individual confirmation code is listed below — they'll need it at check-in. Registration badges are attached as PDFs.</p>

    ${primaryConfirmationCode ? `
    <!-- Primary Code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.codeBox}"><tr><td>
      <p style="${S.codeLabel}">Primary Confirmation Code</p>
      <p style="${S.codeValue}">${primaryConfirmationCode}</p>
    </td></tr></table>
    ` : ""}

    <!-- Registrants table -->
    <p style="${S.sectionTitle}">Registrants</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.detailBox}">
      <tr>
        <td style="padding:10px 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">Member Details</span>
        </td>
        <td style="padding:10px 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;text-align:right;">
          <span style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">Fee</span>
        </td>
      </tr>
      ${memberRows}
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:16px 0 28px;">
      <tr>
        <td style="padding:8px 16px;color:#64748b;font-size:13px;">Subtotal</td>
        <td style="padding:8px 16px;color:#18181b;font-size:13px;text-align:right;font-weight:600;">$${subtotal.toFixed(2)}</td>
      </tr>
      ${surchargeRow}
      <tr><td colspan="2" style="padding:0 16px;"><div style="border-top:2px solid #e2e8f0;"></div></td></tr>
      <tr>
        <td style="padding:12px 16px;color:#18181b;font-size:17px;font-weight:800;">Total ${isFree ? "" : "Paid"}</td>
        <td style="padding:12px 16px;text-align:right;font-size:24px;font-weight:800;color:${isFree ? "#16a34a" : "#0ea5e9"};">${totalDisplay}</td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 8px;">
      <a href="${receiptUrl}" style="${S.cta}">View Full Receipt &rarr;</a>
    </td></tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="${S.footer}">
    <p style="${S.footerText}">
      <span style="${S.footerBold}">FellowFlow</span> — Conference Registration<br>
      Each registrant should present their own confirmation code at check-in.<br>
      Questions? Reply to this email.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`.trim(),
    });

    if (sendError) {
      console.error(`❌ Resend API error for group receipt to ${to}:`, sendError);
      throw new Error(sendError.message || "Resend API error");
    }

    console.log(`📧 Group receipt email sent to ${to} (id: ${sendResult?.id}) for ${members.length} registrants (primary: ${primaryRegistrationId})`);
  } catch (error) {
    console.error("Failed to send group receipt email:", error);
    throw error;
  }
}

/* ── Admin notification email ─────────────────────────────────────── */

export type AdminNotificationMember = {
  firstName: string;
  lastName: string;
  category: string;
  amount: number;
  attendance: string;
  confirmationCode?: string;
};

export type AdminNotificationEmailParams = {
  to: string | string[];
  eventName: string;
  eventStartDate?: string;
  eventEndDate?: string;
  registrantEmail: string;
  registrantPhone?: string | null;
  members: AdminNotificationMember[];
  grandTotal: number;
  isFree: boolean;
  isPaid: boolean;
  groupId?: string | null;
  primaryRegistrationId: string;
  registeredAt: string;
};

/* ── Pre-fill invitation email ──────────────────────────────────── */

export type PrefillInvitationEmailParams = {
  to: string;
  firstName: string;
  lastName: string;
  eventName: string;
  eventStartDate?: string;
  eventEndDate?: string;
  attendanceType: string;
  completionUrl: string;
  invitationCode: string;
  adminNotes?: string | null;
  expiresAt?: string | null;
};

export async function sendPrefillInvitationEmail(params: PrefillInvitationEmailParams) {
  const resend = getResend();
  if (!resend) return;

  const {
    to,
    firstName,
    lastName,
    eventName,
    eventStartDate,
    eventEndDate,
    attendanceType,
    completionUrl,
    invitationCode,
    expiresAt,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fullUrl = `${appUrl}${completionUrl}`;
  const dateRange = eventStartDate && eventEndDate
    ? `${formatDate(eventStartDate)} — ${formatDate(eventEndDate)}`
    : null;
  const expiryNote = expiresAt
    ? `This link expires on ${new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : "";

  try {
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Complete Your Registration — ${eventName}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" style="${S.wrapper}"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="${S.card}">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 40px 36px;text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:50%;padding:12px;margin:0 0 16px;">
        <img src="https://img.icons8.com/fluency/48/mail.png" width="32" height="32" alt="" style="display:block;" />
      </div>
    </td></tr></table>
    <h1 style="${S.h1}">You're Invited!</h1>
    <p style="${S.headerSub}">${eventName}</p>
    ${dateRange ? `<p style="${S.headerSub}">${dateRange}</p>` : ""}
  </td></tr>

  <!-- Body -->
  <tr><td style="${S.bodyPad}">
    <p style="${S.greeting}">Hello ${firstName}! 👋</p>
    <p style="${S.intro}">You have been pre-registered for <strong>${eventName}</strong>. Please click the button below to complete your registration and make any required payment.</p>

    <!-- Pre-filled Details -->
    <p style="${S.sectionTitle}">Your Pre-filled Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.detailBox}"><tr><td style="${S.detailPad}">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow("Name", `${firstName} ${lastName}`)}
        ${detailRow("Event", eventName)}
        ${detailRow("Attendance", attendanceLabel(attendanceType))}
      </table>
    </td></tr></table>

    <!-- Invitation Code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.codeBox}"><tr><td>
      <p style="${S.codeLabel}">Your Invitation Code</p>
      <p style="${S.codeValue}">${invitationCode}</p>
      <p style="margin:8px 0 0;color:#6366f1;font-size:12px;">You'll need this code to access your registration form</p>
    </td></tr></table>

    <p style="margin:0 0 28px;color:#52525b;font-size:14px;line-height:1.7;">
      You'll be able to add your phone number, select your church, and complete any remaining details. ${expiryNote}
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 8px;">
      <a href="${fullUrl}" style="${S.cta}">Complete Registration &rarr;</a>
    </td></tr></table>

    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
      If the button doesn't work, copy this link:<br>
      <a href="${fullUrl}" style="color:#6366f1;word-break:break-all;">${fullUrl}</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="${S.footer}">
    <p style="${S.footerText}">
      <span style="${S.footerBold}">FellowFlow</span> — Conference Registration<br>
      Questions? Reply to this email.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`.trim(),
    });

    if (sendError) {
      console.error(`❌ Resend API error for prefill invitation to ${to}:`, sendError);
      throw new Error(sendError.message || "Resend API error");
    }

    console.log(`📧 Pre-fill invitation email sent to ${to} (id: ${sendResult?.id})`);
  } catch (error) {
    console.error("Failed to send prefill invitation email:", error);
    throw error;
  }
}

/* ── Admin notification email ──────────────────────────────────── */

const SA = {
  header: 'background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px 28px;text-align:center;',
  h1: 'margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;',
  headerSub: 'margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;font-weight:500;',
  alertBox: 'background:linear-gradient(135deg,#eff6ff,#eef2ff);border:1px solid #c7d2fe;border-radius:12px;padding:16px 20px;margin:0 0 24px;',
  alertText: 'margin:0;color:#4338ca;font-size:14px;font-weight:600;',
  alertSub: 'margin:4px 0 0;color:#6366f1;font-size:12px;',
  memberRow: 'padding:12px 16px;border-bottom:1px solid #f1f5f9;',
  memberName: 'font-size:14px;font-weight:700;color:#18181b;margin:0 0 2px;',
  memberMeta: 'font-size:12px;color:#64748b;',
  ctaAdmin: 'display:inline-block;background:linear-gradient(135deg,#1e293b,#475569);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(30,41,59,0.35);',
} as const;

export async function sendAdminNotificationEmail(params: AdminNotificationEmailParams) {
  const resend = getResend();
  if (!resend) return;

  const {
    to,
    eventName,
    eventStartDate,
    eventEndDate,
    registrantEmail,
    registrantPhone,
    members,
    grandTotal,
    isFree,
    isPaid,
    primaryRegistrationId,
    registeredAt,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const adminUrl = `${appUrl}/admin/registrations/${primaryRegistrationId}`;
  const totalDisplay = isFree ? "FREE" : `$${grandTotal.toFixed(2)}`;
  const paymentStatus = isFree ? "Free" : isPaid ? "Paid via Stripe" : "Pending Payment";
  const dateRange = eventStartDate && eventEndDate
    ? `${formatDate(eventStartDate)} — ${formatDate(eventEndDate)}`
    : null;

  const isGroup = members.length > 1;
  const subjectLine = isGroup
    ? `New Group Registration (${members.length}) — ${eventName}`
    : `New Registration: ${members[0].firstName} ${members[0].lastName} — ${eventName}`;

  const memberRows = members
    .map(
      (m, i) => `
      <tr>
        <td style="${SA.memberRow}${i === members.length - 1 ? "border-bottom:none;" : ""}">
          <div style="${SA.memberName}">${m.firstName} ${m.lastName}</div>
          <div style="${SA.memberMeta}">
            ${categoryLabel(m.category)} · ${m.attendance} · ${m.amount === 0 ? "FREE" : `$${m.amount.toFixed(2)}`}
          </div>
          ${m.confirmationCode ? `<div style="font-size:11px;color:#6366f1;font-family:monospace;font-weight:600;margin-top:2px;">Code: ${m.confirmationCode}</div>` : ""}
        </td>
      </tr>`
    )
    .join("");

  let formattedTime = registeredAt;
  try {
    formattedTime = new Date(registeredAt).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch { /* keep raw */ }

  const { data: sendResult, error: sendError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: subjectLine,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" style="${S.wrapper}"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="${S.card}">

  <!-- Header -->
  <tr><td style="${SA.header}">
    <h1 style="${SA.h1}">📋 New Registration</h1>
    <p style="${SA.headerSub}">${eventName}${dateRange ? ` · ${dateRange}` : ""}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="${S.bodyPad}">

    <!-- Alert -->
    <table width="100%" cellpadding="0" cellspacing="0" style="${SA.alertBox}"><tr><td>
      <p style="${SA.alertText}">${isGroup ? `${members.length} new registrants` : "1 new registrant"} just registered!</p>
      <p style="${SA.alertSub}">Payment: ${paymentStatus} · Total: ${totalDisplay}</p>
    </td></tr></table>

    <!-- Contact -->
    <p style="${S.sectionTitle}">Contact Information</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.detailBox}"><tr><td style="${S.detailPad}">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow("Email", registrantEmail)}
        ${detailRow("Phone", registrantPhone || null)}
        ${detailRow("Registered At", formattedTime)}
      </table>
    </td></tr></table>

    <!-- Registrants -->
    <p style="${S.sectionTitle}">Registrant${isGroup ? "s" : ""}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="${S.detailBox}">
      ${memberRows}
    </table>

    <!-- Total -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:16px 0 28px;">
      <tr>
        <td style="padding:14px 20px;color:#18181b;font-size:16px;font-weight:800;">Total</td>
        <td style="padding:14px 20px;text-align:right;font-size:20px;font-weight:800;color:${isFree ? "#16a34a" : "#0ea5e9"};">${totalDisplay}</td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 8px;">
      <a href="${adminUrl}" style="${SA.ctaAdmin}">View in Admin Panel &rarr;</a>
    </td></tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="${S.footer}">
    <p style="${S.footerText}">
      <span style="${S.footerBold}">FellowFlow Admin</span><br>
      You received this because you are an admin of this event.<br>
      <a href="${appUrl}/admin/registrations" style="color:#6366f1;text-decoration:none;">View all registrations &rarr;</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`.trim(),
  });

  if (sendError) {
    const recipient = Array.isArray(to) ? to.join(', ') : to;
    console.error(`❌ Resend API error for admin notification to ${recipient}:`, sendError);
    throw new Error(sendError.message || "Resend API error");
  }

  const recipient = Array.isArray(to) ? to.join(', ') : to;
  console.log(`📧 Admin notification sent to ${recipient} (id: ${sendResult?.id}) for registration ${primaryRegistrationId}`);
}
