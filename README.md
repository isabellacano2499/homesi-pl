# Homesí P&L

Internal web app for Supreme Lending that replaces a Power Query / Excel process for reviewing and classifying P&L transactions from the accounting GL Detail Report.

## What it does

- **Upload P&L**: Parse the GL Detail Report export and normalize it (fill-down, totals filter, GL Code / Branch split). Also supports **Addbacks** — a pre-formatted supplemental file.
- **GL Mapping**: Assign Category 1–7 and Order 1–3 to each GL Code; drives the pivot hierarchy.
- **Branches**: Map branch codes to region and branch manager.
- **Cost Centers**: Rule-based engine that auto-assigns each transaction to a cost center (or flags conflicts).
- **Transaction Review**: Paginated table with column filters (categorical, text, numeric range) for all 12 k+ rows.
- **P&L All**: Pivot report — Category 2 → Category 7 → GL Name → GL Code, month columns + Total. Filterable by Year, Branch, Source.
- **Cost Center Report**: Same pivot structure, filtered by cost center. Supports Unassigned / Conflict views.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v3 |
| Database | Supabase (PostgreSQL + PostgREST) |
| Excel parsing | `xlsx` (SheetJS) |
| Hosting | Vercel |

## Local setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/isabellacano2499/homesi-pl.git
cd homesi-pl
npm install

# 2. Create your local environment file
cp .env.local.example .env.local
# Edit .env.local and fill in your Supabase URL and keys
# (available at https://app.supabase.com/project/<slug>/settings/api)

# 3. Create the database schema
# Run supabase/schema.sql in the Supabase SQL Editor, then also run:
# alter table pl_transactions
#   add column if not exists cost_center_id uuid references cost_centers(id),
#   add column if not exists cost_center_status text default 'unassigned',
#   add column if not exists cost_center_conflicts jsonb,
#   add column if not exists source text default 'original';

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
