import { Resend } from "resend";

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

type ConfirmationEmailParams = {
  to: string;
  firstName: string;
  lastName: string;
  eventName: string;
  amount: number;
  isFree: boolean;
  registrationId: string;
  explanationDetail: string | null;
};

export async function sendConfirmationEmail(params: ConfirmationEmailParams) {
  const resend = getResend();
  if (!resend) return;

  const {
    to,
    firstName,
    lastName,
    eventName,
    amount,
    isFree,
    registrationId,
    explanationDetail,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const receiptUrl = `${appUrl}/register/receipt/${registrationId}`;

  const amountDisplay = isFree ? "FREE" : `$${Number(amount).toFixed(2)}`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Registration Confirmed — ${eventName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Registration Confirmed</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#18181b;font-size:16px;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Your registration for <strong>${eventName}</strong> has been confirmed.
              </p>

              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin:0 0 24px;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;color:#71717a;font-size:13px;">Attendee</td>
                        <td style="padding:4px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;">${firstName} ${lastName}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;color:#71717a;font-size:13px;">Event</td>
                        <td style="padding:4px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;">${eventName}</td>
                      </tr>
                      ${explanationDetail ? `
                      <tr>
                        <td style="padding:4px 0;color:#71717a;font-size:13px;">Details</td>
                        <td style="padding:4px 0;color:#18181b;font-size:13px;text-align:right;">${explanationDetail}</td>
                      </tr>` : ""}
                      <tr>
                        <td colspan="2" style="padding:12px 0 0;border-top:1px solid #e4e4e7;"></td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;color:#71717a;font-size:14px;font-weight:600;">Amount</td>
                        <td style="padding:4px 0;color:#0ea5e9;font-size:18px;text-align:right;font-weight:700;">${amountDisplay}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#71717a;font-size:12px;">Confirmation ID</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:12px;font-family:monospace;word-break:break-all;">${registrationId}</p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 0;">
                    <a href="${receiptUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                      View Receipt
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">
                FellowFlow — Conference Registration
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim(),
    });

    console.log(`📧 Confirmation email sent to ${to} for registration ${registrationId}`);
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
    // Don't throw — email failure should not block the registration flow
  }
}
