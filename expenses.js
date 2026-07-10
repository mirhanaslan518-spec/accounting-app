// =========================================================
// expenses.js — logic for expenses.html (Gider Listesi)
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany, categorizeExpense).
// =========================================================

let currentCompanyId = null;
let allExpenses = [];
let allProducts = [];
let allAccounts = [];
let allEmployees = [];
let editingId = null;                  // null = new expense, otherwise = id being edited
let editingPaymentStatus = "odenecek"; // preserved as-is when editing an expense's details
let currentExpenseType = "fis_fatura"; // which mode the open form is in
let currentFilter = "all";
let pendingPayId = null;               // which expense the account-pay modal is acting on
let pendingEmployeePayId = null;       // which expense the employee-pay modal is acting on

const listEl = document.getElementById("expense-list");
const newQuickBtn = document.getElementById("new-quick-btn");
const newDetailedBtn = document.getElementById("new-detailed-btn");
const newPayrollBtn = document.getElementById("new-payroll-btn");
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
const supplierFieldGroup = document.getElementById("supplier-field-group");
const employeeFieldGroup = document.getElementById("employee-field-group");

const payOverlay = document.getElementById("pay-modal-overlay");
const payForm = document.getElementById("pay-form");
const payError = document.getElementById("pay-form-error");
const payCancelBtn = document.getElementById("pay-cancel-btn");

const employeePayOverlay = document.getElementById("employee-pay-modal-overlay");
const employeePayForm = document.getElementById("employee-pay-form");
const employeePayError = document.getElementById("employee-pay-form-error");
const employeePayCancelBtn = document.getElementById("employee-pay-cancel-btn");

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
  await loadEmployeeOptions();
  await loadProductOptions();
  await loadAccounts();
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

// ---- EMPLOYEE DROPDOWNS (form's "Çalışan" field + both pay-modals) -----------
async function loadEmployeeOptions() {
  const { data } = await sb
    .from("employees")
    .select("id, full_name")
    .eq("company_id", currentCompanyId)
    .order("full_name", { ascending: true });

  allEmployees = data || [];
  populateEmployeeSelectEl(document.getElementById("employee_id"));
}

