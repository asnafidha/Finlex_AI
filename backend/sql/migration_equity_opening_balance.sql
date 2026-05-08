-- Fix 1: Add opening balance columns to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS opening_balance_debit NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opening_balance_credit NUMERIC(15,2) DEFAULT 0;

-- Fix 2: Add unique constraint for account_groups (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_account_groups_company_name'
  ) THEN
    ALTER TABLE account_groups ADD CONSTRAINT uq_account_groups_company_name UNIQUE (company_id, name);
  END IF;
END;
$$;

-- Fix 3: Ensure all companies have equity accounts
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT c.id
    FROM companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.company_id = c.id AND a.type = 'equity'
    )
  LOOP
    RAISE NOTICE 'Adding missing equity accounts for company %', rec.id;
    PERFORM setup_default_accounts(rec.id);
  END LOOP;
END;
$$;

-- Fix 4: Add missing ESIC Payable account
INSERT INTO accounts(company_id, group_id, code, name, type, nature, is_system)
SELECT
  ag.company_id,
  ag.id,
  '2009',
  'ESIC Payable',
  'liability',
  'credit',
  false
FROM account_groups ag
WHERE ag.name = 'Current Liabilities'
  AND NOT EXISTS (
    SELECT 1 FROM accounts a2
    WHERE a2.company_id = ag.company_id AND a2.code = '2009'
  )
ON CONFLICT (company_id, code) DO NOTHING;

SELECT 'Migration complete: opening balance columns added' AS status;
