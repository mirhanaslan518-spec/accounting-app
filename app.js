// =========================================================
// app.js — logic for the Home / login page (index.html)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany, categorizeInvoice, categorizeExpense).
// =========================================================

const loginWrapper = document.getElementById("login-wrapper");
const appSection = document.getElementById("app-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const companyNameEl = document.getElementById("company-name");
const logoutBtn = document.getElementById("logout-btn");

const forgotLink = document.getElementById("forgot-password-link");
const forgotForm = document.getElementById("forgot-password-form");
const forgotError = document.getElementById("forgot-error");
const forgotSuccess = document.getElementById("forgot-success");

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

// ---- DASHBOARD: Tahsilatlar + Ödemeler ------------------------------------------
async function loadDashboard(companyId) {
  await loadReceivables(companyId);
  await loadPayables(companyId);
}

async function loadReceivables(companyId) {
  const { data: invoices, error } = await sb
    .from("invoices")
    .select("grand_total, due_date, collection_status")
    .eq("company_id", companyId);

  if (error || !invoices) return;

  let totalReceivable = 0, upcoming = 0, overdue = 0, unplanned = 0;

  invoices.forEach((inv) => {
    const status = categorizeInvoice(inv);
    if (status.key === "tahsil_edildi") return;

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

async function loadPayables(companyId) {
  const { data: expenses, error } = await sb
    .from("expenses")
    .select("total_amount, due_date, payment_status")
    .eq("company_id", companyId);

  if (error || !expenses) return;

  let totalPayable = 0, upcoming = 0, overdue = 0, unplanned = 0;

  expenses.forEach((x) => {
    const status = categorizeExpense(x);
    if (status.key === "odendi") return;

    const amount = Number(x.total_amount) || 0;
    totalPayable += amount;

    if (status.key === "gecikmis") overdue += amount;
    else if (status.key === "planlanmamis") unplanned += amount;
    else upcoming += amount;
  });

  document.getElementById("pay-stat-total").textContent = totalPayable.toFixed(2);
  document.getElementById("pay-stat-upcoming").textContent = upcoming.toFixed(2);
  document.getElementById("pay-stat-overdue").textContent = overdue.toFixed(2);
  document.getElementById("pay-stat-unplanned").textContent = unplanned.toFixed(2);
}

// ---- LOGIN ------------------------------------------------------------------
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

// ---- FORGOT PASSWORD ----------------------------------------------------------
forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  forgotForm.classList.toggle("hidden");
});

forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  forgotError.textContent = "";
  forgotSuccess.textContent = "";

  const email = document.getElementById("forgot-email").value;
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });

  if (error) {
    forgotError.textContent = error.message;
    return;
  }
  forgotSuccess.textContent = "E-postanıza bir sıfırlama bağlantısı gönderildi.";
});

checkSession();
