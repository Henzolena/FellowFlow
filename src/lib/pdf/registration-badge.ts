import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require("bwip-js") as {
  toBuffer(opts: Record<string, unknown>): Promise<Buffer>;
};

/* ── Types ─────────────────────────────────────────────────────────── */

export type BadgeData = {
  firstName: string;
  lastName: string;
  confirmationCode: string;
  eventName: string;
  eventStartDate?: string;
  eventEndDate?: string;
  category?: string;
  attendanceType?: string;
  gender?: string | null;
  city?: string | null;
  churchName?: string | null;
  amount?: number;
  isFree?: boolean;
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function categoryLabel(cat?: string): string {
  switch (cat) {
    case "adult":
      return "Adult";
    case "youth":
      return "Youth";
    case "child":
      return "Child";
    case "infant":
      return "Infant";
    default:
      return cat || "";
  }
}

function attendanceLabel(type?: string): string {
  switch (type) {
    case "full_conference":
      return "Full Conference";
    case "partial":
      return "Partial";
    case "kote":
      return "KOTE / Walk-in";
    default:
      return type || "";
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

async function generateQRCode(data: string): Promise<Buffer> {
  const buf = await bwipjs.toBuffer({
    bcid: "qrcode",
    text: data,
    scale: 5,
    width: 40,
    height: 40,
  });
  return Buffer.from(buf);
}

async function generateBarcode(data: string): Promise<Buffer> {
  const buf = await bwipjs.toBuffer({
    bcid: "code128",
    text: data,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
    textsize: 10,
  });
  return Buffer.from(buf);
}

/* ── PDF Generator ──────────────────────────────────────────────────── */

export async function generateRegistrationBadgePDF(
  badge: BadgeData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 560]);
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const PRIMARY = rgb(0.055, 0.647, 0.914); // #0ea5e9
  const DARK = rgb(0.094, 0.094, 0.106); // #18181b
  const GRAY = rgb(0.392, 0.392, 0.435); // #64646f
  const LIGHT_BG = rgb(0.969, 0.973, 0.98); // #f8f9fa
  const WHITE = rgb(1, 1, 1);

  let y = height;

  // ── Header background ──
  page.drawRectangle({
    x: 0,
    y: y - 90,
    width,
    height: 90,
    color: PRIMARY,
  });

  // ── Header text ──
  y -= 35;
  const eventTitle = badge.eventName || "Conference Registration";
  const titleWidth = fontBold.widthOfTextAtSize(eventTitle, 16);
  page.drawText(eventTitle, {
    x: (width - titleWidth) / 2,
    y,
    size: 16,
    font: fontBold,
    color: WHITE,
  });

  if (badge.eventStartDate) {
    y -= 20;
    const dateRange = badge.eventEndDate
      ? `${formatDate(badge.eventStartDate)} — ${formatDate(badge.eventEndDate)}`
      : formatDate(badge.eventStartDate);
    const dateWidth = fontRegular.widthOfTextAtSize(dateRange, 11);
    page.drawText(dateRange, {
      x: (width - dateWidth) / 2,
      y,
      size: 11,
      font: fontRegular,
      color: rgb(0.95, 0.95, 0.95),
    });
  }

  // ── Registration Badge label ──
  y -= 30;
  const badgeLabel = "REGISTRATION BADGE";
  const badgeLabelWidth = fontBold.widthOfTextAtSize(badgeLabel, 9);
  page.drawText(badgeLabel, {
    x: (width - badgeLabelWidth) / 2,
    y,
    size: 9,
    font: fontBold,
    color: PRIMARY,
  });

  // ── Attendee name ──
  y -= 30;
  const fullName = `${badge.firstName} ${badge.lastName}`;
  const nameSize = fullName.length > 24 ? 20 : 24;
  const nameWidth = fontBold.widthOfTextAtSize(fullName, nameSize);
  page.drawText(fullName, {
    x: (width - nameWidth) / 2,
    y,
    size: nameSize,
    font: fontBold,
    color: DARK,
  });

  // ── Details box ──
  y -= 25;
  const boxX = 30;
  const boxW = width - 60;
  const boxH = 100;

  page.drawRectangle({
    x: boxX,
    y: y - boxH,
    width: boxW,
    height: boxH,
    color: LIGHT_BG,
    borderColor: rgb(0.886, 0.906, 0.925),
    borderWidth: 1,
  });

  const detailLines: [string, string][] = [];
  if (badge.category) detailLines.push(["Category", categoryLabel(badge.category)]);
  if (badge.attendanceType) detailLines.push(["Attendance", attendanceLabel(badge.attendanceType)]);
  if (badge.gender) detailLines.push(["Gender", badge.gender.charAt(0).toUpperCase() + badge.gender.slice(1)]);
  if (badge.churchName) detailLines.push(["Church", badge.churchName]);
  if (badge.city) detailLines.push(["City", badge.city]);
  if (badge.amount !== undefined) {
    detailLines.push(["Amount", badge.isFree ? "FREE" : `$${badge.amount.toFixed(2)}`]);
  }

  let detailY = y - 16;
  for (const [label, value] of detailLines) {
    page.drawText(label, {
      x: boxX + 16,
      y: detailY,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
    // Truncate long values
    const maxValWidth = boxW - 140;
    let displayVal = value;
    while (fontBold.widthOfTextAtSize(displayVal, 10) > maxValWidth && displayVal.length > 3) {
      displayVal = displayVal.slice(0, -4) + "...";
    }
    page.drawText(displayVal, {
      x: boxX + 120,
      y: detailY,
      size: 10,
      font: fontBold,
      color: DARK,
    });
    detailY -= 16;
  }

  y -= boxH + 20;

  // ── QR Code ──
  try {
    const qrPng = await generateQRCode(badge.confirmationCode);
    const qrImage = await doc.embedPng(qrPng);
    const qrSize = 140;
    page.drawImage(qrImage, {
      x: (width - qrSize) / 2,
      y: y - qrSize,
      width: qrSize,
      height: qrSize,
    });
    y -= qrSize + 10;
  } catch {
    // If QR fails, skip
    y -= 10;
  }

  // ── Confirmation code text ──
  const codeSize = 14;
  const codeWidth = fontBold.widthOfTextAtSize(badge.confirmationCode, codeSize);
  page.drawText(badge.confirmationCode, {
    x: (width - codeWidth) / 2,
    y,
    size: codeSize,
    font: fontBold,
    color: DARK,
  });

  y -= 8;
  const codeLabel = "Confirmation Code — Show this at check-in";
  const codeLabelWidth = fontRegular.widthOfTextAtSize(codeLabel, 8);
  page.drawText(codeLabel, {
    x: (width - codeLabelWidth) / 2,
    y,
    size: 8,
    font: fontRegular,
    color: GRAY,
  });

  // ── Barcode (Code128) ──
  y -= 20;
  try {
    const barPng = await generateBarcode(badge.confirmationCode);
    const barImage = await doc.embedPng(barPng);
    const barW = 240;
    const barH = 50;
    page.drawImage(barImage, {
      x: (width - barW) / 2,
      y: y - barH,
      width: barW,
      height: barH,
    });
    y -= barH + 10;
  } catch {
    // If barcode fails, skip
  }

  // ── Footer ──
  const footerText = "Present this badge at the registration desk for check-in.";
  const footerWidth = fontRegular.widthOfTextAtSize(footerText, 8);
  page.drawText(footerText, {
    x: (width - footerWidth) / 2,
    y: 20,
    size: 8,
    font: fontRegular,
    color: GRAY,
  });

  return doc.save();
}

/* ── Batch helper for group registrations ──────────────────────────── */

export async function generateGroupBadgePDFs(
  members: BadgeData[]
): Promise<{ filename: string; content: Buffer }[]> {
  const results: { filename: string; content: Buffer }[] = [];

  for (const member of members) {
    const pdfBytes = await generateRegistrationBadgePDF(member);
    const safeName = `${member.firstName}_${member.lastName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    results.push({
      filename: `Registration_Badge_${safeName}.pdf`,
      content: Buffer.from(pdfBytes),
    });
  }

  return results;
}
