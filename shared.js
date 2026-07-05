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
// Mirrors the Tahsilatlar categories from the original paraşüt layout:
// Tahsil Edildi (already paid), Gecikmiş (overdue), Planlanmamış (no due
// date set yet), or Tahsil Edilecek (upcoming, normal). Used by both the
// invoices list and the home dashboard, so it only needs to be written once.
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
