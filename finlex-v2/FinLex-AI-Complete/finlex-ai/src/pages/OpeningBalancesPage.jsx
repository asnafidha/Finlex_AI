import { useState, useEffect } from 'react'
import { Upload, Save, RefreshCw, CheckCircle, AlertCircle, Scale } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const request = async (endpoint, options = {}) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...options.headers }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function OpeningBalancesPage() {
  const { company } = useAuth()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [edits, setEdits]         = useState({})       // { account_id: new_balance }
  const [asOfDate, setAsOfDate]   = useState('')
  const [toast, setToast]         = useState(null)
  const [strict, setStrict]       = useState(true)
  const [filter, setFilter]       = useState('all')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4500) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const res = await request(`/opening-balances?company_id=${company.id}`)
      setData(res)
      // Pre-populate edits from existing opening balances
      const e = {}
      res.accounts.forEach(a => { if (parseFloat(a.opening_balance)) e[a.id] = a.opening_balance })
      setEdits(e)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company])

  const save = async () => {
    if (!asOfDate) return showToast('Select an "as of" date before saving', 'error')
    const balances = Object.entries(edits)
      .filter(([, v]) => parseFloat(v) !== 0)
      .map(([account_id, amount]) => ({ account_id: parseInt(account_id), amount: parseFloat(amount) }))
    if (!balances.length) return showToast('No balances to save', 'error')
    setSaving(true)
    try {
      const res = await request('/opening-balances', {
        method: 'POST',
        body: JSON.stringify({ company_id: company.id, as_of_date: asOfDate, balances, strict })
      })
      showToast(res.message + (res.adjustment_note ? ' · ' + res.adjustment_note : ''))
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const accounts = data?.accounts || []
  const filtered = filter === 'all' ? accounts : accounts.filter(a => a.type === filter)

  // Live difference calc using edits
  const debitTotal  = accounts.filter(a => ['asset','expense'].includes(a.type)).reduce((s, a) => s + parseFloat(edits[a.id] || a.opening_balance || 0), 0)
  const creditTotal = accounts.filter(a => ['liability','equity','revenue'].includes(a.type)).reduce((s, a) => s + parseFloat(edits[a.id] || a.opening_balance || 0), 0)
  const diff = Math.abs(debitTotal - creditTotal)
  const isBalanced = diff < 0.01

  const S = styles

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 12, padding: '12px 18px', fontSize: 13, color: toast.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Opening Balances</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Import balances when migrating from Tally / Busy / Zoho</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} placeholder="As of date" style={{ ...S.input, width: 160 }} />
          <button onClick={load} style={S.ghostBtn}><RefreshCw size={14} /></button>
          <button onClick={save} disabled={saving} style={S.primaryBtn}><Save size={14} /> {saving ? 'Saving...' : 'Save Balances'}</button>
        </div>
      </div>

      {/* Balance checker */}
      <div style={{ ...S.card, marginBottom: 20, background: isBalanced ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef9ec, #fef3c7)', border: `1px solid ${isBalanced ? '#86efac' : '#fde68a'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Scale size={24} color={isBalanced ? '#16a34a' : '#d97706'} />
          <div>
            <div style={{ fontWeight: 700, color: isBalanced ? '#166534' : '#92400e', fontSize: 15 }}>
              {isBalanced ? '✓ Balances are equal' : `⚠ Difference: ${fmt(diff)}`}
            </div>
            <div style={{ fontSize: 13, color: isBalanced ? '#16a34a' : '#d97706' }}>
              Debit-nature: {fmt(debitTotal)} &nbsp;|&nbsp; Credit-nature: {fmt(creditTotal)}
            </div>
          </div>
          {!isBalanced && (
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400e', cursor: 'pointer' }}>
              <input type="checkbox" checked={!strict} onChange={e => setStrict(!e.target.checked)} /> Auto-adjust to Retained Earnings
            </label>
          )}
        </div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all','asset','liability','equity','revenue','expense'].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: filter === t ? 'var(--navy)' : 'var(--gray-200)', background: filter === t ? 'var(--navy)' : 'var(--white)', color: filter === t ? 'var(--white)' : 'var(--gray-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading accounts...</div>
      ) : (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--gray-100)' }}>
                {['Code', 'Account Name', 'Type', 'Group', 'Opening Balance'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--gray-400)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(acc => (
                <tr key={acc.id} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-500)' }}>{acc.code}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--navy)' }}>{acc.name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: typeColor(acc.type).bg, color: typeColor(acc.type).text, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{acc.type}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 12 }}>{acc.group_name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      value={edits[acc.id] ?? (parseFloat(acc.opening_balance) || '')}
                      onChange={e => setEdits(prev => ({ ...prev, [acc.id]: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...S.input, width: 140, textAlign: 'right', fontFamily: 'var(--font-mono)', padding: '6px 10px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const typeColor = (t) => ({
  asset:     { bg: '#eff6ff', text: '#2563eb' },
  liability: { bg: '#fef2f2', text: '#dc2626' },
  equity:    { bg: '#f0fdf4', text: '#16a34a' },
  revenue:   { bg: '#f5f3ff', text: '#7c3aed' },
  expense:   { bg: '#fff7ed', text: '#ea580c' },
}[t] || { bg: '#f3f4f6', text: '#6b7280' })

const styles = {
  card: { background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-100)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)', color: 'var(--navy)' },
}