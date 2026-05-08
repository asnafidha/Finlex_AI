-- ============================================================
-- FINLEX SEED DATA — Complete Test Data
-- Run: psql -U postgres -d finlex_db -f /tmp/seed.sql
-- ============================================================

-- Clean existing data
TRUNCATE TABLE audit_log, tds_entries, journal_entry_lines, journal_entries,
  invoice_items, invoices, compliance_deadlines, accounts, account_groups,
  ca_company_access, companies, users RESTART IDENTITY CASCADE;

-- ============================================================
-- 1. USER (CA)
-- Password: password123
-- ============================================================
INSERT INTO users (name, email, password_hash, role) VALUES
('Fida Ahmed CA', 'fida@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGX.ZabC9mMdE7PcU1VYUiEeSOy', 'ca');

-- ============================================================
-- 2. COMPANIES
-- ============================================================
INSERT INTO companies (name, gstin, pan, state_code, state_name, financial_year, fy_start_date, fy_end_date, address, phone, email, business_type, created_by) VALUES
('Rahul Exports Pvt Ltd', '27AABCR1234A1Z5', 'AABCR1234A', '27', 'Maharashtra', '2024-25', '2024-04-01', '2025-03-31', '123 MG Road, Mumbai, Maharashtra 400001', '9876543210', 'rahul@rahulexports.com', 'private_limited', 1),
('Kerala Spices Traders', '32AADCK5678B1Z3', 'AADCK5678B', '32', 'Kerala', '2024-25', '2024-04-01', '2025-03-31', '45 Spice Market, Kozhikode, Kerala 673001', '9845123456', 'info@keralaspices.com', 'proprietorship', 1);

-- ============================================================
-- 3. CA COMPANY ACCESS
-- ============================================================
INSERT INTO ca_company_access (ca_id, company_id, role) VALUES
(1, 1, 'owner'),
(1, 2, 'owner');

-- ============================================================
-- 4. ACCOUNT GROUPS — Company 1
-- ============================================================
INSERT INTO account_groups (company_id, name, type, nature) VALUES
(1, 'Current Assets', 'asset', 'debit'),
(1, 'Fixed Assets', 'asset', 'debit'),
(1, 'Current Liabilities', 'liability', 'credit'),
(1, 'Long Term Liabilities', 'liability', 'credit'),
(1, 'Capital & Reserves', 'equity', 'credit'),
(1, 'Direct Income', 'revenue', 'credit'),
(1, 'Indirect Income', 'revenue', 'credit'),
(1, 'Direct Expenses', 'expense', 'debit'),
(1, 'Indirect Expenses', 'expense', 'debit');

-- Account Groups — Company 2
INSERT INTO account_groups (company_id, name, type, nature) VALUES
(2, 'Current Assets', 'asset', 'debit'),
(2, 'Fixed Assets', 'asset', 'debit'),
(2, 'Current Liabilities', 'liability', 'credit'),
(2, 'Long Term Liabilities', 'liability', 'credit'),
(2, 'Capital & Reserves', 'equity', 'credit'),
(2, 'Direct Income', 'revenue', 'credit'),
(2, 'Indirect Income', 'revenue', 'credit'),
(2, 'Direct Expenses', 'expense', 'debit'),
(2, 'Indirect Expenses', 'expense', 'debit');

