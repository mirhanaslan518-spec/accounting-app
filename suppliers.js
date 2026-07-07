// =========================================================
// suppliers.js — logic for suppliers.html
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;
let allSuppliers = [];
let editingId = null;

const FIELDS = [
  "supplier_type", "company_title", "short_name", "tax_id", "tax_office",
  "category", "email", "phone", "address", "iban", "notes"
];

const listEl = document.getElementById("supplier-list");
const searchInput = document.getElementById("search-input");
const newBtn = document.getElementById("new-supplier-btn");
const overlay = document.getElementById("supplier-form-overlay");
const form = document.getElementById("supplier-form");
const formTitle = document.getElementById("supplier-form-title");
const formError = document.getElementById("supplier-form-error");
const cancelBtn = document.getElementById("supplier-cancel-btn");
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
  await loadSuppliers();
}

// ---- LOAD + RENDER ----------------------------------------------------------
async function loadSuppliers() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("suppliers")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("company_title", { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allSuppliers = data;
  renderList(allSuppliers);
}

function renderList(suppliers) {
  if (suppliers.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz tedarikçi eklenmedi.</p>`;
    return;
  }

  listEl.innerHTML = "";
  suppliers.forEach((s) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(s.company_title)}</strong>
        <span class="customer-card-sub">${escapeHtml(s.short_name || s.tax_id || "")}</span>
      </div>
      <div class="customer-card-actions">
        <button class="edit-btn" data-id="${s.id}">Düzenle</button>
        <button class="delete-btn" data-id="${s.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteSupplier(btn.dataset.id));
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
  formTitle.textContent = "Yeni Tedarikçi";
  formError.textContent = "";
  form.reset();
  overlay.classList.remove("hidden");
}

function openForEdit(id) {
  const s = allSuppliers.find((x) => x.id === id);
  if (!s) return;

  editingId = id;
  formTitle.textContent = "Tedarikçiyi Düzenle";
  formError.textContent = "";
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = s[f] ?? "";
  });
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DELETE ---------------------------------------------------------------
async function deleteSupplier(id) {
  const s = allSuppliers.find((x) => x.id === id);
  const confirmed = confirm(`"${s ? s.company_title : "bu tedarikçi"}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("suppliers").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadSuppliers();
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

  if (!payload.company_title) {
    formError.textContent = "Firma Unvanı zorunludur.";
    return;
  }

  let result;
  if (editingId) {
    result = await sb.from("suppliers").update(payload).eq("id", editingId);
  } else {
    payload.company_id = currentCompanyId;
    result = await sb.from("suppliers").insert(payload);
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadSuppliers();
});

// ---- SEARCH -----------------------------------------------------------------
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderList(allSuppliers);
    return;
  }
  const filtered = allSuppliers.filter((s) =>
    (s.company_title || "").toLowerCase().includes(q) ||
    (s.short_name || "").toLowerCase().includes(q) ||
    (s.tax_id || "").toLowerCase().includes(q)
  );
  renderList(filtered);
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
