-- ============================================================
-- FINLEX V2 MIGRATION — ALL BUG FIXES + NEW FEATURES
-- Run once on existing database: psql -U postgres -d finlex_db -f migration_v2.sql
-- ============================================================

-- ── BUG FIX 1: TAN column on companies ─────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tan VARCHAR(10) DEFAULT NULL;
COMMENT ON COLUMN companies.tan IS 'Tax Deduction Account Number for TDS returns (Form 26Q/27Q)';

-- ── BUG FIX 2: deposited flag on tds_entries ───────────────
ALTER TABLE tds_entries ADD COLUMN IF NOT EXISTS deposited BOOLEAN DEFAULT false;
ALTER TABLE tds_entries ADD COLUMN IF NOT EXISTS deposit_date DATE DEFAULT NULL;
COMMENT ON COLUMN tds_entries.deposited IS 'Whether TDS has been deposited to govt via challan';

-- ── BUG FIX 3: advance_tax_paid account (replaces misuse of 1008) ──
-- Handled via new account codes added in setup_default_accounts (see below)

-- ── NEW FEATURE: Credit / Debit Notes ──────────────────────
CREATE TABLE IF NOT EXISTS credit_debit_notes (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  note_type       VARCHAR(10) NOT NULL,        -- 'credit' or 'debit'
  note_number     VARCHAR(50) NOT NULL,
  note_date       DATE NOT NULL,
  original_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  original_invoice_number VARCHAR(50),
  party_name      VARCHAR(200) NOT NULL,
  party_gstin     VARCHAR(15),
  party_state     VARCHAR(2),
  reason          VARCHAR(200),
  subtotal        NUMERIC(15,2) DEFAULT 0,
  taxable_amount  NUMERIC(15,2) DEFAULT 0,
  cgst_amount     NUMERIC(15,2) DEFAULT 0,
  sgst_amount     NUMERIC(15,2) DEFAULT 0,
  igst_amount     NUMERIC(15,2) DEFAULT 0,
  total_amount    NUMERIC(15,2) DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'confirmed',
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, note_number)
);

CREATE TABLE IF NOT EXISTS credit_debit_note_items (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER REFERENCES credit_debit_notes(id) ON DELETE CASCADE,
  description     VARCHAR(300) NOT NULL,
  hsn_sac_code    VARCHAR(10),
  quantity        NUMERIC(10,3) NOT NULL,
  unit            VARCHAR(20) DEFAULT 'NOS',
  rate            NUMERIC(15,2) NOT NULL,
  taxable_amount  NUMERIC(15,2) NOT NULL,
  gst_rate        NUMERIC(5,2) DEFAULT 18,
  cgst_amount     NUMERIC(15,2) DEFAULT 0,
  sgst_amount     NUMERIC(15,2) DEFAULT 0,
  igst_amount     NUMERIC(15,2) DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL
);