-- ============================================================
-- 5. ACCOUNTS — Company 1
-- ============================================================
INSERT INTO accounts (company_id, group_id, code, name, type, nature, is_system, opening_balance) VALUES
-- Assets
(1, 1, '1001', 'Cash in Hand',        'asset', 'debit', true,  50000),
(1, 1, '1002', 'Bank Account',        'asset', 'debit', true,  250000),
(1, 1, '1003', 'Accounts Receivable', 'asset', 'debit', true,  0),
(1, 1, '1004', 'Input GST (CGST)',    'asset', 'debit', true,  0),
(1, 1, '1005', 'Input GST (SGST)',    'asset', 'debit', true,  0),
(1, 1, '1006', 'Input GST (IGST)',    'asset', 'debit', true,  0),
(1, 1, '1007', 'TDS Receivable',      'asset', 'debit', false, 0),
(1, 2, '1101', 'Computer Equipment',  'asset', 'debit', false, 80000),
-- Liabilities
(1, 3, '2001', 'Accounts Payable',    'liability', 'credit', true,  0),
(1, 3, '2002', 'Output GST (CGST)',   'liability', 'credit', true,  0),
(1, 3, '2003', 'Output GST (SGST)',   'liability', 'credit', true,  0),
(1, 3, '2004', 'Output GST (IGST)',   'liability', 'credit', true,  0),
(1, 3, '2005', 'TDS Payable',         'liability', 'credit', true,  0),
-- Equity
(1, 5, '3001', 'Share Capital',       'equity', 'credit', true,  500000),
(1, 5, '3002', 'Retained Earnings',   'equity', 'credit', true,  120000),
-- Revenue
(1, 6, '4001', 'Sales Revenue',       'revenue', 'credit', true,  0),
(1, 6, '4002', 'Service Revenue',     'revenue', 'credit', true,  0),
(1, 7, '4101', 'Other Income',        'revenue', 'credit', false, 0),
-- Expenses
(1, 8, '5001', 'Purchases',           'expense', 'debit', true,  0),
(1, 9, '5101', 'Salaries & Wages',    'expense', 'debit', false, 0),
(1, 9, '5102', 'Rent',                'expense', 'debit', false, 0),
(1, 9, '5107', 'Professional Fees',   'expense', 'debit', false, 0),
(1, 9, '5108', 'Bank Charges',        'expense', 'debit', false, 0),
(1, 9, '5112', 'Misc Expense',        'expense', 'debit', false, 0);

-- Accounts — Company 2
INSERT INTO accounts (company_id, group_id, code, name, type, nature, is_system, opening_balance) VALUES
(2, 10, '1001', 'Cash in Hand',        'asset', 'debit', true,  30000),
(2, 10, '1002', 'Bank Account',        'asset', 'debit', true,  150000),
(2, 10, '1003', 'Accounts Receivable', 'asset', 'debit', true,  0),
(2, 10, '1004', 'Input GST (CGST)',    'asset', 'debit', true,  0),
(2, 10, '1005', 'Input GST (SGST)',    'asset', 'debit', true,  0),
(2, 10, '1006', 'Input GST (IGST)',    'asset', 'debit', true,  0),
(2, 12, '2001', 'Accounts Payable',    'liability', 'credit', true,  0),
(2, 12, '2002', 'Output GST (CGST)',   'liability', 'credit', true,  0),
(2, 12, '2003', 'Output GST (SGST)',   'liability', 'credit', true,  0),
(2, 12, '2004', 'Output GST (IGST)',   'liability', 'credit', true,  0),
(2, 12, '2005', 'TDS Payable',         'liability', 'credit', true,  0),
(2, 14, '3001', 'Share Capital',       'equity', 'credit', true,  300000),
(2, 15, '4001', 'Sales Revenue',       'revenue', 'credit', true,  0),
(2, 15, '4002', 'Service Revenue',     'revenue', 'credit', true,  0),
(2, 17, '5001', 'Purchases',           'expense', 'debit', true,  0),
(2, 18, '5101', 'Salaries & Wages',    'expense', 'debit', false, 0),
(2, 18, '5107', 'Professional Fees',   'expense', 'debit', false, 0);

