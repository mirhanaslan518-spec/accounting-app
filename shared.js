// =========================================================
// shared.js
// Loaded on EVERY page, before app.js / customers.js / etc.
// Holds the one Supabase connection and a couple of helper
// functions so we don't repeat this code on every new page.
// =========================================================

// ---- 1. CONNECT TO SUPABASE --------------------------------------------
// Use the SAME values you already put in app.js during Sprint 0.
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
// Returns { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } for a named preset.
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
// Wires up a preset-buttons-plus-custom-dates block. Expects this structure
// inside the element with id = widgetId:
//   .filter-btn[data-range="..."]  (one of the presets above, or "custom")
//   .custom-date-range             (wrapper, hidden by default)
//     .custom-from / .custom-to    (date inputs)
//     .custom-apply                (button)
// Calls onChange({from, to}) whenever the selection changes, and once
// immediately with "this_month" so every report has a sensible default.
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