function populateEmployeeSelectEl(selectEl) {
  selectEl.innerHTML = `<option value="">Seçiniz...</option>`;
  allEmployees.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.full_name;
    selectEl.appendChild(opt);
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

// ---- ACCOUNTS (for the account-pay modal) --------------------------------------
async function loadAccounts() {
  const { data } = await sb
    .from("accounts")
    .select("id, name, account_type")
    .eq("company_id", currentCompanyId)
    .order("name", { ascending: true });

  allAccounts = data || [];
}

function populateAccountSelect() {
  const select = document.getElementById("pay_account_id");
  select.innerHTML = `<option value="">Seçiniz...</option>`;
  allAccounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.account_type === "banka" ? "Banka" : "Kasa"})`;
    select.appendChild(opt);
  });
}

// ---- LOAD + RENDER THE EXPENSE LIST -----------------------------------------
async function loadExpenses() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("expenses")
    .select(`
      *,
      suppliers(company_title),
      accounts(name),
      employee:employees!employee_id(full_name),
      paid_by_employee:employees!paid_by_employee_id(full_name)
    `)
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
    const category = categorizeExpense(x);
    const typeLabel = x.expense_type === "alis_faturasi" ? "Detaylı"
      : x.expense_type === "maas_prim" ? "Maaş/Prim"
      : "Hızlı";

    const whoName = x.expense_type === "maas_prim"
      ? (x.employee ? x.employee.full_name : "")
      : (x.suppliers ? x.suppliers.company_title : "");

    let paidInfo = "";
    if (x.payment_status === "odendi" && x.accounts) {
      paidInfo = ` · ${escapeHtml(x.accounts.name)}${x.paid_date ? " (" + x.paid_date + ")" : ""}`;
    } else if (x.payment_status === "calisan_cebinden_odedi" && x.paid_by_employee) {
      paidInfo = ` · ${escapeHtml(x.paid_by_employee.full_name)}${x.paid_date ? " (" + x.paid_date + ")" : ""}`;
    }

    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(x.expense_name || "Gider")}</strong>
        <span class="customer-card-sub">${escapeHtml(whoName)} · ${x.receipt_date || ""} · ${typeLabel}${paidInfo}</span>
        <span class="status-badge ${category.cls}">${category.label}</span>
      </div>
      <div class="customer-card-actions">
        <strong class="invoice-total">${Number(x.total_amount).toFixed(2)} ${x.currency}</strong>
        ${paymentActionButtons(x)}
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
    btn.addEventListener("click", () => revertToUnpaid(btn.dataset.id));
  });
  document.querySelectorAll(".account-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => openAccountPayModal(btn.dataset.id));
  });
  document.querySelectorAll(".employee-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEmployeePayModal(btn.dataset.id));
  });
}

function paymentActionButtons(x) {
  if (x.payment_status === "odenecek") {
    return `
      <button class="account-pay-btn" data-id="${x.id}">Ödendi Yap</button>
      <button class="employee-pay-btn" data-id="${x.id}">Çalışan Cebinden Ödedi Yap</button>
    `;
  }
  return `<button class="toggle-btn" data-id="${x.id}">Ödenecek Yap</button>`;
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

// ---- PAYMENT STATUS: three states, each with exactly one path to reach it ------
async function revertToUnpaid(id) {
  const { error } = await sb.from("expenses").update({
    payment_status: "odenecek",
    paid_date: null,
    account_id: null,
    paid_by_employee_id: null,
  }).eq("id", id);

  if (error) {
    alert(`Güncellenemedi: ${error.message}`);
    return;
  }
  await loadExpenses();
}

async function openAccountPayModal(id) {
  if (allAccounts.length === 0) {
    alert("Önce en az bir Kasa/Banka hesabı oluşturmalısınız (Kasa/Banka sayfası).");
    return;
  }
  pendingPayId = id;
  payError.textContent = "";
  document.getElementById("pay_date").value = new Date().toISOString().slice(0, 10);
  populateAccountSelect();
  payOverlay.classList.remove("hidden");
}

payForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  payError.textContent = "";

  const date = document.getElementById("pay_date").value;
  const accountId = document.getElementById("pay_account_id").value;

  if (!accountId) {
    payError.textContent = "Hesap seçilmelidir.";
    return;
  }

  const { error } = await sb.from("expenses").update({
    payment_status: "odendi",
    paid_date: date,
    account_id: accountId,
    paid_by_employee_id: null,
  }).eq("id", pendingPayId);

  if (error) {
    payError.textContent = error.message;
    return;
  }

  payOverlay.classList.add("hidden");
  pendingPayId = null;
  await loadExpenses();
});

payCancelBtn.addEventListener("click", () => {
  payOverlay.classList.add("hidden");
  pendingPayId = null;
});

async function openEmployeePayModal(id) {
  if (allEmployees.length === 0) {
    alert("Önce en az bir çalışan eklemelisiniz (Çalışanlar sayfası).");
    return;
  }
  pendingEmployeePayId = id;
  employeePayError.textContent = "";
  document.getElementById("employee_pay_date").value = new Date().toISOString().slice(0, 10);
  populateEmployeeSelectEl(document.getElementById("employee_pay_id"));
  employeePayOverlay.classList.remove("hidden");
}

employeePayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  employeePayError.textContent = "";

  const date = document.getElementById("employee_pay_date").value;
  const employeeId = document.getElementById("employee_pay_id").value;

  if (!employeeId) {
    employeePayError.textContent = "Çalışan seçilmelidir.";
    return;
  }

  const { error } = await sb.from("expenses").update({
    payment_status: "calisan_cebinden_odedi",
    paid_date: date,
    paid_by_employee_id: employeeId,
    account_id: null,
  }).eq("id", pendingEmployeePayId);

  if (error) {
    employeePayError.textContent = error.message;
    return;
  }

  employeePayOverlay.classList.add("hidden");
  pendingEmployeePayId = null;
  await loadExpenses();
});

employeePayCancelBtn.addEventListener("click", () => {
  employeePayOverlay.classList.add("hidden");
  pendingEmployeePayId = null;
});

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

// ---- FORM MODE SWITCH (hızlı / detaylı / maaş-prim) ----------------------------
function setFormMode(type) {
  currentExpenseType = type;
  const isDetailed = type === "alis_faturasi";
  const isPayroll = type === "maas_prim";

  manualTotalsGroup.classList.toggle("hidden", isDetailed);
  linesGroup.classList.toggle("hidden", !isDetailed);
  computedTotalsBox.classList.toggle("hidden", !isDetailed);

  supplierFieldGroup.classList.toggle("hidden", isPayroll);
  employeeFieldGroup.classList.toggle("hidden", !isPayroll);
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

  // Deliberately does NOT autofill unit_price — see note in Sprint 7 recap.
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
  editingPaymentStatus = "odenecek"; // every new expense starts unpaid
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
  editingPaymentStatus = "odenecek";
  formError.textContent = "";
  resetCommonFields();
  setFormMode("alis_faturasi");
  formTitle.textContent = "Yeni Detaylı Fiş/Fatura";
  lineItemsEl.innerHTML = "";
  lineItemsEl.appendChild(createLineItemRow());
  recalcTotals();
  overlay.classList.remove("hidden");
}

function openForNewPayroll() {
  editingId = null;
  editingPaymentStatus = "odenecek";
  formError.textContent = "";
  resetCommonFields();
  setFormMode("maas_prim");
  formTitle.textContent = "Yeni Maaş/Prim";
  document.getElementById("manual_total").value = 0;
  document.getElementById("manual_tax").value = 0;
  lineItemsEl.innerHTML = "";
  overlay.classList.remove("hidden");
}

async function openForEdit(id) {
  const x = allExpenses.find((y) => y.id === id);
  if (!x) return;

  editingId = id;
  editingPaymentStatus = x.payment_status; // untouched by this form
  formError.textContent = "";
  setFormMode(x.expense_type);
  formTitle.textContent = {
    alis_faturasi: "Detaylı Fiş/Faturayı Düzenle",
    maas_prim: "Maaş/Primi Düzenle",
  }[x.expense_type] || "Hızlı Fiş/Faturayı Düzenle";

  document.getElementById("expense_name").value = x.expense_name || "";
  document.getElementById("supplier_id").value = x.supplier_id || "";
  document.getElementById("employee_id").value = x.employee_id || "";
  document.getElementById("receipt_date").value = x.receipt_date || "";
  document.getElementById("receipt_number").value = x.receipt_number || "";
  document.getElementById("currency").value = x.currency || "TRY";
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
    // total_amount is always the GROSS figure — back-compute the net field.
    const net = Number(x.total_amount || 0) - Number(x.tax_total || 0);
    document.getElementById("manual_total").value = net;
    document.getElementById("manual_tax").value = x.tax_total ?? 0;
  }

  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- SAVE (CALLS THE POSTGRES FUNCTIONS) ----------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const expenseName = document.getElementById("expense_name").value || null;
  const receiptDate = document.getElementById("receipt_date").value;
  const receiptNumber = document.getElementById("receipt_number").value || null;
  const currency = document.getElementById("currency").value;
  const dueDate = document.getElementById("due_date").value || null;
  const notes = document.getElementById("notes").value || null;

  const supplierId = currentExpenseType === "maas_prim"
    ? null
    : (document.getElementById("supplier_id").value || null);
  const employeeId = currentExpenseType === "maas_prim"
    ? (document.getElementById("employee_id").value || null)
    : null;

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
    p_employee_id: employeeId,
    p_expense_name: expenseName,
    p_expense_type: currentExpenseType,
    p_receipt_date: receiptDate,
    p_receipt_number: receiptNumber,
    p_currency: currency,
    p_payment_status: editingPaymentStatus, // never set by this form
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
newPayrollBtn.addEventListener("click", openForNewPayroll);
cancelBtn.addEventListener("click", closeForm);

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

// ---- START ----------------------------------------------------------------------------
init();
