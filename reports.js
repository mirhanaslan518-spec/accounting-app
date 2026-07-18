// =========================================================
// reports.js — logic for reports.html
// Relies on shared.js (sb, requireSession, getMyCompany,
// categorizeInvoice, categorizeExpense, getDateRangeForPreset,
// initDateRangeFilter) and csv-tools.js (exportToExcel via
// window.XLSX, used here through exportTableToExcel).
// =========================================================

let currentCompanyId = null;
const initialized = {};

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- GENERIC TABLE EXPORT ----------------------------------------------------
// Reads whatever is currently rendered in a <table id="..."> — headers from
// <thead>, data from <tbody> — and exports it. Works for every report tab
// without needing a separate column-definition list per report, since the
// table already IS the data we want to export.
function exportTableToExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
  const bodyRows = Array.from(table.querySelectorAll("tbody tr")).filter(
    (tr) => !tr.querySelector("td.empty-state")
  );

  const rows = bodyRows.map((tr) => {
    const cells = Array.from(tr.querySelectorAll("td"));
    const obj = {};
    cells.forEach((td, i) => {
      obj[headers[i] || `Sütun ${i + 1}`] = td.textContent.trim();
    });
    return obj;
  });

  if (rows.length === 0) {
    alert("Dışa aktarılacak veri yok.");
    return;
  }

  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Rapor");
  window.XLSX.writeFile(wb, filename);
}

document.querySelectorAll(".export-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    exportTableToExcel(btn.dataset.table, btn.dataset.filename);
  });
});

// ---- STARTUP --------------------------------------------------------------
async function init() {
  const session = await requireSession();
  if (!session) return;

  const company = await getMyCompany(session.user.id);
  if (!company) {
    document.querySelector(".container-wide").innerHTML =
      `<p class="empty-state">Bu kullanıcıya bağlı bir şirket bulunamadı.</p>`;
    return;
  }
  currentCompanyId = company.id;

  showReportTab("tahsilatlar");
}

// ---- TAB SWITCHING ----------------------------------------------------------
function showReportTab(tab) {
  document.querySelectorAll(".report-section").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
  document.querySelectorAll("#report-tabs .filter-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (initialized[tab]) return;
  initialized[tab] = true;

  if (tab === "tahsilatlar") initTahsilatlarTab();
  else if (tab === "odemeler") initOdemelerTab();
  else if (tab === "satislar") initSatislarTab();
  else if (tab === "giderler") initGiderlerTab();
  else if (tab === "gelirgider") initGelirGiderTab();
  else if (tab === "kdv") initKdvTab();
  else if (tab === "kasabanka") initKasaBankaTab();
  else if (tab === "nakitakisi") initNakitAkisiTab();
}

document.querySelectorAll("#report-tabs .filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => showReportTab(btn.dataset.tab));
});

// ---- AGING BUCKETS (shared by Tahsilatlar + Ödemeler) --------------------------
const AGING_ORDER = ["planlanmamis", "guncel", "b1_30", "b31_60", "b61_90", "b91_120", "b120plus"];
const AGING_LABELS = {
  planlanmamis: "Planlanmamış",
  guncel: "Güncel (Vadesi Geçmemiş)",
  b1_30: "1-30 Gün Gecikmiş",
  b31_60: "31-60 Gün Gecikmiş",
  b61_90: "61-90 Gün Gecikmiş",
  b91_120: "91-120 Gün Gecikmiş",
  b120plus: "120+ Gün Gecikmiş",
};

function agingBucketKey(dueDate) {
  if (!dueDate) return "planlanmamis";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diffDays = Math.round((today - due) / 86400000);
  if (diffDays <= 0) return "guncel";
  if (diffDays <= 30) return "b1_30";
  if (diffDays <= 60) return "b31_60";
  if (diffDays <= 90) return "b61_90";
  if (diffDays <= 120) return "b91_120";
  return "b120plus";
}