-- ============================================================
-- 6. COMPLIANCE DEADLINES — Company 1
-- ============================================================
INSERT INTO compliance_deadlines (company_id, type, name, due_date, financial_year, status) VALUES
(1, 'GST',          'GSTR-1 Filing (Apr 2024)',       '2024-05-11', '2024-25', 'completed'),
(1, 'GST',          'GSTR-3B Filing (Apr 2024)',      '2024-05-20', '2024-25', 'completed'),
(1, 'GST',          'GSTR-1 Filing (May 2024)',       '2024-06-11', '2024-25', 'completed'),
(1, 'GST',          'GSTR-3B Filing (May 2024)',      '2024-06-20', '2024-25', 'completed'),
(1, 'GST',          'GSTR-1 Filing (Jun 2024)',       '2024-07-11', '2024-25', 'completed'),
(1, 'GST',          'GSTR-3B Filing (Jun 2024)',      '2024-07-20', '2024-25', 'completed'),
(1, 'TDS',          'TDS Return Q1 (Apr-Jun 2024)',   '2024-07-31', '2024-25', 'completed'),
(1, 'ADVANCE_TAX',  'Advance Tax Q1',                 '2024-06-15', '2024-25', 'completed'),
(1, 'ADVANCE_TAX',  'Advance Tax Q2',                 '2024-09-15', '2024-25', 'completed'),
(1, 'TDS',          'TDS Return Q2 (Jul-Sep 2024)',   '2024-10-31', '2024-25', 'completed'),
(1, 'ADVANCE_TAX',  'Advance Tax Q3',                 '2024-12-15', '2024-25', 'completed'),
(1, 'TDS',          'TDS Return Q3 (Oct-Dec 2024)',   '2025-01-31', '2024-25', 'pending'),
(1, 'GST',          'GSTR-1 Filing (Jan 2025)',       '2025-02-11', '2024-25', 'pending'),
(1, 'GST',          'GSTR-3B Filing (Jan 2025)',      '2025-02-20', '2024-25', 'pending'),
(1, 'GST',          'GSTR-1 Filing (Feb 2025)',       '2025-03-11', '2024-25', 'pending'),
(1, 'GST',          'GSTR-3B Filing (Feb 2025)',      '2025-03-20', '2024-25', 'pending'),
(1, 'ADVANCE_TAX',  'Advance Tax Q4',                 '2025-03-15', '2024-25', 'pending'),
(1, 'TDS',          'TDS Return Q4 (Jan-Mar 2025)',   '2025-05-31', '2024-25', 'pending'),
(1, 'ITR',          'ITR Filing FY 2024-25',          '2025-07-31', '2024-25', 'pending'),
(1, 'ROC',          'ROC Annual Return',              '2025-09-30', '2024-25', 'pending');

-- Compliance — Company 2
INSERT INTO compliance_deadlines (company_id, type, name, due_date, financial_year, status) VALUES
(2, 'GST',         'GSTR-1 Filing (Apr 2024)',       '2024-05-11', '2024-25', 'completed'),
(2, 'GST',         'GSTR-3B Filing (Apr 2024)',      '2024-05-20', '2024-25', 'completed'),
(2, 'TDS',         'TDS Return Q1',                  '2024-07-31', '2024-25', 'completed'),
(2, 'GST',         'GSTR-1 Filing (Jan 2025)',       '2025-02-11', '2024-25', 'pending'),
(2, 'GST',         'GSTR-3B Filing (Jan 2025)',      '2025-02-20', '2024-25', 'pending'),
(2, 'ITR',         'ITR Filing FY 2024-25',          '2025-07-31', '2024-25', 'pending');

