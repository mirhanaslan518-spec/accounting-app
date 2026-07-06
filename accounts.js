// =========================================================
// accounts.js — logic for accounts.html (Kasa ve Bankalar)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;
let allAccounts = [];
let editingId = null;

const FIELDS = ["name", "account_type", "currency", "opening_balance"];

const listEl = document.getElementById("account-list");
const newBtn = document.getElementById("new-account-btn");
const overlay = document.getElementById("account-form-overlay");
const form = document.getElementById("account-form");
const formTitle = document.getElementById("account-form-title");
const formError = document.getElementById("account-form-error");
const cancelBtn = document.getElementById("account-cancel-btn");
const logoutBtn = document.getElementById("logout-btn");

// ---- STARTUP --------------------------------------------------------------
async function init() {
  const session = await requireSession();
  if (!session) return;

  const company = await getMyCompany(session.user.id);
  if (!company) {
    listEl.innerHTML = `<p class="empty-state">Bu kullanıcıya bağlı bir şirket bulunamadı.</p>`;
    return;
  }
  currentCompanyId = company.id;
  await loadAccounts();
}

// ---- LOAD + RENDER ----------------------------------------------------------
async function loadAccounts() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("accounts")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allAccounts = data;
  renderList(allAccounts);
}

function renderList(accounts) {
  if (accounts.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz kasa/banka hesabı eklenmedi.</p>`;
    return;
  }

  listEl.innerHTML = "";
  accounts.forEach((a) => {
    const typeLabel = a.account_type === "banka" ? "Banka" : "Kasa";
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(a.name)}</strong>
        <span class="customer-card-sub">${typeLabel} · ${escapeHtml(a.currency)} · Açılış: ${Number(a.opening_balance).toFixed(2)}</span>
      </div>
      <div class="customer-card-actions">
        <button class="edit-btn" data-id="${a.id}">Düzenle</button>
        <button class="delete-btn" data-id="${a.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteAccount(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- FORM: OPEN / CLOSE -------------------------------------------------------
function openForNew() {
  editingId = null;
  formTitle.textContent = "Yeni Hesap";
  formError.textContent = "";
  form.reset();
  document.getElementById("account_type").value = "kasa";
  document.getElementById("currency").value = "TRY";
  document.getElementById("opening_balance").value = 0;
  overlay.classList.remove("hidden");
}

function openForEdit(id) {
  const a = allAccounts.find((x) => x.id === id);
  if (!a) return;

  editingId = id;
  formTitle.textContent = "Hesabı Düzenle";
  formError.textContent = "";
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = a[f] ?? "";
  });
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DELETE ---------------------------------------------------------------
async function deleteAccount(id) {
  const a = allAccounts.find((x) => x.id === id);
  const confirmed = confirm(`"${a ? a.name : "bu hesap"}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("accounts").delete().eq("id", id);
  if (error) {
    // If any invoice has recorded a payment against this account, the
    // database will refuse to delete it rather than orphan that record.
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadAccounts();
}

// ---- SAVE (INSERT OR UPDATE) ----------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const payload = {};
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (!el) return;
    payload[f] = el.value === "" ? null : el.value;
  });

  if (!payload.name) {
    formError.textContent = "Hesap Adı zorunludur.";
    return;
  }

  let result;
  if (editingId) {
    result = await sb.from("accounts").update(payload).eq("id", editingId);
  } else {
    payload.company_id = currentCompanyId;
    result = await sb.from("accounts").insert(payload);
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadAccounts();
});

// ---- BUTTONS ---------------------------------------------------------------
newBtn.addEventListener("click", openForNew);
cancelBtn.addEventListener("click", closeForm);

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

// ---- START -----------------------------------------------------------------
init();
