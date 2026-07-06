// =========================================================
// invoices.js — logic for invoices.html
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany, categorizeInvoice).
// =========================================================

let currentCompanyId = null;
let allInvoices = [];
let allProducts = [];
let allAccounts = [];
let editingId = null; // null = new invoice, otherwise = id being edited
let editingCollectionStatus = "tahsil_edilecek"; // preserved as-is when editing an invoice
let pendingCollectId = null; // which invoice the collect-modal is currently acting on

const listEl = document.getElementById("invoice-list");
const newBtn = document.getElementById("new-invoice-btn");
const overlay = document.getElementById("invoice-form-overlay");
const form = document.getElementById("invoice-form");
const formTitle = document.getElementById("invoice-form-title");
const formError = document.getElementById("invoice-form-error");
const cancelBtn = document.getElementById("invoice-cancel-btn");
const logoutBtn = document.getElementById("logout-btn");
const lineItemsEl = document.getElementById("line-items");
const addLineBtn = document.getElementById("add-line-btn");

const collectOverlay = document.getElementById("collect-modal-overlay");
const collectForm = document.getElementById("collect-form");
const collectError = document.getElementById("collect-form-error");
const collectCancelBtn = document.getElementById("collect-cancel-btn");

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

  await loadCustomerOptions();
  await loadProductOptions();
  await loadAccounts();
  await loadInvoices();
}

// ---- CUSTOMER DROPDOWN ------------------------------------------------------
async function loadCustomerOptions() {
  const { data } = await sb
    .from("customers")
    .select("id, company_title")
    .eq("company_id", currentCompanyId)
    .order("company_title", { ascending: true });

  const select = document.getElementById("customer_id");
  select.innerHTML = `<option value="">Seçiniz...</option>`;
  (data || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.company_title;
    select.appendChild(opt);
  });
}

// ---- PRODUCT CATALOG (for the line-item autocomplete) ------------------------
async function loadProductOptions() {
  const { data } = await sb
    .from("products")
    .select("id, name, unit, unit_price, tax_rate")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  allProducts = data || [];

  const datalist = document.getElementById("product-options");
  datalist.innerHTML = "";
  allProducts.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    datalist.appendChild(opt);
  });
}

// ---- ACCOUNTS (for the collection modal) --------------------------------------
async function loadAccounts() {
  const { data } = await sb
    .from("accounts")
    .select("id, name, account_type")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  allAccounts = data || [];
}

function populateAccountSelect() {
  const select = document.getElementById("collect_account_id");
  select.innerHTML = `<option value="">Seçiniz...</option>`;
  allAccounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.account_type === "banka" ? "Banka" : "Kasa"})`;
    select.appendChild(opt);
  });
}

// ---- LOAD + RENDER THE INVOICE LIST -----------------------------------------
async function loadInvoices() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("invoices")
    .select("*, customers(company_title), accounts(name)")
    .eq("company_id", currentCompanyId)
    .order("issue_date", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allInvoices = data;
  renderInvoiceList(allInvoices);
}

function renderInvoiceList(invoices) {
  if (invoices.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Henüz fatura oluşturulmadı.</p>`;
    return;
  }

  listEl.innerHTML = "";
  invoices.forEach((inv) => {
    const status = categorizeInvoice(inv);
    const toggleLabel = inv.collection_status === "tahsil_edildi"
      ? "Tahsil Edilecek Yap"
      : "Tahsil Edildi Yap";

    const collectedInfo = inv.collection_status === "tahsil_edildi" && inv.accounts
      ? ` · ${escapeHtml(inv.accounts.name)}${inv.collected_date ? " (" + inv.collected_date + ")" : ""}`
      : "";

    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(inv.invoice_name || inv.invoice_number || "Fatura")}</strong>
        <span class="customer-card-sub">${escapeHtml(inv.customers ? inv.customers.company_title : "")} · ${inv.issue_date || ""}${collectedInfo}</span>
        <span class="status-badge ${status.cls}">${status.label}</span>
      </div>
      <div class="customer-card-actions">
        <strong class="invoice-total">${Number(inv.grand_total).toFixed(2)} ${inv.currency}</strong>
        <button class="toggle-btn" data-id="${inv.id}" data-status="${inv.collection_status}">${toggleLabel}</button>
        <button class="edit-btn" data-id="${inv.id}">Düzenle</button>
        <button class="delete-btn" data-id="${inv.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteInvoice(btn.dataset.id));
  });
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleCollectionStatus(btn.dataset.id, btn.dataset.status));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- COLLECTION STATUS: the only place this ever changes ---------------------
async function toggleCollectionStatus(id, currentStatus) {
  if (currentStatus === "tahsil_edildi") {
    // Undo is simple: flip back and clear the collection details.
    const { error } = await sb.from("invoices").update({
      collection_status: "tahsil_edilecek",
      collected_date: null,
      account_id: null,
    }).eq("id", id);

    if (error) {
      alert(`Güncellenemedi: ${error.message}`);
      return;
    }
    await loadInvoices();
    return;
  }

  // Marking as collected requires knowing which account received it.
  if (allAccounts.length === 0) {
    alert("Önce en az bir Kasa/Banka hesabı oluşturmalısınız (Kasa/Banka sayfası).");
    return;
  }

  pendingCollectId = id;
  collectError.textContent = "";
  document.getElementById("collect_date").value = new Date().toISOString().slice(0, 10);
  populateAccountSelect();
  collectOverlay.classList.remove("hidden");
}

collectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  collectError.textContent = "";

  const date = document.getElementById("collect_date").value;
  const accountId = document.getElementById("collect_account_id").value;

  if (!accountId) {
    collectError.textContent = "Hesap seçilmelidir.";
    return;
  }

  const { error } = await sb.from("invoices").update({
    collection_status: "tahsil_edildi",
    collected_date: date,
    account_id: accountId,
  }).eq("id", pendingCollectId);

  if (error) {
    collectError.textContent = error.message;
    return;
  }

  collectOverlay.classList.add("hidden");
  pendingCollectId = null;
  await loadInvoices();
});

collectCancelBtn.addEventListener("click", () => {
  collectOverlay.classList.add("hidden");
  pendingCollectId = null;
});

// ---- LINE ITEM ROWS ----------------------------------------------------------
function makeInput(className, type, value, placeholder, step) {
  const input = document.createElement("input");
  input.className = className;
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  if (step) input.step = step;
  return input;
}

function createLineItemRow(line = {}) {
  const row = document.createElement("div");
  row.className = "line-item-row";

  const descInput = makeInput("li-description", "text", line.description ?? "", "Hizmet / Ürün açıklaması");
  descInput.setAttribute("list", "product-options");
  row.appendChild(descInput);

  row.appendChild(makeInput("li-quantity", "number", line.quantity ?? 1, "Miktar", "0.01"));
  row.appendChild(makeInput("li-unit", "text", line.unit ?? "adet", "Birim"));
  row.appendChild(makeInput("li-unit_price", "number", line.unit_price ?? 0, "Br. Fiyat", "0.01"));
  row.appendChild(makeInput("li-tax_rate", "number", line.tax_rate ?? 18, "KDV %", "0.01"));

  const totalSpan = document.createElement("span");
  totalSpan.className = "li-total";
  totalSpan.textContent = "0.00";
  row.appendChild(totalSpan);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "li-remove";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.remove();
    recalcTotals();
  });
  row.appendChild(removeBtn);

  descInput.addEventListener("change", () => {
    const typed = descInput.value.trim().toLowerCase();
    const match = allProducts.find((p) => p.name.toLowerCase() === typed);
    if (match) {
      row.querySelector(".li-unit").value = match.unit || "adet";
      row.querySelector(".li-unit_price").value = match.unit_price ?? 0;
      row.querySelector(".li-tax_rate").value = match.tax_rate ?? 18;
      recalcTotals();
    }
  });

  return row;
}

function recalcTotals() {
  let subtotal = 0;
  let taxTotal = 0;

  lineItemsEl.querySelectorAll(".line-item-row").forEach((row) => {
    const qty = parseFloat(row.querySelector(".li-quantity").value) || 0;
    const price = parseFloat(row.querySelector(".li-unit_price").value) || 0;
    const taxRate = parseFloat(row.querySelector(".li-tax_rate").value) || 0;

    const lineSubtotal = qty * price;
    const lineTax = (lineSubtotal * taxRate) / 100;
    const lineTotal = lineSubtotal + lineTax;

    row.querySelector(".li-total").textContent = lineTotal.toFixed(2);

    subtotal += lineSubtotal;
    taxTotal += lineTax;
  });

  document.getElementById("totals-subtotal").textContent = subtotal.toFixed(2);
  document.getElementById("totals-tax").textContent = taxTotal.toFixed(2);
  document.getElementById("totals-grand").textContent = (subtotal + taxTotal).toFixed(2);
}

function collectLines() {
  const lines = [];
  lineItemsEl.querySelectorAll(".line-item-row").forEach((row) => {
    lines.push({
      description: row.querySelector(".li-description").value,
      quantity: parseFloat(row.querySelector(".li-quantity").value) || 0,
      unit: row.querySelector(".li-unit").value,
      unit_price: parseFloat(row.querySelector(".li-unit_price").value) || 0,
      tax_rate: parseFloat(row.querySelector(".li-tax_rate").value) || 0,
    });
  });
  return lines;
}

