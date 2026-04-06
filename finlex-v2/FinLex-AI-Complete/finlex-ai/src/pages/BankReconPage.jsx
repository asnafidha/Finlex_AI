import { useState, useEffect } from 'react'
import { Upload, RefreshCw, CheckCircle, AlertCircle, Link, Unlink, Plus, X } from 'lucide-react'
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

export default function BankReconPage() {
  const { company } = useAuth()
  const [lines, setLines]       = useState([])
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [filter, setFilter]     = useState('unmatched')
  const [toast, setToast]       = useState(null)
  const [importing, setImporting] = useState(false)
  const [autoMatching, setAutoMatching] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [journals, setJournals] = useState([])
  const [matchModal, setMatchModal] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [l, s, j] = await Promise.all([
        request(`/bank-recon?company_id=${company.id}${filter !== 'all' ? `&matched=${filter === 'matched'}` : ''}`),
        request(`/bank-recon/summary?company_id=${company.id}`),
        request(`/journals?company_id=${company.id}`)
      ])
      setLines(l); setSummary(s); setJournals(j)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company, filter])

  const autoMatch = async () => {
    setAutoMatching(true)
    try {
      const res = await request('/bank-recon/auto-match', { method: 'POST', body: JSON.stringify({ company_id: company.id }) })
      showToast(`Auto-matched ${res.matched} of ${res.total} lines`)
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setAutoMatching(false) }
  }

  const importStatements = async () => {
    // Parse simple CSV: date,description,debit,credit
    setImporting(true)
    try {
      const rows = importText.trim().split('\n').slice(1).map(row => {
        const [statement_date, description, debit, credit, balance, reference] = row.split(',')
        return { statement_date: statement_date?.trim(), description: description?.trim(), debit: debit?.trim() || '0', credit: credit?.trim() || '0', balance: balance?.trim(), reference: reference?.trim() }
      }).filter(r => r.statement_date)
      const res = await request('/bank-recon/import', {
        method: 'POST',
        body: JSON.stringify({ company_id: company.id, statements: rows })
      })
      showToast(`Imported ${res.imported} lines (${res.duplicates} duplicates skipped)`)
      setShowImport(false); setImportText(''); load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setImporting(false) }
  }

  const match = async (id, jeId) => {
    try {
      await request(`/bank-recon/${id}/match`, { method: 'PATCH', body: JSON.stringify({ journal_entry_id: jeId }) })
      showToast('Matched successfully'); setMatchModal(null); load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const unmatch = async (id) => {
    try {
      await request(`/bank-recon/${id}/unmatch`, { method: 'PATCH' })
      showToast('Unmatched'); load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const S = styles

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 12, padding: '12px 18px', fontSize: 13, color: toast.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Bank Reconciliation</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Import bank statement · Auto-match · Reconcile manually</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={autoMatch} disabled={autoMatching} style={S.ghostBtn}><RefreshCw size={14} /> {autoMatching ? 'Matching...' : 'Auto Match'}</button>
          <button onClick={() => setShowImport(true)} style={S.primaryBtn}><Upload size={14} /> Import Statement</button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Book Balance', value: fmt(summary.book_balance), color: 'var(--navy)' },
            { label: 'Unmatched Lines', value: summary.unmatched_count, color: '#dc2626' },
            { label: 'Matched Lines', value: summary.matched_count, color: '#16a34a' },
            { label: 'Last Statement', value: summary.last_statement_date ? new Date(summary.last_statement_date).toLocaleDateString('en-IN') : '—', color: 'var(--gray-600)' },
          ].map(c => (
            <div key={c.label} style={S.card}>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        {['unmatched','matched','all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: filter === f ? 'var(--navy)' : 'transparent', color: filter === f ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Lines table */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Loading...</div>
        ) : lines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Upload size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
            <div style={{ color: 'var(--gray-400)', fontSize: 14 }}>No statement lines yet. Import a bank statement to begin.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--gray-100)' }}>
                {['Date', 'Description', 'Debit', 'Credit', 'Matched JE', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--gray-400)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-50)', background: l.matched ? 'transparent' : '#fffbeb' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--gray-600)', fontSize: 12 }}>{new Date(l.statement_date).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--navy)', fontWeight: 400, maxWidth: 220 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description || '—'}</div></td>
                  <td style={{ padding: '10px 12px', color: '#dc2626', fontWeight: parseFloat(l.debit) > 0 ? 600 : 400 }}>{parseFloat(l.debit) > 0 ? fmt(l.debit) : '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: parseFloat(l.credit) > 0 ? 600 : 400 }}>{parseFloat(l.credit) > 0 ? fmt(l.credit) : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {l.matched_entry_number
                      ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{l.matched_entry_number}</span>
                      : <span style={{ color: 'var(--gray-300)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {l.matched
                      ? <button onClick={() => unmatch(l.id)} style={{ ...S.ghostBtn, padding: '4px 10px', fontSize: 11, color: '#dc2626', borderColor: '#fca5a5' }}><Unlink size={11} /> Unmatch</button>
                      : <button onClick={() => setMatchModal(l)} style={{ ...S.ghostBtn, padding: '4px 10px', fontSize: 11 }}><Link size={11} /> Match</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 600 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Import Bank Statement</span>
              <button onClick={() => setShowImport(false)} style={S.closeBtn}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 10, background: 'var(--gray-50)', borderRadius: 8, padding: '10px 12px' }}>
              CSV format: <code>date,description,debit,credit,balance,reference</code><br />
              First row is header (will be skipped). Date format: YYYY-MM-DD
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"date,description,debit,credit,balance,reference\n2025-03-01,NEFT from ABC Ltd,0,50000,150000,REF001\n2025-03-02,Vendor Payment XYZ,20000,0,130000,CHQ123"}
              style={{ ...S.input, height: 200, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button onClick={() => setShowImport(false)} style={S.ghostBtn}>Cancel</button>
              <button onClick={importStatements} disabled={importing || !importText.trim()} style={S.primaryBtn}><Upload size={14} /> {importing ? 'Importing...' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      {matchModal && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 500 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Match to Journal Entry</span>
              <button onClick={() => setMatchModal(null)} style={S.closeBtn}><X size={18} /></button>
            </div>
            <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12 }}>
              <strong>{matchModal.description}</strong><br />
              {new Date(matchModal.statement_date).toLocaleDateString('en-IN')} · {parseFloat(matchModal.credit) > 0 ? `Credit ${fmt(matchModal.credit)}` : `Debit ${fmt(matchModal.debit)}`}
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {journals.map(j => (
                <button key={j.id} onClick={() => match(matchModal.id, j.id)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--gray-100)', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 13 }}>{j.entry_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{new Date(j.entry_date).toLocaleDateString('en-IN')} · {j.narration?.slice(0, 50)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{fmt(j.total_debit)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: { background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-100)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)', color: 'var(--navy)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--white)', borderRadius: 20, padding: 28, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 },
}