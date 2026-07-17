// =========================================================
// employees.js — logic for employees.html (Çalışanlar)
// Relies on shared.js (sb, requireSession, getMyCompany) and
// csv-tools.js (exportToExcel, setupImportButton).
// =========================================================

let currentCompanyId = null;
let allEmployees = [];
let editingId = null;

const FIELDS = ["full_name", "email", "national_id", "iban"];

const EXPORT_COLUMNS = [
  { key: "full_name", header: "Adı Soyadı" },
  { key: "email", header: "E-posta" },
  { key: "national_id", header: "TC Kimlik No" },
  { key: "iban", header: "IBAN" },
];

function mapImportRowToEmployee(row) {
  return {
    full_name: (row["Adı Soyadı"] || "").toString().trim(),
    email: row["E-posta"] || null,
    national_id: row["TC Kimlik No"] || null,
    iban: row["IBAN"] || null,
  };
}

const listEl = document.getElementById("employee-list");
const searchInput = document.getElementById("search-input");
const newBtn = document.getElementById("new-employee-btn");
const overlay = document.getElementById("employee-form-overlay");
const form = document.getElementById("employee-form");
const formTitle = document.getElementById("employee-form-title");
const formError = document.getElementById("employee-form-error");
const cancelBtn = document.getElementById("employee-cancel-btn");
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
  await loadEmployees();

  setupImportButton("import-btn", "import-file-input", handleImportRows);
}

// ---- LOAD + RENDER ----------------------------------------------------------
async function loadEmployees() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("employees")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("full_name", { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allEmployees = data;
  renderList(allEmployees);
}

function renderList(employees) {
  if (employees.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz çalışan eklenmedi.</p>`;
    return;
  }

  listEl.innerHTML = "";
  employees.forEach((e) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(e.full_name)}</strong>
        <span class="customer-card-sub">${escapeHtml(e.email || "")}</span>
      </div>
      <div class="customer-card-actions">
        <button class="edit-btn" data-id="${e.id}">Düzenle</button>
        <button class="delete-btn" data-id="${e.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteEmployee(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- EXPORT / IMPORT ---------------------------------------------------------
document.getElementById("export-btn").addEventListener("click", () => {
  exportToExcel(allEmployees, EXPORT_COLUMNS, "calisanlar.xlsx");
});

async function handleImportRows(rows) {
  const validRows = rows.filter((r) => (r["Adı Soyadı"] || "").toString().trim() !== "");
  if (validRows.length === 0) {
    alert('İçe aktarılacak geçerli satır bulunamadı ("Adı Soyadı" sütunu boş olmamalı).');
    return;
  }

  const confirmed = confirm(`${validRows.length} çalışan içe aktarılacak. Devam edilsin mi?`);
  if (!confirmed) return;

  const payloads = validRows.map((r) => ({ ...mapImportRowToEmployee(r), company_id: currentCompanyId }));

  const { error } = await sb.from("employees").insert(payloads);
  if (error) {
    alert(`İçe aktarma başarısız: ${error.message}`);
    return;
  }

  alert(`${payloads.length} çalışan başarıyla içe aktarıldı.`);
  await loadEmployees();
}

// ---- FORM: OPEN / CLOSE -------------------------------------------------------
function openForNew() {
  editingId = null;
  formTitle.textContent = "Yeni Çalışan";
  formError.textContent = "";
  form.reset();
  overlay.classList.remove("hidden");
}

function openForEdit(id) {
  const e = allEmployees.find((x) => x.id === id);
  if (!e) return;

  editingId = id;
  formTitle.textContent = "Çalışanı Düzenle";
  formError.textContent = "";
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = e[f] ?? "";
  });
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DELETE ---------------------------------------------------------------
async function deleteEmployee(id) {
  const e = allEmployees.find((x) => x.id === id);
  const confirmed = confirm(`"${e ? e.full_name : "bu çalışan"}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadEmployees();
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

  if (!payload.full_name) {
    formError.textContent = "Adı Soyadı zorunludur.";
    return;
  }

  let result;
  if (editingId) {
    result = await sb.from("employees").update(payload).eq("id", editingId);
  } else {
    payload.company_id = currentCompanyId;
    result = await sb.from("employees").insert(payload);
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadEmployees();
});

// ---- SEARCH -----------------------------------------------------------------
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderList(allEmployees);
    return;
  }
  const filtered = allEmployees.filter((e) => (e.full_name || "").toLowerCase().includes(q));
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
