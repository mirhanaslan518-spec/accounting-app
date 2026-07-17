// =========================================================
// suppliers.js — logic for suppliers.html
// Relies on shared.js (sb, requireSession, getMyCompany) and
// csv-tools.js (exportToExcel, setupImportButton).
// =========================================================

let currentCompanyId = null;
let allSuppliers = [];
let editingId = null;

const FIELDS = [
  "supplier_type", "company_title", "short_name", "tax_id", "tax_office",
  "category", "email", "phone", "address", "iban", "notes"
];

const EXPORT_COLUMNS = [
  { key: "supplier_type", header: "Tür", format: (v) => (v === "gercek" ? "Gerçek Kişi" : "Tüzel Kişi") },
  { key: "company_title", header: "Firma Unvanı" },
  { key: "short_name", header: "Kısa İsim" },
  { key: "tax_id", header: "VKN/TCKN" },
  { key: "tax_office", header: "Vergi Dairesi" },
  { key: "category", header: "Kategori" },
  { key: "email", header: "E-posta" },
  { key: "phone", header: "Telefon" },
  { key: "address", header: "Açık Adres" },
  { key: "iban", header: "IBAN" },
  { key: "notes", header: "Notlar" },
];

function mapImportRowToSupplier(row) {
  const tur = (row["Tür"] || "").toString().trim();
  return {
    supplier_type: tur === "Gerçek Kişi" ? "gercek" : "tuzel",
    company_title: (row["Firma Unvanı"] || "").toString().trim(),
    short_name: row["Kısa İsim"] || null,
    tax_id: row["VKN/TCKN"] || null,
    tax_office: row["Vergi Dairesi"] || null,
    category: row["Kategori"] || null,
    email: row["E-posta"] || null,
    phone: row["Telefon"] || null,
    address: row["Açık Adres"] || null,
    iban: row["IBAN"] || null,
    notes: row["Notlar"] || null,
  };
}

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

  setupImportButton("import-btn", "import-file-input", handleImportRows);
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

// ---- EXPORT / IMPORT ---------------------------------------------------------
document.getElementById("export-btn").addEventListener("click", () => {
  exportToExcel(allSuppliers, EXPORT_COLUMNS, "tedarikciler.xlsx");
});

async function handleImportRows(rows) {
  const validRows = rows.filter((r) => (r["Firma Unvanı"] || "").toString().trim() !== "");
  if (validRows.length === 0) {
    alert('İçe aktarılacak geçerli satır bulunamadı ("Firma Unvanı" sütunu boş olmamalı).');
    return;
  }

  const confirmed = confirm(`${validRows.length} tedarikçi içe aktarılacak. Devam edilsin mi?`);
  if (!confirmed) return;

  const payloads = validRows.map((r) => ({ ...mapImportRowToSupplier(r), company_id: currentCompanyId }));

  const { error } = await sb.from("suppliers").insert(payloads);
  if (error) {
    alert(`İçe aktarma başarısız: ${error.message}`);
    return;
  }

  alert(`${payloads.length} tedarikçi başarıyla içe aktarıldı.`);
  await loadSuppliers();
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