-- ============================================================
-- 7. INVOICES — Company 1 (Sales)
-- ============================================================
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, notes) VALUES
-- Intra-state sales (Maharashtra to Maharashtra) — CGST + SGST
(1, 'sale', 'INV-2024-001', '2024-04-05', '2024-05-05', 'Tech Solutions Mumbai',   '27AABCT9876B1Z1', '27', 100000, 100000, 9000, 9000, 0,     118000, 'confirmed', 'paid',   'Software services April'),
(1, 'sale', 'INV-2024-002', '2024-05-10', '2024-06-10', 'Pune Distributors Ltd',   '27AAECP4567C1Z2', '27', 50000,  50000,  4500, 4500, 0,     59000,  'confirmed', 'paid',   'Product supply May'),
(1, 'sale', 'INV-2024-003', '2024-06-15', '2024-07-15', 'Mumbai Retailers Co',     '27AABCM7654D1Z3', '27', 75000,  75000,  6750, 6750, 0,     88500,  'confirmed', 'partial','Goods June'),
-- Inter-state sales (Maharashtra to Kerala) — IGST
(1, 'sale', 'INV-2024-004', '2024-07-20', '2024-08-20', 'Kerala Imports Pvt Ltd',  '32AABCK3456E1Z4', '32', 200000, 200000, 0,    0,    36000, 236000, 'confirmed', 'unpaid', 'Export goods July'),
(1, 'sale', 'INV-2024-005', '2024-08-25', '2024-09-25', 'Bangalore Tech Corp',     '29AABCB8901F1Z5', '29', 150000, 150000, 0,    0,    27000, 177000, 'confirmed', 'paid',   'IT services Aug'),
(1, 'sale', 'INV-2024-006', '2024-09-30', '2024-10-30', 'Delhi Enterprises',       '07AABCD2345G1Z6', '07', 80000,  80000,  0,    0,    14400, 94400,  'confirmed', 'unpaid', 'Consulting Sep'),
(1, 'sale', 'INV-2024-007', '2024-10-05', '2024-11-05', 'Tech Solutions Mumbai',   '27AABCT9876B1Z1', '27', 120000, 120000, 10800,10800,0,     141600, 'confirmed', 'paid',   'Software Oct'),
(1, 'sale', 'INV-2024-008', '2024-11-10', '2024-12-10', 'Pune Distributors Ltd',   '27AAECP4567C1Z2', '27', 90000,  90000,  8100, 8100, 0,     106200, 'confirmed', 'paid',   'Products Nov'),
(1, 'sale', 'INV-2024-009', '2024-12-15', '2025-01-15', 'Gujarat Traders',         '24AABCG5678H1Z7', '24', 60000,  60000,  0,    0,    10800, 70800,  'confirmed', 'unpaid', 'Goods Dec'),
(1, 'sale', 'INV-2025-001', '2025-01-20', '2025-02-20', 'Mumbai Retailers Co',     '27AABCM7654D1Z3', '27', 110000, 110000, 9900, 9900, 0,     129800, 'confirmed', 'unpaid', 'Jan supply');

-- Company 1 — Purchase Invoices
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status) VALUES
(1, 'purchase', 'PUR-2024-001', '2024-04-10', '2024-05-10', 'Raw Materials Co',      '27AABCR5432I1Z8', '27', 40000,  40000,  3600, 3600, 0,     47200,  'confirmed', 'paid'),
(1, 'purchase', 'PUR-2024-002', '2024-05-15', '2024-06-15', 'Office Supplies Hub',   '27AABCO6789J1Z9', '27', 15000,  15000,  1350, 1350, 0,     17700,  'confirmed', 'paid'),
(1, 'purchase', 'PUR-2024-003', '2024-06-20', '2024-07-20', 'Chennai Suppliers Ltd', '33AABCC9012K1Z0', '33', 80000,  80000,  0,    0,    14400, 94400,  'confirmed', 'paid'),
(1, 'purchase', 'PUR-2024-004', '2024-09-10', '2024-10-10', 'Raw Materials Co',      '27AABCR5432I1Z8', '27', 55000,  55000,  4950, 4950, 0,     64900,  'confirmed', 'paid'),
(1, 'purchase', 'PUR-2024-005', '2024-12-05', '2025-01-05', 'Tech Equipment Delhi',  '07AABCT1234L1Z1', '07', 120000, 120000, 0,    0,    21600, 141600, 'confirmed', 'unpaid');