-- ── NEW FEATURE: Opening Balances Import ───────────────────
-- Uses existing accounts.opening_balance column; new import log for audit
CREATE TABLE IF NOT EXISTS opening_balance_imports (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  import_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  financial_year  VARCHAR(9) NOT NULL,
  total_debit     NUMERIC(15,2) DEFAULT 0,
  total_credit    NUMERIC(15,2) DEFAULT 0,
  is_balanced     BOOLEAN DEFAULT false,
  imported_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── NEW FEATURE: Bank Reconciliation ───────────────────────
CREATE TABLE IF NOT EXISTS bank_statements (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  account_id      INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date  DATE NOT NULL,
  description     VARCHAR(300) NOT NULL,
  debit_amount    NUMERIC(15,2) DEFAULT 0,
  credit_amount   NUMERIC(15,2) DEFAULT 0,
  balance         NUMERIC(15,2) DEFAULT 0,
  reference       VARCHAR(100),
  matched         BOOLEAN DEFAULT false,
  matched_je_id   INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_stmt_company ON bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_stmt_account ON bank_statements(account_id);

-- ── NEW FEATURE: Payroll ────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   VARCHAR(200) NOT NULL,
  employee_pan    VARCHAR(10),
  month           INTEGER NOT NULL,
  year            INTEGER NOT NULL,
  gross_salary    NUMERIC(15,2) NOT NULL,
  basic           NUMERIC(15,2) DEFAULT 0,
  hra             NUMERIC(15,2) DEFAULT 0,
  allowances      NUMERIC(15,2) DEFAULT 0,
  pf_employee     NUMERIC(15,2) DEFAULT 0,
  pf_employer     NUMERIC(15,2) DEFAULT 0,
  esic_employee   NUMERIC(15,2) DEFAULT 0,
  esic_employer   NUMERIC(15,2) DEFAULT 0,
  tds_amount      NUMERIC(15,2) DEFAULT 0,
  other_deductions NUMERIC(15,2) DEFAULT 0,
  net_salary      NUMERIC(15,2) NOT NULL,
  payment_date    DATE,
  payment_mode    VARCHAR(20) DEFAULT 'bank',
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_company ON payroll_entries(company_id);

-- ── NEW FEATURE: Depreciation ──────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  asset_name      VARCHAR(200) NOT NULL,
  asset_code      VARCHAR(50),
  category        VARCHAR(50),
  purchase_date   DATE NOT NULL,
  cost_price      NUMERIC(15,2) NOT NULL,
  salvage_value   NUMERIC(15,2) DEFAULT 0,
  useful_life_years INTEGER DEFAULT 5,
  method          VARCHAR(10) DEFAULT 'SLM',  -- SLM or WDV
  wdv_rate        NUMERIC(5,2) DEFAULT 20,    -- % for WDV
  current_wdv     NUMERIC(15,2),              -- auto-updated
  account_id      INTEGER REFERENCES accounts(id),
  is_active       BOOLEAN DEFAULT true,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depreciation_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  asset_id        INTEGER REFERENCES fixed_assets(id) ON DELETE CASCADE,
  financial_year  VARCHAR(9) NOT NULL,
  opening_wdv     NUMERIC(15,2) NOT NULL,
  depreciation    NUMERIC(15,2) NOT NULL,
  closing_wdv     NUMERIC(15,2) NOT NULL,
  method          VARCHAR(10) NOT NULL,
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(asset_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets(company_id);

-- ── INDEXES for new tables ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cdn_company ON credit_debit_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_company ON depreciation_entries(company_id);

-- ── Update setup_default_accounts to add new tax accounts ──
CREATE OR REPLACE FUNCTION setup_default_accounts(p_company_id INTEGER)
RETURNS VOID AS $$
DECLARE
  g_current_assets    INTEGER;
  g_fixed_assets      INTEGER;
  g_current_liab      INTEGER;
  g_long_term_liab    INTEGER;
  g_equity            INTEGER;
  g_direct_income     INTEGER;
  g_indirect_income   INTEGER;
  g_direct_expense    INTEGER;
  g_indirect_expense  INTEGER;
BEGIN
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Current Assets','asset','debit') RETURNING id INTO g_current_assets;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Fixed Assets','asset','debit') RETURNING id INTO g_fixed_assets;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Current Liabilities','liability','credit') RETURNING id INTO g_current_liab;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Long Term Liabilities','liability','credit') RETURNING id INTO g_long_term_liab;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Capital & Reserves','equity','credit') RETURNING id INTO g_equity;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Direct Income','revenue','credit') RETURNING id INTO g_direct_income;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Indirect Income','revenue','credit') RETURNING id INTO g_indirect_income;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Direct Expenses','expense','debit') RETURNING id INTO g_direct_expense;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Indirect Expenses','expense','debit') RETURNING id INTO g_indirect_expense;

  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id,g_current_assets,'1001','Cash in Hand','asset','debit',true),
    (p_company_id,g_current_assets,'1002','Bank Account','asset','debit',true),
    (p_company_id,g_current_assets,'1003','Accounts Receivable','asset','debit',true),
    (p_company_id,g_current_assets,'1004','Input GST (CGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1005','Input GST (SGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1006','Input GST (IGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1007','TDS Receivable','asset','debit',true),
    (p_company_id,g_current_assets,'1008','Advance to Suppliers','asset','debit',false),
    (p_company_id,g_current_assets,'1009','Prepaid Expenses','asset','debit',false),
    (p_company_id,g_current_assets,'1010','Stock / Inventory','asset','debit',false),
    (p_company_id,g_current_assets,'1011','Advance Tax Paid','asset','debit',true),
    (p_company_id,g_current_assets,'1012','Self Assessment Tax Paid','asset','debit',true),
    (p_company_id,g_fixed_assets,'1101','Plant & Machinery','asset','debit',false),
    (p_company_id,g_fixed_assets,'1102','Furniture & Fixtures','asset','debit',false),
    (p_company_id,g_fixed_assets,'1103','Computer Equipment','asset','debit',false),
    (p_company_id,g_fixed_assets,'1104','Land & Building','asset','debit',false),
    (p_company_id,g_fixed_assets,'1105','Accumulated Depreciation','asset','credit',false),
    (p_company_id,g_current_liab,'2001','Accounts Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2002','Output GST (CGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2003','Output GST (SGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2004','Output GST (IGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2005','TDS Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2006','Advance from Customers','liability','credit',false),
    (p_company_id,g_current_liab,'2007','Salary Payable','liability','credit',false),
    (p_company_id,g_current_liab,'2008','PF Payable','liability','credit',false),
    (p_company_id,g_current_liab,'2009','ESIC Payable','liability','credit',false),
    (p_company_id,g_long_term_liab,'2101','Bank Loan','liability','credit',false),
    (p_company_id,g_long_term_liab,'2102','Directors Loan','liability','credit',false),
    (p_company_id,g_equity,'3001','Share Capital','equity','credit',true),
    (p_company_id,g_equity,'3002','Retained Earnings','equity','credit',true),
    (p_company_id,g_equity,'3003','Current Year Profit / Loss','equity','credit',true),
    (p_company_id,g_direct_income,'4001','Sales Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4002','Service Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4003','Sales Returns & Allowances','revenue','debit',false),
    (p_company_id,g_indirect_income,'4101','Interest Income','revenue','credit',false),
    (p_company_id,g_indirect_income,'4102','Discount Received','revenue','credit',false),
    (p_company_id,g_indirect_income,'4103','Other Income','revenue','credit',false),
    (p_company_id,g_direct_expense,'5001','Purchases','expense','debit',true),
    (p_company_id,g_direct_expense,'5002','Purchase Returns','expense','credit',false),
    (p_company_id,g_direct_expense,'5003','Direct Labour','expense','debit',false),
    (p_company_id,g_indirect_expense,'5101','Salaries & Wages','expense','debit',true),
    (p_company_id,g_indirect_expense,'5102','Rent','expense','debit',false),
    (p_company_id,g_indirect_expense,'5103','Electricity','expense','debit',false),
    (p_company_id,g_indirect_expense,'5104','Internet & Phone','expense','debit',false),
    (p_company_id,g_indirect_expense,'5105','Office Supplies','expense','debit',false),
    (p_company_id,g_indirect_expense,'5106','Travel & Conveyance','expense','debit',false),
    (p_company_id,g_indirect_expense,'5107','Professional Fees','expense','debit',false),
    (p_company_id,g_indirect_expense,'5108','Bank Charges','expense','debit',false),
    (p_company_id,g_indirect_expense,'5109','Depreciation','expense','debit',true),
    (p_company_id,g_indirect_expense,'5110','Interest on Loan','expense','debit',false),
    (p_company_id,g_indirect_expense,'5111','GST Late Fee','expense','debit',false),
    (p_company_id,g_indirect_expense,'5112','Miscellaneous Expense','expense','debit',false),
    (p_company_id,g_indirect_expense,'5113','PF Employer Contribution','expense','debit',false),
    (p_company_id,g_indirect_expense,'5114','ESIC Employer Contribution','expense','debit',false);

  RAISE NOTICE 'Default Chart of Accounts created for company %', p_company_id;
END;
$$ LANGUAGE plpgsql;

SELECT 'FinLex V2 migration applied successfully' AS status;