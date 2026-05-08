// FinLex AI — Complete API Service Layer (Phase 1 + Phase 2 + Phase 3 SaaS)

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

// ── AUTH ──────────────────────────────────────────────────────
export const auth = {
  login:          (email, password)               => request('/auth/login',           { method:'POST', body:JSON.stringify({ email, password }) }),
  register:       (name, email, password)          => request('/auth/register',        { method:'POST', body:JSON.stringify({ name, email, password }) }),
  me:             ()                               => request('/auth/me'),
  changePassword: (current_password, new_password) => request('/auth/change-password', { method:'POST', body:JSON.stringify({ current_password, new_password }) }),
}

// ── COMPANIES ─────────────────────────────────────────────────
export const companies = {
  list:   ()         => request('/companies'),
  get:    (id)       => request(`/companies/${id}`),
  create: (data)     => request('/companies', { method:'POST', body:JSON.stringify(data) }),
  update: (id, data) => request(`/companies/${id}`, { method:'PUT', body:JSON.stringify(data) }),
}

// ── ACCOUNTS ──────────────────────────────────────────────────
export const accounts = {
  list:    (company_id, type) => request(`/accounts?company_id=${company_id}${type ? `&type=${type}` : ''}`),
  grouped: (company_id)       => request(`/accounts/grouped?company_id=${company_id}`),
  create:  (data)             => request('/accounts',     { method:'POST', body:JSON.stringify(data) }),
  update:  (id, data)         => request(`/accounts/${id}`, { method:'PUT', body:JSON.stringify(data) }),
}

// ── INVOICES ──────────────────────────────────────────────────
export const invoices = {
  list:         (company_id, invoice_type) => request(`/invoices?company_id=${company_id}${invoice_type ? `&invoice_type=${invoice_type}` : ''}`),
  get:          (id)                        => request(`/invoices/${id}`),
  create:       (data)                      => request('/invoices', { method:'POST', body:JSON.stringify(data) }),
  updateStatus: (id, status, payment_status) => request(`/invoices/${id}/status`, { method:'PATCH', body:JSON.stringify({ status, payment_status }) }),
  cancel:       (id)                        => request(`/invoices/${id}/cancel`, { method:'PATCH' }),
}

// ── PAYMENTS ──────────────────────────────────────────────────
export const payments = {
  list:   (company_id) => request(`/payments?company_id=${company_id}`),
  create: (data)       => request('/payments', { method:'POST', body:JSON.stringify(data) }),
}

// ── JOURNALS ──────────────────────────────────────────────────
export const journals = {
  list:   (company_id) => request(`/journals?company_id=${company_id}`),
  get:    (id)         => request(`/journals/${id}`),
  create: (data)       => request('/journals', { method:'POST', body:JSON.stringify(data) }),
}

// ── REPORTS ───────────────────────────────────────────────────
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

// ── COMPLIANCE ────────────────────────────────────────────────
export const compliance = {
  list:     (company_id, status, type) =>
    request(`/compliance?company_id=${company_id}${status?`&status=${status}`:''}${type?`&type=${type}`:''}`),
  dashboard: (company_id) => request(`/compliance/dashboard?company_id=${company_id}`),
  create:   (data)        => request('/compliance', { method:'POST', body:JSON.stringify(data) }),
  complete: (id, notes)   => request(`/compliance/${id}/complete`, { method:'PATCH', body:JSON.stringify({ notes }) }),
}

// ── CA ────────────────────────────────────────────────────────
export const ca = {
  dashboard: () => request('/ca/dashboard'),
  summary:   (id) => request(`/ca/companies/${id}/summary`),
}

// ── TDS ───────────────────────────────────────────────────────
export const tds = {
  sections:  ()            => request('/tds/sections'),
  entries:   (company_id)  => request(`/tds/entries?company_id=${company_id}`),
  calculate: (data)        => request('/tds/calculate', { method:'POST', body:JSON.stringify(data) }),
  create:    (data)        => request('/tds/entries',   { method:'POST', body:JSON.stringify(data) }),
  export:    (company_id, quarter, year, format) =>
    `${BASE_URL}/tds/export-return?company_id=${company_id}&quarter=${quarter}&year=${year}&format=${format}`,
}

// ── GSTR ──────────────────────────────────────────────────────
export const gstr = {
  export:     (company_id, month, year, type) =>
    request(`/gstr/export?company_id=${company_id}&month=${month}&year=${year}&type=${type}`),
  summary:    (company_id, month, year) =>
    request(`/gstr/summary?company_id=${company_id}&month=${month}&year=${year}`),
}

// ── ITC ───────────────────────────────────────────────────────
export const itc = {
  register:   (company_id, month, year) =>
    request(`/itc/purchase-register?company_id=${company_id}&month=${month}&year=${year}`),
  reconcile:  (company_id, month, year, gstr2b) =>
    request('/itc/reconcile', { method:'POST', body:JSON.stringify({ company_id, month, year, gstr2b_data: gstr2b }) }),
}

// ── ITR ───────────────────────────────────────────────────────
export const itr = {
  compute:    (company_id, year) =>
    request(`/itr/compute?company_id=${company_id}&year=${year}`),
}

// ── AUDIT TRAIL ───────────────────────────────────────────────
export const auditTrail = {
  list: (company_id, limit) =>
    request(`/audit-trail?company_id=${company_id}${limit?`&limit=${limit}`:''}`),
}

// ── ACTIONS (Phase 3) ─────────────────────────────────────────
export const actions = {
  list: (company_id) => request(`/actions?company_id=${company_id}`),
}