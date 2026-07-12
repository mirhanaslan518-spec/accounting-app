// =========================================================
// settings.js — logic for settings.html (Firma Bilgileri)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;

const FIELDS = [
  "name", "ticari_unvan", "sektor", "adres", "ilce", "il",
  "telefon", "faks", "vergi_dairesi", "vergi_no", "mersis_no", "ticaret_sicil_no"
];

async function init() {
  const session = await requireSession();
  if (!session) return;

  const company = await getMyCompany(session.user.id);
  if (!company) {
    document.querySelector(".container").innerHTML =
      `<p class="empty-state">Bu kullanıcıya bağlı bir şirket bulunamadı.</p>`;
    return;
  }
  currentCompanyId = company.id;
  await loadCompanyInfo();
}

async function loadCompanyInfo() {
  const { data, error } = await sb.from("companies").select("*").eq("id", currentCompanyId).single();
  if (error || !data) {
    document.getElementById("settings-error").textContent = "Şirket bilgileri yüklenemedi.";
    return;
  }
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = data[f] ?? "";
  });
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("settings-error");
  const successEl = document.getElementById("settings-success");
  errorEl.textContent = "";
  successEl.textContent = "";

  const payload = {};
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (!el) return;
    payload[f] = el.value === "" ? null : el.value;
  });

  if (!payload.name) {
    errorEl.textContent = "Firma Adı zorunludur.";
    return;
  }

  const { error } = await sb.from("companies").update(payload).eq("id", currentCompanyId);
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  successEl.textContent = "Kaydedildi.";
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

init();
