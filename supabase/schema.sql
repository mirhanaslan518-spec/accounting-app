-- =========================================================
-- SPRINT 0 SCHEMA
-- Run this whole file once in the Supabase SQL Editor.
-- It creates every table for the app, and locks every table
-- down so a user can only ever see rows that belong to
-- their own company.
-- =========================================================

-- ---------------------------------------------------------
-- 1. COMPANIES
-- One row per business using the app. Today there will only
-- be one row here (yours). If this becomes a multi-company
-- product later, every new customer just becomes a new row.
-- ---------------------------------------------------------
create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2. COMPANY_USERS
-- Links a login (auth.users, managed by Supabase) to a
-- company. This is what lets us know "which company does
-- this logged-in person belong to".
-- ---------------------------------------------------------
create table company_users (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- ---------------------------------------------------------
-- 3. CUSTOMERS  (Müşteriler)
-- ---------------------------------------------------------
create table customers (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  tax_id           text,              -- VKN / TCKN
  customer_type    text default 'tuzel', -- 'tuzel' (company) or 'gercek' (individual)
  company_title    text not null,     -- FİRMA UNVANI
  short_name       text,              -- KISA İSİM
  tax_office       text,              -- VERGİ DAİRESİ
  category         text,
  email            text,
  phone            text,
  fax              text,
  address          text,
  postal_code      text,
  district         text,
  city             text,
  iban             text,
  price_list       text,
  currency         text default 'TRY',
  opening_balance  numeric default 0,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 4. SUPPLIERS  (Tedarikçiler)
-- ---------------------------------------------------------
create table suppliers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  tax_id         text,
  supplier_type  text default 'tuzel',
  company_title  text not null,
  short_name     text,
  tax_office     text,
  category       text,
  email          text,
  phone          text,
  address        text,
  iban           text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 5. PRODUCTS  (Hizmet ve Ürünler)
-- ---------------------------------------------------------
create table products (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,
  unit           text default 'adet',
  unit_price     numeric default 0,
  tax_rate       numeric default 20,   -- KDV %, e.g. 20 means 20%
  track_stock    boolean default true,
  stock_quantity numeric default 0,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 6. INVOICES  (Satış Faturaları)
-- ---------------------------------------------------------
create table invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  customer_id      uuid references customers(id),
  invoice_name     text,
  invoice_number   text,
  invoice_type     text default 'satis', -- satis / proforma / ihracat / konaklama
  issue_date       date not null default current_date,
  due_date         date,
  collection_status text not null default 'tahsil_edilecek', -- tahsil_edilecek / tahsil_edildi
  currency         text default 'TRY',
  stock_movement   boolean default true,
  subtotal         numeric default 0,
  tax_total        numeric default 0,
  grand_total      numeric default 0,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 7. INVOICE_LINES (the product rows inside one invoice)
-- ---------------------------------------------------------
create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  product_id   uuid references products(id),
  description  text,
  quantity     numeric not null default 1,
  unit         text,
  unit_price   numeric not null default 0,
  tax_rate     numeric not null default 20,
  line_total   numeric not null default 0
);

-- ---------------------------------------------------------
-- 8. EXPENSES  (Giderler: Fiş/Fatura and Alış Faturası)
-- ---------------------------------------------------------
create table expenses (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  supplier_id      uuid references suppliers(id),
  expense_name     text,
  expense_type     text default 'fis_fatura', -- fis_fatura / alis_faturasi
  receipt_date     date not null default current_date,
  receipt_number   text,
  total_amount     numeric default 0,
  tax_total        numeric default 0,
  currency         text default 'TRY',
  payment_status   text not null default 'odenecek', -- odenecek / odendi
  due_date         date,
  stock_movement   boolean default false,
  receipt_image_url text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 9. EXPENSE_LINES (product rows inside an Alış Faturası)
-- ---------------------------------------------------------
create table expense_lines (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses(id) on delete cascade,
  product_id   uuid references products(id),
  description  text,
  quantity     numeric not null default 1,
  unit         text,
  unit_price   numeric not null default 0,
  tax_rate     numeric not null default 20,
  line_total   numeric not null default 0
);

-- =========================================================
-- SECURITY: Row Level Security (RLS)
-- Without this, anyone with your public API key could read
-- or write any row. This is what makes "company_id" actually
-- mean something.
-- =========================================================

-- Helper function: "does the currently logged-in user belong
-- to this company?" Every policy below reuses this.
create or replace function is_company_member(target_company_id uuid)
returns boolean as $$
  select exists (
    select 1 from company_users
    where company_users.company_id = target_company_id
    and company_users.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Turn RLS on for every table
alter table companies       enable row level security;
alter table company_users   enable row level security;
alter table customers       enable row level security;
alter table suppliers       enable row level security;
alter table products        enable row level security;
alter table invoices        enable row level security;
alter table invoice_lines   enable row level security;
alter table expenses        enable row level security;
alter table expense_lines   enable row level security;

-- companies: you can see/edit companies you belong to
create policy "member can view company" on companies
  for select using (is_company_member(id));
create policy "member can update company" on companies
  for update using (is_company_member(id));

-- company_users: you can see your own membership rows
create policy "user can view own membership" on company_users
  for select using (user_id = auth.uid());

-- customers
create policy "member can view customers" on customers
  for select using (is_company_member(company_id));
create policy "member can insert customers" on customers
  for insert with check (is_company_member(company_id));
create policy "member can update customers" on customers
  for update using (is_company_member(company_id));
create policy "member can delete customers" on customers
  for delete using (is_company_member(company_id));

-- suppliers
create policy "member can view suppliers" on suppliers
  for select using (is_company_member(company_id));
create policy "member can insert suppliers" on suppliers
  for insert with check (is_company_member(company_id));
create policy "member can update suppliers" on suppliers
  for update using (is_company_member(company_id));
create policy "member can delete suppliers" on suppliers
  for delete using (is_company_member(company_id));

-- products
create policy "member can view products" on products
  for select using (is_company_member(company_id));
create policy "member can insert products" on products
  for insert with check (is_company_member(company_id));
create policy "member can update products" on products
  for update using (is_company_member(company_id));
create policy "member can delete products" on products
  for delete using (is_company_member(company_id));

-- invoices
create policy "member can view invoices" on invoices
  for select using (is_company_member(company_id));
create policy "member can insert invoices" on invoices
  for insert with check (is_company_member(company_id));
create policy "member can update invoices" on invoices
  for update using (is_company_member(company_id));
create policy "member can delete invoices" on invoices
  for delete using (is_company_member(company_id));

-- invoice_lines (check permission through the parent invoice)
create policy "member can view invoice lines" on invoice_lines
  for select using (
    exists (select 1 from invoices where invoices.id = invoice_lines.invoice_id
            and is_company_member(invoices.company_id))
  );
create policy "member can insert invoice lines" on invoice_lines
  for insert with check (
    exists (select 1 from invoices where invoices.id = invoice_lines.invoice_id
            and is_company_member(invoices.company_id))
  );
create policy "member can update invoice lines" on invoice_lines
  for update using (
    exists (select 1 from invoices where invoices.id = invoice_lines.invoice_id
            and is_company_member(invoices.company_id))
  );
create policy "member can delete invoice lines" on invoice_lines
  for delete using (
    exists (select 1 from invoices where invoices.id = invoice_lines.invoice_id
            and is_company_member(invoices.company_id))
  );

-- expenses
create policy "member can view expenses" on expenses
  for select using (is_company_member(company_id));
create policy "member can insert expenses" on expenses
  for insert with check (is_company_member(company_id));
create policy "member can update expenses" on expenses
  for update using (is_company_member(company_id));
create policy "member can delete expenses" on expenses
  for delete using (is_company_member(company_id));

-- expense_lines
create policy "member can view expense lines" on expense_lines
  for select using (
    exists (select 1 from expenses where expenses.id = expense_lines.expense_id
            and is_company_member(expenses.company_id))
  );
create policy "member can insert expense lines" on expense_lines
  for insert with check (
    exists (select 1 from expenses where expenses.id = expense_lines.expense_id
            and is_company_member(expenses.company_id))
  );
create policy "member can update expense lines" on expense_lines
  for update using (
    exists (select 1 from expenses where expenses.id = expense_lines.expense_id
            and is_company_member(expenses.company_id))
  );
create policy "member can delete expense lines" on expense_lines
  for delete using (
    exists (select 1 from expenses where expenses.id = expense_lines.expense_id
            and is_company_member(expenses.company_id))
  );