-- Company 2 Invoices
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status) VALUES
(2, 'sale', 'KST-2024-001', '2024-04-12', '2024-05-12', 'Mumbai Spice Importers', '27AABCM1234M1Z2', '27', 45000, 45000, 0,    0,    8100, 53100, 'confirmed', 'paid'),
(2, 'sale', 'KST-2024-002', '2024-07-18', '2024-08-18', 'Bangalore Groceries',    '29AABCB5678N1Z3', '29', 32000, 32000, 0,    0,    5760, 37760, 'confirmed', 'paid'),
(2, 'sale', 'KST-2024-003', '2024-11-22', '2024-12-22', 'Delhi Food Corp',        '07AABCD9012O1Z4', '07', 67000, 67000, 0,    0,    12060,79060, 'confirmed', 'unpaid'),
(2, 'purchase', 'KPR-2024-001', '2024-04-20', '2024-05-20', 'Spice Farm Kerala', '32AABCS3456P1Z5', '32', 20000, 20000, 1800, 1800, 0, 23600, 'confirmed', 'paid');

-- ============================================================
-- 8. INVOICE ITEMS — Company 1 Sales
-- ============================================================
INSERT INTO invoice_items (invoice_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) VALUES
(1, 'Software Development Services', '998314', 1, 'NOS', 100000, 100000, 18, 9, 9, 0, 9000,  9000,  0,     118000),
(2, 'Electronic Components',         '8542',   100,'PCS', 500,    50000,  18, 9, 9, 0, 4500,  4500,  0,     59000),
(3, 'Hardware Goods',                '8471',   50, 'PCS', 1500,   75000,  18, 9, 9, 0, 6750,  6750,  0,     88500),
(4, 'Export Goods — Spices',         '0910',   200,'KG',  1000,   200000, 18, 0, 0, 18,0,     0,     36000, 236000),
(5, 'IT Consulting Services',        '998313', 1,  'NOS', 150000, 150000, 18, 0, 0, 18,0,     0,     27000, 177000),
(6, 'Business Consulting',           '998311', 1,  'NOS', 80000,  80000,  18, 0, 0, 18,0,     0,     14400, 94400),
(7, 'Software License',              '998315', 1,  'NOS', 120000, 120000, 18, 9, 9, 0, 10800, 10800, 0,     141600),
(8, 'Electronic Products',           '8542',   150,'PCS', 600,    90000,  18, 9, 9, 0, 8100,  8100,  0,     106200),
(9, 'Textile Goods',                 '5208',   100,'MTR', 600,    60000,  18, 0, 0, 18,0,     0,     10800, 70800),
(10,'Hardware Supply',               '8471',   80, 'PCS', 1375,   110000, 18, 9, 9, 0, 9900,  9900,  0,     129800);

-- Invoice items for purchases
INSERT INTO invoice_items (invoice_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) VALUES
(11,'Raw Materials — Steel',    '7208', 20, 'KG',  2000,  40000,  18, 9, 9, 0,  3600, 3600, 0,     47200),
(12,'Office Stationery',        '4820', 1,  'LOT', 15000, 15000,  18, 9, 9, 0,  1350, 1350, 0,     17700),
(13,'Electronic Components',    '8542', 100,'PCS', 800,   80000,  18, 0, 0, 18, 0,    0,    14400, 94400),
(14,'Raw Materials — Copper',   '7408', 25, 'KG',  2200,  55000,  18, 9, 9, 0,  4950, 4950, 0,     64900),
(15,'Computer Equipment',       '8471', 2,  'PCS', 60000, 120000, 18, 0, 0, 18, 0,    0,    21600, 141600);

