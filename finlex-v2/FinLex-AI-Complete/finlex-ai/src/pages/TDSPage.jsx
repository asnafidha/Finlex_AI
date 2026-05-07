import { useState, useEffect } from 'react'
import { Plus, Calculator, FileText, X, CheckCircle, Download,
         Shield, AlertCircle, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
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

export default function TDSPage() {
  const { company } = useAuth()
  const [tab, setTab] = useState('calculator')
  const [sections, setSections] = useState([])
  const [entries, setEntries] = useState([])
  const [calc, setCalc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [showTable, setShowTable] = useState(true)
  const [toast, setToast] = useState(null)
  const [depositModal, setDepositModal] = useState(null)
  const [depositForm, setDepositForm] = useState({
    challan_no: '',
    cin: '',
    deposit_date: new Date().toISOString().split('T')[0]
  })

  const showToast = (msg, detail, type = 'success') => {
    setToast({ msg, detail, type })
    setTimeout(() => setToast(null), 4000)
  }

  const calcInterest = (entry) => {
    if (entry.deposited) return 0
    const dueDate = new Date(entry.payment_date)
    dueDate.setMonth(dueDate.getMonth() + 1)
    const today = new Date()
    if (today <= dueDate) return 0
    const daysLate = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24))
    return Math.round((entry.tds_amount * 1.5 / 100) * Math.ceil(daysLate / 30) * 100) / 100
  }

  const [calcForm, setCalcForm] = useState({ amount: '', section: '194J', party_type: 'company', pan_available: true })
  const [entryForm, setEntryForm] = useState({
    party_name: '', party_pan: '', section: '194J',
    gross_amount: '', tds_rate: 10, tds_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_nature: '', challan_no: '',
  })
  const [exportQuarter, setExportQuarter] = useState('Q4')
  const [exportYear, setExportYear] = useState(new Date().getFullYear())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadSections()
    if (company?.id) loadEntries()
  }, [company])

  const loadSections = async () => {
    try { const data = await request('/tds/sections'); setSections(data) }
    catch (err) { console.error(err) }
  }

  const loadEntries = async () => {
    try { const data = await request(`/tds/entries?company_id=${company.id}`); setEntries(data) }
    catch (err) { console.error(err) }
  }

  const handleExportTDS = async (format) => {
    if (!company?.id) { setError('No company selected'); return }
    setExporting(true); setError('')
    try {
      const url = `${BASE_URL}/tds/export-return?company_id=${company.id}&quarter=${exportQuarter}&year=${exportYear}&format=${format}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Export failed') }
      if (format === 'csv') {
        const text = await res.text()
        const blob = new Blob([text], { type: 'text/csv' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `TDS_26Q_${exportQuarter}_${exportYear}.csv`; a.click()
      } else {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `TDS_26Q_${exportQuarter}_${exportYear}.json`; a.click()
      }
      setSuccess(`TDS Return exported as ${format.toUpperCase()} successfully!`)
    } catch (err) { setError(err.message) }
    finally { setExporting(false) }
  }

  const handleCalculate = async () => {
    if (!calcForm.amount || !calcForm.section) { setError('Amount and section required'); return }
    setLoading(true); setError('')
    try {
      const data = await request('/tds/calculate', { method: 'POST', body: JSON.stringify(calcForm) })
      setCalc(data)
      setEntryForm(f => ({ ...f, gross_amount: calcForm.amount, tds_rate: data.tds_rate, tds_amount: data.tds_amount, section: calcForm.section }))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleSaveEntry = async () => {
    if (!entryForm.party_name || !entryForm.gross_amount || !entryForm.tds_amount) {
      setError('Party name, gross amount, and TDS amount required')
      return
    }
    setLoading(true); setError('')
    try {
      await request('/tds/entries', { method: 'POST', body: JSON.stringify({ company_id: company.id, ...entryForm }) })
      const tdsAmt = parseFloat(entryForm.tds_amount || 0)
      showToast('TDS entry saved', `₹${tdsAmt.toLocaleString('en-IN')} TDS recorded · Journal entry posted · Challan pending`)
      setShowForm(false)
      setCalc(null)
      setCalcForm({ amount: '', section: '194J', party_type: 'company', pan_available: true })
      loadEntries()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleDeposit = async () => {
    if (!depositForm.challan_no) {
      setError('Challan number is required')
      return
    }
    setLoading(true)
    try {
      await request(`/tds/entries/${depositModal.id}/deposit`, {
        method: 'PATCH',
        body: JSON.stringify({
          challan_no: depositForm.challan_no,
          deposit_date: depositForm.deposit_date
        })
      })
      showToast('TDS deposit recorded', `Challan ${depositForm.challan_no} recorded`)
      setDepositModal(null)
      loadEntries()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid var(--gray-200)', fontSize: 13,
    fontFamily: 'var(--font-body)', color: 'var(--navy)',
    background: 'var(--gray-100)', outline: 'none',
  }

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      padding: '9px 24px', borderRadius: 9, border: 'none',
      background: tab === id ? 'var(--navy)' : 'transparent',
      color: tab === id ? 'var(--white)' : 'var(--gray-600)',
      fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
    }}>{label}</button>
  )

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:24, right:24, zIndex:2000, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'13px 16px', minWidth:280, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', display:'flex', alignItems:'flex-start', gap:10, animation:'fadeUp 0.3s ease' }}>
          <CheckCircle size={15} color="#16a34a" style={{ flexShrink:0, marginTop:1 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#15803d' }}>{toast.msg}</div>
            {toast.detail && <div style={{ fontSize:12, color:'#166534', marginTop:2 }}>{toast.detail}</div>}
          </div>
          <button onClick={()=>setToast(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-400)', padding:0 }}><X size={13}/></button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>TDS Module</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 14 }}>Calculate TDS, record entries and auto journal</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <Plus size={14} /> New TDS Entry
        </button>
      </div>

      {/* TDS Summary Cards */}
      {entries.length > 0 && (() => {
        const totalDeducted  = entries.reduce((s, e) => s + parseFloat(e.tds_amount || 0), 0)
        const totalGross     = entries.reduce((s, e) => s + parseFloat(e.gross_amount || 0), 0)
        const pendingChallan = entries.filter(e => !e.challan_no).length
        const pendingAmt     = entries.filter(e => !e.challan_no).reduce((s, e) => s + parseFloat(e.tds_amount || 0), 0)
        const sections       = [...new Set(entries.map(e => e.section))]
        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:13, marginBottom:20 }}>
            {[
              { label:'TDS Deducted', value:`₹${totalDeducted.toLocaleString('en-IN')}`, sub:`On ₹${totalGross.toLocaleString('en-IN')} gross`, Icon:TrendingDown, color:'#7c3aed', bg:'#f5f3ff' },
              { label:'Pending Deposit', value: pendingChallan > 0 ? `₹${pendingAmt.toLocaleString('en-IN')}` : 'All deposited', sub: pendingChallan > 0 ? `${pendingChallan} entries without challan` : 'No pending deposits', Icon: pendingChallan > 0 ? AlertCircle : CheckCircle, color: pendingChallan > 0 ? '#dc2626' : '#16a34a', bg: pendingChallan > 0 ? '#fef2f2' : '#f0fdf4' },
              { label:'TDS Sections', value: sections.length, sub: sections.slice(0,3).join(', '), Icon:Shield, color:'#1d4ed8', bg:'#eff6ff' },
              { label:'Total Entries', value: entries.length, sub:`${entries.filter(e=>e.challan_no).length} with challan`, Icon:FileText, color:'#16a34a', bg:'#f0fdf4' },
            ].map((s,i) => (
              <div key={i} style={{ background:'var(--white)', borderRadius:12, padding:'14px 16px', border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <span style={{ fontSize:11, color:'var(--gray-500)', fontWeight:500 }}>{s.label}</span>
                  <div style={{ width:28, height:28, borderRadius:7, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <s.Icon size={13} color={s.color}/>
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--navy)', marginBottom:2 }}>{s.value}</div>
                <div style={{ fontSize:11, color:'var(--gray-400)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '11px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        {tabBtn('calculator', 'Calculator')}
        {tabBtn('entries', 'Entries')}
        {tabBtn('sections', 'TDS Rates')}
      </div>

      {/* Calculator Tab */}
      {tab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: 28, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>TDS Calculator</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 5 }}>PAYMENT AMOUNT (₹)</label>
                <input type="number" placeholder="e.g. 100000" value={calcForm.amount}
                  onChange={e => setCalcForm({ ...calcForm, amount: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 5 }}>TDS SECTION</label>
                <select value={calcForm.section} onChange={e => setCalcForm({ ...calcForm, section: e.target.value })} style={inp}>
                  {sections.map(s => <option key={s.code} value={s.code}>{s.code} — {s.description}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 5 }}>PARTY TYPE</label>
                <select value={calcForm.party_type} onChange={e => setCalcForm({ ...calcForm, party_type: e.target.value })} style={inp}>
                  <option value="company">Company</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="pan" checked={calcForm.pan_available}
                  onChange={e => setCalcForm({ ...calcForm, pan_available: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="pan" style={{ fontSize: 13, color: 'var(--navy)', cursor: 'pointer' }}>PAN Available (No PAN = 20% TDS)</label>
              </div>
              <button onClick={handleCalculate} disabled={loading} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 10, border: 'none',
                background: 'var(--navy)', color: 'var(--white)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
                opacity: loading ? 0.7 : 1,
              }}><Calculator size={16} /> {loading ? 'Calculating...' : 'Calculate TDS'}</button>
            </div>
          </div>

          {/* Result */}
          <div style={{ background: calc ? 'var(--navy)' : 'var(--white)', borderRadius: 16, padding: 28, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {!calc ? (
              <div style={{ textAlign: 'center', color: 'var(--gray-400)' }}>
                <Calculator size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div style={{ fontSize: 15 }}>Enter amount and click Calculate</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4 }}>SECTION {calc.section}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 24 }}>{calc.description}</div>
                {[
                  { label: 'Gross Amount', value: fmt(calc.gross_amount), color: 'rgba(255,255,255,0.7)' },
                  { label: `TDS @ ${calc.tds_rate}%`, value: fmt(calc.tds_amount), color: '#ef4444' },
                  { label: 'Net Payable', value: fmt(calc.net_payable), color: '#10b981' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{r.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 16, padding: 16, background: 'rgba(201,168,76,0.15)', borderRadius: 10, border: '1px solid rgba(201,168,76,0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>TDS TO DEDUCT</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: '#C9A84C' }}>{fmt(calc.tds_amount)}</div>
                </div>
                <button onClick={() => setShowForm(true)} style={{
                  marginTop: 16, padding: '12px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
                  color: 'var(--navy)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>Save as Entry + Journal</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Entries Tab */}
      {tab === 'entries' && (
        <>
          {/* TDS Return Export Panel */}
          <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #0f1f4b)', borderRadius: 14, padding: '18px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 2 }}>📋 Export TDS Return (Form 26Q)</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>TRACES-compatible format for quarterly TDS Return filing</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={exportQuarter} onChange={e => setExportQuarter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: 13, cursor: 'pointer' }}>
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q} value={q} style={{ color: '#000' }}>{q}</option>)}
              </select>
              <select value={exportYear} onChange={e => setExportYear(parseInt(e.target.value))}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: 13, cursor: 'pointer' }}>
                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y} style={{ color: '#000' }}>{y}</option>)}
              </select>
              <button onClick={() => handleExportTDS('json')} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: 'var(--navy)', fontSize: 12, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: exporting ? 0.7 : 1 }}>
                <Download size={13} /> JSON
              </button>
              <button onClick={() => handleExportTDS('csv')} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'var(--white)', fontSize: 12, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: exporting ? 0.7 : 1 }}>
                <Download size={13} /> CSV
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            {entries.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>No TDS entries yet. Use the Calculator tab to add one.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    {['Date', 'Party', 'PAN', 'Section', 'Gross Amount', 'TDS Rate', 'TDS Amount', 'Net Amount', 'Status'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--gray-600)' }}>{new Date(e.payment_date).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{e.party_name}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: e.party_pan ? 'inherit' : '#dc2626', fontWeight: e.party_pan ? 'normal' : 600 }}>{e.party_pan || '⚠ PAN Missing'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>{e.section}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{fmt(e.gross_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13 }}>{e.tds_rate}%</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(e.tds_amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#10b981' }}>{fmt(e.net_amount)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                            background: e.deposited ? '#f0fdf4' : '#fff7ed',
                            color: e.deposited ? '#16a34a' : '#ea580c'
                          }}>
                            {e.deposited ? `✓ ${e.challan_no || 'Deposited'}` : 'Pending'}
                          </span>
                          {!e.deposited && (
                            <>
                              <button onClick={() => { setDepositModal(e); setDepositForm({ challan_no: '', cin: '', deposit_date: new Date().toISOString().split('T')[0] }) }}
                                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: 'none', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Pay TDS
                              </button>
                              {calcInterest(e) > 0 && (
                                <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                                  +₹{calcInterest(e).toLocaleString('en-IN')} int.
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Deposit Modal */}
      {depositModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:28, width:'100%', maxWidth:420 }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Record TDS Deposit</div>
            <div style={{ fontSize:12, color:'var(--gray-500)', marginBottom:20 }}>
              {depositModal.party_name} · u/s {depositModal.section} · ₹{parseFloat(depositModal.tds_amount).toLocaleString('en-IN')}
              {calcInterest(depositModal) > 0 && (
                <span style={{ marginLeft:8, color:'#dc2626', fontWeight:600 }}>
                  + ₹{calcInterest(depositModal).toLocaleString('en-IN')} interest u/s 201(1A)
                </span>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
              {[
                { label:'Challan No (ITNS 281) *', key:'challan_no', placeholder:'e.g. 12345678' },
                { label:'Challan Identification No (CIN)', key:'cin', placeholder:'e.g. BKID001234567' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>{f.label.toUpperCase()}</label>
                  <input value={depositForm[f.key]} onChange={e => setDepositForm({...depositForm, [f.key]: e.target.value})}
                    placeholder={f.placeholder}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--gray-200)', fontSize:13, fontFamily:'var(--font-body)', outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>DEPOSIT DATE</label>
                <input type="date" value={depositForm.deposit_date} onChange={e => setDepositForm({...depositForm, deposit_date: e.target.value})}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--gray-200)', fontSize:13, fontFamily:'var(--font-body)', outline:'none', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDepositModal(null)} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:13, cursor:'pointer', fontFamily:'var(--font-body)' }}>Cancel</button>
              <button onClick={handleDeposit} disabled={loading} style={{ flex:2, padding:11, borderRadius:9, border:'none', background:'linear-gradient(135deg, #C9A84C, #e2c06e)', color:'var(--navy)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)', opacity: loading ? 0.7 : 1 }}>Record Deposit</button>
            </div>
          </div>
        </div>
      )}

      {/* Sections/Rates Tab */}
      {tab === 'sections' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {sections.map((s, i) => (
            <div key={i} style={{ background: 'var(--white)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ background: 'var(--navy)', color: 'var(--gold)', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }}>u/s {s.code}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{s.description}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Threshold: ₹{s.threshold.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--navy)' }}>{s.rate_company}%</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Company rate</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Entry Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--white)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>Save TDS Entry</h2>
              <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray-600)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Party Name', key: 'party_name', type: 'text', placeholder: 'e.g. TCS Ltd' },
                { label: 'PAN', key: 'party_pan', type: 'text', placeholder: 'ABCDE1234F' },
                { label: 'Payment Nature', key: 'payment_nature', type: 'text', placeholder: 'e.g. Professional Fees' },
                { label: 'Gross Amount', key: 'gross_amount', type: 'number' },
                { label: 'TDS Amount', key: 'tds_amount', type: 'number' },
                { label: 'Payment Date', key: 'payment_date', type: 'date' },
                { label: 'Challan No (optional)', key: 'challan_no', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 5 }}>{f.label.toUpperCase()}</label>
                  <input type={f.type} placeholder={f.placeholder || ''} value={entryForm[f.key]}
                    onChange={e => setEntryForm({ ...entryForm, [f.key]: e.target.value })} style={inp} />
                </div>
              ))}
            </div>
            {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginTop: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--gray-200)', background: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={handleSaveEntry} disabled={loading} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Saving...' : 'Save + Create Journal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}