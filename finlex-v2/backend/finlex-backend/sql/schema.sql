-- ============================================================
-- FINLEX DATABASE SCHEMA — PHASE 1 + PHASE 2 (COMPLETE)
-- Run: psql -U postgres -d finlex_db -f schema.sql
-- ============================================================

-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean slate (careful in production!)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS tds_entries CASCADE;
DROP TABLE IF EXISTS journal_entry_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS compliance_deadlines CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS account_groups CASCADE;
DROP TABLE IF EXISTS ca_company_access CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS setup_default_accounts(INTEGER);
DROP FUNCTION IF EXISTS update_timestamp();

-- ============================================================
-- TABLE 1: USERS
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'ca',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: COMPANIES
-- ============================================================
CREATE TABLE companies (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  gstin           VARCHAR(15),
  pan             VARCHAR(10),
  state_code      VARCHAR(2),
  state_name      VARCHAR(100),
  financial_year  VARCHAR(9) NOT NULL DEFAULT '2024-25',
  fy_start_date   DATE,
  fy_end_date     DATE,
  address         TEXT,
  phone           VARCHAR(15),
  email           VARCHAR(150),
  business_type   VARCHAR(50) DEFAULT 'private_limited',
  gst_registered  BOOLEAN DEFAULT true,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 3: CA COMPANY ACCESS (Many-to-Many)
-- ============================================================
CREATE TABLE ca_company_access (
  id          SERIAL PRIMARY KEY,
  ca_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  role        VARCHAR(20) DEFAULT 'owner',
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(ca_id, company_id)
);

-- ============================================================
-- TABLE 4: ACCOUNT GROUPS
-- ============================================================
CREATE TABLE account_groups (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20) NOT NULL,  -- asset, liability, equity, revenue, expense
  nature      VARCHAR(10) NOT NULL,  -- debit, credit
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 5: ACCOUNTS (Chart of Accounts)
-- ============================================================
CREATE TABLE accounts (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  group_id        INTEGER REFERENCES account_groups(id),
  code            VARCHAR(10) NOT NULL,
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(20) NOT NULL,  -- asset, liability, equity, revenue, expense
  sub_type        VARCHAR(50),
  nature          VARCHAR(10) DEFAULT 'debit',
  parent_id       INTEGER REFERENCES accounts(id),
  is_system       BOOLEAN DEFAULT false,
  opening_balance NUMERIC(15,2) DEFAULT 0,
  balance         NUMERIC(15,2) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ============================================================
-- TABLE 6: INVOICES
-- ============================================================
CREATE TABLE invoices (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  invoice_type    VARCHAR(10) NOT NULL,  -- 'sale' or 'purchase'
  invoice_number  VARCHAR(50) NOT NULL,
  invoice_date    DATE NOT NULL,
  due_date        DATE,
  party_name      VARCHAR(200) NOT NULL,
  party_gstin     VARCHAR(15),
  party_address   TEXT,
  party_state     VARCHAR(2),
  subtotal        NUMERIC(15,2) DEFAULT 0,
  taxable_amount  NUMERIC(15,2) DEFAULT 0,
  cgst_amount     NUMERIC(15,2) DEFAULT 0,
  sgst_amount     NUMERIC(15,2) DEFAULT 0,
  igst_amount     NUMERIC(15,2) DEFAULT 0,
  total_amount    NUMERIC(15,2) DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'confirmed',
  payment_status  VARCHAR(20) DEFAULT 'unpaid',
  supply_type     VARCHAR(20) DEFAULT 'regular',
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, invoice_number)
);

-- ============================================================
-- TABLE 7: INVOICE ITEMS
-- ============================================================
CREATE TABLE invoice_items (
  id              SERIAL PRIMARY KEY,
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description     VARCHAR(300) NOT NULL,
  hsn_sac_code    VARCHAR(10),
  quantity        NUMERIC(10,3) NOT NULL,
  unit            VARCHAR(20) DEFAULT 'NOS',
  rate            NUMERIC(15,2) NOT NULL,
  taxable_amount  NUMERIC(15,2) NOT NULL,
  gst_rate        NUMERIC(5,2) DEFAULT 18,
  cgst_rate       NUMERIC(5,2) DEFAULT 9,
  sgst_rate       NUMERIC(5,2) DEFAULT 9,
  igst_rate       NUMERIC(5,2) DEFAULT 0,
  cgst_amount     NUMERIC(15,2) DEFAULT 0,
  sgst_amount     NUMERIC(15,2) DEFAULT 0,
  igst_amount     NUMERIC(15,2) DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL,
  account_id      INTEGER REFERENCES accounts(id)
);

-- ============================================================
-- TABLE 8: JOURNAL ENTRIES
-- ============================================================
CREATE TABLE journal_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  entry_number    VARCHAR(20),
  entry_date      DATE NOT NULL,
  reference_type  VARCHAR(20),  -- 'invoice', 'payment', 'tds', 'manual'
  reference_id    INTEGER,
  narration       TEXT NOT NULL,
  is_posted       BOOLEAN DEFAULT true,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 9: JOURNAL ENTRY LINES
-- ============================================================
CREATE TABLE journal_entry_lines (
  id                SERIAL PRIMARY KEY,
  journal_entry_id  INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        INTEGER REFERENCES accounts(id),
  debit_amount      NUMERIC(15,2) DEFAULT 0,
  credit_amount     NUMERIC(15,2) DEFAULT 0,
  narration         VARCHAR(300),
  CONSTRAINT debit_or_credit CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0) OR
    (debit_amount = 0 AND credit_amount = 0)
  )
);

