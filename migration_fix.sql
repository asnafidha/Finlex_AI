ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reverses      INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_by   INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_editable   BOOLEAN DEFAULT true;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_debit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit NUMERIC(15,2) DEFAULT 0;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

INSERT INTO ca_company_access (ca_id, company_id, role)
SELECT c.created_by, c.id, 'owner'
FROM companies c
WHERE c.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ca_company_access cca
    WHERE cca.ca_id = c.created_by AND cca.company_id = c.id
  );

SELECT 'Migration complete ✅' AS status;
