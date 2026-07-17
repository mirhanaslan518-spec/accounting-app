// =========================================================
// products.js — logic for products.html
// Relies on shared.js (sb, requireSession, getMyCompany) and
// csv-tools.js (exportToExcel, setupImportButton).
// =========================================================

let currentCompanyId = null;
let allProducts = [];
let editingId = null;

const FIELDS = ["name", "unit", "unit_price", "tax_rate"];

const EXPORT_COLUMNS = [
  { key: "name", header: "Hizmet / Ürün Adı" },
  { key: "unit", header: "Birim" },
  { key: "unit_price", header: "Satış Fiyatı" },
  { key: "tax_rate", header: "KDV %" },
];

function mapImportRowToProduct(row) {
  return {
    name: (row["Hizmet / Ürün Adı"] || "").toString().trim(),
    unit: row["Birim"] || "adet",
    unit_price: row["Satış Fiyatı"] || 0,
    tax_rate: row["KDV %"] || 18,
  };
}

const listEl = document.getElementById("product-list");
const searchInput = document.getElementById("search-input");
const newBtn = document.getElementById("new-product-btn");
const overlay = document.getElementById("product-form-overlay");
const form = document.getElementById("product-form");
const formTitle = document.getElementById("product-form-title");
const formError = document.getElementById("product-form-error");
const cancelBtn = document.getElementById("product-cancel-btn");
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
  await loadProducts();

  setupImportButton("import-btn", "import-file-input", handleImportRows);
}

// ---- LOAD + RENDER ----------------------------------------------------------
async function loadProducts() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allProducts = data;
  renderList(allProducts);
}

function renderList(products) {
  if (products.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz ürün eklenmedi.</p>`;
    return;
  }

  listEl.innerHTML = "";
  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="customer-card-sub">${Number(p.unit_price).toFixed(2)} / ${escapeHtml(p.unit)} · KDV %${p.tax_rate}</span>
      </div>
      <div class="customer-card-actions">
        <button class="edit-btn" data-id="${p.id}">Düzenle</button>
        <button class="delete-btn" data-id="${p.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteProduct(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- EXPORT / IMPORT ---------------------------------------------------------
document.getElementById("export-btn").addEventListener("click", () => {
  exportToExcel(allProducts, EXPORT_COLUMNS, "urunler.xlsx");
});

async function handleImportRows(rows) {
  const validRows = rows.filter((r) => (r["Hizmet / Ürün Adı"] || "").toString().trim() !== "");
  if (validRows.length === 0) {
    alert('İçe aktarılacak geçerli satır bulunamadı ("Hizmet / Ürün Adı" sütunu boş olmamalı).');
    return;
  }

  const confirmed = confirm(`${validRows.length} ürün içe aktarılacak. Devam edilsin mi?`);
  if (!confirmed) return;

  const payloads = validRows.map((r) => ({ ...mapImportRowToProduct(r), company_id: currentCompanyId }));

  const { error } = await sb.from("products").insert(payloads);
  if (error) {
    alert(`İçe aktarma başarısız: ${error.message}`);
    return;
  }

  alert(`${payloads.length} ürün başarıyla içe aktarıldı.`);
  await loadProducts();
}

// ---- FORM: OPEN / CLOSE -------------------------------------------------------
function openForNew() {
  editingId = null;
  formTitle.textContent = "Yeni Ürün";
  formError.textContent = "";
  form.reset();
  document.getElementById("unit").value = "adet";
  document.getElementById("unit_price").value = 0;
  document.getElementById("tax_rate").value = 18;
  overlay.classList.remove("hidden");
}

function openForEdit(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;

  editingId = id;
  formTitle.textContent = "Ürünü Düzenle";
  formError.textContent = "";
  FIELDS.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = p[f] ?? "";
  });
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DELETE ---------------------------------------------------------------
async function deleteProduct(id) {
  const p = allProducts.find((x) => x.id === id);
  const confirmed = confirm(`"${p ? p.name : "bu ürün"}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadProducts();
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
    formError.textContent = "Hizmet / Ürün Adı zorunludur.";
    return;
  }

  let result;
  if (editingId) {
    result = await sb.from("products").update(payload).eq("id", editingId);
  } else {
    payload.company_id = currentCompanyId;
    result = await sb.from("products").insert(payload);
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadProducts();
});

// ---- SEARCH -----------------------------------------------------------------
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderList(allProducts);
    return;
  }
  const filtered = allProducts.filter((p) => (p.name || "").toLowerCase().includes(q));
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
