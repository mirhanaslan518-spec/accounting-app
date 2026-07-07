// =========================================================
// quotes.js — logic for quotes.html
// Relies on shared.js being loaded first (sb, requireSession,
// getMyCompany).
// =========================================================

let currentCompanyId = null;
let allQuotes = [];
let allProducts = [];
let editingId = null;       // null = new quote, otherwise = id being edited
let editingStatus = "beklemede"; // preserved as-is when editing a quote's details
let currentFilter = "all";

const listEl = document.getElementById("quote-list");
const newBtn = document.getElementById("new-quote-btn");
const overlay = document.getElementById("quote-form-overlay");
const form = document.getElementById("quote-form");
const formTitle = document.getElementById("quote-form-title");
const formError = document.getElementById("quote-form-error");
const cancelBtn = document.getElementById("quote-cancel-btn");
const logoutBtn = document.getElementById("logout-btn");
const lineItemsEl = document.getElementById("line-items");
const addLineBtn = document.getElementById("add-line-btn");

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
  await loadQuotes();
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

// ---- LOAD + RENDER THE QUOTE LIST -----------------------------------------
async function loadQuotes() {
  listEl.innerHTML = `<p class="empty-state">Yükleniyor...</p>`;

  const { data, error } = await sb
    .from("quotes")
    .select("*, customers(company_title)")
    .eq("company_id", currentCompanyId)
    .order("issue_date", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state">Hata: ${error.message}</p>`;
    return;
  }
  allQuotes = data;
  renderList();
}

function statusInfo(status) {
  if (status === "kabul_edildi") return { label: "Kabul Edildi", cls: "status-ok" };
  if (status === "reddedildi") return { label: "Reddedildi", cls: "status-fail" };
  return { label: "Beklemede", cls: "status-pending" };
}

