// =========================================================
// app.js — logic for the Home / login page (index.html)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
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
