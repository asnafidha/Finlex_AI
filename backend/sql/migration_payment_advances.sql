-- ══════════════════════════════════════════════════════════════════════════
-- Migration: Payment Mode Fixes — New Advance Payment Accounts
-- Run this ONCE against your company database after deploying the backend fix
-- ══════════════════════════════════════════════════════════════════════════

-- Add "Customer Advances" account (2006) for money received before invoice is raised
-- Type: liability — we owe the customer goods/services
INSERT INTO accounts (company_id, code, name, type, opening_balance, created_at)
SELECT
  c.id,
  '2006',
  'Customer Advances',
  'liability',
  0,
  NOW()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.company_id = c.id AND a.code = '2006'
);

-- Add "Vendor Advances" account (1008) for money paid before invoice is received
-- Type: asset — the vendor owes us goods/services
INSERT INTO accounts (company_id, code, name, type, opening_balance, created_at)
SELECT
  c.id,
  '1008',
  'Vendor Advances',
  'asset',
  0,
  NOW()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.company_id = c.id AND a.code = '1008'
);

-- Verify
SELECT c.name as company, a.code, a.name, a.type
FROM accounts a
JOIN companies c ON c.id = a.company_id
WHERE a.code IN ('1008', '2006')
ORDER BY c.name, a.code;
