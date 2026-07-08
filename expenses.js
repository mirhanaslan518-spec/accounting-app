// =========================================================
// expenses.js — logic for expenses.html (Gider Listesi)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;
let allExpenses = [];
let allProducts = [];
let editingId = null;              // null = new expense, otherwise = id being edited
let currentExpenseType = "fis_fatura"; // which mode the open form is in
let currentFilter = "all";

const listEl = document.getElementById("expense-list");
const newQuickBtn = document.getElementById("new-quick-btn");
const newDetailedBtn = document.getElementById("new-detailed-btn");
const overlay = document.getElementById("expense-form-overlay");
const form = document.getElementById("expense-form");
const formTitle = document.getElementById("expense-form-title");
const formError = document.getElementById("expense-form-error");
const cancelBtn = document.getElementById("expense-cancel-btn");
const logoutBtn = document.getElementById("logout-btn");
const lineItemsEl = document.getElementById("line-items");
const addLineBtn = document.getElementById("add-line-btn");
const manualTotalsGroup = document.getElementById("manual-totals-group");
const linesGroup = document.getElementById("lines-group");
const computedTotalsBox = document.getElementById("computed-totals-box");

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

  await loadSupplierOptions();
  await loadProductOptions();
  await loadExpenses();
}

// ---- SUPPLIER DROPDOWN ------------------------------------------------------
async function loadSupplierOptions() {
  const { data } = await sb
    .from("suppliers")
    .select("id, company_title")
    .eq("company_id", currentCompanyId)
    .order("company_title", { ascending: true });

  const select = document.getElementById("supplier_id");
  select.innerHTML = `<option value="">Seçiniz...</option>`;
  (data || []).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.company_title;
    select.appendChild(opt);
  });
}

