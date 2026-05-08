import { useState, useEffect } from 'react'
import { BookOpen, Plus, X, ChevronDown, ChevronUp, RefreshCw, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { journals, accounts } from '../services/api'

const fmt  = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

const REF_COLORS = {
  invoice:  { bg:'#eff6ff', color:'#1d4ed8', label:'Invoice' },
  tds:      { bg:'#fef3c7', color:'#92400e', label:'TDS' },
  payment:  { bg:'#ecfdf5', color:'#065f46', label:'Payment' },
  reversal: { bg:'#fef2f2', color:'#991b1b', label:'Reversal' },
  manual:   { bg:'#f5f3ff', color:'#5b21b6', label:'Manual' },
  bank:     { bg:'#f0fdf4', color:'#166534', label:'Bank' },
}

const BLANK_LINE = { account_id:'', debit_amount:'', credit_amount:'', narration:'' }

export default function JournalPage() {
  const { company } = useAuth()

  const [list, setList]           = useState([])
  const [acctList, setAcctList]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [expanded, setExpanded]   = useState(null)   // journal entry id
  const [expandedLines, setExpandedLines] = useState({}) // id → lines
  const [showForm, setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    narration:  '',
  })
  const [lines, setLines] = useState([
    { ...BLANK_LINE },
    { ...BLANK_LINE },
  ])

  useEffect(() => { if (company?.id) { load(); loadAccounts() } }, [company])

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await journals.list(company.id)
      setList(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadAccounts = async () => {
    try {
      const data = await accounts.list(company.id)
      setAcctList(data)
    } catch {}
  }

  const toggleExpand = async (je) => {
    if (expanded === je.id) { setExpanded(null); return }
    setExpanded(je.id)
    if (!expandedLines[je.id]) {
      try {
        const data = await journals.get(je.id)
        setExpandedLines(prev => ({ ...prev, [je.id]: data.lines || [] }))
      } catch {}
    }
  }

  // ── Line helpers ─────────────────────────────────────────────
  const updateLine = (i, field, val) => {
    const copy = [...lines]
    copy[i] = { ...copy[i], [field]: val }
    setLines(copy)
  }
  const addLine    = () => setLines([...lines, { ...BLANK_LINE }])
  const removeLine = (i) => lines.length > 2 && setLines(lines.filter((_,idx)=>idx!==i))

  const totalDebit  = lines.reduce((s,l) => s + (parseFloat(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s,l) => s + (parseFloat(l.credit_amount) || 0), 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const handleSubmit = async () => {
    if (!form.narration.trim()) { setError('Narration is required'); return }
    if (!isBalanced) { setError(`Debits (${fmt(totalDebit)}) ≠ Credits (${fmt(totalCredit)}). Journal must balance.`); return }
    const filledLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount)||0) + (parseFloat(l.credit_amount)||0) > 0)
    if (filledLines.length < 2) { setError('Minimum 2 lines required'); return }

    setSubmitting(true); setError('')
    try {
      await journals.create({
        company_id: company.id,
        entry_date:  form.entry_date,
        narration:   form.narration,
        lines: filledLines.map(l => ({
          account_id:    parseInt(l.account_id),
          debit_amount:  parseFloat(l.debit_amount)  || 0,
          credit_amount: parseFloat(l.credit_amount) || 0,
          narration:     l.narration || null,
        }))
      })
      setSuccess('Journal entry posted to books ✅')
      setShowForm(false)
      setForm({ entry_date: new Date().toISOString().split('T')[0], narration:'' })
      setLines([{ ...BLANK_LINE }, { ...BLANK_LINE }])
      load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  const resetForm = () => {
    setShowForm(false)
    setError('')
    setForm({ entry_date: new Date().toISOString().split('T')[0], narration:'' })
    setLines([{ ...BLANK_LINE }, { ...BLANK_LINE }])
  }

  // ── Quick-fill templates ──────────────────────────────────────
  const TEMPLATES = [
    {
      label: 'TDS Receivable',
      desc:  'Client deducted TDS on payment to you',
      lines: [
        { account_code:'1007', debit_amount:'', credit_amount:'', narration:'TDS deducted by client' },
        { account_code:'1003', debit_amount:'', credit_amount:'', narration:'Reduce accounts receivable' },
      ]
    },
    {
      label: 'Advance Tax Paid',
      desc:  'Paid advance tax to government',
      lines: [
        { account_code:'1008', debit_amount:'', credit_amount:'', narration:'Advance tax payment' },
        { account_code:'1002', debit_amount:'', credit_amount:'', narration:'Bank payment' },
      ]
    },
    {
      label: 'Self Assessment Tax',
      desc:  'Paid self assessment tax',
      lines: [
        { account_code:'1009', debit_amount:'', credit_amount:'', narration:'Self assessment tax paid' },
        { account_code:'1002', debit_amount:'', credit_amount:'', narration:'Bank payment' },
      ]
    },
    {
      label: 'TDS Paid to Govt',
      desc:  'Deposited collected TDS to government',
      lines: [
        { account_code:'2005', debit_amount:'', credit_amount:'', narration:'TDS payable settled' },
        { account_code:'1002', debit_amount:'', credit_amount:'', narration:'Bank payment' },
      ]
    },
  ]

  const applyTemplate = (tpl) => {
    const mapped = tpl.lines.map(tl => {
      const acc = acctList.find(a => a.code === tl.account_code)
      return { account_id: acc?.id?.toString() || '', debit_amount: tl.debit_amount, credit_amount: tl.credit_amount, narration: tl.narration }
    })
    setLines(mapped)
    setForm(f => ({ ...f, narration: tpl.desc }))
  }

  const inputStyle = {
    width:'100%', padding:'8px 10px', borderRadius:7,
    border:'1px solid var(--gray-200)', fontSize:13,
    fontFamily:'var(--font-body)', background:'var(--white)',
    color:'var(--navy)', outline:'none',
  }

  return (
    <div style={{ animation:'fadeUp 0.5s ease' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>
            Journal Entries
          </h1>
          <p style={{ color:'var(--gray-600)', fontSize:15 }}>
            All accounting entries — auto-posted and manual
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'1.5px solid var(--gray-200)', background:'var(--white)', color:'var(--gray-600)', fontSize:13, cursor:'pointer', fontFamily:'var(--font-body)' }}>
            <RefreshCw size={14}/> Refresh
          </button>
          <button onClick={() => { setShowForm(true); setError('') }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#C9A84C,#e2c06e)', color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
            <Plus size={16}/> New Entry
          </button>
        </div>
      </div>

      {success && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'#ecfdf5', color:'#065f46', padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13, fontWeight:600, border:'1px solid #bbf7d0' }}>
          <CheckCircle size={16}/> {success}
        </div>
      )}
      {error && !showForm && (
        <div style={{ background:'#fef2f2', color:'#dc2626', padding:'12px 16px', borderRadius:8, marginBottom:16, fontSize:13 }}>{error}</div>
      )}

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Entries',   value: list.length,                                                          color:'var(--navy)' },
          { label:'Auto-Posted',     value: list.filter(j=>j.reference_type!=='manual').length,                   color:'#3b82f6' },
          { label:'Manual Entries',  value: list.filter(j=>j.reference_type==='manual').length,                   color:'#7c3aed' },
        ].map((s,i) => (
          <div key={i} style={{ background:'var(--white)', borderRadius:14, padding:'18px 22px', border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)' }}>
            <div style={{ fontSize:12, color:'var(--gray-500)', fontWeight:600, marginBottom:6 }}>{s.label}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Journal list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--gray-400)' }}>Loading entries...</div>
      ) : (
        <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
          {list.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'var(--gray-400)' }}>
              <BookOpen size={40} style={{ marginBottom:12, opacity:0.3 }}/>
              <div>No journal entries yet. They are auto-created when you create invoices, record TDS, etc.</div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--gray-100)', borderBottom:'1px solid var(--gray-200)' }}>
                  {['Entry No','Date','Narration','Type','Amount',''].map((h,i) => (
                    <th key={i} style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', textAlign: i>=4?'right':'left', letterSpacing:'0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((je, idx) => {
                  const ref   = REF_COLORS[je.reference_type] || REF_COLORS.manual
                  const isExp = expanded === je.id
                  return (
                    <>
                      <tr key={je.id}
                        onClick={() => toggleExpand(je)}
                        style={{ borderBottom:'1px solid var(--gray-100)', cursor:'pointer', background: isExp ? '#f8faff' : idx%2===0 ? 'var(--white)' : 'var(--gray-50)',
                          transition:'background 0.1s' }}
                        onMouseEnter={e => !isExp && (e.currentTarget.style.background='var(--gray-100)')}
                        onMouseLeave={e => !isExp && (e.currentTarget.style.background= idx%2===0?'var(--white)':'var(--gray-50)')}
                      >
                        <td style={{ padding:'13px 16px', fontSize:13, fontWeight:700, color:'var(--navy)', fontFamily:'var(--font-mono)' }}>{je.entry_number}</td>
                        <td style={{ padding:'13px 16px', fontSize:13, color:'var(--gray-600)' }}>{fmtD(je.entry_date)}</td>
                        <td style={{ padding:'13px 16px', fontSize:13, color:'var(--navy)', maxWidth:280 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{je.narration}</div>
                        </td>
                        <td style={{ padding:'13px 16px' }}>
                          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:ref.bg, color:ref.color }}>{ref.label}</span>
                        </td>
                        <td style={{ padding:'13px 16px', fontSize:13, fontWeight:600, color:'var(--navy)', textAlign:'right' }}>{fmt(je.total_debit)}</td>
                        <td style={{ padding:'13px 16px', textAlign:'right' }}>
                          {isExp ? <ChevronUp size={16} color='var(--gray-400)'/> : <ChevronDown size={16} color='var(--gray-400)'/>}
                        </td>
                      </tr>

                      {/* Expanded lines */}
                      {isExp && (
                        <tr key={`${je.id}-exp`}>
                          <td colSpan={6} style={{ padding:'0 16px 16px 40px', background:'#f8faff', borderBottom:'1px solid var(--gray-200)' }}>
                            {expandedLines[je.id] ? (
                              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:8 }}>
                                <thead>
                                  <tr>
                                    {['Account','Narration','Debit','Credit'].map((h,i)=>(
                                      <th key={i} style={{ padding:'6px 12px', fontSize:11, fontWeight:700, color:'var(--gray-500)', textAlign:i>=2?'right':'left', background:'rgba(255,255,255,0.6)', borderRadius:i===0?'6px 0 0 6px':i===3?'0 6px 6px 0':0 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedLines[je.id].map((line,li) => (
                                    <tr key={li} style={{ borderTop:'1px solid var(--gray-100)' }}>
                                      <td style={{ padding:'8px 12px', fontSize:13 }}>
                                        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--gray-400)', marginRight:6 }}>{line.account_code}</span>
                                        <span style={{ fontWeight:600, color:'var(--navy)' }}>{line.account_name}</span>
                                      </td>
                                      <td style={{ padding:'8px 12px', fontSize:12, color:'var(--gray-500)' }}>{line.narration||'—'}</td>
                                      <td style={{ padding:'8px 12px', fontSize:13, fontWeight:600, color:'#16a34a', textAlign:'right' }}>
                                        {parseFloat(line.debit_amount)>0 ? fmt(line.debit_amount) : '—'}
                                      </td>
                                      <td style={{ padding:'8px 12px', fontSize:13, fontWeight:600, color:'#dc2626', textAlign:'right' }}>
                                        {parseFloat(line.credit_amount)>0 ? fmt(line.credit_amount) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ padding:'12px 0', color:'var(--gray-400)', fontSize:13 }}>Loading lines...</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* New Entry Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target===e.currentTarget && resetForm()}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:32, width:'100%', maxWidth:760, maxHeight:'92vh', overflowY:'auto' }}>

            {/* Modal header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, color:'var(--navy)' }}>New Journal Entry</h2>
              <button onClick={resetForm} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={22}/></button>
            </div>

            {/* Quick templates */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-500)', letterSpacing:'0.5px', marginBottom:8 }}>QUICK TEMPLATES</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {TEMPLATES.map((tpl,i) => (
                  <button key={i} onClick={() => applyTemplate(tpl)} style={{
                    padding:'6px 14px', borderRadius:20, border:'1.5px solid var(--gray-200)',
                    background:'var(--gray-100)', color:'var(--navy)', fontSize:12, fontWeight:600,
                    cursor:'pointer', fontFamily:'var(--font-body)',
                  }} title={tpl.desc}>
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Narration */}
            <div style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:14, marginBottom:20 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>DATE</label>
                <input type='date' value={form.entry_date} onChange={e=>setForm({...form,entry_date:e.target.value})} style={inputStyle}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>NARRATION</label>
                <input type='text' placeholder='e.g. TDS deducted by Infosys on consulting fees' value={form.narration}
                  onChange={e=>setForm({...form,narration:e.target.value})} style={inputStyle}/>
              </div>
            </div>

            {/* Lines */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <label style={{ fontSize:13, fontWeight:700, color:'var(--navy)' }}>Entry Lines</label>
                <button onClick={addLine} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:'1px solid var(--gold)', color:'var(--gold)', background:'rgba(201,168,76,0.08)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <Plus size={12}/> Add Line
                </button>
              </div>

              {/* Column headers */}
              <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1.5fr 1fr 1fr 28px', gap:8, marginBottom:6, padding:'0 4px' }}>
                {['Account','Narration (optional)','Debit (Dr)','Credit (Cr)',''].map((h,i)=>(
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:'var(--gray-500)', letterSpacing:'0.5px' }}>{h}</div>
                ))}
              </div>

              {lines.map((line,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'2.5fr 1.5fr 1fr 1fr 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                  <select value={line.account_id} onChange={e=>updateLine(i,'account_id',e.target.value)} style={{ ...inputStyle, color: line.account_id ? 'var(--navy)' : 'var(--gray-400)' }}>
                    <option value=''>— Select account —</option>
                    {acctList.map(a=>(
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <input type='text' placeholder='Line narration' value={line.narration} onChange={e=>updateLine(i,'narration',e.target.value)} style={inputStyle}/>
                  <input type='number' placeholder='0.00' value={line.debit_amount} onChange={e=>updateLine(i,'debit_amount',e.target.value)}
                    style={{ ...inputStyle, color:'#16a34a', fontWeight:600 }}/>
                  <input type='number' placeholder='0.00' value={line.credit_amount} onChange={e=>updateLine(i,'credit_amount',e.target.value)}
                    style={{ ...inputStyle, color:'#dc2626', fontWeight:600 }}/>
                  <button onClick={()=>removeLine(i)} style={{ border:'none', background:'none', cursor: lines.length>2?'pointer':'not-allowed', color: lines.length>2?'#dc2626':'var(--gray-300)', padding:4 }}>
                    <X size={14}/>
                  </button>
                </div>
              ))}

              {/* Totals row */}
              <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1.5fr 1fr 1fr 28px', gap:8, marginTop:4, padding:'10px 0', borderTop:'2px solid var(--gray-200)' }}>
                <div style={{ gridColumn:'1/3', fontSize:13, fontWeight:700, color:'var(--navy)', display:'flex', alignItems:'center', gap:10 }}>
                  TOTALS
                  {isBalanced
                    ? <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>✅ Balanced</span>
                    : totalDebit>0||totalCredit>0
                      ? <span style={{ fontSize:11, color:'#dc2626', fontWeight:600 }}>⚠️ Difference: {fmt(Math.abs(totalDebit-totalCredit))}</span>
                      : null
                  }
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:'#16a34a', textAlign:'right' }}>{fmt(totalDebit)}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#dc2626', textAlign:'right' }}>{fmt(totalCredit)}</div>
                <div/>
              </div>
            </div>

            {error && (
              <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>
            )}

            <div style={{ display:'flex', gap:12 }}>
              <button onClick={resetForm} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:14, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting || !isBalanced} style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:12, borderRadius:10, border:'none', background: isBalanced ? 'linear-gradient(135deg,#C9A84C,#e2c06e)' : 'var(--gray-200)', color: isBalanced ? 'var(--navy)' : 'var(--gray-400)', fontSize:14, fontWeight:700, cursor: isBalanced&&!submitting?'pointer':'not-allowed', fontFamily:'var(--font-body)' }}>
                <BookOpen size={16}/> {submitting ? 'Posting...' : 'Post to Books'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}