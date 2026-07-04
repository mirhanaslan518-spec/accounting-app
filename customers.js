// =========================================================
// customers.js — logic for customers.html
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;
let allCustomers = [];
let editingId = null; // null = adding a new customer, otherwise = id being edited

// Every field in the form, matched to a column in the "customers" table.
const FIELDS = [
  "customer_type", "company_title", "short_name", "tax_id", "tax_office", "category",
  "email", "phone", "fax", "address", "postal_code", "district", "city",
  "iban", "price_list", "currency", "opening_balance",
  "contact_name", "contact_email", "contact_phone", "notes"
];

const listEl = document.getElementById("customer-list");
const searchInput = document.getElementById("search-input");
const newBtn = document.getElementById("new-customer-btn");
const overlay = document.getElementById("customer-form-overlay");
const form = document.getElementById("customer-form");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");
const cancelBtn = document.getElementById("cancel-btn");
const logoutBtn = document.getElementById("logout-btn");

// ---- STARTUP -------------------------------------------------------------
async function init() {
  const session = await requireSession(); // sends user to index.html if not logged in
  if (!session) return;

  const company = await getMyCompany(session.user.id);
  if (!company) {
    listEl.innerHTML = `<p class="empty-state">Bu kullanıcıya bağlı bir şirket bulunamadı.</p>`;
    return;
  }
  currentCompanyId = company.id;
  await loadCustomers();
}

// ---- LOAD + RENDER THE LIST ----------------------------------------------
async function loadCustomers() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("customers")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("company_title", { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allCustomers = data;
  renderList(allCustomers);
}

function renderList(customers) {
  if (customers.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz müşteri eklenmedi.</p>`;
    return;
  }

  listEl.innerHTML = "";
  customers.forEach((c) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(c.company_title)}</strong>
        <span class="customer-card-sub">${escapeHtml(c.short_name || c.tax_id || "")}</span>
      </div>
      <div class="customer-card-actions">
        <button class="edit-btn" data-id="${c.id}">Düzenle</button>
        <button class="delete-btn" data-id="${c.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteCustomer(btn.dataset.id));
  });
}

// Prevents customer-entered text from being read as HTML (basic safety).
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- FORM: OPEN / CLOSE ---------------------------------------------------
function openForNew() {
  editingId = null;
  formTitle.textContent = "Yeni Müşteri";
  formError.textContent = "";
  form.reset();
  overlay.classList.remove("hidden");
}

function openForEdit(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c) return;

  editingId = id;
  formTitle.textContent = "Müşteriyi Düzenle";
  formError.textContent = "";
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = c[f] ?? "";
  });
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DELETE ---------------------------------------------------------------
async function deleteCustomer(id) {
  const c = allCustomers.find((x) => x.id === id);
  const confirmed = confirm(`"${c ? c.company_title : "bu müşteri"}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("customers").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadCustomers();
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
    result = await sb.from("customers").update(payload).eq("id", editingId);
  } else {
    payload.company_id = currentCompanyId;
    result = await sb.from("customers").insert(payload);
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadCustomers();
});

// ---- SEARCH (filters the already-loaded list, no extra database call) ----
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderList(allCustomers);
    return;
  }
  const filtered = allCustomers.filter((c) =>
    (c.company_title || "").toLowerCase().includes(q) ||
    (c.short_name || "").toLowerCase().includes(q) ||
    (c.tax_id || "").toLowerCase().includes(q)
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
