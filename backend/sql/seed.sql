-- ============================================================
-- FINLEX AI — DEMO SEED DATA
-- Creates 1 CA user + 3 companies with realistic Indian data
-- Run: psql -U postgres -d finlex_db -f seed.sql
-- ============================================================

-- ============================================================
-- STEP 1: CREATE CA USER
-- Password: Demo@1234 (bcrypt hashed)
-- ============================================================
INSERT INTO users (name, email, password_hash, role) VALUES
('Arjun Menon', 'arjun@menon-ca.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uNoLuFqsm', 'ca')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- STEP 2: CREATE 3 COMPANIES
-- ============================================================
INSERT INTO companies (name, gstin, pan, state_code, state_name, financial_year, fy_start_date, fy_end_date, address, phone, email, business_type, gst_registered, created_by) VALUES
(
  'Kerala Spices Traders Pvt Ltd',
  '32AABCK1234A1Z5',
  'AABCK1234A',
  '32',
  'Kerala',
  '2024-25',
  '2024-04-01',
  '2025-03-31',
  '45/B, MG Road, Kozhikode, Kerala - 673001',
  '9876543210',
  'info@keralasp ices.com',
  'private_limited',
  true,
  1
),
(
  'TechNova Solutions Pvt Ltd',
  '27AABCT5678B2Z6',
  'AABCT5678B',
  '27',
  'Maharashtra',
  '2024-25',
  '2024-04-01',
  '2025-03-31',
  '301, Bandra Kurla Complex, Mumbai, Maharashtra - 400051',
  '9123456789',
  'accounts@technova.in',
  'private_limited',
  true,
  1
),
(
  'Hyderabad Electronics Pvt Ltd',
  '36AABCH9012C3Z7',
  'AABCH9012C',
  '36',
  'Telangana',
  '2024-25',
  '2024-04-01',
  '2025-03-31',
  '22, Hitech City, Madhapur, Hyderabad - 500081',
  '9988776655',
  'finance@hydelec.com',
  'private_limited',
  true,
  1
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 3: GRANT CA ACCESS TO ALL COMPANIES
-- ============================================================
INSERT INTO ca_company_access (ca_id, company_id, role)
SELECT 1, id, 'owner' FROM companies WHERE name IN (
  'Kerala Spices Traders Pvt Ltd',
  'TechNova Solutions Pvt Ltd',
  'Hyderabad Electronics Pvt Ltd'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 4: SETUP DEFAULT ACCOUNTS FOR ALL 3 COMPANIES
-- ============================================================
SELECT setup_default_accounts(id) FROM companies WHERE name IN (
  'Kerala Spices Traders Pvt Ltd',
  'TechNova Solutions Pvt Ltd',
  'Hyderabad Electronics Pvt Ltd'
);

-- ============================================================
-- STEP 5: SALES INVOICES — Kerala Spices Traders (company 1)
-- ============================================================
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(1, 'sale', 'KST/2024/001', '2024-04-05', '2024-05-05', 'Rajesh Enterprises', '32AABCR1111A1Z1', '32', 85000.00, 85000.00, 7650.00, 7650.00, 0.00, 100300.00, 'confirmed', 'paid', 'regular'),
(1, 'sale', 'KST/2024/002', '2024-04-12', '2024-05-12', 'Mumbai Masala Pvt Ltd', '27AABCM2222B2Z2', '27', 120000.00, 120000.00, 0.00, 0.00, 21600.00, 141600.00, 'confirmed', 'paid', 'regular'),
(1, 'sale', 'KST/2024/003', '2024-05-03', '2024-06-03', 'Bangalore Grocers Ltd', '29AABCB3333C3Z3', '29', 95000.00, 95000.00, 0.00, 0.00, 17100.00, 112100.00, 'confirmed', 'unpaid', 'regular'),
(1, 'sale', 'KST/2024/004', '2024-05-18', '2024-06-18', 'Chennai Foods Co', '33AABCC4444D4Z4', '33', 75000.00, 75000.00, 0.00, 0.00, 13500.00, 88500.00, 'confirmed', 'paid', 'regular'),
(1, 'sale', 'KST/2024/005', '2024-06-02', '2024-07-02', 'Local Retail Store Kerala', '32AABCL5555E5Z5', '32', 45000.00, 45000.00, 4050.00, 4050.00, 0.00, 53100.00, 'confirmed', 'unpaid', 'regular'),
(1, 'sale', 'KST/2024/006', '2024-06-20', '2024-07-20', 'Delhi Spice House', '07AABCD6666F6Z6', '07', 180000.00, 180000.00, 0.00, 0.00, 32400.00, 212400.00, 'confirmed', 'paid', 'regular'),
(1, 'sale', 'KST/2024/007', '2024-07-08', '2024-08-08', 'Rajesh Enterprises', '32AABCR1111A1Z1', '32', 92000.00, 92000.00, 8280.00, 8280.00, 0.00, 108560.00, 'confirmed', 'paid', 'regular'),
(1, 'sale', 'KST/2024/008', '2024-07-25', '2024-08-25', 'Kolkata Traders', '19AABCK7777G7Z7', '19', 65000.00, 65000.00, 0.00, 0.00, 11700.00, 76700.00, 'confirmed', 'unpaid', 'regular');

-- Purchase invoices for Kerala Spices
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(1, 'purchase', 'PUR/KST/001', '2024-04-02', '2024-05-02', 'Wayanad Spice Farm', '32AABCW8888H8Z8', '32', 55000.00, 55000.00, 2750.00, 2750.00, 0.00, 60500.00, 'confirmed', 'paid', 'regular'),
(1, 'purchase', 'PUR/KST/002', '2024-04-20', '2024-05-20', 'Idukki Cardamom Co', '32AABCI9999I9Z9', '32', 80000.00, 80000.00, 4000.00, 4000.00, 0.00, 88000.00, 'confirmed', 'paid', 'regular'),
(1, 'purchase', 'PUR/KST/003', '2024-05-10', '2024-06-10', 'Tamil Nadu Pepper Traders', '33AABCT1010J1Z1', '33', 45000.00, 45000.00, 0.00, 0.00, 2250.00, 47250.00, 'confirmed', 'unpaid', 'regular'),
(1, 'purchase', 'PUR/KST/004', '2024-06-15', '2024-07-15', 'Packaging Solutions Kerala', '32AABCP2020K2Z2', '32', 12000.00, 12000.00, 1080.00, 1080.00, 0.00, 14160.00, 'confirmed', 'paid', 'regular');

-- ============================================================
-- STEP 6: SALES INVOICES — TechNova Solutions (company 2)
-- ============================================================
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(2, 'sale', 'TNS/2024/001', '2024-04-08', '2024-05-08', 'Infosys Ltd', '29AABCI3030L3Z3', '29', 250000.00, 250000.00, 0.00, 0.00, 45000.00, 295000.00, 'confirmed', 'paid', 'regular'),
(2, 'sale', 'TNS/2024/002', '2024-04-22', '2024-05-22', 'Wipro Technologies', '29AABCW4040M4Z4', '29', 180000.00, 180000.00, 0.00, 0.00, 32400.00, 212400.00, 'confirmed', 'paid', 'regular'),
(2, 'sale', 'TNS/2024/003', '2024-05-15', '2024-06-15', 'HDFC Bank Ltd', '27AABCH5050N5Z5', '27', 320000.00, 320000.00, 28800.00, 28800.00, 0.00, 377600.00, 'confirmed', 'unpaid', 'regular'),
(2, 'sale', 'TNS/2024/004', '2024-06-05', '2024-07-05', 'Tata Consultancy', '27AABCT6060O6Z6', '27', 420000.00, 420000.00, 37800.00, 37800.00, 0.00, 495600.00, 'confirmed', 'paid', 'regular'),
(2, 'sale', 'TNS/2024/005', '2024-06-28', '2024-07-28', 'Reliance Industries', '27AABCR7070P7Z7', '27', 550000.00, 550000.00, 49500.00, 49500.00, 0.00, 649000.00, 'confirmed', 'paid', 'regular'),
(2, 'sale', 'TNS/2024/006', '2024-07-12', '2024-08-12', 'Zomato Ltd', '07AABCZ8080Q8Z8', '07', 150000.00, 150000.00, 0.00, 0.00, 27000.00, 177000.00, 'confirmed', 'unpaid', 'regular');

-- Purchase invoices for TechNova
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(2, 'purchase', 'PUR/TNS/001', '2024-04-05', '2024-05-05', 'AWS India Pvt Ltd', '07AABCA9090R9Z9', '07', 85000.00, 85000.00, 0.00, 0.00, 15300.00, 100300.00, 'confirmed', 'paid', 'regular'),
(2, 'purchase', 'PUR/TNS/002', '2024-05-01', '2024-06-01', 'Microsoft India', '07AABCM1111S1Z1', '07', 45000.00, 45000.00, 0.00, 0.00, 8100.00, 53100.00, 'confirmed', 'paid', 'regular'),
(2, 'purchase', 'PUR/TNS/003', '2024-06-01', '2024-07-01', 'Airtel Business', '27AABCA2222T2Z2', '27', 18000.00, 18000.00, 1620.00, 1620.00, 0.00, 21240.00, 'confirmed', 'paid', 'regular');

-- ============================================================
-- STEP 7: SALES INVOICES — Hyderabad Electronics (company 3)
-- ============================================================
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(3, 'sale', 'HEL/2024/001', '2024-04-10', '2024-05-10', 'Croma Retail Ltd', '27AABCC3333U3Z3', '27', 350000.00, 350000.00, 0.00, 0.00, 63000.00, 413000.00, 'confirmed', 'paid', 'regular'),
(3, 'sale', 'HEL/2024/002', '2024-04-28', '2024-05-28', 'Reliance Digital', '27AABCR4444V4Z4', '27', 280000.00, 280000.00, 0.00, 0.00, 50400.00, 330400.00, 'confirmed', 'paid', 'regular'),
(3, 'sale', 'HEL/2024/003', '2024-05-20', '2024-06-20', 'Viveks Electronics Chennai', '33AABCV5555W5Z5', '33', 195000.00, 195000.00, 0.00, 0.00, 35100.00, 230100.00, 'confirmed', 'unpaid', 'regular'),
(3, 'sale', 'HEL/2024/004', '2024-06-10', '2024-07-10', 'Local Dealer Hyderabad', '36AABCL6666X6Z6', '36', 125000.00, 125000.00, 11250.00, 11250.00, 0.00, 147500.00, 'confirmed', 'paid', 'regular'),
(3, 'sale', 'HEL/2024/005', '2024-07-05', '2024-08-05', 'Amazon Seller Services', '29AABCA7777Y7Z7', '29', 420000.00, 420000.00, 0.00, 0.00, 75600.00, 495600.00, 'confirmed', 'paid', 'regular');

-- Purchase invoices for Hyderabad Electronics
INSERT INTO invoices (company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type) VALUES
(3, 'purchase', 'PUR/HEL/001', '2024-04-03', '2024-05-03', 'Samsung India Electronics', '06AABCS8888Z8Z8', '06', 250000.00, 250000.00, 0.00, 0.00, 45000.00, 295000.00, 'confirmed', 'paid', 'regular'),
(3, 'purchase', 'PUR/HEL/002', '2024-05-05', '2024-06-05', 'LG Electronics India', '29AABCL9999A9Z9', '29', 180000.00, 180000.00, 0.00, 0.00, 32400.00, 212400.00, 'confirmed', 'paid', 'regular'),
(3, 'purchase', 'PUR/HEL/003', '2024-06-08', '2024-07-08', 'Bosch India Ltd', '29AABCB1010B1Z1', '29', 95000.00, 95000.00, 0.00, 0.00, 17100.00, 112100.00, 'confirmed', 'unpaid', 'regular');

-- ============================================================
-- STEP 8: INVOICE ITEMS (for first few invoices)
-- ============================================================
INSERT INTO invoice_items (invoice_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) VALUES
-- KST/2024/001
(1, 'Black Pepper Grade A', '0904', 50.000, 'KG', 1200.00, 60000.00, 18, 9, 9, 0, 5400.00, 5400.00, 0.00, 70800.00),
(1, 'Cardamom Small', '0908', 5.000, 'KG', 5000.00, 25000.00, 18, 9, 9, 0, 2250.00, 2250.00, 0.00, 29500.00),
-- KST/2024/002
(2, 'Turmeric Powder', '0910', 200.000, 'KG', 180.00, 36000.00, 18, 0, 0, 18, 0.00, 0.00, 6480.00, 42480.00),
(2, 'Coriander Seeds', '0909', 300.000, 'KG', 140.00, 42000.00, 18, 0, 0, 18, 0.00, 0.00, 7560.00, 49560.00),
(2, 'Cloves Premium', '0907', 20.000, 'KG', 2100.00, 42000.00, 18, 0, 0, 18, 0.00, 0.00, 7560.00, 49560.00),
-- TNS/2024/001
(9, 'Software Development Services', '998313', 1.000, 'NOS', 250000.00, 250000.00, 18, 0, 0, 18, 0.00, 0.00, 45000.00, 295000.00),
-- TNS/2024/002
(10, 'IT Consulting Services', '998314', 1.000, 'NOS', 180000.00, 180000.00, 18, 0, 0, 18, 0.00, 0.00, 32400.00, 212400.00),
-- HEL/2024/001
(15, 'Samsung 65" QLED TV', '8528', 5.000, 'NOS', 45000.00, 225000.00, 18, 0, 0, 18, 0.00, 0.00, 40500.00, 265500.00),
(15, 'LG Refrigerator 340L', '8418', 5.000, 'NOS', 25000.00, 125000.00, 18, 0, 0, 18, 0.00, 0.00, 22500.00, 147500.00);

-- ============================================================
-- STEP 9: TDS ENTRIES — All 3 companies
-- ============================================================
INSERT INTO tds_entries (company_id, party_name, party_pan, section, gross_amount, tds_rate, tds_amount, net_amount, payment_date, payment_nature, challan_no, created_by) VALUES
-- Kerala Spices
(1, 'Transport Logistics Kerala', 'AABCT1234A', '194C', 50000.00, 1.00, 500.00, 49500.00, '2024-04-30', 'Freight Charges', 'CHL/2024/001', 1),
(1, 'CA Priya Nair - Audit Fees', 'AABCP5678B', '194J', 75000.00, 10.00, 7500.00, 67500.00, '2024-06-30', 'Professional Fees', 'CHL/2024/002', 1),
(1, 'Warehouse Rent Kozhikode', 'AABCW9012C', '194I', 120000.00, 10.00, 12000.00, 108000.00, '2024-07-31', 'Rent - Building', 'CHL/2024/003', 1),
-- TechNova
(2, 'Freelancer Dev Services', 'AABCF3456D', '194J', 180000.00, 10.00, 18000.00, 162000.00, '2024-04-30', 'Technical Fees', 'CHL/2024/004', 1),
(2, 'Office Rent BKC Mumbai', 'AABCO7890E', '194I', 360000.00, 10.00, 36000.00, 324000.00, '2024-07-31', 'Rent - Commercial', 'CHL/2024/005', 1),
(2, 'Digital Marketing Agency', 'AABCD1234F', '194C', 85000.00, 1.00, 850.00, 84150.00, '2024-06-30', 'Advertisement', 'CHL/2024/006', 1),
-- Hyderabad Electronics
(3, 'Security Services Hyderabad', 'AABCS5678G', '194C', 60000.00, 1.00, 600.00, 59400.00, '2024-04-30', 'Security Contract', 'CHL/2024/007', 1),
(3, 'Office Space Hitech City', 'AABCO9012H', '194I', 420000.00, 10.00, 42000.00, 378000.00, '2024-07-31', 'Rent - Commercial', 'CHL/2024/008', 1),
(3, 'CA Firm Audit Fees', 'AABCC3456I', '194J', 95000.00, 10.00, 9500.00, 85500.00, '2024-06-30', 'Professional Fees', 'CHL/2024/009', 1);

-- ============================================================
-- STEP 10: COMPLIANCE DEADLINES
-- ============================================================
INSERT INTO compliance_deadlines (company_id, type, name, due_date, financial_year, period, status) VALUES
-- Kerala Spices
(1, 'GST', 'GSTR-1 Filing - April 2024', '2024-05-11', '2024-25', 'April 2024', 'completed'),
(1, 'GST', 'GSTR-3B Filing - April 2024', '2024-05-20', '2024-25', 'April 2024', 'completed'),
(1, 'GST', 'GSTR-1 Filing - May 2024', '2024-06-11', '2024-25', 'May 2024', 'completed'),
(1, 'GST', 'GSTR-3B Filing - May 2024', '2024-06-20', '2024-25', 'May 2024', 'completed'),
(1, 'TDS', 'TDS Return Q1 FY 2024-25', '2024-07-31', '2024-25', 'Q1', 'completed'),
(1, 'GST', 'GSTR-1 Filing - July 2024', '2024-08-11', '2024-25', 'July 2024', 'pending'),
(1, 'GST', 'GSTR-3B Filing - July 2024', '2024-08-20', '2024-25', 'July 2024', 'pending'),
(1, 'ADVANCE_TAX', 'Advance Tax Q2 Installment', '2024-09-15', '2024-25', 'Q2', 'pending'),
-- TechNova
(2, 'GST', 'GSTR-1 Filing - April 2024', '2024-05-11', '2024-25', 'April 2024', 'completed'),
(2, 'GST', 'GSTR-3B Filing - April 2024', '2024-05-20', '2024-25', 'April 2024', 'completed'),
(2, 'TDS', 'TDS Return Q1 FY 2024-25', '2024-07-31', '2024-25', 'Q1', 'completed'),
(2, 'GST', 'GSTR-1 Filing - July 2024', '2024-08-11', '2024-25', 'July 2024', 'pending'),
(2, 'ADVANCE_TAX', 'Advance Tax Q2 Installment', '2024-09-15', '2024-25', 'Q2', 'pending'),
(2, 'ROC', 'Annual ROC Filing', '2024-09-30', '2024-25', 'Annual', 'pending'),
-- Hyderabad Electronics
(3, 'GST', 'GSTR-1 Filing - April 2024', '2024-05-11', '2024-25', 'April 2024', 'completed'),
(3, 'GST', 'GSTR-3B Filing - April 2024', '2024-05-20', '2024-25', 'April 2024', 'completed'),
(3, 'TDS', 'TDS Return Q1 FY 2024-25', '2024-07-31', '2024-25', 'Q1', 'completed'),
(3, 'GST', 'GSTR-1 Filing - July 2024', '2024-08-11', '2024-25', 'July 2024', 'pending'),
(3, 'ADVANCE_TAX', 'Advance Tax Q2 Installment', '2024-09-15', '2024-25', 'Q2', 'pending');

-- ============================================================
-- STEP 11: JOURNAL ENTRIES — Kerala Spices (company 1)
-- ============================================================
INSERT INTO journal_entries (company_id, entry_number, entry_date, reference_type, narration, is_posted, created_by) VALUES
(1, 'JE/2024/001', '2024-04-05', 'invoice', 'Sales Invoice KST/2024/001 - Rajesh Enterprises', true, 1),
(1, 'JE/2024/002', '2024-04-12', 'invoice', 'Sales Invoice KST/2024/002 - Mumbai Masala Pvt Ltd', true, 1),
(1, 'JE/2024/003', '2024-04-02', 'invoice', 'Purchase Invoice PUR/KST/001 - Wayanad Spice Farm', true, 1),
(1, 'JE/2024/004', '2024-04-30', 'payment', 'Salary payment for April 2024', true, 1),
(1, 'JE/2024/005', '2024-04-30', 'manual', 'Monthly rent payment - Godown Kozhikode', true, 1),
(1, 'JE/2024/006', '2024-05-20', 'payment', 'Payment received from Rajesh Enterprises - INV KST/2024/001', true, 1),
(1, 'JE/2024/007', '2024-06-05', 'manual', 'Electricity bill payment - April-May 2024', true, 1),
(1, 'JE/2024/008', '2024-06-30', 'payment', 'Salary payment for June 2024', true, 1);

-- Journal Lines for JE/2024/001 (Sales Invoice - intrastate)
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='1003'), -- Accounts Receivable
       100300.00, 0.00, 'Accounts Receivable - Rajesh Enterprises'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/001';

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='4001'), -- Sales Revenue
       0.00, 85000.00, 'Sales Revenue'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/001';

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='2002'), -- Output CGST
       0.00, 7650.00, 'Output CGST @ 9%'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/001';

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='2003'), -- Output SGST
       0.00, 7650.00, 'Output SGST @ 9%'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/001';

