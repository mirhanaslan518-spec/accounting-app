// =========================================================
// shared.js
// Loaded on EVERY page, before app.js / customers.js / etc.
// Holds the one Supabase connection and a couple of helper
// functions so we don't repeat this code on every new page.
// =========================================================

// ---- 1. CONNECT TO SUPABASE --------------------------------------------
// Use the SAME values you already put in app.js during Sprint 0.
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2. PROTECT A PAGE -------------------------------------------------
// Call this at the top of any page that should NOT be visible unless
// the person is logged in. If there's no session, it sends them back
// to the home page and returns null. Not used on index.html itself,
// since that page needs to show its own login form instead.
async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// ---- 3. FIND THE LOGGED-IN USER'S COMPANY ------------------------------
// Returns { id, name } for the company this user belongs to,
// or null if they aren't linked to one yet.
async function getMyCompany(userId) {
  const { data, error } = await sb
    .from("company_users")
    .select("company_id, companies(name)")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return { id: data.company_id, name: data.companies.name };
}
