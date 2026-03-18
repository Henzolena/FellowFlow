import { PDFDocument, rgb, StandardFonts, type RGB, type PDFPage, type PDFFont } from "pdf-lib";
import { getCategoryBadge, getAccessTierBadge, getAttendanceBadge } from "@/lib/badge-colors";
import { formatDayNumber } from "@/lib/date-utils";
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
  accessTier?: string;
  gender?: string | null;
  city?: string | null;
  churchName?: string | null;
  amount?: number;
  isFree?: boolean;
  selectedDays?: number[] | null;
  dormName?: string | null;
  bedLabel?: string | null;
  mealCount?: number;
  tshirtSize?: string | null;
  mealPurchaseUrl?: string | null;
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return rgb(
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255
  );
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
    textgap: 3,
  });
  return Buffer.from(buf);
}

/** Draw a rounded-rect pill with centered text */
function drawPill(
  page: PDFPage,
  x: number,
  y: number,
  text: string,
  font: PDFFont,
  fontSize: number,
  textColor: RGB,
  bgColor: RGB
) {
  const textW = font.widthOfTextAtSize(text, fontSize);
  const pillW = textW + 20;
  const pillH = fontSize + 10;
  // Rounded rectangle (approximate with overlapping rects + circles)
  page.drawRectangle({ x, y: y - pillH, width: pillW, height: pillH, color: bgColor, borderColor: bgColor, borderWidth: 0 });
  page.drawText(text, { x: x + 10, y: y - pillH + 5, size: fontSize, font, color: textColor });
  return pillW;
}

/* ── PDF Generator ──────────────────────────────────────────────────── */

