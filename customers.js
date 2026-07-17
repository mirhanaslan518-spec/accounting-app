// =========================================================
// customers.js — logic for customers.html
// Relies on shared.js (sb, requireSession, getMyCompany) and
// csv-tools.js (exportToExcel, setupImportButton).
// =========================================================

let currentCompanyId = null;
let allCustomers = [];
let editingId = null;

const FIELDS = [
  "customer_type", "company_title", "short_name", "tax_id", "tax_office", "category",
  "email", "phone", "fax", "address", "postal_code", "district", "city",
  "iban", "price_list", "currency", "opening_balance",
  "contact_name", "contact_email", "contact_phone", "notes"
];

// Shared shape for export columns and their human-readable Turkish headers —
// import uses the same headers in reverse, so exporting then re-importing
// a file works cleanly without a separate mapping step.
const EXPORT_COLUMNS = [
  { key: "customer_type", header: "Tür", format: (v) => (v === "gercek" ? "Gerçek Kişi" : "Tüzel Kişi") },
  { key: "company_title", header: "Firma Unvanı" },
  { key: "short_name", header: "Kısa İsim" },
  { key: "tax_id", header: "VKN/TCKN" },
  { key: "tax_office", header: "Vergi Dairesi" },
  { key: "category", header: "Kategori" },
  { key: "email", header: "E-posta" },
  { key: "phone", header: "Telefon" },
  { key: "fax", header: "Faks" },
  { key: "address", header: "Açık Adres" },
  { key: "postal_code", header: "Posta Kodu" },
  { key: "district", header: "İlçe" },
  { key: "city", header: "İl" },
  { key: "iban", header: "IBAN" },
  { key: "price_list", header: "Fiyat Listesi" },
  { key: "currency", header: "Döviz" },
  { key: "opening_balance", header: "Açılış Bakiyesi" },
  { key: "contact_name", header: "Yetkili Adı" },
  { key: "contact_email", header: "Yetkili E-posta" },
  { key: "contact_phone", header: "Yetkili Telefon" },
  { key: "notes", header: "Notlar" },
];

function mapImportRowToCustomer(row) {
  const tur = (row["Tür"] || "").toString().trim();
  return {
    customer_type: tur === "Gerçek Kişi" ? "gercek" : "tuzel",
    company_title: (row["Firma Unvanı"] || "").toString().trim(),
    short_name: row["Kısa İsim"] || null,
    tax_id: row["VKN/TCKN"] || null,
    tax_office: row["Vergi Dairesi"] || null,
    category: row["Kategori"] || null,
    email: row["E-posta"] || null,
    phone: row["Telefon"] || null,
    fax: row["Faks"] || null,
    address: row["Açık Adres"] || null,
    postal_code: row["Posta Kodu"] || null,
    district: row["İlçe"] || null,
    city: row["İl"] || null,
    iban: row["IBAN"] || null,
    price_list: row["Fiyat Listesi"] || null,
    currency: row["Döviz"] || "TRY",
    opening_balance: row["Açılış Bakiyesi"] || 0,
    contact_name: row["Yetkili Adı"] || null,
    contact_email: row["Yetkili E-posta"] || null,
    contact_phone: row["Yetkili Telefon"] || null,
    notes: row["Notlar"] || null,
  };
}

const listEl = document.getElementById("customer-list");
const searchInput = document.getElementById("search-input");
const newBtn = document.getElementById("new-customer-btn");
const overlay = document.getElementById("customer-form-overlay");
const form = document.getElementById("customer-form");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");
const cancelBtn = document.getElementById("cancel-btn");
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
  await loadCustomers();

  setupImportButton("import-btn", "import-file-input", handleImportRows);
}

// ---- LOAD + RENDER ----------------------------------------------------------
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- EXPORT / IMPORT ---------------------------------------------------------
document.getElementById("export-btn").addEventListener("click", () => {
  exportToExcel(allCustomers, EXPORT_COLUMNS, "musteriler.xlsx");
});

async function handleImportRows(rows) {
  const validRows = rows.filter((r) => (r["Firma Unvanı"] || "").toString().trim() !== "");
  if (validRows.length === 0) {
    alert('İçe aktarılacak geçerli satır bulunamadı ("Firma Unvanı" sütunu boş olmamalı).');
    return;
  }

  const confirmed = confirm(`${validRows.length} müşteri içe aktarılacak. Devam edilsin mi?`);
  if (!confirmed) return;

  const payloads = validRows.map((r) => ({ ...mapImportRowToCustomer(r), company_id: currentCompanyId }));

  const { error } = await sb.from("customers").insert(payloads);
  if (error) {
    alert(`İçe aktarma başarısız: ${error.message}`);
    return;
  }

  alert(`${payloads.length} müşteri başarıyla içe aktarıldı.`);
  await loadCustomers();
}

// ---- FORM: OPEN / CLOSE -------------------------------------------------------
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

// ---- SEARCH -----------------------------------------------------------------
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