function renderAgingTable(rows, tbodyId) {
  const buckets = {};
  AGING_ORDER.forEach((k) => { buckets[k] = { count: 0, amount: 0 }; });

  rows.forEach((r) => {
    const key = agingBucketKey(r.due_date);
    buckets[key].count += 1;
    buckets[key].amount += r.amount;
  });

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";
  AGING_ORDER.forEach((k) => {
    const b = buckets[k];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${AGING_LABELS[k]}</td><td class="numeric">${b.count}</td><td class="numeric">${b.amount.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
}

// ================= TAHSİLATLAR =================
function initTahsilatlarTab() {
  initDateRangeFilter("tahsilatlar-date-range", (range) => loadTahsilatlarReport(range));
}

async function loadTahsilatlarReport(range) {
  let periodQuery = sb.from("invoices")
    .select("grand_total")
    .eq("company_id", currentCompanyId)
    .eq("collection_status", "tahsil_edildi");
  if (range.from) periodQuery = periodQuery.gte("collected_date", range.from);
  if (range.to) periodQuery = periodQuery.lte("collected_date", range.to);
  const { data: periodData } = await periodQuery;

  const periodTotal = (periodData || []).reduce((s, x) => s + (Number(x.grand_total) || 0), 0);
  document.getElementById("tahsilat-period-total").textContent = periodTotal.toFixed(2);

  const { data: outstanding } = await sb
    .from("invoices")
    .select("grand_total, due_date")
    .eq("company_id", currentCompanyId)
    .neq("collection_status", "tahsil_edildi");

  const rows = (outstanding || []).map((x) => ({ due_date: x.due_date, amount: Number(x.grand_total) || 0 }));
  renderAgingTable(rows, "tahsilat-aging-body");
}

// ================= ÖDEMELER =================
function initOdemelerTab() {
  initDateRangeFilter("odemeler-date-range", (range) => loadOdemelerReport(range));
}

async function loadOdemelerReport(range) {
  let periodQuery = sb.from("expenses")
    .select("total_amount")
    .eq("company_id", currentCompanyId)
    .in("payment_status", ["odendi", "calisan_cebinden_odedi"]);
  if (range.from) periodQuery = periodQuery.gte("paid_date", range.from);
  if (range.to) periodQuery = periodQuery.lte("paid_date", range.to);
  const { data: periodData } = await periodQuery;

  const periodTotal = (periodData || []).reduce((s, x) => s + (Number(x.total_amount) || 0), 0);
  document.getElementById("odeme-period-total").textContent = periodTotal.toFixed(2);

  const { data: outstanding } = await sb
    .from("expenses")
    .select("total_amount, due_date")
    .eq("company_id", currentCompanyId)
    .not("payment_status", "in", "(odendi,calisan_cebinden_odedi)");

  const rows = (outstanding || []).map((x) => ({ due_date: x.due_date, amount: Number(x.total_amount) || 0 }));
  renderAgingTable(rows, "odeme-aging-body");
}

// ================= SATIŞLAR =================
let satislarRange = { from: null, to: null };
let satislarView = "faturalar";

function initSatislarTab() {
  initDateRangeFilter("satislar-date-range", (range) => {
    satislarRange = range;
    loadSatislarReport();
  });

  document.querySelectorAll("#satislar-view-tabs .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#satislar-view-tabs .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      satislarView = btn.dataset.view;
      document.getElementById("satislar-unpaid-only-wrap").classList.toggle("hidden", satislarView !== "faturalar");
      loadSatislarReport();
    });
  });

  document.getElementById("satislar-kdv-haric").addEventListener("change", loadSatislarReport);
  document.getElementById("satislar-unpaid-only").addEventListener("change", loadSatislarReport);
}

