// FinLex AI — Complete API Service v4.1

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')

export const saveToken  = (t) => localStorage.setItem('finlex_token', t)
export const clearToken = ()  => localStorage.removeItem('finlex_token')

const request = async (endpoint, options = {}) => {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

// ── AUTH ──────────────────────────────────────────────────
export const auth = {
  login:          (email, password)               => request('/auth/login',           { method:'POST', body:JSON.stringify({ email, password }) }),
  register:       (name, email, password)          => request('/auth/register',        { method:'POST', body:JSON.stringify({ name, email, password }) }),
  me:             ()                               => request('/auth/me'),
  changePassword: (current_password, new_password) => request('/auth/change-password', { method:'POST', body:JSON.stringify({ current_password, new_password }) }),
}

// ── COMPANIES ─────────────────────────────────────────────
export const companies = {
  list:   ()         => request('/companies'),
  get:    (id)       => request(`/companies/${id}`),
  create: (data)     => request('/companies', { method:'POST', body:JSON.stringify(data) }),
  update: (id, data) => request(`/companies/${id}`, { method:'PUT', body:JSON.stringify(data) }),
}

// ── ACCOUNTS ──────────────────────────────────────────────
export const accounts = {
  list:    (company_id, type) => request(`/accounts?company_id=${company_id}${type ? `&type=${type}` : ''}`),
  grouped: (company_id)       => request(`/accounts/grouped?company_id=${company_id}`),
  create:  (data)             => request('/accounts',       { method:'POST', body:JSON.stringify(data) }),
  update:  (id, data)         => request(`/accounts/${id}`, { method:'PUT',  body:JSON.stringify(data) }),
}

// ── INVOICES ──────────────────────────────────────────────
export const invoices = {
  list:         (company_id, invoice_type) => request(`/invoices?company_id=${company_id}${invoice_type ? `&invoice_type=${invoice_type}` : ''}`),
  get:          (id)                        => request(`/invoices/${id}`),
  create:       (data)                      => request('/invoices', { method:'POST', body:JSON.stringify(data) }),
  updateStatus: (id, status, payment_status)=> request(`/invoices/${id}/status`, { method:'PATCH', body:JSON.stringify({ status, payment_status }) }),
  cancel:       (id)                        => request(`/invoices/${id}/cancel`,  { method:'PATCH' }),
}

// ── PAYMENTS ──────────────────────────────────────────────
export const payments = {
  list:   (company_id) => request(`/payments?company_id=${company_id}`),
  create: (data)       => request('/payments', { method:'POST', body:JSON.stringify(data) }),
}

// ── JOURNALS ──────────────────────────────────────────────
export const journals = {
  list:   (company_id) => request(`/journals?company_id=${company_id}`),
  get:    (id)         => request(`/journals/${id}`),
  create: (data)       => request('/journals', { method:'POST', body:JSON.stringify(data) }),
}

// ── REPORTS ───────────────────────────────────────────────
export const reports = {
  trialBalance: (company_id, from, to) =>
    request(`/reports/trial-balance?company_id=${company_id}${from?`&from=${from}`:''}${to?`&to=${to}`:''}`),
  pl: (company_id, from, to) =>
    request(`/reports/pl?company_id=${company_id}${from?`&from=${from}`:''}${to?`&to=${to}`:''}`),
  balanceSheet: (company_id, as_of) =>
    request(`/reports/balance-sheet?company_id=${company_id}${as_of?`&as_of=${as_of}`:''}`),
  ledger: (company_id, account_code, from, to) =>
    request(`/reports/ledger?company_id=${company_id}${account_code?`&account_code=${account_code}`:''}${from?`&from=${from}`:''}${to?`&to=${to}`:''}`),
  gstSummary: (company_id, month, year) =>
    request(`/reports/gst-summary?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}`),
}

// ── COMPLIANCE ────────────────────────────────────────────
export const compliance = {
  list:     (company_id, status, type) => request(`/compliance?company_id=${company_id}${status?`&status=${status}`:''}${type?`&type=${type}`:''}`),
  dashboard:(company_id)               => request(`/compliance/dashboard?company_id=${company_id}`),
  create:   (data)                     => request('/compliance', { method:'POST', body:JSON.stringify(data) }),
  complete: (id, notes)                => request(`/compliance/${id}/complete`, { method:'PATCH', body:JSON.stringify({ notes }) }),
  reopen:   (id)                       => request(`/compliance/${id}/reopen`,   { method:'PATCH' }),
}

// ── CA ────────────────────────────────────────────────────
export const ca = {
  dashboard:         ()   => request('/ca/dashboard'),
  companySummary:    (id) => request(`/ca/companies/${id}/summary`),
}

// ── TDS ───────────────────────────────────────────────────
export const tds = {
  sections:       ()                                       => request('/tds/sections'),
  entries:        (company_id)                             => request(`/tds/entries?company_id=${company_id}`),
  calculate:      (data)                                   => request('/tds/calculate',       { method:'POST', body:JSON.stringify(data) }),
  create:         (data)                                   => request('/tds/entries',          { method:'POST', body:JSON.stringify(data) }),
  // FIXED: was /tds/entries/:id/deposited — correct endpoint is /deposit
  markDeposited:  (id, challan_no, deposit_date)           => request(`/tds/entries/${id}/deposit`, { method:'PATCH', body:JSON.stringify({ challan_no, deposit_date }) }),
  aggregateCheck: (company_id, party_name, section)        => request(`/tds/aggregate-check?company_id=${company_id}&party_name=${encodeURIComponent(party_name)}&section=${section}`),
  summary:        (company_id, quarter, year)              => request(`/tds/summary?company_id=${company_id}${quarter?`&quarter=${quarter}`:''}${year?`&year=${year}`:''}`),
  // Returns URL string for download links
  exportReturnUrl: (company_id, quarter, year, format='csv') => `${BASE_URL}/tds/export-return?company_id=${company_id}&quarter=${quarter}&year=${year}&format=${format}&token=${getToken()}`,
}

// ── GSTR ──────────────────────────────────────────────────
export const gstr = {
  // FIXED: was /gstr/export — correct endpoints are export-json / export-csv
  gstr1:      (company_id, month, year, filer_type) =>
    request(`/gstr/gstr1?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}${filer_type?`&filer_type=${filer_type}`:''}`),
  gstr3b:     (company_id, month, year, filing_date) =>
    request(`/gstr/gstr3b?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}${filing_date?`&filing_date=${filing_date}`:''}`),
  // FIXED: was /gstr/summary — now correct endpoint
  summary:    (company_id, month, year) =>
    request(`/gstr/gstr3b?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}`),
  lateFee:    (company_id, type, month, year, filing_date) =>
    request(`/gstr/late-fee?company_id=${company_id}&type=${type}&month=${month}&year=${year}${filing_date?`&filing_date=${filing_date}`:''}`),
  exportJsonUrl: (company_id, type, month, year) =>
    `${BASE_URL}/gstr/export-json?company_id=${company_id}&type=${type}&month=${month}&year=${year}&token=${getToken()}`,
  exportCsvUrl:  (company_id, type, month, year) =>
    `${BASE_URL}/gstr/export-csv?company_id=${company_id}&type=${type}&month=${month}&year=${year}&token=${getToken()}`,
}

// ── ITC ───────────────────────────────────────────────────
export const itc = {
  register:  (company_id, month, year) =>
    request(`/itc/purchase-register?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}`),
  reconcile: (company_id, month, year, gstr2b) =>
    request('/itc/reconcile', { method:'POST', body:JSON.stringify({ company_id, month, year, gstr2b_data: gstr2b }) }),
}

// ── ITR ───────────────────────────────────────────────────
export const itr = {
  computation: (company_id, fy, regime) =>
    request(`/itr/computation?company_id=${company_id}&fy=${fy||'2024-25'}&regime=${regime||'new'}`),
}

// ── ADVANCE TAX ───────────────────────────────────────────
export const advanceTax = {
  plan:          (company_id, fy, regime) =>
    request(`/advance-tax/plan?company_id=${company_id}&fy=${fy||'2024-25'}&regime=${regime||'new'}`),
  recordPayment: (data) =>
    request('/advance-tax/record-payment', { method:'POST', body:JSON.stringify(data) }),
}

// ── AUDIT TRAIL ───────────────────────────────────────────
export const auditTrail = {
  list:    (company_id, limit, action, from, to) =>
    request(`/audit-trail?company_id=${company_id}${limit?`&limit=${limit}`:''}${action?`&action=${action}`:''}${from?`&from=${from}`:''}${to?`&to=${to}`:''}`),
  actions: (company_id) => request(`/audit-trail/actions?company_id=${company_id}`),
}

// ── ACTIONS ───────────────────────────────────────────────
export const actions = {
  list: (company_id) => request(`/actions?company_id=${company_id}`),
}

// ── CREDIT / DEBIT NOTES ─────────────────────────────────
export const creditNotes = {
  list:   (company_id, note_type) => request(`/credit-notes?company_id=${company_id}${note_type?`&note_type=${note_type}`:''}`),
  get:    (id)                     => request(`/credit-notes/${id}`),
  create: (data)                   => request('/credit-notes', { method:'POST', body:JSON.stringify(data) }),
}

// ── OPENING BALANCES ─────────────────────────────────────
export const openingBalances = {
  get:      (company_id) => request(`/opening-balances?company_id=${company_id}`),
  // FIXED: was POST /opening-balances — now correct, backend accepts this directly
  save:     (data)       => request('/opening-balances', { method:'POST', body:JSON.stringify(data) }),
  template: (company_id) => `${BASE_URL}/opening-balances/template?company_id=${company_id}&token=${getToken()}`,
}

// ── BANK RECONCILIATION ──────────────────────────────────
export const bankRecon = {
  list:      (company_id, matched) => request(`/bank-recon?company_id=${company_id}${matched !== undefined ? `&matched=${matched}` : ''}`),
  summary:   (company_id)          => request(`/bank-recon/summary?company_id=${company_id}`),
  // FIXED: was /bank-recon/import — correct endpoint is now /import (added in fix)
  import:    (data)                 => request('/bank-recon/import',     { method:'POST', body:JSON.stringify(data) }),
  autoMatch: (data)                 => request('/bank-recon/auto-match', { method:'POST', body:JSON.stringify(data) }),
  match:     (id, journal_entry_id) => request(`/bank-recon/${id}/match`,   { method:'PATCH', body:JSON.stringify({ journal_entry_id }) }),
  unmatch:   (id)                   => request(`/bank-recon/${id}/unmatch`,  { method:'PATCH' }),
  delete:    (id)                   => request(`/bank-recon/${id}`,          { method:'DELETE' }),
}

// ── PAYROLL ───────────────────────────────────────────────
export const payroll = {
  list:      (company_id, month, year) => request(`/payroll?company_id=${company_id}${month?`&month=${month}`:''}${year?`&year=${year}`:''}`),
  calculate: (data)                    => request('/payroll/calculate', { method:'POST', body:JSON.stringify(data) }),
  create:    (data)                    => request('/payroll',           { method:'POST', body:JSON.stringify(data) }),
  summary:   (company_id, year)        => request(`/payroll/summary?company_id=${company_id}${year?`&year=${year}`:''}`),
}

// ── DEPRECIATION ─────────────────────────────────────────
export const depreciation = {
  schedules:    (company_id)     => request(`/depreciation/schedules?company_id=${company_id}`),
  create:       (data)           => request('/depreciation/schedules',           { method:'POST', body:JSON.stringify(data) }),
  preview:      (id)             => request(`/depreciation/schedules/${id}/preview`),
  post:         (id, data)       => request(`/depreciation/schedules/${id}/post`, { method:'POST', body:JSON.stringify(data) }),
  summary:      (company_id, fy) => request(`/depreciation/summary?company_id=${company_id}${fy?`&financial_year=${fy}`:''}`),
  referenceRates: ()             => request('/depreciation/reference-rates'),
}

// ── AI ────────────────────────────────────────────────────
export const ai = {
  chat:            (company_id, message, history) => request('/ai/chat',            { method:'POST', body:JSON.stringify({ company_id, message, history }) }),
  complianceCheck: (company_id, check_types)      => request('/ai/compliance-check', { method:'POST', body:JSON.stringify({ company_id, check_types }) }),
  auditAnalysis:   (company_id, from, to)         => request('/ai/audit-analysis',   { method:'POST', body:JSON.stringify({ company_id, from, to }) }),
  rules:           (query)                        => request(`/ai/rules${query?`?query=${encodeURIComponent(query)}`:''}`),
}
// ── CLIENT COLLABORATION ─────────────────────────────────
export const clientCollab = {
  getRequests:     (companyId) => request(`/client-collab/requests?company_id=${companyId}`),
  createRequest:   (data)      => request('/client-collab/requests', { method: 'POST', body: JSON.stringify(data) }),
  getRequest:      (id)        => request(`/client-collab/requests/${id}`),
  updateItemStatus:(itemId, status) => request(`/client-collab/items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  addComment:      (requestId, message) => request(`/client-collab/requests/${requestId}/comments`, { method: 'POST', body: JSON.stringify({ message }) }),
  deleteRequest:   (id)        => request(`/client-collab/requests/${id}`, { method: 'DELETE' }),
  getSummary:      (companyId) => request(`/client-collab/summary?company_id=${companyId}`),
  getNotifications: ()          => request('/client-collab/notifications'),
  markNotificationsRead: ()     => request('/client-collab/notifications/mark-read', { method: 'PATCH' }),
};