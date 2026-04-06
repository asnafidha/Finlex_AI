# FinLex V2 — Complete Changelog

## How to upgrade
1. Run `sql/migration_v2.sql` on your existing PostgreSQL database
2. Replace `backend/src/routes/` with the new routes
3. Replace `backend/src/server.js`
4. `npm install` (no new dependencies needed)

---

## Bug Fixes

### 1. TAN column added to companies
- **File**: `companies.js`, `migration_v2.sql`
- **Fix**: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS tan VARCHAR(10)`
- **Impact**: 26Q TDS export now returns actual TAN instead of `TAN_NOT_SET`

### 2. Section 87A rebate — correct application
- **File**: `itr.js`
- **Fix**: Rebate now applied BEFORE cess. New regime: taxable ≤₹7L → ₹25,000 rebate. Old: ≤₹5L → ₹12,500.
- **Law**: Income Tax Act Sec 87A

### 3. Surcharge — applies to both regimes
- **File**: `itr.js`
- **Fix**: Surcharge now computed for new regime (capped at 25%) and old regime (up to 37%). Budget 2023 capped new regime surcharge at 25%.
- **Law**: Finance Act 2023

### 4. Advance tax — ₹10,000 threshold check
- **File**: `itr.js`
- **Fix**: Instalments only shown if total tax ≥ ₹10,000. Below this, advance tax is not legally required.
- **Law**: Income Tax Act Sec 208

### 5. Partial payment over-payment prevention
- **File**: `payments.js`
- **Fix**: Now sums ALL prior payment JEs for an invoice before accepting new payment. Error message shows already-paid, total, and remaining.

### 6. Audit log coverage — all mutations now logged
- **Files**: `invoices.js`, `journals.js`, `tds.js`, `payments.js`, `companies.js`
- **Fix**: Every state-changing operation writes to `audit_log` with old/new values

### 7. Account 1011/1012 for advance/self-assessment tax
- **File**: `itr.js`, `migration_v2.sql`
- **Fix**: New accounts 1011 "Advance Tax Paid" and 1012 "Self Assessment Tax Paid" added to default CoA. ITR computation reads from these (not from 1008 "Advance to Suppliers")

### 8. TDS section rates — comprehensive fix
- **File**: `tds.js`
- **Fix**:
  - 194A: Split into bank (₹40,000) and others (₹5,000) threshold
  - 194C: Added `aggregate_threshold: 100000` and `/aggregate-check` endpoint
  - 194I: Split into 194I_LAND (10%) and 194I_PLANT (2%)
  - 194J: Split into 194J (10% professional) and 194J_TECH (2% technical, Budget 2020)
  - Added 20+ new sections: 194B/BB, 194D/DA, 194G, 194IA/IB/IC, 194K/LA/LB/LC, 194M/N/O/P/Q/R/S, 195, 206C
- **Law**: Various CBDT Circulars + Finance Acts 2020-2024

### 9. GST GSTR-3B — correct ITC utilization order
- **File**: `gstr.js`
- **Fix**: Implemented CGST Rule 88A: IGST ITC → IGST→CGST→SGST; CGST ITC → CGST→IGST; SGST ITC → SGST→IGST. Cross-utilization CGST↔SGST blocked.
- **Law**: CGST Rule 88A

### 10. GSTR-1 QRMP filer deadline
- **File**: `gstr.js`
- **Fix**: Added `filer_type` param. Monthly filers: 11th. QRMP quarterly filers: 13th.
- **Law**: CGST Notification 89/2020

### 11. GST late fee calculation
- **File**: `gstr.js`, new `/api/gstr/late-fee` endpoint
- **Fix**: GSTR-1: ₹50/day max ₹10,000 (₹20/day for NIL). GSTR-3B: ₹50/day + 18% p.a. interest on unpaid tax.
- **Law**: CGST Act Sec 47

### 12. Credit note time limit validation
- **File**: `credit_notes.js`
- **Fix**: Credit notes validated against Sep 30 of following FY limit. Blocked with clear error if exceeded.
- **Law**: CGST Act Sec 34

### 13. Payroll PF/ESIC auto-calculation
- **File**: `payroll.js`
- **Fix**: New `/api/payroll/calculate` endpoint computes PF on basic (capped at ₹15,000 ceiling), ESIC only if gross ≤ ₹21,000. Correct rates: PF employee 12%, employer 12% (8.33% EPS + 3.67% EPF). ESIC employee 0.75%, employer 3.25%.
- **Law**: EPF Act, ESIC Act

---

## New Features

### A. Credit / Debit Notes (`/api/credit-notes`)
- Full GST calculation with intra/inter-state detection
- Automatic journal entries (sales returns Dr, GST reversed, AR credited)
- Time limit validation per CGST Sec 34
- Included in GSTR-1 credit note section

### B. Opening Balances Import (`/api/opening-balances`)
- Bulk import endpoint validates debit = credit (rejects if unbalanced)
- CSV template download pre-filled with your chart of accounts
- Audit log entry for every import

### C. Bank Reconciliation (`/api/bank-recon`)
- Upload bank statement lines (bulk)
- Auto-match to journal entries by amount ± 3-day date window
- Manual match/unmatch endpoints
- Unmatched items summary for CA review

### D. Payroll (`/api/payroll`)
- Auto-calculate PF/ESIC from salary components
- Full double-entry: Salary Dr + PF Employer Dr + ESIC Employer Dr = PF Payable Cr + ESIC Payable Cr + TDS Payable Cr + Bank/Payable Cr
- Monthly summary endpoint

### E. Depreciation (`/api/depreciation`)
- Fixed asset register (SLM and WDV methods)
- Batch depreciation computation for a full financial year
- Auto-posts journal: Depreciation Expense Dr, Accumulated Depreciation Cr
- Prevents double-posting for same asset+FY
- Depreciation schedule report

### F. RAG-based Compliance Check (`/api/ai/compliance-check`)
- Checks 15+ GST rules against your actual data
- TDS violations: missing PAN, undeposited TDS, 194C aggregate breach
- Advance tax warnings timed to quarterly due dates
- Returns severity-graded issues with law references and action items

### G. AI Audit Trail Analysis (`/api/ai/audit-analysis`)
- Statistical anomaly detection: large transactions (>10× median), high cancellation rate, weekend entries, round-number entries, high manual JE ratio
- Groq LLM narrative analysis using Llama-3.3-70B with tax rules injected as context
- Works offline (returns statistical anomalies without AI key)

### H. Tax Rules Knowledge Base (`/api/ai/rules`)
- Static RAG corpus: all key IT Act, TDS, GST, PF/ESIC rules
- Keyword search endpoint for rule lookup
- Injected as context into every AI audit analysis request