-- Journal Lines for Salary Payment JE/2024/004
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='5101'), -- Salaries
       85000.00, 0.00, 'Salaries for April 2024'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/004';

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='1002'), -- Bank Account
       0.00, 85000.00, 'Bank payment - Salaries April 2024'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/004';

-- Journal Lines for Rent Payment JE/2024/005
INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='5102'), -- Rent
       25000.00, 0.00, 'Monthly rent - Godown Kozhikode'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/005';

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, narration)
SELECT je.id,
       (SELECT id FROM accounts WHERE company_id=1 AND code='1002'), -- Bank Account
       0.00, 25000.00, 'Bank payment - Rent April 2024'
FROM journal_entries je WHERE je.company_id=1 AND je.entry_number='JE/2024/005';

-- ============================================================
-- STEP 12: OPENING BALANCES — Kerala Spices (company 1)
-- ============================================================
UPDATE accounts SET opening_balance = 250000.00, balance = 250000.00 WHERE company_id = 1 AND code = '1002'; -- Bank
UPDATE accounts SET opening_balance = 50000.00,  balance = 50000.00  WHERE company_id = 1 AND code = '1001'; -- Cash
UPDATE accounts SET opening_balance = 350000.00, balance = 350000.00 WHERE company_id = 1 AND code = '3001'; -- Share Capital
UPDATE accounts SET opening_balance = 120000.00, balance = 120000.00 WHERE company_id = 1 AND code = '1010'; -- Stock
UPDATE accounts SET opening_balance = 200000.00, balance = 200000.00 WHERE company_id = 1 AND code = '2101'; -- Bank Loan