lineItemsEl.addEventListener("input", recalcTotals);
addLineBtn.addEventListener("click", () => {
  lineItemsEl.appendChild(createLineItemRow());
  recalcTotals();
});

// ---- FORM: OPEN / CLOSE -------------------------------------------------------
function openForNew() {
  editingId = null;
  editingCollectionStatus = "tahsil_edilecek"; // every new invoice starts uncollected
  formTitle.textContent = "Yeni Fatura";
  formError.textContent = "";
  form.reset();
  document.getElementById("issue_date").value = new Date().toISOString().slice(0, 10);

  lineItemsEl.innerHTML = "";
  lineItemsEl.appendChild(createLineItemRow());
  recalcTotals();

  overlay.classList.remove("hidden");
}

async function openForEdit(id) {
  const inv = allInvoices.find((x) => x.id === id);
  if (!inv) return;

  editingId = id;
  editingCollectionStatus = inv.collection_status; // preserved untouched by this form
  formTitle.textContent = "Faturayı Düzenle";
  formError.textContent = "";

  document.getElementById("invoice_name").value = inv.invoice_name || "";
  document.getElementById("customer_id").value = inv.customer_id || "";
  document.getElementById("invoice_number").value = inv.invoice_number || "";
  document.getElementById("issue_date").value = inv.issue_date || "";
  document.getElementById("due_date").value = inv.due_date || "";
  document.getElementById("currency").value = inv.currency || "TRY";
  document.getElementById("notes").value = inv.notes || "";

  const { data: lines } = await sb
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id);

  lineItemsEl.innerHTML = "";
  (lines || []).forEach((line) => lineItemsEl.appendChild(createLineItemRow(line)));
  if (!lines || lines.length === 0) lineItemsEl.appendChild(createLineItemRow());

  recalcTotals();
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- DUE DATE PRESETS -----------------------------------------------------------
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const days = parseInt(btn.dataset.days, 10);
    const issueDateVal = document.getElementById("issue_date").value;
    if (!issueDateVal) return;
    const d = new Date(issueDateVal);
    d.setDate(d.getDate() + days);
    document.getElementById("due_date").value = d.toISOString().slice(0, 10);
  });
});

// ---- DELETE -----------------------------------------------------------------------
async function deleteInvoice(id) {
  const inv = allInvoices.find((x) => x.id === id);
  const label = inv ? (inv.invoice_name || inv.invoice_number || "bu fatura") : "bu fatura";
  const confirmed = confirm(`"${label}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("invoices").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadInvoices();
}

// ---- SAVE (CALLS THE POSTGRES FUNCTIONS FROM sprint2_invoice_functions.sql) --------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const customerId = document.getElementById("customer_id").value;
  if (!customerId) {
    formError.textContent = "Müşteri seçilmelidir.";
    return;
  }

  const lines = collectLines();
  if (lines.length === 0) {
    formError.textContent = "En az bir satır eklemelisiniz.";
    return;
  }

  const invoiceName = document.getElementById("invoice_name").value || null;
  const invoiceNumber = document.getElementById("invoice_number").value || null;
  const issueDate = document.getElementById("issue_date").value;
  const dueDate = document.getElementById("due_date").value || null;
  const currency = document.getElementById("currency").value;
  const notes = document.getElementById("notes").value || null;

  let result;
  if (editingId) {
    result = await sb.rpc("update_invoice", {
      p_invoice_id: editingId,
      p_customer_id: customerId,
      p_invoice_name: invoiceName,
      p_invoice_number: invoiceNumber,
      p_issue_date: issueDate,
      p_due_date: dueDate,
      p_collection_status: editingCollectionStatus, // untouched by this form
      p_currency: currency,
      p_notes: notes,
      p_lines: lines,
    });
  } else {
    result = await sb.rpc("create_invoice", {
      p_company_id: currentCompanyId,
      p_customer_id: customerId,
      p_invoice_name: invoiceName,
      p_invoice_number: invoiceNumber,
      p_issue_date: issueDate,
      p_due_date: dueDate,
      p_collection_status: "tahsil_edilecek", // new invoices always start uncollected
      p_currency: currency,
      p_notes: notes,
      p_lines: lines,
    });
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadInvoices();
});

// ---- BUTTONS ------------------------------------------------------------------------
newBtn.addEventListener("click", openForNew);
cancelBtn.addEventListener("click", closeForm);

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

// ---- START ----------------------------------------------------------------------------
init();