-- Invoice items Company 2
INSERT INTO invoice_items (invoice_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) VALUES
(16,'Black Pepper Export',  '0904', 150,'KG', 300,  45000, 18, 0, 0, 18, 0,    0,    8100, 53100),
(17,'Cardamom Supply',      '0908', 80, 'KG', 400,  32000, 18, 0, 0, 18, 0,    0,    5760, 37760),
(18,'Mixed Spices',         '0910', 200,'KG', 335,  67000, 18, 0, 0, 18, 0,    0,    12060,79060),
(19,'Raw Spices Purchase',  '0910', 100,'KG', 200,  20000, 18, 9, 9, 0,  1800, 1800, 0,    23600);

-- ============================================================
-- 9. JOURNAL ENTRIES — Company 1
-- ============================================================
INSERT INTO journal_entries (company_id, entry_number, entry_date, reference_type, reference_id, narration, is_posted, created_by) VALUES
-- Sales invoice journals
(1,'JE-0001','2024-04-05','invoice',1, 'Sales Invoice INV-2024-001 — Tech Solutions Mumbai', true, 1),
(1,'JE-0002','2024-05-10','invoice',2, 'Sales Invoice INV-2024-002 — Pune Distributors Ltd', true, 1),
(1,'JE-0003','2024-06-15','invoice',3, 'Sales Invoice INV-2024-003 — Mumbai Retailers Co',  true, 1),
(1,'JE-0004','2024-07-20','invoice',4, 'Sales Invoice INV-2024-004 — Kerala Imports Pvt Ltd',true,1),
(1,'JE-0005','2024-08-25','invoice',5, 'Sales Invoice INV-2024-005 — Bangalore Tech Corp',  true, 1),
(1,'JE-0006','2024-09-30','invoice',6, 'Sales Invoice INV-2024-006 — Delhi Enterprises',    true, 1),
(1,'JE-0007','2024-10-05','invoice',7, 'Sales Invoice INV-2024-007 — Tech Solutions Mumbai', true, 1),
(1,'JE-0008','2024-11-10','invoice',8, 'Sales Invoice INV-2024-008 — Pune Distributors Ltd', true, 1),
(1,'JE-0009','2024-12-15','invoice',9, 'Sales Invoice INV-2024-009 — Gujarat Traders',      true, 1),
(1,'JE-0010','2025-01-20','invoice',10,'Sales Invoice INV-2025-001 — Mumbai Retailers Co',  true, 1),
-- Purchase invoice journals
(1,'JE-0011','2024-04-10','invoice',11,'Purchase Invoice PUR-2024-001 — Raw Materials Co',    true, 1),
(1,'JE-0012','2024-05-15','invoice',12,'Purchase Invoice PUR-2024-002 — Office Supplies Hub', true, 1),
(1,'JE-0013','2024-06-20','invoice',13,'Purchase Invoice PUR-2024-003 — Chennai Suppliers',   true, 1),
(1,'JE-0014','2024-09-10','invoice',14,'Purchase Invoice PUR-2024-004 — Raw Materials Co',    true, 1),
(1,'JE-0015','2024-12-05','invoice',15,'Purchase Invoice PUR-2024-005 — Tech Equipment Delhi',true, 1),
-- Payment journals
(1,'JE-0016','2024-04-20','payment',1, 'Payment received — Tech Solutions Mumbai — INV-2024-001', true, 1),
(1,'JE-0017','2024-05-25','payment',2, 'Payment received — Pune Distributors — INV-2024-002',    true, 1),
(1,'JE-0018','2024-04-15','payment',11,'Payment made — Raw Materials Co — PUR-2024-001',         true, 1),
(1,'JE-0019','2024-08-30','payment',5, 'Payment received — Bangalore Tech Corp — INV-2024-005',  true, 1),
(1,'JE-0020','2024-11-20','payment',8, 'Payment received — Pune Distributors — INV-2024-008',    true, 1),
-- Manual journal — Salary
(1,'JE-0021','2024-04-30','manual', NULL,'Salary payment for April 2024', true, 1),
(1,'JE-0022','2024-05-31','manual', NULL,'Salary payment for May 2024',   true, 1),
(1,'JE-0023','2024-06-30','manual', NULL,'Rent payment for Q1 2024',      true, 1),
-- TDS journals
(1,'JE-0024','2024-07-05','tds',   NULL,'TDS on Professional Services — LegalEdge Associates — Section 194J', true, 1),
(1,'JE-0025','2024-10-10','tds',   NULL,'TDS on Rent — Premises Owner — Section 194I', true, 1);