-- ============================================================
-- TABLE 10: COMPLIANCE DEADLINES
-- ============================================================
CREATE TABLE compliance_deadlines (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,  -- 'GST', 'TDS', 'ITR', 'ROC', 'ADVANCE_TAX'
  name            VARCHAR(200) NOT NULL,
  due_date        DATE NOT NULL,
  financial_year  VARCHAR(9),
  period          VARCHAR(20),
  status          VARCHAR(20) DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 11: TDS ENTRIES (Phase 2)
-- ============================================================
CREATE TABLE tds_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  party_name      VARCHAR(200) NOT NULL,
  party_pan       VARCHAR(10),
  section         VARCHAR(10) NOT NULL,
  gross_amount    NUMERIC(15,2) NOT NULL,
  tds_rate        NUMERIC(5,2) NOT NULL,
  tds_amount      NUMERIC(15,2) NOT NULL,
  net_amount      NUMERIC(15,2) NOT NULL,
  payment_date    DATE NOT NULL,
  payment_nature  VARCHAR(100),
  challan_no      VARCHAR(50),
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 12: AUDIT LOG (Phase 2)
-- ============================================================
CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  action      VARCHAR(50) NOT NULL,
  table_name  VARCHAR(50),
  record_id   INTEGER,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_companies_created_by   ON companies(created_by);
CREATE INDEX idx_ca_access_ca           ON ca_company_access(ca_id);
CREATE INDEX idx_ca_access_company      ON ca_company_access(company_id);
CREATE INDEX idx_accounts_company       ON accounts(company_id);
CREATE INDEX idx_invoices_company       ON invoices(company_id);
CREATE INDEX idx_invoices_type          ON invoices(invoice_type);
CREATE INDEX idx_invoice_items_invoice  ON invoice_items(invoice_id);
CREATE INDEX idx_journal_company        ON journal_entries(company_id);
CREATE INDEX idx_journal_lines_entry    ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_compliance_company     ON compliance_deadlines(company_id);
CREATE INDEX idx_tds_company            ON tds_entries(company_id);
CREATE INDEX idx_audit_company          ON audit_log(company_id);

-- ============================================================
-- FUNCTION: setup_default_accounts
-- ============================================================
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
    (p_company_id,g_current_assets,'1007','TDS Receivable','asset','debit',false),
    (p_company_id,g_current_assets,'1008','Advance to Suppliers','asset','debit',false),
    (p_company_id,g_current_assets,'1009','Prepaid Expenses','asset','debit',false),
    (p_company_id,g_current_assets,'1010','Stock / Inventory','asset','debit',false),
    (p_company_id,g_fixed_assets,'1101','Plant & Machinery','asset','debit',false),
    (p_company_id,g_fixed_assets,'1102','Furniture & Fixtures','asset','debit',false),
    (p_company_id,g_fixed_assets,'1103','Computer Equipment','asset','debit',false),
    (p_company_id,g_fixed_assets,'1104','Land & Building','asset','debit',false),
    (p_company_id,g_current_liab,'2001','Accounts Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2002','Output GST (CGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2003','Output GST (SGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2004','Output GST (IGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2005','TDS Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2006','Advance from Customers','liability','credit',false),
    (p_company_id,g_current_liab,'2007','Salary Payable','liability','credit',false),
    (p_company_id,g_current_liab,'2008','PF Payable','liability','credit',false),
    (p_company_id,g_long_term_liab,'2101','Bank Loan','liability','credit',false),
    (p_company_id,g_long_term_liab,'2102','Directors Loan','liability','credit',false),
    (p_company_id,g_equity,'3001','Share Capital','equity','credit',true),
    (p_company_id,g_equity,'3002','Retained Earnings','equity','credit',true),
    (p_company_id,g_equity,'3003','Current Year Profit / Loss','equity','credit',true),
    (p_company_id,g_direct_income,'4001','Sales Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4002','Service Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4003','Sales Returns','revenue','debit',false),
    (p_company_id,g_indirect_income,'4101','Interest Income','revenue','credit',false),
    (p_company_id,g_indirect_income,'4102','Discount Received','revenue','credit',false),
    (p_company_id,g_indirect_income,'4103','Other Income','revenue','credit',false),
    (p_company_id,g_direct_expense,'5001','Purchases','expense','debit',true),
    (p_company_id,g_direct_expense,'5002','Purchase Returns','expense','credit',false),
    (p_company_id,g_direct_expense,'5003','Direct Labour','expense','debit',false),
    (p_company_id,g_indirect_expense,'5101','Salaries & Wages','expense','debit',false),
    (p_company_id,g_indirect_expense,'5102','Rent','expense','debit',false),
    (p_company_id,g_indirect_expense,'5103','Electricity','expense','debit',false),
    (p_company_id,g_indirect_expense,'5104','Internet & Phone','expense','debit',false),
    (p_company_id,g_indirect_expense,'5105','Office Supplies','expense','debit',false),
    (p_company_id,g_indirect_expense,'5106','Travel & Conveyance','expense','debit',false),
    (p_company_id,g_indirect_expense,'5107','Professional Fees','expense','debit',false),
    (p_company_id,g_indirect_expense,'5108','Bank Charges','expense','debit',false),
    (p_company_id,g_indirect_expense,'5109','Depreciation','expense','debit',false),
    (p_company_id,g_indirect_expense,'5110','Interest on Loan','expense','debit',false),
    (p_company_id,g_indirect_expense,'5111','GST Late Fee','expense','debit',false),
    (p_company_id,g_indirect_expense,'5112','Miscellaneous Expense','expense','debit',false);

  RAISE NOTICE 'Default Chart of Accounts created for company %', p_company_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_invoices_updated  BEFORE UPDATE ON invoices  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

SELECT 'FinLex Phase 1+2 schema created successfully' AS status;