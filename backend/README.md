# FinLex Backend — Phase 1

## Setup (do this once)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Then open .env and fill in your PostgreSQL password.

### 3. Create the database in PostgreSQL
Open pgAdmin or psql and run:
```sql
CREATE DATABASE finlex_db;
```

### 4. Run the schema (creates all tables)
Open pgAdmin → finlex_db → Query Tool → paste contents of:
```
sql/schema.sql
```
Run it. Then run:
```
sql/default_accounts.sql
```

### 5. Start the server
```bash
npm run dev
```
Server runs on http://localhost:5000

---

## API Endpoints (Phase 1)

### Auth
- POST /api/auth/register   — create CA account
- POST /api/auth/login      — login, get JWT token
- GET  /api/auth/me         — get current user

### Companies
- POST /api/companies       — create company (auto creates Chart of Accounts)
- GET  /api/companies       — list all companies for this CA
- GET  /api/companies/:id   — single company

### Invoices
- POST /api/invoices        — create invoice (auto GST calc + auto journal entry)
- GET  /api/invoices/company/:id — list invoices

### Reports
- GET /api/reports/trial-balance/:company_id   — Trial Balance
- GET /api/reports/pl/:company_id              — Profit & Loss
- GET /api/reports/balance-sheet/:company_id   — Balance Sheet

### Health
- GET /api/health

---

## What happens automatically when you create an invoice:
1. GST is calculated (CGST/SGST for intra-state, IGST for inter-state)
2. Invoice is saved with all line items
3. Double-entry journal entry is auto-created
4. Ledger updates automatically (it's a view on journal entries)
5. Trial Balance and Financial Statements reflect the change instantly

## Tech Stack
- Node.js + Express
- PostgreSQL
- JWT Authentication
- bcrypt password hashing
