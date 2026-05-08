-- ============================================================
-- DEFAULT CHART OF ACCOUNTS for Indian businesses
-- Run this after creating a new company
-- Standard Indian accounting structure
-- ============================================================

-- This is a function you call with a company_id
-- It creates the full default chart of accounts automatically

CREATE OR REPLACE FUNCTION setup_default_accounts(p_company_id UUID)
RETURNS void AS $$
DECLARE
  -- Group IDs
  g_current_assets    UUID;
  g_fixed_assets      UUID;
  g_current_liab      UUID;
  g_long_term_liab    UUID;
  g_equity            UUID;
  g_direct_income     UUID;
  g_indirect_income   UUID;
  g_direct_expense    UUID;
  g_indirect_expense  UUID;
BEGIN

  -- ASSET GROUPS
  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Current Assets','asset','debit')
    RETURNING id INTO g_current_assets;

  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Fixed Assets','asset','debit')
    RETURNING id INTO g_fixed_assets;

  -- LIABILITY GROUPS
  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Current Liabilities','liability','credit')
    RETURNING id INTO g_current_liab;

  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Long Term Liabilities','liability','credit')
    RETURNING id INTO g_long_term_liab;

  -- EQUITY
  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Capital & Reserves','equity','credit')
    RETURNING id INTO g_equity;

  -- INCOME GROUPS
  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Direct Income','revenue','credit')
    RETURNING id INTO g_direct_income;

  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Indirect Income','revenue','credit')
    RETURNING id INTO g_indirect_income;

  -- EXPENSE GROUPS
  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Direct Expenses','expense','debit')
    RETURNING id INTO g_direct_expense;

  INSERT INTO account_groups(company_id,name,type,nature)
    VALUES(p_company_id,'Indirect Expenses','expense','debit')
    RETURNING id INTO g_indirect_expense;

  -- ── ASSET ACCOUNTS ──────────────────────────────────────────
  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id, g_current_assets, '1001', 'Cash in Hand',          'asset','debit', true),
    (p_company_id, g_current_assets, '1002', 'Bank Account',           'asset','debit', true),
    (p_company_id, g_current_assets, '1003', 'Accounts Receivable',    'asset','debit', true),
    (p_company_id, g_current_assets, '1004', 'Input GST (CGST)',       'asset','debit', true),
    (p_company_id, g_current_assets, '1005', 'Input GST (SGST)',       'asset','debit', true),
    (p_company_id, g_current_assets, '1006', 'Input GST (IGST)',       'asset','debit', true),
    (p_company_id, g_current_assets, '1007', 'TDS Receivable',         'asset','debit', false),
    (p_company_id, g_current_assets, '1008', 'Advance to Suppliers',   'asset','debit', false),
    (p_company_id, g_current_assets, '1009', 'Prepaid Expenses',       'asset','debit', false),
    (p_company_id, g_current_assets, '1010', 'Stock / Inventory',      'asset','debit', false),
    (p_company_id, g_fixed_assets,   '1101', 'Plant & Machinery',      'asset','debit', false),
    (p_company_id, g_fixed_assets,   '1102', 'Furniture & Fixtures',   'asset','debit', false),
    (p_company_id, g_fixed_assets,   '1103', 'Computer Equipment',     'asset','debit', false),
    (p_company_id, g_fixed_assets,   '1104', 'Land & Building',        'asset','debit', false);

  -- ── LIABILITY ACCOUNTS ──────────────────────────────────────
  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id, g_current_liab, '2001', 'Accounts Payable',        'liability','credit', true),
    (p_company_id, g_current_liab, '2002', 'Output GST (CGST)',       'liability','credit', true),
    (p_company_id, g_current_liab, '2003', 'Output GST (SGST)',       'liability','credit', true),
    (p_company_id, g_current_liab, '2004', 'Output GST (IGST)',       'liability','credit', true),
    (p_company_id, g_current_liab, '2005', 'TDS Payable',             'liability','credit', true),
    (p_company_id, g_current_liab, '2006', 'Advance from Customers',  'liability','credit', false),
    (p_company_id, g_current_liab, '2007', 'Salary Payable',          'liability','credit', false),
    (p_company_id, g_current_liab, '2008', 'PF Payable',              'liability','credit', false),
    (p_company_id, g_long_term_liab,'2101','Bank Loan',               'liability','credit', false),
    (p_company_id, g_long_term_liab,'2102','Directors Loan',          'liability','credit', false);

  -- ── EQUITY ACCOUNTS ─────────────────────────────────────────
  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id, g_equity, '3001', 'Share Capital',                 'equity','credit', true),
    (p_company_id, g_equity, '3002', 'Retained Earnings',             'equity','credit', true),
    (p_company_id, g_equity, '3003', 'Current Year Profit / Loss',    'equity','credit', true);

  -- ── REVENUE ACCOUNTS ────────────────────────────────────────
  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id, g_direct_income,   '4001', 'Sales Revenue',         'revenue','credit', true),
    (p_company_id, g_direct_income,   '4002', 'Service Revenue',       'revenue','credit', true),
    (p_company_id, g_direct_income,   '4003', 'Sales Returns',         'revenue','debit',  false),
    (p_company_id, g_indirect_income, '4101', 'Interest Income',       'revenue','credit', false),
    (p_company_id, g_indirect_income, '4102', 'Discount Received',     'revenue','credit', false),
    (p_company_id, g_indirect_income, '4103', 'Other Income',          'revenue','credit', false);

  -- ── EXPENSE ACCOUNTS ────────────────────────────────────────
  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id, g_direct_expense,   '5001', 'Purchases',            'expense','debit', true),
    (p_company_id, g_direct_expense,   '5002', 'Purchase Returns',     'expense','credit',false),
    (p_company_id, g_direct_expense,   '5003', 'Direct Labour',        'expense','debit', false),
    (p_company_id, g_indirect_expense, '5101', 'Salaries & Wages',     'expense','debit', false),
    (p_company_id, g_indirect_expense, '5102', 'Rent',                 'expense','debit', false),
    (p_company_id, g_indirect_expense, '5103', 'Electricity',          'expense','debit', false),
    (p_company_id, g_indirect_expense, '5104', 'Internet & Phone',     'expense','debit', false),
    (p_company_id, g_indirect_expense, '5105', 'Office Supplies',      'expense','debit', false),
    (p_company_id, g_indirect_expense, '5106', 'Travel & Conveyance',  'expense','debit', false),
    (p_company_id, g_indirect_expense, '5107', 'Professional Fees',    'expense','debit', false),
    (p_company_id, g_indirect_expense, '5108', 'Bank Charges',         'expense','debit', false),
    (p_company_id, g_indirect_expense, '5109', 'Depreciation',         'expense','debit', false),
    (p_company_id, g_indirect_expense, '5110', 'Interest on Loan',     'expense','debit', false),
    (p_company_id, g_indirect_expense, '5111', 'GST Late Fee',         'expense','debit', false),
    (p_company_id, g_indirect_expense, '5112', 'Miscellaneous Expense','expense','debit', false);

  RAISE NOTICE 'Default Chart of Accounts created for company %', p_company_id;
END;
$$ LANGUAGE plpgsql;
