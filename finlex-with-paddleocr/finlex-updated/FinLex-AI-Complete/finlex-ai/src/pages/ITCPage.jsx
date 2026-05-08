import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
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

export default function ITCPage() {
  const { company }                   = useAuth()
  const [tab, setTab]                 = useState('register')
  const [register, setRegister]       = useState(null)
  const [reconcile, setReconcile]     = useState(null)
  const [month, setMonth]             = useState(new Date().getMonth() + 1)
  const [year, setYear]               = useState(new Date().getFullYear() - 1)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [gstr2bJson, setGstr2bJson]   = useState('')
  const [gstr2bFileName, setGstr2bFileName] = useState('')
  const gstr2bFileRef = useRef()

  useEffect(() => { if (company?.id) loadRegister() }, [company, month, year])

  const loadRegister = async () => {
    setLoading(true); setError('')
    try {
      const data = await request(`/itc/purchase-register?company_id=${company.id}&month=${month}&year=${year}`)
      setRegister(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleGstr2bFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      JSON.parse(text) // validate JSON
      setGstr2bJson(text)
      setGstr2bFileName(file.name)
      setError('')
    } catch {
      setError('Invalid JSON file. Please upload the GSTR-2B JSON export from the GST portal.')
    }
  }

  const handleReconcile = async () => {
    if (!gstr2bJson.trim()) { setError('Please upload or paste your GSTR-2B JSON data'); return }
    setLoading(true); setError('')
    try {
      const gstr2b_data = JSON.parse(gstr2bJson)
      const data = await request('/itc/reconcile', {
        method: 'POST',
        body: JSON.stringify({ company_id: company.id, month, year, gstr2b_data })
      })
      setReconcile(data)
      setTab('result')
    } catch (err) {
      if (err.message.includes('JSON')) setError('Invalid JSON — please check the GSTR-2B data format')
      else setError(err.message)
    }
    finally { setLoading(false) }
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const selStyle = { padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--navy)', background: 'var(--white)', cursor: 'pointer', outline: 'none' }
  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: tab === id ? 'var(--navy)' : 'transparent', color: tab === id ? 'var(--white)' : 'var(--gray-600)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{label}</button>
  )

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>ITC Reconciliation</h1>
        <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Match your purchase register against GSTR-2B to verify ITC claims</p>
      </div>

      {/* Filters + Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--white)', borderRadius: 12, padding: 4, border: '1px solid var(--gray-200)' }}>
          {tabBtn('register', 'Purchase Register')}
          {tabBtn('upload', 'Upload GSTR-2B')}
          {reconcile && tabBtn('result', 'Reconciliation Result')}
        </div>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={selStyle}>
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selStyle}>
          {[new Date().getFullYear()-2, new Date().getFullYear()-1, new Date().getFullYear(), new Date().getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={loadRegister} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Purchase Register */}
      {tab === 'register' && (
        <>
          {register && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Total Invoices', value: register.count,             color: '#3b82f6' },
                { label: 'Total ITC',      value: fmt(register.total_itc),    color: '#10b981' },
                { label: 'Pending Match',  value: register.count + ' invoices', color: '#f59e0b' },
              ].map((s,i) => (
                <div key={i} style={{ background: 'var(--white)', borderRadius: 12, padding: '18px 20px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>Loading purchase register...</div>
            ) : !register?.invoices?.length ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>No purchase invoices for this period</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    {['Invoice No','Date','Vendor','GSTIN','Taxable','CGST','SGST','IGST','Total ITC'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {register.invoices.map((inv, i) => (
                    <tr key={i} style={{ background: i%2===0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{inv.invoice_number}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{inv.party_name}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{inv.party_gstin || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{fmt(inv.taxable_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{fmt(inv.cgst_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{fmt(inv.sgst_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{fmt(inv.igst_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#10b981' }}>{fmt(inv.total_itc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Upload GSTR-2B */}
      {tab === 'upload' && (
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 32, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Upload GSTR-2B Data</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: 14, marginBottom: 20 }}>Download your GSTR-2B JSON from the GST portal and upload the file, or paste the content below</p>

          {/* File Upload */}
          <div
            onClick={() => gstr2bFileRef.current.click()}
            style={{
              border: '2px dashed var(--gray-300)', borderRadius: 12, padding: '20px 24px',
              textAlign: 'center', cursor: 'pointer', marginBottom: 16,
              background: gstr2bFileName ? 'rgba(201,168,76,0.06)' : 'var(--gray-100)',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--gray-300)'}
          >
            <input
              ref={gstr2bFileRef} type="file" accept=".json"
              onChange={handleGstr2bFile} style={{ display: 'none' }}
            />
            <Upload size={22} color={gstr2bFileName ? 'var(--gold)' : 'var(--gray-400)'} style={{ marginBottom: 8 }} />
            {gstr2bFileName
              ? <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>✅ {gstr2bFileName}</div>
              : <><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>Click to upload GSTR-2B JSON file</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Select the .json file exported from the GST portal</div></>
            }
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>— or paste JSON below —</div>

          <div style={{ background: 'var(--gray-100)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--gray-200)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>Expected JSON format:</div>
            <code style={{ fontSize: 11, color: 'var(--gray-600)', fontFamily: 'var(--font-mono)' }}>
              {`[{"invoice_number":"BILL-001","gstin":"27XXXX","itc_amount":9000}, ...]`}
            </code>
          </div>

          <textarea
            value={gstr2bJson}
            onChange={e => setGstr2bJson(e.target.value)}
            placeholder="Paste your GSTR-2B JSON here..."
            style={{
              width: '100%', height: 200, padding: '12px 14px', borderRadius: 10,
              border: '1.5px solid var(--gray-200)', fontSize: 13,
              fontFamily: 'var(--font-mono)', color: 'var(--navy)',
              background: 'var(--gray-100)', outline: 'none', resize: 'vertical',
            }}
          />
          <button onClick={handleReconcile} disabled={loading} style={{
            marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
            color: 'var(--navy)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
            opacity: loading ? 0.7 : 1,
          }}><CheckCircle size={16} /> {loading ? 'Reconciling...' : 'Run Reconciliation'}</button>
        </div>
      )}

      {/* Reconciliation Result */}
      {tab === 'result' && reconcile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { label: 'Matched',          value: reconcile.summary.matched,         color: '#10b981', bg: '#ecfdf5', icon: <CheckCircle size={18} color="#10b981" /> },
              { label: 'Mismatched',       value: reconcile.summary.mismatched,       color: '#f59e0b', bg: '#fffbeb', icon: <AlertTriangle size={18} color="#f59e0b" /> },
              { label: 'Missing in 2B',    value: reconcile.summary.missing_in_2b,    color: '#dc2626', bg: '#fef2f2', icon: <XCircle size={18} color="#dc2626" /> },
              { label: 'Missing in Books', value: reconcile.summary.missing_in_books, color: '#8b5cf6', bg: '#f5f3ff', icon: <AlertTriangle size={18} color="#8b5cf6" /> },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 14, padding: '18px 20px', border: `1px solid ${s.color}22`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>{s.icon}</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ITC Summary */}
          <div style={{ background: 'var(--navy)', borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 32, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>OUR TOTAL ITC CLAIMED</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{fmt(reconcile.summary.our_total_itc)}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>ELIGIBLE ITC (MATCHED)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#10b981' }}>{fmt(reconcile.summary.eligible_itc)}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>INELIGIBLE ITC (MISSING IN 2B)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{fmt(reconcile.summary.ineligible_itc)}</div>
            </div>
          </div>

          {/* Missing in 2B */}
          {reconcile.missing_in_2b?.length > 0 && (
            <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid #fca5a5', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', background: '#fef2f2', borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={16} color="#dc2626" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>Missing in GSTR-2B ({reconcile.missing_in_2b.length}) — Vendor may not have filed</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    {['Invoice No','Vendor','GSTIN','ITC Amount','Note'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#dc2626' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconcile.missing_in_2b.map((inv, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{inv.invoice_number}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{inv.party_name}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{inv.party_gstin || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(inv.total_itc)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{inv.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}