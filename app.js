// =========================================================
// app.js — logic for the Home / login page (index.html)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany, categorizeInvoice).
// =========================================================

const loginWrapper = document.getElementById("login-wrapper");
const appSection = document.getElementById("app-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const companyNameEl = document.getElementById("company-name");
const logoutBtn = document.getElementById("logout-btn");

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp(session);
  } else {
    showLogin();
  }
}

function showLogin() {
  loginWrapper.classList.remove("hidden");
  appSection.classList.add("hidden");
}

async function showApp(session) {
  loginWrapper.classList.add("hidden");
  appSection.classList.remove("hidden");
  userEmailEl.textContent = session.user.email;

  const company = await getMyCompany(session.user.id);
  companyNameEl.textContent = company ? company.name : "Bağlı bir şirket yok";

  if (company) {
    await loadDashboard(company.id);
  }
}

// ---- DASHBOARD: Toplam Tahsil Edilecek / Vadesi Gelecek / Gecikmiş / Planlanmamış ----
// Note: this adds amounts across all invoices regardless of currency. If you start
// billing in more than one currency, these totals will mix them together — worth
// splitting by currency at that point, but not needed yet at your current scale.
async function loadDashboard(companyId) {
  const { data: invoices, error } = await sb
    .from("invoices")
    .select("grand_total, due_date, collection_status")
    .eq("company_id", companyId);

  if (error || !invoices) return;

  let totalReceivable = 0;
  let upcoming = 0;
  let overdue = 0;
  let unplanned = 0;

  invoices.forEach((inv) => {
    const status = categorizeInvoice(inv);
    if (status.key === "tahsil_edildi") return; // already collected, not part of receivables

    const amount = Number(inv.grand_total) || 0;
    totalReceivable += amount;

    if (status.key === "gecikmis") overdue += amount;
    else if (status.key === "planlanmamis") unplanned += amount;
    else upcoming += amount;
  });

  document.getElementById("stat-total").textContent = totalReceivable.toFixed(2);
  document.getElementById("stat-upcoming").textContent = upcoming.toFixed(2);
  document.getElementById("stat-overdue").textContent = overdue.toFixed(2);
  document.getElementById("stat-unplanned").textContent = unplanned.toFixed(2);
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

checkSession();