async function loadSatislarReport() {
  const kdvHaric = document.getElementById("satislar-kdv-haric").checked;
  const unpaidOnly = document.getElementById("satislar-unpaid-only").checked;
  const thead = document.getElementById("satislar-thead");
  const tbody = document.getElementById("satislar-tbody");

  if (satislarView === "faturalar") {
    let q = sb.from("invoices")
      .select("invoice_name, invoice_number, issue_date, subtotal, grand_total, currency, collection_status, due_date, customers(company_title)")
      .eq("company_id", currentCompanyId);
    if (satislarRange.from) q = q.gte("issue_date", satislarRange.from);
    if (satislarRange.to) q = q.lte("issue_date", satislarRange.to);
    let { data } = await q.order("issue_date", { ascending: false });

    if (unpaidOnly) {
      data = (data || []).filter((inv) => inv.collection_status !== "tahsil_edildi");
    }

    thead.innerHTML = `<tr><th>Fatura</th><th>Müşteri</th><th>Tarih</th><th>Durum</th><th class="numeric">Tutar</th></tr>`;
    tbody.innerHTML = "";
    (data || []).forEach((inv) => {
      const amount = kdvHaric ? Number(inv.subtotal) : Number(inv.grand_total);
      const status = categorizeInvoice(inv);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(inv.invoice_name || inv.invoice_number || "Fatura")}</td>
        <td>${escapeHtml(inv.customers ? inv.customers.company_title : "")}</td>
        <td>${inv.issue_date || ""}</td>
        <td><span class="status-badge ${status.cls}">${status.label}</span></td>
        <td class="numeric">${amount.toFixed(2)} ${inv.currency}</td>
      `;
      tbody.appendChild(tr);
    });

  } else if (satislarView === "musteriler") {
    let q = sb.from("invoices").select("subtotal, grand_total, customers(company_title)").eq("company_id", currentCompanyId);
    if (satislarRange.from) q = q.gte("issue_date", satislarRange.from);
    if (satislarRange.to) q = q.lte("issue_date", satislarRange.to);
    const { data } = await q;

    const grouped = {};
    (data || []).forEach((inv) => {
      const name = inv.customers ? inv.customers.company_title : "(Müşterisiz)";
      const amount = kdvHaric ? Number(inv.subtotal) : Number(inv.grand_total);
      grouped[name] = (grouped[name] || 0) + amount;
    });

    thead.innerHTML = `<tr><th>Müşteri</th><th class="numeric">Toplam</th></tr>`;
    tbody.innerHTML = "";
    Object.entries(grouped).sort((a, b) => b[1] - a[1]).forEach(([name, total]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td class="numeric">${total.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });

  } else {
    let q = sb.from("invoice_lines")
      .select("description, quantity, unit_price, line_total, invoices!inner(issue_date, company_id)")
      .eq("invoices.company_id", currentCompanyId);
    if (satislarRange.from) q = q.gte("invoices.issue_date", satislarRange.from);
    if (satislarRange.to) q = q.lte("invoices.issue_date", satislarRange.to);
    const { data } = await q;

    const grouped = {};
    (data || []).forEach((line) => {
      const name = line.description || "(Açıklamasız)";
      const amount = kdvHaric ? Number(line.quantity) * Number(line.unit_price) : Number(line.line_total);
      if (!grouped[name]) grouped[name] = { qty: 0, amount: 0 };
      grouped[name].qty += Number(line.quantity);
      grouped[name].amount += amount;
    });

    thead.innerHTML = `<tr><th>Hizmet/Ürün</th><th class="numeric">Miktar</th><th class="numeric">Toplam</th></tr>`;
    tbody.innerHTML = "";
    Object.entries(grouped).sort((a, b) => b[1].amount - a[1].amount).forEach(([name, g]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td class="numeric">${g.qty}</td><td class="numeric">${g.amount.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
  }

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Seçili aralıkta veri yok.</td></tr>`;
  }
}

// ================= GİDERLER =================
let giderlerRange = { from: null, to: null };
let giderlerView = "giderler";

function initGiderlerTab() {
  initDateRangeFilter("giderler-date-range", (range) => {
    giderlerRange = range;
    loadGiderlerReport();
  });

  document.querySelectorAll("#giderler-view-tabs .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#giderler-view-tabs .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      giderlerView = btn.dataset.view;
      document.getElementById("giderler-unpaid-only-wrap").classList.toggle("hidden", giderlerView !== "giderler");
      loadGiderlerReport();
    });
  });

  document.getElementById("giderler-kdv-haric").addEventListener("change", loadGiderlerReport);
  document.getElementById("giderler-unpaid-only").addEventListener("change", loadGiderlerReport);
}