-- Opening Balances — TechNova (company 2)
UPDATE accounts SET opening_balance = 850000.00, balance = 850000.00 WHERE company_id = 2 AND code = '1002'; -- Bank
UPDATE accounts SET opening_balance = 25000.00,  balance = 25000.00  WHERE company_id = 2 AND code = '1001'; -- Cash
UPDATE accounts SET opening_balance = 1000000.00,balance = 1000000.00 WHERE company_id = 2 AND code = '3001'; -- Share Capital
UPDATE accounts SET opening_balance = 500000.00, balance = 500000.00 WHERE company_id = 2 AND code = '2101'; -- Bank Loan

-- Opening Balances — Hyderabad Electronics (company 3)
UPDATE accounts SET opening_balance = 1200000.00,balance = 1200000.00 WHERE company_id = 3 AND code = '1002'; -- Bank
UPDATE accounts SET opening_balance = 80000.00,  balance = 80000.00  WHERE company_id = 3 AND code = '1001'; -- Cash
UPDATE accounts SET opening_balance = 2000000.00,balance = 2000000.00 WHERE company_id = 3 AND code = '3001'; -- Share Capital
UPDATE accounts SET opening_balance = 800000.00, balance = 800000.00 WHERE company_id = 3 AND code = '1010'; -- Stock

