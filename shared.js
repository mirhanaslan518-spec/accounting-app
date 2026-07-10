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
// Tahsil Edildi / Gecikmiş / Planlanmamış / Tahsil Edilecek.
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
// Mirrors categorizeInvoice for the Ödemeler side. Both "Ödendi" and
// "Çalışan Cebinden Ödedi" count as settled (money has already left the
// business either way) and are excluded from outstanding totals — they
// just get different labels/colors so you can tell them apart in the list.
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
