-- Homesí P&L Internal App — Database Schema
-- Run this in the Supabase SQL Editor

create table gl_mapping (
  id uuid primary key default gen_random_uuid(),
  gl_code text not null unique,
  gl_name text not null,
  category_1 text,
  category_2 text,
  category_3 text,
  category_4 text,
  category_5 text,
  category_6 text,
  category_7 text,
  order_1 int,
  order_2 int,
  order_3 int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  branch text not null unique,
  region text,
  branch_manager text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table pl_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_at timestamptz default now(),
  row_count int,
  status text default 'processing',
  error_message text
);

create table pl_transactions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references pl_uploads(id) on delete cascade,
  gl_number_raw text,
  gl_code text,
  branch text,
  gl_name text,
  check_description text,
  loan_number text,
  borrower_name text,
  journal_post_date date,
  year int,
  month text,
  vendor text,
  invoice_numb text,
  ref_numb text,
  doc_type text,
  debit numeric(14,2) default 0,
  credit numeric(14,2) default 0,
  movement numeric(14,2),
  category_1 text,
  category_2 text,
  category_3 text,
  category_4 text,
  category_5 text,
  category_6 text,
  category_7 text,
  order_1 int,
  order_2 int,
  order_3 int,
  region text,
  branch_manager text,
  manual_override boolean default false,
  manual_category_7 text,
  created_at timestamptz default now()
);

create index idx_pl_transactions_gl_code on pl_transactions(gl_code);
create index idx_pl_transactions_branch on pl_transactions(branch);
create index idx_pl_transactions_upload on pl_transactions(upload_id);

-- Auto-update updated_at on gl_mapping and branches
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gl_mapping_updated_at
  before update on gl_mapping
  for each row execute function update_updated_at();

create trigger branches_updated_at
  before update on branches
  for each row execute function update_updated_at();