-- ============================================================
-- 10. JOURNAL ENTRY LINES — Company 1
-- ============================================================
-- JE-0001: Sales INV-2024-001 (intra-state, 118000 total)
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(1, 3,  118000, 0,      'Accounts Receivable'),
(1, 16, 0,      100000, 'Sales Revenue'),
(1, 10, 0,      9000,   'CGST Payable'),
(1, 11, 0,      9000,   'SGST Payable');

-- JE-0002: Sales INV-2024-002
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(2, 3,  59000, 0,     'Accounts Receivable'),
(2, 16, 0,     50000, 'Sales Revenue'),
(2, 10, 0,     4500,  'CGST Payable'),
(2, 11, 0,     4500,  'SGST Payable');

-- JE-0003: Sales INV-2024-003
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(3, 3,  88500, 0,     'Accounts Receivable'),
(3, 16, 0,     75000, 'Sales Revenue'),
(3, 10, 0,     6750,  'CGST Payable'),
(3, 11, 0,     6750,  'SGST Payable');

-- JE-0004: Sales INV-2024-004 (inter-state, IGST)
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(4, 3,  236000, 0,      'Accounts Receivable'),
(4, 16, 0,      200000, 'Sales Revenue'),
(4, 12, 0,      36000,  'IGST Payable');

-- JE-0005: Sales INV-2024-005
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(5, 3,  177000, 0,      'Accounts Receivable'),
(5, 17, 0,      150000, 'Service Revenue'),
(5, 12, 0,      27000,  'IGST Payable');

-- JE-0006: Sales INV-2024-006
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(6, 3,  94400, 0,     'Accounts Receivable'),
(6, 17, 0,     80000, 'Service Revenue'),
(6, 12, 0,     14400, 'IGST Payable');

-- JE-0007: Sales INV-2024-007
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(7, 3,  141600, 0,      'Accounts Receivable'),
(7, 16, 0,      120000, 'Sales Revenue'),
(7, 10, 0,      10800,  'CGST Payable'),
(7, 11, 0,      10800,  'SGST Payable');

-- JE-0008: Sales INV-2024-008
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(8, 3,  106200, 0,     'Accounts Receivable'),
(8, 16, 0,      90000, 'Sales Revenue'),
(8, 10, 0,      8100,  'CGST Payable'),
(8, 11, 0,      8100,  'SGST Payable');

-- JE-0009: Sales INV-2024-009
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(9, 3,  70800, 0,     'Accounts Receivable'),
(9, 16, 0,     60000, 'Sales Revenue'),
(9, 12, 0,     10800, 'IGST Payable');

-- JE-0010: Sales INV-2025-001
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(10, 3,  129800, 0,      'Accounts Receivable'),
(10, 16, 0,      110000, 'Sales Revenue'),
(10, 10, 0,      9900,   'CGST Payable'),
(10, 11, 0,      9900,   'SGST Payable');

-- JE-0011: Purchase PUR-2024-001
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(11, 19, 40000, 0,     'Purchases'),
(11, 4,  3600,  0,     'Input GST CGST'),
(11, 5,  3600,  0,     'Input GST SGST'),
(11, 9,  0,     47200, 'Accounts Payable');

-- JE-0012: Purchase PUR-2024-002
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(12, 19, 15000, 0,     'Purchases'),
(12, 4,  1350,  0,     'Input GST CGST'),
(12, 5,  1350,  0,     'Input GST SGST'),
(12, 9,  0,     17700, 'Accounts Payable');