async function loadGiderlerReport() {
  const kdvHaric = document.getElementById("giderler-kdv-haric").checked;
  const unpaidOnly = document.getElementById("giderler-unpaid-only").checked;
  const thead = document.getElementById("giderler-thead");
  const tbody = document.getElementById("giderler-tbody");

  if (giderlerView === "giderler") {
    let q = sb.from("expenses")
      .select("expense_name, receipt_date, total_amount, tax_total, currency, payment_status, due_date, suppliers(company_title)")
      .eq("company_id", currentCompanyId);
    if (giderlerRange.from) q = q.gte("receipt_date", giderlerRange.from);
    if (giderlerRange.to) q = q.lte("receipt_date", giderlerRange.to);
    let { data } = await q.order("receipt_date", { ascending: false });

    if (unpaidOnly) {
      data = (data || []).filter((x) => x.payment_status === "odenecek");
    }

    thead.innerHTML = `<tr><th>Gider</th><th>Tedarikçi</th><th>Tarih</th><th>Durum</th><th class="numeric">Tutar</th></tr>`;
    tbody.innerHTML = "";
    (data || []).forEach((x) => {
      const net = Number(x.total_amount) - Number(x.tax_total);
      const amount = kdvHaric ? net : Number(x.total_amount);
      const status = categorizeExpense(x);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.expense_name || "Gider")}</td>
        <td>${escapeHtml(x.suppliers ? x.suppliers.company_title : "")}</td>
        <td>${x.receipt_date || ""}</td>
        <td><span class="status-badge ${status.cls}">${status.label}</span></td>
        <td class="numeric">${amount.toFixed(2)} ${x.currency}</td>
      `;
      tbody.appendChild(tr);
    });

  } else if (giderlerView === "tedarikciler") {
    let q = sb.from("expenses").select("total_amount, tax_total, suppliers(company_title)").eq("company_id", currentCompanyId);
    if (giderlerRange.from) q = q.gte("receipt_date", giderlerRange.from);
    if (giderlerRange.to) q = q.lte("receipt_date", giderlerRange.to);
    const { data } = await q;

    const grouped = {};
    (data || []).forEach((x) => {
      const name = x.suppliers ? x.suppliers.company_title : "(Tedarikçisiz)";
      const net = Number(x.total_amount) - Number(x.tax_total);
      const amount = kdvHaric ? net : Number(x.total_amount);
      grouped[name] = (grouped[name] || 0) + amount;
    });

    thead.innerHTML = `<tr><th>Tedarikçi</th><th class="numeric">Toplam</th></tr>`;
    tbody.innerHTML = "";
    Object.entries(grouped).sort((a, b) => b[1] - a[1]).forEach(([name, total]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td class="numeric">${total.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });

  } else {
    let q = sb.from("expense_lines")
      .select("description, quantity, unit_price, line_total, expenses!inner(receipt_date, company_id)")
      .eq("expenses.company_id", currentCompanyId);
    if (giderlerRange.from) q = q.gte("expenses.receipt_date", giderlerRange.from);
    if (giderlerRange.to) q = q.lte("expenses.receipt_date", giderlerRange.to);
    const { data } = await q;

    const grouped = {};
    (data || []).forEach((line) => {
      const name = line.description || "(Açıklamasız)";
      const amount = kdvHaric ? Number(line.quantity) * Number(line.unit_price) : Number(line.line_total);
      if (!grouped[name]) grouped[name] = { qty: 0, amount: 0 };
      grouped[name].qty += Number(line.quantity);
      grouped[name].amount += amount;
    });

    thead.innerHTML = `<tr><th>Hizmet/Ürün</th><th class="numeric">Miktar</th><th class="numeric">Toplam</th></tr>`;
    tbody.innerHTML = "";
    Object.entries(grouped).sort((a, b) => b[1].amount - a[1].amount).forEach(([name, g]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td class="numeric">${g.qty}</td><td class="numeric">${g.amount.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
  }

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Seçili aralıkta veri yok.</td></tr>`;
  }
}