-- ============================================================
-- STEP 13: AUDIT LOG ENTRIES
-- ============================================================
INSERT INTO audit_log (company_id, user_id, action, table_name, record_id, new_values) VALUES
(1, 1, 'CREATE', 'invoices', 1, '{"invoice_number": "KST/2024/001", "total_amount": 100300}'),
(1, 1, 'CREATE', 'invoices', 2, '{"invoice_number": "KST/2024/002", "total_amount": 141600}'),
(1, 1, 'UPDATE', 'invoices', 1, '{"payment_status": "paid"}'),
(2, 1, 'CREATE', 'invoices', 9, '{"invoice_number": "TNS/2024/001", "total_amount": 295000}'),
(2, 1, 'CREATE', 'tds_entries', 4, '{"party_name": "Freelancer Dev Services", "tds_amount": 18000}'),
(3, 1, 'CREATE', 'invoices', 15, '{"invoice_number": "HEL/2024/001", "total_amount": 413000}'),
(3, 1, 'UPDATE', 'invoices', 15, '{"payment_status": "paid"}');

-- ============================================================
-- DONE!
-- ============================================================
SELECT '✅ FinLex Demo Seed Data loaded successfully!' AS status;
SELECT 'Login: arjun@menon-ca.com | Password: Demo@1234' AS credentials;
