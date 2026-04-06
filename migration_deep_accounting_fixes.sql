-- ============================================================
-- FINLEX MIGRATION: Deep Accounting Correctness Fixes
-- ============================================================

-- FIX 1: Add opening_debit and opening_credit columns
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_debit  NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS chk_opening_debit_nonneg,
  DROP CONSTRAINT IF EXISTS chk_opening_credit_nonneg,
  DROP CONSTRAINT IF EXISTS chk_opening_one_side_only;

ALTER TABLE accounts
  ADD CONSTRAINT chk_opening_debit_nonneg  CHECK (opening_debit  >= 0),
  ADD CONSTRAINT chk_opening_credit_nonneg CHECK (opening_credit >= 0),
  ADD CONSTRAINT chk_opening_one_side_only CHECK (opening_debit = 0 OR opening_credit = 0);

-- Backfill existing opening_balance
UPDATE accounts SET
  opening_debit  = CASE
    WHEN type IN ('asset','expense') AND opening_balance > 0  THEN opening_balance
    WHEN type IN ('liability','equity','revenue') AND opening_balance < 0 THEN ABS(opening_balance)
    ELSE 0
  END,
  opening_credit = CASE
    WHEN type IN ('liability','equity','revenue') AND opening_balance > 0 THEN opening_balance
    WHEN type IN ('asset','expense') AND opening_balance < 0 THEN ABS(opening_balance)
    ELSE 0
  END
WHERE opening_debit = 0 AND opening_credit = 0 AND opening_balance != 0;

-- Trigger to sync opening_balance
CREATE OR REPLACE FUNCTION sync_opening_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opening_debit > 0 AND NEW.opening_credit > 0 THEN
    RAISE EXCEPTION 'opening_debit and opening_credit cannot both be > 0 on account %', NEW.id;
  END IF;
  NEW.opening_balance := NEW.opening_debit - NEW.opening_credit;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_opening_balance ON accounts;
CREATE TRIGGER trg_sync_opening_balance
  BEFORE INSERT OR UPDATE OF opening_debit, opening_credit ON accounts
  FOR EACH ROW EXECUTE FUNCTION sync_opening_balance();

-- FIX 2: Database-level double-entry enforcement
CREATE OR REPLACE FUNCTION enforce_double_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit  NUMERIC(15,2);
  v_total_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Double-entry violated for journal_entry_id=%: debit=% credit=% diff=%',
      NEW.journal_entry_id, v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_double_entry ON journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
  AFTER INSERT OR UPDATE ON journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_double_entry();

-- FIX 3: Add closing_entries_posted flag to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS closing_entries_posted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_entries_date   DATE DEFAULT NULL;

-- FIX 4: Unique constraint on account_groups
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_account_groups_company_name') THEN
    ALTER TABLE account_groups ADD CONSTRAINT uq_account_groups_company_name UNIQUE (company_id, name);
  END IF;
END;
$$;

-- FIX 5: opening_balance_imports table
CREATE TABLE IF NOT EXISTS opening_balance_imports (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  import_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  as_of_date      DATE NOT NULL,
  financial_year  VARCHAR(9) NOT NULL,
  total_debit     NUMERIC(15,2) DEFAULT 0,
  total_credit    NUMERIC(15,2) DEFAULT 0,
  is_balanced     BOOLEAN DEFAULT false,
  imported_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

ALTER TABLE opening_balance_imports ADD COLUMN IF NOT EXISTS as_of_date DATE;

SELECT 'Deep accounting fixes migration complete' AS status;