// ================= GELİR-GİDER =================
let gelirGiderRange = { from: null, to: null };
let gelirGiderBasis = "accrual";

function initGelirGiderTab() {
  initDateRangeFilter("gelirgider-date-range", (range) => {
    gelirGiderRange = range;
    loadGelirGiderReport();
  });

  document.querySelectorAll("#gg-basis-tabs .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#gg-basis-tabs .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      gelirGiderBasis = btn.dataset.basis;
      loadGelirGiderReport();
    });
  });
}

async function loadGelirGiderReport() {
  let invoices, expenses;
  const incomeDateField = gelirGiderBasis === "cash" ? "collected_date" : "issue_date";
  const expenseDateField = gelirGiderBasis === "cash" ? "paid_date" : "receipt_date";

  if (gelirGiderBasis === "cash") {
    let invQ = sb.from("invoices")
      .select(`grand_total, ${incomeDateField}`)
      .eq("company_id", currentCompanyId)
      .eq("collection_status", "tahsil_edildi");
    if (gelirGiderRange.from) invQ = invQ.gte(incomeDateField, gelirGiderRange.from);
    if (gelirGiderRange.to) invQ = invQ.lte(incomeDateField, gelirGiderRange.to);
    ({ data: invoices } = await invQ);

    let expQ = sb.from("expenses")
      .select(`total_amount, ${expenseDateField}`)
      .eq("company_id", currentCompanyId)
      .in("payment_status", ["odendi", "calisan_cebinden_odedi"]);
    if (gelirGiderRange.from) expQ = expQ.gte(expenseDateField, gelirGiderRange.from);
    if (gelirGiderRange.to) expQ = expQ.lte(expenseDateField, gelirGiderRange.to);
    ({ data: expenses } = await expQ);

  } else {
    let invQ = sb.from("invoices").select(`grand_total, ${incomeDateField}`).eq("company_id", currentCompanyId);
    if (gelirGiderRange.from) invQ = invQ.gte(incomeDateField, gelirGiderRange.from);
    if (gelirGiderRange.to) invQ = invQ.lte(incomeDateField, gelirGiderRange.to);
    ({ data: invoices } = await invQ);

    let expQ = sb.from("expenses").select(`total_amount, ${expenseDateField}`).eq("company_id", currentCompanyId);
    if (gelirGiderRange.from) expQ = expQ.gte(expenseDateField, gelirGiderRange.from);
    if (gelirGiderRange.to) expQ = expQ.lte(expenseDateField, gelirGiderRange.to);
    ({ data: expenses } = await expQ);
  }

  const totalIncome = (invoices || []).reduce((s, x) => s + (Number(x.grand_total) || 0), 0);
  const totalExpense = (expenses || []).reduce((s, x) => s + (Number(x.total_amount) || 0), 0);
  const net = totalIncome - totalExpense;

  document.getElementById("gg-income").textContent = totalIncome.toFixed(2);
  document.getElementById("gg-expense").textContent = totalExpense.toFixed(2);
  document.getElementById("gg-net").textContent = net.toFixed(2);

  const netCard = document.getElementById("gg-net-card");
  netCard.classList.toggle("stat-card-primary", net >= 0);
  netCard.classList.toggle("stat-card-fail", net < 0);

  const months = {};
  (invoices || []).forEach((x) => {
    const key = (x[incomeDateField] || "").slice(0, 7);
    if (!key) return;
    if (!months[key]) months[key] = { income: 0, expense: 0 };
    months[key].income += Number(x.grand_total) || 0;
  });
  (expenses || []).forEach((x) => {
    const key = (x[expenseDateField] || "").slice(0, 7);
    if (!key) return;
    if (!months[key]) months[key] = { income: 0, expense: 0 };
    months[key].expense += Number(x.total_amount) || 0;
  });

  const tbody = document.getElementById("gg-monthly-body");
  tbody.innerHTML = "";
  Object.keys(months).sort().forEach((key) => {
    const [y, m] = key.split("-");
    const label = `${TURKISH_MONTHS[parseInt(m, 10) - 1]} ${y}`;
    const row = months[key];
    const rowNet = row.income - row.expense;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td class="numeric">${row.income.toFixed(2)}</td>
      <td class="numeric">${row.expense.toFixed(2)}</td>
      <td class="numeric">${rowNet.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (Object.keys(months).length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Seçili aralıkta veri yok.</td></tr>`;
  }
}

// ================= KDV =================
function initKdvTab() {
  const yearSelect = document.getElementById("kdv-year");
  const currentYear = new Date().getFullYear();
  yearSelect.innerHTML = "";
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.addEventListener("change", () => loadKdvReport(parseInt(yearSelect.value, 10)));
  loadKdvReport(currentYear);
}

async function loadKdvReport(year) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data: invoices } = await sb
    .from("invoices")
    .select("tax_total, issue_date")
    .eq("company_id", currentCompanyId)
    .gte("issue_date", from)
    .lte("issue_date", to);

  const { data: expenses } = await sb
    .from("expenses")
    .select("tax_total, receipt_date")
    .eq("company_id", currentCompanyId)
    .gte("receipt_date", from)
    .lte("receipt_date", to);

  const monthly = Array.from({ length: 12 }, () => ({ hesaplanan: 0, indirilecek: 0 }));

  (invoices || []).forEach((x) => {
    const m = parseInt((x.issue_date || "").slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthly[m].hesaplanan += Number(x.tax_total) || 0;
  });
  (expenses || []).forEach((x) => {
    const m = parseInt((x.receipt_date || "").slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthly[m].indirilecek += Number(x.tax_total) || 0;
  });

  const tbody = document.getElementById("kdv-body");
  tbody.innerHTML = "";
  monthly.forEach((row, i) => {
    const net = row.hesaplanan - row.indirilecek;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${TURKISH_MONTHS[i]}</td>
      <td class="numeric">${row.hesaplanan.toFixed(2)}</td>
      <td class="numeric">${row.indirilecek.toFixed(2)}</td>
      <td class="numeric">${net.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= KASA/BANKA =================
let kbAccounts = [];
let kbRange = { from: null, to: null };

async function initKasaBankaTab() {
  await loadKbAccounts();
  initDateRangeFilter("kasabanka-date-range", (range) => {
    kbRange = range;
    loadKasaBankaReport();
  });
  document.getElementById("kb-account-select").addEventListener("change", loadKasaBankaReport);
}

async function loadKbAccounts() {
  const { data } = await sb
    .from("accounts")
    .select("id, name, account_type, currency, opening_balance")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  kbAccounts = data || [];
  const select = document.getElementById("kb-account-select");
  select.innerHTML = `<option value="">Tüm Hesaplar</option>`;
  kbAccounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.account_type === "banka" ? "Banka" : "Kasa"})`;
    select.appendChild(opt);
  });
}

async function computeAccountBalance(acc) {
  const { data: invoicesIn } = await sb
    .from("invoices")
    .select("grand_total")
    .eq("account_id", acc.id)
    .eq("collection_status", "tahsil_edildi");
  const { data: expensesOut } = await sb
    .from("expenses")
    .select("total_amount")
    .eq("account_id", acc.id)
    .eq("payment_status", "odendi");

  const inSum = (invoicesIn || []).reduce((s, x) => s + Number(x.grand_total), 0);
  const outSum = (expensesOut || []).reduce((s, x) => s + Number(x.total_amount), 0);
  return (Number(acc.opening_balance) || 0) + inSum - outSum;
}

async function computePeriodInOut(accountId, range) {
  let invQ = sb.from("invoices").select("grand_total").eq("company_id", currentCompanyId).eq("collection_status", "tahsil_edildi");
  if (accountId) invQ = invQ.eq("account_id", accountId);
  if (range.from) invQ = invQ.gte("collected_date", range.from);
  if (range.to) invQ = invQ.lte("collected_date", range.to);
  const { data: invoicesIn } = await invQ;

  let expQ = sb.from("expenses").select("total_amount").eq("company_id", currentCompanyId).eq("payment_status", "odendi");
  if (accountId) expQ = expQ.eq("account_id", accountId);
  if (range.from) expQ = expQ.gte("paid_date", range.from);
  if (range.to) expQ = expQ.lte("paid_date", range.to);
  const { data: expensesOut } = await expQ;

  const inAmt = (invoicesIn || []).reduce((s, x) => s + Number(x.grand_total), 0);
  const outAmt = (expensesOut || []).reduce((s, x) => s + Number(x.total_amount), 0);
  return { inAmt, outAmt };
}

async function loadKasaBankaReport() {
  const accountId = document.getElementById("kb-account-select").value;
  const ledgerSection = document.getElementById("kb-ledger-section");
  const tbody = document.getElementById("kb-ledger-body");

  if (!accountId) {
    ledgerSection.classList.add("hidden");

    let totalBalance = 0;
    for (const acc of kbAccounts) {
      totalBalance += await computeAccountBalance(acc);
    }
    document.getElementById("kb-balance").textContent = totalBalance.toFixed(2);

    const { inAmt, outAmt } = await computePeriodInOut(null, kbRange);
    document.getElementById("kb-period-in").textContent = inAmt.toFixed(2);
    document.getElementById("kb-period-out").textContent = outAmt.toFixed(2);
    return;
  }

  const acc = kbAccounts.find((a) => a.id === accountId);
  if (!acc) return;
  ledgerSection.classList.remove("hidden");

  const balance = await computeAccountBalance(acc);
  document.getElementById("kb-balance").textContent = `${balance.toFixed(2)} ${acc.currency}`;

  const { inAmt, outAmt } = await computePeriodInOut(accountId, kbRange);
  document.getElementById("kb-period-in").textContent = `${inAmt.toFixed(2)} ${acc.currency}`;
  document.getElementById("kb-period-out").textContent = `${outAmt.toFixed(2)} ${acc.currency}`;

  const { data: invoicesIn } = await sb
    .from("invoices")
    .select("collected_date, grand_total, invoice_name, invoice_number")
    .eq("account_id", accountId)
    .eq("collection_status", "tahsil_edildi");
  const { data: expensesOut } = await sb
    .from("expenses")
    .select("paid_date, total_amount, expense_name")
    .eq("account_id", accountId)
    .eq("payment_status", "odendi");

  let entries = [];
  (invoicesIn || []).forEach((x) => entries.push({
    date: x.collected_date,
    desc: x.invoice_name || x.invoice_number || "Fatura Tahsilatı",
    amount: Number(x.grand_total),
  }));
  (expensesOut || []).forEach((x) => entries.push({
    date: x.paid_date,
    desc: x.expense_name || "Gider Ödemesi",
    amount: -Number(x.total_amount),
  }));

  entries.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  let running = Number(acc.opening_balance) || 0;
  const rows = entries.map((e) => {
    running += e.amount;
    return { ...e, running };
  });

  const displayRows = rows.filter((r) =>
    (!kbRange.from || r.date >= kbRange.from) && (!kbRange.to || r.date <= kbRange.to)
  );

  tbody.innerHTML = "";
  if (displayRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Seçili aralıkta işlem yok.</td></tr>`;
  }
  displayRows.forEach((r) => {
    const amountLabel = (r.amount >= 0 ? "+" : "") + r.amount.toFixed(2);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date || ""}</td>
      <td>${escapeHtml(r.desc)}</td>
      <td class="numeric">${amountLabel}</td>
      <td class="numeric">${r.running.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= NAKİT AKIŞI =================
async function initNakitAkisiTab() {
  await loadNakitAkisiReport();
}

function renderCashflowChart(weeklyData) {
  const maxAbs = Math.max(1, ...weeklyData.map((w) => Math.abs(w.net)));
  const container = document.getElementById("cashflow-chart");
  container.innerHTML = "";
  weeklyData.forEach((w) => {
    const pct = (Math.abs(w.net) / maxAbs) * 100;
    const barClass = w.net >= 0 ? "cashflow-bar-positive" : "cashflow-bar-negative";
    const row = document.createElement("div");
    row.className = "cashflow-row";
    row.innerHTML = `
      <span class="cashflow-label">${w.label}</span>
      <div class="cashflow-bar-track">
        <div class="cashflow-bar ${barClass}" style="width:${pct}%;"></div>
      </div>
      <span class="cashflow-amount">${w.net >= 0 ? "+" : ""}${w.net.toFixed(2)}</span>
    `;
    container.appendChild(row);
  });
}

async function loadNakitAkisiReport() {
  const { data: accounts } = await sb
    .from("accounts")
    .select("id, opening_balance")
    .eq("company_id", currentCompanyId);

  let totalBalance = 0;
  for (const acc of (accounts || [])) {
    totalBalance += await computeAccountBalance(acc);
  }
  document.getElementById("na-total-balance").textContent = totalBalance.toFixed(2);

  const today = new Date().toISOString().slice(0, 10);

  const { data: uncollected } = await sb
    .from("invoices")
    .select("grand_total, due_date")
    .eq("company_id", currentCompanyId)
    .neq("collection_status", "tahsil_edildi");
  const { data: unpaid } = await sb
    .from("expenses")
    .select("total_amount, due_date")
    .eq("company_id", currentCompanyId)
    .eq("payment_status", "odenecek");

  let overdueIn = 0, overdueOut = 0, unplannedIn = 0, unplannedOut = 0;
  const futureIn = {};
  const futureOut = {};

  (uncollected || []).forEach((x) => {
    const amt = Number(x.grand_total) || 0;
    if (!x.due_date) { unplannedIn += amt; return; }
    if (x.due_date < today) { overdueIn += amt; return; }
    const weekIdx = Math.floor((new Date(x.due_date) - new Date(today)) / (7 * 86400000));
    if (weekIdx >= 0 && weekIdx < 12) futureIn[weekIdx] = (futureIn[weekIdx] || 0) + amt;
  });

  (unpaid || []).forEach((x) => {
    const amt = Number(x.total_amount) || 0;
    if (!x.due_date) { unplannedOut += amt; return; }
    if (x.due_date < today) { overdueOut += amt; return; }
    const weekIdx = Math.floor((new Date(x.due_date) - new Date(today)) / (7 * 86400000));
    if (weekIdx >= 0 && weekIdx < 12) futureOut[weekIdx] = (futureOut[weekIdx] || 0) + amt;
  });

  document.getElementById("na-overdue-in").textContent = overdueIn.toFixed(2);
  document.getElementById("na-overdue-out").textContent = overdueOut.toFixed(2);
  document.getElementById("na-unplanned-in").textContent = unplannedIn.toFixed(2);
  document.getElementById("na-unplanned-out").textContent = unplannedOut.toFixed(2);

  const weeklyData = [];
  let cumulative = totalBalance;
  for (let i = 0; i < 12; i++) {
    const net = (futureIn[i] || 0) - (futureOut[i] || 0);
    cumulative += net;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + i * 7);
    weeklyData.push({
      label: `Hafta ${i + 1} (${startDate.toISOString().slice(5, 10)})`,
      net,
      projected: cumulative,
    });
  }

  renderCashflowChart(weeklyData);

  const tbody = document.getElementById("na-weekly-body");
  tbody.innerHTML = "";
  weeklyData.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.label}</td>
      <td class="numeric">${w.net >= 0 ? "+" : ""}${w.net.toFixed(2)}</td>
      <td class="numeric">${w.projected.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---- LOGOUT + START ---------------------------------------------------------
document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

init();