function renderList() {
  const filtered = currentFilter === "all"
    ? allQuotes
    : allQuotes.filter((q) => q.status === currentFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Gösterilecek teklif yok.</p>`;
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach((q) => {
    const status = statusInfo(q.status);

    let actionButtons = "";
    if (q.status === "beklemede") {
      actionButtons = `
        <button class="toggle-btn" data-id="${q.id}" data-action="kabul_edildi">Kabul Edildi Yap</button>
        <button class="reject-btn" data-id="${q.id}" data-action="reddedildi">Reddedildi Yap</button>
      `;
    } else if (q.status === "kabul_edildi") {
      actionButtons = `<button class="toggle-btn" data-id="${q.id}" data-action="beklemede">Beklemede Yap</button>`;
      if (!q.converted_invoice_id) {
        actionButtons += `<button class="convert-btn" data-id="${q.id}">Faturalandır</button>`;
      }
    } else {
      actionButtons = `<button class="toggle-btn" data-id="${q.id}" data-action="beklemede">Beklemede Yap</button>`;
    }

    // Conversion is permanent, regardless of what the quote's status gets
    // changed to afterward — so this note shows no matter which status
    // branch above fired, instead of only inside the "kabul_edildi" one.
    if (q.converted_invoice_id) {
      actionButtons += `<span class="converted-note">Faturalandırıldı</span>`;
    }

    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <strong>${escapeHtml(q.quote_name || "Teklif")}</strong>
        <span class="customer-card-sub">${escapeHtml(q.customers ? q.customers.company_title : "")} · ${q.issue_date || ""}</span>
        <span class="status-badge ${status.cls}">${status.label}</span>
      </div>
      <div class="customer-card-actions">
        <strong class="invoice-total">${Number(q.grand_total).toFixed(2)} ${q.currency}</strong>
        ${actionButtons}
        <button class="edit-btn" data-id="${q.id}">Düzenle</button>
        <button class="delete-btn" data-id="${q.id}">Sil</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openForEdit(btn.dataset.id));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteQuote(btn.dataset.id));
  });
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => updateQuoteStatus(btn.dataset.id, btn.dataset.action));
  });
  document.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => updateQuoteStatus(btn.dataset.id, btn.dataset.action));
  });
  document.querySelectorAll(".convert-btn").forEach((btn) => {
    btn.addEventListener("click", () => convertToInvoice(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- FILTER BAR (wired once — the buttons themselves don't change) -----------
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

// ---- STATUS ACTIONS ---------------------------------------------------------
async function updateQuoteStatus(id, newStatus) {
  const { error } = await sb.from("quotes").update({ status: newStatus }).eq("id", id);
  if (error) {
    alert(`Güncellenemedi: ${error.message}`);
    return;
  }
  await loadQuotes();
}

async function convertToInvoice(id) {
  const confirmed = confirm("Bu teklif faturaya dönüştürülsün mü? Bu işlem geri alınamaz.");
  if (!confirmed) return;

  const { error } = await sb.rpc("convert_quote_to_invoice", { p_quote_id: id });
  if (error) {
    alert(`Faturalandırılamadı: ${error.message}`);
    return;
  }
  alert("Teklif faturaya dönüştürüldü — Faturalar sayfasından görüntüleyebilirsiniz.");
  await loadQuotes();
}

async function deleteQuote(id) {
  const q = allQuotes.find((x) => x.id === id);
  const label = q ? (q.quote_name || "bu teklif") : "bu teklif";
  const confirmed = confirm(`"${label}" silinsin mi?`);
  if (!confirmed) return;

  const { error } = await sb.from("quotes").delete().eq("id", id);
  if (error) {
    alert(`Silinemedi: ${error.message}`);
    return;
  }
  await loadQuotes();
}

// ---- LINE ITEM ROWS (same pattern as invoices.js) -----------------------------
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
  editingStatus = "beklemede";
  formTitle.textContent = "Yeni Teklif";
  formError.textContent = "";
  form.reset();
  document.getElementById("issue_date").value = new Date().toISOString().slice(0, 10);

  lineItemsEl.innerHTML = "";
  lineItemsEl.appendChild(createLineItemRow());
  recalcTotals();

  overlay.classList.remove("hidden");
}

async function openForEdit(id) {
  const q = allQuotes.find((x) => x.id === id);
  if (!q) return;

  editingId = id;
  editingStatus = q.status;
  formTitle.textContent = "Teklifi Düzenle";
  formError.textContent = "";

  document.getElementById("quote_name").value = q.quote_name || "";
  document.getElementById("customer_id").value = q.customer_id || "";
  document.getElementById("issue_date").value = q.issue_date || "";
  document.getElementById("valid_until").value = q.valid_until || "";
  document.getElementById("currency").value = q.currency || "TRY";
  document.getElementById("terms").value = q.terms || "";
  document.getElementById("notes").value = q.notes || "";

  const { data: lines } = await sb
    .from("quote_lines")
    .select("*")
    .eq("quote_id", id);

  lineItemsEl.innerHTML = "";
  (lines || []).forEach((line) => lineItemsEl.appendChild(createLineItemRow(line)));
  if (!lines || lines.length === 0) lineItemsEl.appendChild(createLineItemRow());

  recalcTotals();
  overlay.classList.remove("hidden");
}

function closeForm() {
  overlay.classList.add("hidden");
}

// ---- VALIDITY DATE PRESETS -----------------------------------------------------
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const days = parseInt(btn.dataset.days, 10);
    const issueDateVal = document.getElementById("issue_date").value;
    if (!issueDateVal) return;
    const d = new Date(issueDateVal);
    d.setDate(d.getDate() + days);
    document.getElementById("valid_until").value = d.toISOString().slice(0, 10);
  });
});

// ---- SAVE (CALLS THE POSTGRES FUNCTIONS FROM sprint5_quotes.sql) --------------
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

  const quoteName = document.getElementById("quote_name").value || null;
  const issueDate = document.getElementById("issue_date").value;
  const validUntil = document.getElementById("valid_until").value || null;
  const currency = document.getElementById("currency").value;
  const terms = document.getElementById("terms").value || null;
  const notes = document.getElementById("notes").value || null;

  let result;
  if (editingId) {
    result = await sb.rpc("update_quote", {
      p_quote_id: editingId,
      p_customer_id: customerId,
      p_quote_name: quoteName,
      p_issue_date: issueDate,
      p_valid_until: validUntil,
      p_currency: currency,
      p_status: editingStatus, // untouched by this form
      p_terms: terms,
      p_notes: notes,
      p_lines: lines,
    });
  } else {
    result = await sb.rpc("create_quote", {
      p_company_id: currentCompanyId,
      p_customer_id: customerId,
      p_quote_name: quoteName,
      p_issue_date: issueDate,
      p_valid_until: validUntil,
      p_currency: currency,
      p_terms: terms,
      p_notes: notes,
      p_lines: lines,
    });
  }

  if (result.error) {
    formError.textContent = result.error.message;
    return;
  }

  closeForm();
  await loadQuotes();
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
