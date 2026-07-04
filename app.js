// =========================================================
// app.js — logic for the Home / login page (index.html)
// Relies on shared.js being loaded first (see index.html),
// which provides: sb, requireSession(), getMyCompany()
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

function log(message, status = "pending") {
  const line = document.createElement("div");
  line.className = `log-line log-${status}`;
  const icon = status === "ok" ? "OK  " : status === "fail" ? "FAIL" : "... ";
  line.textContent = `[${icon}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

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

  const company = await getMyCompany(session.user.id);
  if (!company) {
    companyNameEl.textContent = "No company linked yet — see Sprint 0 instructions, step 8";
  } else {
    companyNameEl.textContent = company.name;
    companyNameEl.dataset.companyId = company.id;
  }
}

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

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
});

runTestBtn.addEventListener("click", async () => {
  logEl.innerHTML = "";
  const companyId = companyNameEl.dataset.companyId;

  if (!companyId) {
    log("No company_id found for this user — link a company first", "fail");
    return;
  }

  log("Connecting to Supabase...", "pending");

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

checkSession();
