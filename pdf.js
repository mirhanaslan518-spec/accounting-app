// =========================================================
// pdf.js — shared PDF generation for invoices and quotes.
// Relies on window.jsPDF and window.pdfAutoTable, set up in the
// <script type="module"> block at the bottom of the page.
// =========================================================

// jsPDF's built-in fonts only cover ASCII — Turkish letters (ğ ı ş ç ö ü)
// would render as broken boxes without this. We fetch a real Unicode font
// once per page session and embed it into each PDF instead of pasting a
// giant base64 blob into this file.
const TURKISH_FONT_URL = "http://fonts.googleapis.com/css?family=Cantora+One|Ropa+Sans:400,400italic";
let fontBase64Cache = null;

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ensureTurkishFont(doc) {
  if (!fontBase64Cache) {
    const response = await fetch(TURKISH_FONT_URL);
    if (!response.ok) {
      throw new Error(`Font indirilemedi (HTTP ${response.status}) — TURKISH_FONT_URL adresini kontrol edin.`);
    }
    const buffer = await response.arrayBuffer();
    fontBase64Cache = arrayBufferToBase64(buffer);
  }
  doc.addFileToVFS("Roboto-Regular.ttf", fontBase64Cache);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto");
}

// config: {
//   docType: "FATURA" | "TEKLİF", docNumber, issueDate, dueDate, currency,
//   company: {name, ticari_unvan, adres, vergi_dairesi, vergi_no, telefon},
//   customer: {company_title, tax_id, address, phone},
//   lines: [{description, quantity, unit, unit_price, tax_rate, line_total}],
//   subtotal, taxTotal, grandTotal, notes, terms (quotes only)
// }
async function buildDocumentPDF(config) {
  const doc = new window.jsPDF();
  await ensureTurkishFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // ---- Company info (left) ----
  doc.setFontSize(14);
  doc.text(config.company.name || "", 14, y);
  doc.setFontSize(9);
  y += 6;
  if (config.company.ticari_unvan) { doc.text(config.company.ticari_unvan, 14, y); y += 5; }
  if (config.company.adres) { doc.text(config.company.adres, 14, y, { maxWidth: 90 }); y += 10; }
  if (config.company.vergi_dairesi || config.company.vergi_no) {
    doc.text(`${config.company.vergi_dairesi || ""} V.D. ${config.company.vergi_no || ""}`, 14, y);
    y += 5;
  }
  if (config.company.telefon) { doc.text(config.company.telefon, 14, y); y += 5; }

  // ---- Document title + meta (right) ----
  doc.setFontSize(18);
  doc.text(config.docType, pageWidth - 14, 20, { align: "right" });
  doc.setFontSize(9);
  let metaY = 28;
  if (config.docNumber) { doc.text(`No: ${config.docNumber}`, pageWidth - 14, metaY, { align: "right" }); metaY += 5; }
  doc.text(`Tarih: ${config.issueDate || ""}`, pageWidth - 14, metaY, { align: "right" }); metaY += 5;
  if (config.dueDate) { doc.text(`Vade: ${config.dueDate}`, pageWidth - 14, metaY, { align: "right" }); metaY += 5; }

  y = Math.max(y, metaY) + 8;

  // ---- Customer info ----
  doc.setFontSize(11);
  doc.text("Müşteri", 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.text(config.customer.company_title || "", 14, y); y += 5;
  if (config.customer.tax_id) { doc.text(`VKN/TCKN: ${config.customer.tax_id}`, 14, y); y += 5; }
  if (config.customer.address) { doc.text(config.customer.address, 14, y, { maxWidth: 120 }); y += 10; }
  if (config.customer.phone) { doc.text(config.customer.phone, 14, y); y += 5; }

  y += 6;

  // ---- Line items table ----
  const body = config.lines.map((l) => [
    l.description || "",
    String(l.quantity),
    l.unit || "",
    Number(l.unit_price).toFixed(2),
    `%${l.tax_rate}`,
    Number(l.line_total).toFixed(2),
  ]);

  window.pdfAutoTable(doc, {
    startY: y,
    head: [["Açıklama", "Miktar", "Birim", "Br. Fiyat", "KDV", "Toplam"]],
    body,
    theme: "grid",
    headStyles: { font: "Roboto", fillColor: [232, 163, 61], textColor: [20, 23, 26] },
    styles: { font: "Roboto", fontSize: 9 },
  });

  let finalY = doc.lastAutoTable.finalY + 10;

  // ---- Totals ----
  doc.setFontSize(9);
  doc.text(`Ara Toplam: ${Number(config.subtotal).toFixed(2)} ${config.currency}`, pageWidth - 14, finalY, { align: "right" });
  finalY += 6;
  doc.text(`Toplam KDV: ${Number(config.taxTotal).toFixed(2)} ${config.currency}`, pageWidth - 14, finalY, { align: "right" });
  finalY += 6;
  doc.setFontSize(12);
  doc.text(`Genel Toplam: ${Number(config.grandTotal).toFixed(2)} ${config.currency}`, pageWidth - 14, finalY, { align: "right" });
  finalY += 10;

  doc.setFontSize(9);

  if (config.terms) {
    doc.text("Teklif Koşulları:", 14, finalY);
    finalY += 5;
    doc.text(config.terms, 14, finalY, { maxWidth: pageWidth - 28 });
    finalY += 10;
  }

  if (config.notes) {
    doc.text("Notlar:", 14, finalY);
    finalY += 5;
    doc.text(config.notes, 14, finalY, { maxWidth: pageWidth - 28 });
  }

  return doc;
}

function openPDF(doc) {
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
}
