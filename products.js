// =========================================================
// products.js — logic for products.html
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
//
// Note: this only exposes name / unit / price / tax rate — the
// fields needed for invoice line items to autofill. track_stock
// and stock_quantity stay at their database defaults until the
// full Stok module gets built later; no need to expose them yet.
// =========================================================

let currentCompanyId = null;
let allProducts = [];
let editingId = null; // null = new product, otherwise = id being edited

const FIELDS = ["name", "unit", "unit_price", "tax_rate"];

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
