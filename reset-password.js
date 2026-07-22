// =========================================================
// reset-password.js — logic for reset-password.html
// Relies on shared.js being loaded first (sb).
// Does NOT use requireSession() — a normal login session isn't
// what gets us here; Supabase creates a special short-lived
// "recovery" session automatically when the emailed link is
// opened, and that's what authorizes the password update below.
// =========================================================

const form = document.getElementById("reset-form");
const errorEl = document.getElementById("reset-error");
const successEl = document.getElementById("reset-success");

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    errorEl.textContent = "Geçersiz veya süresi dolmuş bağlantı. Lütfen giriş sayfasından şifre sıfırlama isteğini tekrar gönderin.";
    form.classList.add("hidden");
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  successEl.textContent = "";

  const pw1 = document.getElementById("new-password").value;
  const pw2 = document.getElementById("confirm-password").value;

  if (pw1.length < 8) {
    errorEl.textContent = "Şifre en az 8 karakter olmalıdır.";
    return;
  }
  if (pw1 !== pw2) {
    errorEl.textContent = "Şifreler eşleşmiyor.";
    return;
  }

  const { error } = await sb.auth.updateUser({ password: pw1 });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  successEl.textContent = "Şifreniz güncellendi. Giriş sayfasına yönlendiriliyorsunuz...";
  form.classList.add("hidden");
  setTimeout(() => { window.location.href = "index.html"; }, 2000);
});

init();