export async function generateRegistrationBadgePDF(
  badge: BadgeData
): Promise<Uint8Array> {
  // Determine if we need the "Valid Days" section
  const hasSpecificDays = !!(badge.selectedDays && badge.selectedDays.length > 0 && badge.eventStartDate);
  const isFullConference = badge.attendanceType === "full_conference";
  const showValidDays = hasSpecificDays || (isFullConference && !!badge.eventStartDate);
  const validDaysExtra = showValidDays ? 60 : 0;

  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 580 + validDaysExtra]);
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const DARK = rgb(0.094, 0.094, 0.106);
  const GRAY = rgb(0.392, 0.392, 0.435);
  const LIGHT_BG = rgb(0.969, 0.973, 0.98);
  const WHITE = rgb(1, 1, 1);

  // Resolve badge colors from centralized system
  const tierInfo = getAccessTierBadge(badge.accessTier);
  const catInfo = getCategoryBadge(badge.category);
  const attInfo = getAttendanceBadge(badge.attendanceType);

  const HEADER_COLOR = hexToRgb(tierInfo.hex);
  const CAT_TEXT = hexToRgb(catInfo.hex);
  const CAT_BG = hexToRgb(catInfo.bg);
  const ATT_TEXT = hexToRgb(attInfo.hex);
  const ATT_BG = hexToRgb(attInfo.bg);

  let y = height;

  // ── Color-coded header (by access tier) ──
  page.drawRectangle({ x: 0, y: y - 95, width, height: 95, color: HEADER_COLOR });

  y -= 30;
  const eventTitle = badge.eventName || "Conference Registration";
  const titleSize = eventTitle.length > 30 ? 14 : 16;
  const titleWidth = fontBold.widthOfTextAtSize(eventTitle, titleSize);
  page.drawText(eventTitle, { x: (width - titleWidth) / 2, y, size: titleSize, font: fontBold, color: WHITE });

  if (badge.eventStartDate) {
    y -= 20;
    const dateRange = badge.eventEndDate
      ? `${formatDate(badge.eventStartDate)} — ${formatDate(badge.eventEndDate)}`
      : formatDate(badge.eventStartDate);
    const dateWidth = fontRegular.widthOfTextAtSize(dateRange, 10);
    page.drawText(dateRange, { x: (width - dateWidth) / 2, y, size: 10, font: fontRegular, color: rgb(0.95, 0.95, 0.95) });
  }

  // ── Access tier label on header ──
  y -= 18;
  const tierLabel = tierInfo.label.toUpperCase();
  const tierLabelW = fontBold.widthOfTextAtSize(tierLabel, 9);
  page.drawRectangle({ x: (width - tierLabelW - 16) / 2, y: y - 4, width: tierLabelW + 16, height: 16, color: rgb(1, 1, 1) });
  page.drawText(tierLabel, { x: (width - tierLabelW) / 2, y: y - 1, size: 9, font: fontBold, color: HEADER_COLOR });

  // ── Attendee name ──
  y -= 56;
  const fullName = `${badge.firstName} ${badge.lastName}`;
  const nameSize = fullName.length > 24 ? 20 : 24;
  const nameWidth = fontBold.widthOfTextAtSize(fullName, nameSize);
  page.drawText(fullName, { x: (width - nameWidth) / 2, y, size: nameSize, font: fontBold, color: DARK });

  // ── Category + Attendance pills ──
  y -= 36;
  const catLabel = catInfo.label.toUpperCase();
  const attLabel = attInfo.label.toUpperCase();
  const catPillW = fontBold.widthOfTextAtSize(catLabel, 8) + 20;
  const attPillW = fontBold.widthOfTextAtSize(attLabel, 8) + 20;
  const gap = 8;
  const totalPillsW = catPillW + gap + attPillW;
  let pillX = (width - totalPillsW) / 2;

  drawPill(page, pillX, y, catLabel, fontBold, 8, CAT_TEXT, CAT_BG);
  pillX += catPillW + gap;
  drawPill(page, pillX, y, attLabel, fontBold, 8, ATT_TEXT, ATT_BG);

  // ── Valid Days section ──
  if (showValidDays) {
    const CHIP_BG = rgb(0.996, 0.957, 0.886);   // warm cream/amber
    const CHIP_BORDER = rgb(0.929, 0.886, 0.792); // subtle border
    const CHIP_H = 22;
    const CHIP_FONT = 8;
    const CHIP_GAP = 6;

    y -= 30;
    const validLabel = "VALID FOR";
    const vLabelW = fontBold.widthOfTextAtSize(validLabel, 7);
    page.drawText(validLabel, { x: (width - vLabelW) / 2, y, size: 7, font: fontBold, color: GRAY });
    y -= 20;

    if (isFullConference && !hasSpecificDays) {
      // Full conference: single wide chip with date range
      const rangeText = badge.eventEndDate
        ? `ALL DAYS  ·  ${formatDate(badge.eventStartDate)} – ${formatDate(badge.eventEndDate)}`
        : "ALL CONFERENCE DAYS";
      const rTextW = fontBold.widthOfTextAtSize(rangeText, CHIP_FONT);
      const rChipW = rTextW + 24;
      const rX = (width - rChipW) / 2;
      page.drawRectangle({ x: rX, y: y - CHIP_H, width: rChipW, height: CHIP_H, color: CHIP_BG, borderColor: CHIP_BORDER, borderWidth: 0.5 });
      page.drawText(rangeText, { x: rX + 12, y: y - CHIP_H + 7, size: CHIP_FONT, font: fontBold, color: DARK });
    } else if (hasSpecificDays) {
      // Individual day chips
      const sortedDays = badge.selectedDays!.slice().sort((a, b) => a - b);
      const dayLabels = sortedDays.map((d) => formatDayNumber(badge.eventStartDate!, d));
      const chipWidths = dayLabels.map((l) => fontBold.widthOfTextAtSize(l, CHIP_FONT) + 20);
      const totalW = chipWidths.reduce((s, w) => s + w, 0) + CHIP_GAP * (chipWidths.length - 1);

      let cx = (width - totalW) / 2;
      for (let i = 0; i < dayLabels.length; i++) {
        page.drawRectangle({
          x: cx, y: y - CHIP_H, width: chipWidths[i], height: CHIP_H,
          color: CHIP_BG, borderColor: CHIP_BORDER, borderWidth: 0.5,
        });
        page.drawText(dayLabels[i], {
          x: cx + 10, y: y - CHIP_H + 7, size: CHIP_FONT, font: fontBold, color: DARK,
        });
        cx += chipWidths[i] + CHIP_GAP;
      }
    }

    y -= CHIP_H + 6;
  }

  // ── Details box ──
  y -= 20;
  const boxX = 30;
  const boxW = width - 60;

  const detailLines: [string, string][] = [];
  if (badge.gender) detailLines.push(["Gender", badge.gender.charAt(0).toUpperCase() + badge.gender.slice(1)]);
  if (badge.churchName) detailLines.push(["Church", badge.churchName]);
  if (badge.city) detailLines.push(["City", badge.city]);
  if (badge.dormName) detailLines.push(["Dorm", badge.dormName]);
  if (badge.bedLabel) detailLines.push(["Bed", badge.bedLabel]);
  if (badge.mealCount && badge.mealCount > 0) detailLines.push(["Meals", `${badge.mealCount} meal(s) purchased`]);
  if (badge.tshirtSize) detailLines.push(["T-Shirt", badge.tshirtSize]);

  const VAL_FONT_SIZE = 10;
  const LINE_H = 16;
  const labelX = boxX + 16;
  const valX = boxX + 80;
  const maxValWidth = boxW - 100;

  // Word-wrap helper: split value into lines that fit within maxValWidth
  function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return [text];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [text];
  }

  // Pre-compute wrapped lines for each detail to determine box height
  const wrappedDetails: { label: string; lines: string[] }[] = detailLines.map(([label, value]) => ({
    label,
    lines: wrapText(value, fontBold, VAL_FONT_SIZE, maxValWidth),
  }));
  const totalLines = wrappedDetails.reduce((sum, d) => sum + d.lines.length, 0);
  const boxH = Math.max(50, totalLines * LINE_H + 20);

  page.drawRectangle({
    x: boxX, y: y - boxH, width: boxW, height: boxH,
    color: LIGHT_BG, borderColor: rgb(0.886, 0.906, 0.925), borderWidth: 1,
  });

  let detailY = y - 16;
  for (const { label, lines } of wrappedDetails) {
    page.drawText(label, { x: labelX, y: detailY, size: 9, font: fontRegular, color: GRAY });
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: valX, y: detailY, size: VAL_FONT_SIZE, font: fontBold, color: DARK });
      detailY -= LINE_H;
    }
  }

  y -= boxH + 16;

  // ── QR Code ──
  try {
    const qrPng = await generateQRCode(badge.confirmationCode);
    const qrImage = await doc.embedPng(qrPng);
    const qrSize = 130;
    page.drawImage(qrImage, { x: (width - qrSize) / 2, y: y - qrSize, width: qrSize, height: qrSize });
    y -= qrSize + 16;
  } catch {
    y -= 10;
  }

  // ── Confirmation code text ──
  const codeSize = 14;
  const codeWidth = fontBold.widthOfTextAtSize(badge.confirmationCode, codeSize);
  page.drawText(badge.confirmationCode, { x: (width - codeWidth) / 2, y, size: codeSize, font: fontBold, color: DARK });

  y -= 16;
  const codeLabel = "Confirmation Code — Show this at check-in";
  const codeLabelWidth = fontRegular.widthOfTextAtSize(codeLabel, 8);
  page.drawText(codeLabel, { x: (width - codeLabelWidth) / 2, y, size: 8, font: fontRegular, color: GRAY });

  // ── Barcode (Code128) ──
  y -= 18;
  try {
    const barPng = await generateBarcode(badge.confirmationCode);
    const barImage = await doc.embedPng(barPng);
    const barW = 220;
    const barH = 45;
    page.drawImage(barImage, { x: (width - barW) / 2, y: y - barH, width: barW, height: barH });
    y -= barH + 30;
  } catch {
    // If barcode fails, skip
  }

  // ── Meal Purchase QR (bottom-right corner) ──
  if (badge.mealPurchaseUrl) {
    try {
      const mealQrPng = await generateQRCode(badge.mealPurchaseUrl);
      const mealQrImage = await doc.embedPng(mealQrPng);
      const mqSize = 60;
      const mqX = width - mqSize - 16;
      const mqY = 36;
      // Light background behind QR
      page.drawRectangle({
        x: mqX - 4, y: mqY - 4, width: mqSize + 8, height: mqSize + 18,
        color: rgb(0.98, 0.98, 0.99), borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5,
      });
      page.drawImage(mealQrImage, { x: mqX, y: mqY, width: mqSize, height: mqSize });
      const mqLabel = "Buy Meals";
      const mqLabelW = fontBold.widthOfTextAtSize(mqLabel, 6);
      page.drawText(mqLabel, {
        x: mqX + (mqSize - mqLabelW) / 2,
        y: mqY + mqSize + 3,
        size: 6, font: fontBold, color: hexToRgb("#d97706"),
      });
    } catch {
      // If meal QR fails, skip silently
    }
  }

  // ── Color-coded footer bar (matches header) ──
  page.drawRectangle({ x: 0, y: 0, width, height: 30, color: HEADER_COLOR });
  const footerText = "Present this badge at the registration desk for check-in.";
  const footerWidth = fontRegular.widthOfTextAtSize(footerText, 8);
  page.drawText(footerText, { x: (width - footerWidth) / 2, y: 10, size: 8, font: fontRegular, color: WHITE });

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
