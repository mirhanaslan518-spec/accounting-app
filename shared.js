// =========================================================
// shared.js
// Loaded on EVERY page, before app.js / customers.js / etc.
// Holds the one Supabase connection and helper functions reused
// across pages.
// =========================================================

// ---- 1. CONNECT TO SUPABASE --------------------------------------------
const SUPABASE_URL = "https://pwadtzdtdgfinbzigtis.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JlunJBttQl8sdvcPyQM8vA_2EtDz5GS";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2. PROTECT A PAGE -------------------------------------------------
async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// ---- 3. FIND THE LOGGED-IN USER'S COMPANY ------------------------------
async function getMyCompany(userId) {
  const { data, error } = await sb
    .from("company_users")
    .select("company_id, companies(name)")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return { id: data.company_id, name: data.companies.name };
}

// ---- 4. CATEGORIZE AN INVOICE ------------------------------------------
function categorizeInvoice(inv) {
  if (inv.collection_status === "tahsil_edildi") {
    return { key: "tahsil_edildi", label: "Tahsil Edildi", cls: "status-ok" };
  }
  if (!inv.due_date) {
    return { key: "planlanmamis", label: "Planlanmamış", cls: "status-neutral" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (inv.due_date < today) {
    return { key: "gecikmis", label: "Gecikmiş", cls: "status-fail" };
  }
  return { key: "tahsil_edilecek", label: "Tahsil Edilecek", cls: "status-pending" };
}

// ---- 5. CATEGORIZE AN EXPENSE -------------------------------------------
function categorizeExpense(x) {
  if (x.payment_status === "odendi") {
    return { key: "odendi", label: "Ödendi", cls: "status-ok" };
  }
  if (x.payment_status === "calisan_cebinden_odedi") {
    return { key: "odendi", label: "Çalışan Cebinden Ödedi", cls: "status-neutral" };
  }
  if (!x.due_date) {
    return { key: "planlanmamis", label: "Planlanmamış", cls: "status-neutral" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (x.due_date < today) {
    return { key: "gecikmis", label: "Gecikmiş", cls: "status-fail" };
  }
  return { key: "odenecek", label: "Ödenecek", cls: "status-pending" };
}

// ---- 6. DATE RANGE PRESETS (used by every report) ------------------------
function getDateRangeForPreset(preset) {
  const toStr = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);

  switch (preset) {
    case "this_month":
      return { from: toStr(new Date(y, m, 1)), to: toStr(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: toStr(new Date(y, m - 1, 1)), to: toStr(new Date(y, m, 0)) };
    case "this_quarter":
      return { from: toStr(new Date(y, q * 3, 1)), to: toStr(new Date(y, q * 3 + 3, 0)) };
    case "last_quarter":
      return { from: toStr(new Date(y, q * 3 - 3, 1)), to: toStr(new Date(y, q * 3, 0)) };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return { from: null, to: null };
  }
}

// ---- 7. DATE RANGE WIDGET ------------------------------------------------
function initDateRangeFilter(widgetId, onChange) {
  const widget = document.getElementById(widgetId);
  const buttons = widget.querySelectorAll(".filter-btn");
  const customRow = widget.querySelector(".custom-date-range");
  const customFrom = widget.querySelector(".custom-from");
  const customTo = widget.querySelector(".custom-to");
  const customApply = widget.querySelector(".custom-apply");

  function selectPreset(preset) {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.range === preset));
    if (preset === "custom") {
      customRow.classList.remove("hidden");
      return;
    }
    customRow.classList.add("hidden");
    onChange(getDateRangeForPreset(preset));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => selectPreset(btn.dataset.range));
  });

  customApply.addEventListener("click", () => {
    onChange({ from: customFrom.value || null, to: customTo.value || null });
  });

  selectPreset("this_month");
}

// ---- 8. ACCOUNT BALANCE --------------------------------------------------
// Opening balance + every collected invoice for that account − every paid
// expense for that account. Used by both the Kasa/Banka report and the
// Nakit Akışı projection (both home page and Raporlar), so it only needs
// to be correct in one place.
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

// ---- 9. 12-WEEK CASH FLOW PROJECTION -------------------------------------
// Returns everything both the home-page preview and the full Nakit Akışı
// report need: current total balance, overdue/unplanned totals on both
// sides, and a 12-week array of {label, shortLabel, net, projected}.
async function computeCashFlowProjection(companyId) {
  const { data: accounts } = await sb
    .from("accounts")
    .select("id, opening_balance")
    .eq("company_id", companyId);

  let totalBalance = 0;
  for (const acc of (accounts || [])) {
    totalBalance += await computeAccountBalance(acc);
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: uncollected } = await sb
    .from("invoices")
    .select("grand_total, due_date")
    .eq("company_id", companyId)
    .neq("collection_status", "tahsil_edildi");
  const { data: unpaid } = await sb
    .from("expenses")
    .select("total_amount, due_date")
    .eq("company_id", companyId)
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

  const weeklyData = [];
  let cumulative = totalBalance;
  for (let i = 0; i < 12; i++) {
    const net = (futureIn[i] || 0) - (futureOut[i] || 0);
    cumulative += net;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + i * 7);
    weeklyData.push({
      label: `Hafta ${i + 1} (${startDate.toISOString().slice(5, 10)})`,
      shortLabel: `H${i + 1}`,
      net,
      projected: cumulative,
    });
  }

  return { totalBalance, overdueIn, overdueOut, unplannedIn, unplannedOut, weeklyData };
}

// ---- 10. CASH FLOW BAR CHART ---------------------------------------------
// useShortLabel: true on the compact home-page preview ("H1", "H2"...),
// false on the full Raporlar page ("Hafta 1 (07-28)"...).
function renderCashflowChart(weeklyData, containerId, useShortLabel) {
  const maxAbs = Math.max(1, ...weeklyData.map((w) => Math.abs(w.net)));
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  weeklyData.forEach((w) => {
    const pct = (Math.abs(w.net) / maxAbs) * 100;
    const barClass = w.net >= 0 ? "cashflow-bar-positive" : "cashflow-bar-negative";
    const label = useShortLabel ? w.shortLabel : w.label;
    const row = document.createElement("div");
    row.className = "cashflow-row";
    row.innerHTML = `
      <span class="cashflow-label">${label}</span>
      <div class="cashflow-bar-track">
        <div class="cashflow-bar ${barClass}" style="width:${pct}%;"></div>
      </div>
      <span class="cashflow-amount">${w.net >= 0 ? "+" : ""}${w.net.toFixed(2)}</span>
    `;
    container.appendChild(row);
  });
}
