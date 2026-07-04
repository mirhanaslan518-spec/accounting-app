// =========================================================
// 1. CONNECT TO SUPABASE
// Replace the two values below with the ones from YOUR OWN
// Supabase project (Settings -> API in the dashboard).
//
// The "anon" key below is SAFE to leave in this file and
// commit to GitHub — it is a public key, and it is designed
// to be visible in the browser. Real security comes from the
// Row Level Security policies in schema.sql, not from hiding
// this key.
// =========================================================
const SUPABASE_URL = "https://pwadtzdtdgfinbzigtis.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_JlunJBttQl8sdvcPyQM8vA_2EtDz5GS";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================
// 2. GRAB THE PAGE ELEMENTS WE NEED TO CONTROL
// =========================================================
const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const companyNameEl = document.getElementById("company-name");
const logoutBtn = document.getElementById("logout-btn");
const runTestBtn = document.getElementById("run-test-btn");
const logEl = document.getElementById("log");

// =========================================================
// 3. LOG HELPER
// Prints one line into the on-screen black log box, like a
// tiny terminal, so you can see each step of the test happen.
// =========================================================
function log(message, status = "pending") {
  const line = document.createElement("div");
  line.className = `log-line log-${status}`;
  const icon = status === "ok" ? "OK  " : status === "fail" ? "FAIL" : "... ";
  line.textContent = `[${icon}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// =========================================================
// 4. SHOW LOGIN SCREEN OR APP SCREEN DEPENDING ON SESSION
// =========================================================
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp(session);
  } else {
    showLogin();
  }
}

function showLogin() {
  loginSection.classList.remove("hidden");
  appSection.classList.add("hidden");
}

async function showApp(session) {
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  userEmailEl.textContent = session.user.email;

  // Find which company this logged-in user belongs to.
  const { data, error } = await sb
    .from("company_users")
    .select("company_id, companies(name)")
    .eq("user_id", session.user.id)
    .single();

  if (error || !data) {
    companyNameEl.textContent = "No company linked yet — see Sprint 0 instructions, step 8";
  } else {
    companyNameEl.textContent = data.companies.name;
    companyNameEl.dataset.companyId = data.company_id;
  }
}

// =========================================================
// 5. LOGIN FORM SUBMIT
// =========================================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = error.message;
    return;
  }
  showApp(data.session);
});

// =========================================================
// 6. LOGOUT
// =========================================================
logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
});

// =========================================================
// 7. THE ACTUAL ROUND-TRIP TEST
// This proves: login works, RLS works, and company_id
// scoping works — i.e. Sprint 0 is genuinely done.
// =========================================================
runTestBtn.addEventListener("click", async () => {
  logEl.innerHTML = "";
  const companyId = companyNameEl.dataset.companyId;

  if (!companyId) {
    log("No company_id found for this user — link a company first", "fail");
    return;
  }

  log("Connecting to Supabase...", "pending");

  // a) write a test customer row
  const testName = `Test Customer ${new Date().toLocaleTimeString()}`;
  const { data: inserted, error: insertError } = await sb
    .from("customers")
    .insert({ company_id: companyId, company_title: testName })
    .select()
    .single();

  if (insertError) {
    log(`Write failed: ${insertError.message}`, "fail");
    return;
  }
  log(`Wrote row: "${inserted.company_title}"`, "ok");

  // b) read it back
  const { data: rows, error: readError } = await sb
    .from("customers")
    .select("company_title, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (readError) {
    log(`Read failed: ${readError.message}`, "fail");
    return;
  }
  log(`Read back ${rows.length} row(s) for your company`, "ok");
  rows.forEach((r) => log(`  - ${r.company_title}`, "ok"));

  log("Round trip complete. Sprint 0 is working.", "ok");
});

// =========================================================
// 8. START
// =========================================================
checkSession();