-- JE-0013: Purchase PUR-2024-003 (inter-state)
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(13, 19, 80000, 0,     'Purchases'),
(13, 6,  14400, 0,     'Input GST IGST'),
(13, 9,  0,     94400, 'Accounts Payable');

-- JE-0014: Purchase PUR-2024-004
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(14, 19, 55000, 0,     'Purchases'),
(14, 4,  4950,  0,     'Input GST CGST'),
(14, 5,  4950,  0,     'Input GST SGST'),
(14, 9,  0,     64900, 'Accounts Payable');

-- JE-0015: Purchase PUR-2024-005 (inter-state)
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(15, 19,  120000, 0,      'Purchases'),
(15, 6,   21600,  0,      'Input GST IGST'),
(15, 9,   0,      141600, 'Accounts Payable');

-- JE-0016: Payment received INV-2024-001
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(16, 2, 118000, 0,      'Payment received via bank'),
(16, 3, 0,      118000, 'INV-2024-001 cleared');

-- JE-0017: Payment received INV-2024-002
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(17, 2, 59000, 0,     'Payment received via bank'),
(17, 3, 0,     59000, 'INV-2024-002 cleared');

-- JE-0018: Payment made PUR-2024-001
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(18, 9, 47200, 0,     'PUR-2024-001 cleared'),
(18, 2, 0,     47200, 'Payment via bank');

-- JE-0019: Payment received INV-2024-005
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(19, 2, 177000, 0,      'Payment received via bank'),
(19, 3, 0,      177000, 'INV-2024-005 cleared');

-- JE-0020: Payment received INV-2024-008
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(20, 2, 106200, 0,      'Payment received via bank'),
(20, 3, 0,      106200, 'INV-2024-008 cleared');

-- JE-0021: Salary April
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(21, 20, 80000, 0,     'Salaries April 2024'),
(21, 2,  0,     80000, 'Bank payment');

-- JE-0022: Salary May
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(22, 20, 80000, 0,     'Salaries May 2024'),
(22, 2,  0,     80000, 'Bank payment');

-- JE-0023: Rent Q1
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(23, 21, 90000, 0,     'Rent Q1 2024'),
(23, 2,  0,     90000, 'Bank payment');

-- JE-0024: TDS 194J
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(24, 22, 50000, 0,     'Professional Fees — LegalEdge'),
(24, 13, 0,     5000,  'TDS @ 10% u/s 194J'),
(24, 2,  0,     45000, 'Net payment to LegalEdge');

-- JE-0025: TDS 194I
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration) VALUES
(25, 21, 30000, 0,     'Rent — Oct 2024'),
(25, 13, 0,     3000,  'TDS @ 10% u/s 194I'),
(25, 2,  0,     27000, 'Net payment');

-- ============================================================
-- 11. TDS ENTRIES — Company 1
-- ============================================================
INSERT INTO tds_entries (company_id, party_name, party_pan, section, gross_amount, tds_rate, tds_amount, net_amount, payment_date, payment_nature, challan_no, created_by) VALUES
(1, 'LegalEdge Associates',  'AABCL1234A', '194J', 50000, 10, 5000, 45000, '2024-07-05', 'Professional Fees',  'CHL-001', 1),
(1, 'Property Owner Mr Shah','AABCS5678B', '194I', 30000, 10, 3000, 27000, '2024-10-10', 'Rent',               'CHL-002', 1),
(1, 'IT Contractor Pvt Ltd', 'AABCI9012C', '194C', 80000, 2,  1600, 78400, '2024-08-15', 'Contract Services',  'CHL-003', 1),
(1, 'Digital Agency',        'AABCD3456D', '194J', 40000, 10, 4000, 36000, '2024-11-20', 'Technical Services', 'CHL-004', 1);

SELECT 'FinLex Seed Data inserted successfully!' AS status;
SELECT 'Login: fida@example.com / password123' AS login;