// ---- PRODUCT CATALOG (for the line-item autocomplete) ------------------------
// Note: only unit + KDV autofill here, never price — see createLineItemRow.
async function loadProductOptions() {
  const { data } = await sb
    .from("products")
    .select("id, name, unit, tax_rate")
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

// ---- LOAD + RENDER THE EXPENSE LIST -----------------------------------------
async function loadExpenses() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("expenses")
    .select("*, suppliers(company_title)")
    .eq("company_id", currentCompanyId)
    .order("receipt_date", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allExpenses = data;
  renderList();
}

function renderList() {
  const filtered = currentFilter === "all"
    ? allExpenses
    : allExpenses.filter((x) => x.payment_status === currentFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Gösterilecek gider yok.</p>`;
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach((x) => {
    const isPaid = x.payment_status === "odendi";
    const statusLabel = isPaid ? "Ödendi" : "Ödenecek";
    const statusCls = isPaid ? "status-ok" : "status-pending";
    const typeLabel = x.expense_type === "alis_faturasi" ? "Detaylı" : "Hızlı";
    const toggleTarget = isPaid ? "odenecek" : "odendi";
    const toggleLabel = isPaid ? "Ödenecek Yap" : "Ödendi Yap";

    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(x.expense_name || "Gider")}</strong>
        <span class="customer-card-sub">${escapeHtml(x.suppliers ? x.suppliers.company_title : "")} · ${x.receipt_date || ""} · ${typeLabel}</span>
        <span class="status-badge ${statusCls}">${statusLabel}</span>
      </div>
      <div class="customer-card-actions">
        <strong class="invoice-total">${Number(x.total_amount).toFixed(2)} ${x.currency}</strong>
        <button class="toggle-btn" data-id="${x.id}" data-action="${toggleTarget}">${toggleLabel}</button>
        <button class="edit-btn" data-id="${x.id}">Düzenle</button>
        <button class="delete-btn" data-id="${x.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteExpense(btn.dataset.id));
  });
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => updatePaymentStatus(btn.dataset.id, btn.dataset.action));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- FILTER BAR ---------------------------------------------------------------
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

// ---- QUICK PAYMENT STATUS TOGGLE -----------------------------------------------
async function updatePaymentStatus(id, newStatus) {
  const { error } = await sb.from("expenses").update({ payment_status: newStatus }).eq("id", id);
  if (error) {
    alert(`Güncellenemedi: ${error.message}`);
    return;
  }
  await loadExpenses();
}

// ---- DELETE ---------------------------------------------------------------
async function deleteExpense(id) {
  const x = allExpenses.find((y) => y.id === id);
  const label = x ? (x.expense_name || "bu gider") : "bu gider";
  const confirmed = confirm(`"${label}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadExpenses();
}

// ---- FORM MODE SWITCH (hızlı vs detaylı) ---------------------------------------
function setFormMode(type) {
  currentExpenseType = type;
  if (type === "alis_faturasi") {
    manualTotalsGroup.classList.add("hidden");
    linesGroup.classList.remove("hidden");
    computedTotalsBox.classList.remove("hidden");
  } else {
    manualTotalsGroup.classList.remove("hidden");
    linesGroup.classList.add("hidden");
    computedTotalsBox.classList.add("hidden");
  }
}

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

  // Deliberately does NOT autofill unit_price: products.unit_price is your
  // SELLING price, and this line is a PURCHASE — reusing it here would
  // silently substitute the wrong number. Only unit and KDV rate autofill.
  descInput.addEventListener("change", () => {
    const typed = descInput.value.trim().toLowerCase();
    const match = allProducts.find((p) => p.name.toLowerCase() === typed);
    if (match) {
      row.querySelector(".li-unit").value = match.unit || "adet";
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
function resetCommonFields() {
  form.reset();
  document.getElementById("receipt_date").value = new Date().toISOString().slice(0, 10);
}

function openForNewQuick() {
  editingId = null;
  formError.textContent = "";
  resetCommonFields();
  setFormMode("fis_fatura");
  formTitle.textContent = "Yeni Hızlı Fiş/Fatura";
  document.getElementById("manual_total").value = 0;
  document.getElementById("manual_tax").value = 0;
  lineItemsEl.innerHTML = "";
  overlay.classList.remove("hidden");
}

function openForNewDetailed() {
  editingId = null;
  formError.textContent = "";
  resetCommonFields();
  setFormMode("alis_faturasi");
  formTitle.textContent = "Yeni Detaylı Fiş/Fatura";
  lineItemsEl.innerHTML = "";
  lineItemsEl.appendChild(createLineItemRow());
  recalcTotals();
  overlay.classList.remove("hidden");
}

async function openForEdit(id) {
  const x = allExpenses.find((y) => y.id === id);
  if (!x) return;

  editingId = id;
  formError.textContent = "";
  setFormMode(x.expense_type);
  formTitle.textContent = x.expense_type === "alis_faturasi"
    ? "Detaylı Fiş/Faturayı Düzenle"
    : "Hızlı Fiş/Faturayı Düzenle";

  document.getElementById("expense_name").value = x.expense_name || "";
  document.getElementById("supplier_id").value = x.supplier_id || "";
  document.getElementById("receipt_date").value = x.receipt_date || "";
  document.getElementById("receipt_number").value = x.receipt_number || "";
  document.getElementById("currency").value = x.currency || "TRY";
  document.getElementById("payment_status").value = x.payment_status || "odenecek";
  document.getElementById("due_date").value = x.due_date || "";
  document.getElementById("notes").value = x.notes || "";

  if (x.expense_type === "alis_faturasi") {
    const { data: lines } = await sb
      .from("expense_lines")
      .select("*")
      .eq("expense_id", id);

    lineItemsEl.innerHTML = "";
    (lines || []).forEach((line) => lineItemsEl.appendChild(createLineItemRow(line)));
    if (!lines || lines.length === 0) lineItemsEl.appendChild(createLineItemRow());
    recalcTotals();
  } else {
    document.getElementById("manual_total").value = x.total_amount ?? 0;
    document.getElementById("manual_tax").value = x.tax_total ?? 0;
  }

  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- SAVE (CALLS THE POSTGRES FUNCTIONS FROM sprint7_expenses.sql) --------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const expenseName = document.getElementById("expense_name").value || null;
  const supplierId = document.getElementById("supplier_id").value || null;
  const receiptDate = document.getElementById("receipt_date").value;
  const receiptNumber = document.getElementById("receipt_number").value || null;
  const currency = document.getElementById("currency").value;
  const paymentStatus = document.getElementById("payment_status").value;
  const dueDate = document.getElementById("due_date").value || null;
  const notes = document.getElementById("notes").value || null;

  let manualTotal = null;
  let manualTax = null;
  let lines = [];

  if (currentExpenseType === "alis_faturasi") {
    lines = collectLines();
    if (lines.length === 0) {
      formError.textContent = "En az bir satır eklemelisiniz.";
      return;
    }
  } else {
    manualTotal = parseFloat(document.getElementById("manual_total").value) || 0;
    manualTax = parseFloat(document.getElementById("manual_tax").value) || 0;
  }

  const sharedPayload = {
    p_supplier_id: supplierId,
    p_expense_name: expenseName,
    p_expense_type: currentExpenseType,
    p_receipt_date: receiptDate,
    p_receipt_number: receiptNumber,
    p_currency: currency,
    p_payment_status: paymentStatus,
    p_due_date: dueDate,
    p_notes: notes,
    p_manual_total: manualTotal,
    p_manual_tax: manualTax,
    p_lines: lines,
  };

  let result;
  if (editingId) {
    result = await sb.rpc("update_expense", { p_expense_id: editingId, ...sharedPayload });
  } else {
    result = await sb.rpc("create_expense", { p_company_id: currentCompanyId, ...sharedPayload });
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadExpenses();
});

// ---- BUTTONS ------------------------------------------------------------------------
newQuickBtn.addEventListener("click", openForNewQuick);
newDetailedBtn.addEventListener("click", openForNewDetailed);
cancelBtn.addEventListener("click", closeForm);

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

// ---- START ----------------------------------------------------------------------------
init();
