import { useState, useEffect } from 'react'
import { Building2, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
         Plus, RefreshCw, ChevronRight, IndianRupee, Calendar, FileText,
         Shield, Zap, BarChart2, AlertCircle, X, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ca as caApi, companies as companiesApi } from '../services/api'

const fmt  = (n) => '₹' + parseFloat(n||0).toLocaleString('en-IN', { minimumFractionDigits: 0 })
const fmtK = (n) => {
  const v = parseFloat(n||0)
  if (v >= 1e7) return '₹' + (v/1e7).toFixed(1) + 'Cr'
  if (v >= 1e5) return '₹' + (v/1e5).toFixed(1) + 'L'
  return '₹' + v.toLocaleString('en-IN')
}

const HEALTH = {
  good:     { bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0', label:'Healthy',  dot:'#16a34a' },
  warning:  { bg:'#fffbeb', color:'#ca8a04', border:'#fde68a', label:'Warning',  dot:'#f59e0b' },
  critical: { bg:'#fef2f2', color:'#dc2626', border:'#fecaca', label:'Critical', dot:'#dc2626' },
}

const INP = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--gray-200)', fontSize:13, fontFamily:'var(--font-body)', color:'var(--navy)', background:'var(--gray-100)', outline:'none', boxSizing:'border-box' }

const INDIAN_STATES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],
  ['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],
  ['13','Nagaland'],['14','Manipur'],['15','Mizoram'],['16','Tripura'],
  ['17','Meghalaya'],['18','Assam'],['19','West Bengal'],['20','Jharkhand'],
  ['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],
  ['26','Dadra & Nagar Haveli'],['27','Maharashtra'],['28','Andhra Pradesh'],
  ['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],
  ['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman & Nicobar'],
  ['36','Telangana'],['37','Andhra Pradesh (New)'],
]

export default function MultiCompanyPage({ setPage }) {
  const { selectCompany }         = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [filter, setFilter]       = useState('all')
  const [sortBy, setSortBy]       = useState('overdue')
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr]     = useState('')
  const [form, setForm] = useState({
    name:'', gstin:'', pan:'', state_code:'', state_name:'',
    financial_year:'2024-25', fy_start_date:'2024-04-01', fy_end_date:'2025-03-31',
    business_type:'private_limited',
  })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try { setDashboard(await caApi.dashboard()) }
    catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const addCompany = async () => {
    if (!form.name || !form.pan || !form.state_code) return setFormErr('Company name, PAN and State are required')
    setSubmitting(true); setFormErr('')
    try {
      await companiesApi.create(form)
      setShowAdd(false)
      setForm({ name:'', gstin:'', pan:'', state_code:'', state_name:'', financial_year:'2024-25', fy_start_date:'2024-04-01', fy_end_date:'2025-03-31', business_type:'private_limited' })
      await load()
    } catch(e) { setFormErr(e.message) }
    finally { setSubmitting(false) }
  }

  const onStateChange = (code) => {
    const st = INDIAN_STATES.find(s => s[0] === code)
    setForm({...form, state_code: code, state_name: st?.[1] || ''})
  }

  // Open chatbot with a pre-filled question about a company
  const askAI = (co, question) => {
    selectCompany(co)
    // Dispatch event for ChatBot to pick up
    window.dispatchEvent(new CustomEvent('finlex-ask-ai', { detail: { question, company: co } }))
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>⏳</div>
      <div style={{ color:'var(--gray-600)', fontSize:15 }}>Loading CA dashboard...</div>
    </div>
  )

  const companies = dashboard?.companies || []

  // ── "Clients needing attention today" ────────────────────────
  const needsAttention = companies.filter(c =>
    parseInt(c.compliance?.overdue||0) > 0 ||
    parseInt(c.compliance?.due_this_week||0) > 0 ||
    parseFloat(c.invoices?.unpaid_amount||0) > 50000
  ).sort((a, b) => {
    const scoreA = parseInt(a.compliance?.overdue||0)*3 + parseInt(a.compliance?.due_this_week||0)*2
    const scoreB = parseInt(b.compliance?.overdue||0)*3 + parseInt(b.compliance?.due_this_week||0)*2
    return scoreB - scoreA
  }).slice(0, 5)

  const visible = companies
    .filter(c => filter==='all' || c.health===filter)
    .sort((a, b) => {
      if (sortBy==='revenue') return parseFloat(b.invoices?.total_revenue||0) - parseFloat(a.invoices?.total_revenue||0)
      if (sortBy==='score')   return b.compliance_score - a.compliance_score
      if (sortBy==='overdue') return parseInt(b.compliance?.overdue||0) - parseInt(a.compliance?.overdue||0)
      return a.name.localeCompare(b.name)
    })

  return (
    <div style={{ animation:'fadeUp 0.5s ease' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, color:'var(--navy)', marginBottom:2 }}>CA Mission Control</h1>
          <p style={{ color:'var(--gray-600)', fontSize:14 }}>All client companies — compliance, revenue and health at a glance</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:9, border:'1px solid var(--gray-200)', background:'var(--white)', color:'var(--gray-600)', fontSize:13, cursor:'pointer', fontFamily:'var(--font-body)' }}>
            <RefreshCw size={13}/> Refresh
          </button>
          <button onClick={()=>setShowAdd(true)} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#C9A84C,#e2c06e)', color:'var(--navy)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
            <Plus size={14}/> Add Company
          </button>
        </div>
      </div>

      {/* CA-level KPI bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Total Clients',    value: dashboard?.total_companies||0,    icon:Building2,     color:'#3b82f6', bg:'#eff6ff' },
          { label:'Total Revenue',    value: fmtK(dashboard?.total_revenue),   icon:TrendingUp,    color:'#16a34a', bg:'#f0fdf4', raw:true },
          { label: parseFloat(dashboard?.total_unpaid||0) > 0 ? fmtK(dashboard?.total_unpaid) + ' stuck' : 'Receivables clear',
                                      value: parseFloat(dashboard?.total_unpaid||0) > 0 ? 'Unpaid invoices' : 'All paid',
                                                                                icon:IndianRupee,   color: parseFloat(dashboard?.total_unpaid||0) > 0 ? '#dc2626' : '#16a34a', bg: parseFloat(dashboard?.total_unpaid||0) > 0 ? '#fef2f2' : '#f0fdf4', raw:true },
          { label: parseInt(dashboard?.total_overdue||0) > 0 ? `${dashboard?.total_overdue} overdue filings` : 'All filings current',
                                      value: parseInt(dashboard?.total_overdue||0) > 0 ? 'Penalty risk' : 'On track',
                                                                                icon:AlertTriangle, color: parseInt(dashboard?.total_overdue||0)>0?'#dc2626':'#16a34a', bg: parseInt(dashboard?.total_overdue||0)>0?'#fef2f2':'#f0fdf4' },
        ].map((s,i) => (
          <div key={i} style={{ background:'var(--white)', borderRadius:13, padding:'16px 18px', border:'1px solid var(--gray-200)', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <s.icon size={17} color={s.color}/>
            </div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--navy)' }}>{s.value}</div>
              <div style={{ fontSize:11, color:'var(--gray-500)', marginTop:1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CLIENTS NEEDING ATTENTION TODAY ─────────────────── */}
      {needsAttention.length > 0 && (
        <div style={{ background:'var(--white)', borderRadius:16, border:'1.5px solid #fecaca', marginBottom:22, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 18px', background:'#fef2f2', borderBottom:'1px solid #fecaca' }}>
            <AlertTriangle size={15} color="#dc2626" />
            <span style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:'#dc2626' }}>
              {needsAttention.length} client{needsAttention.length > 1 ? 's' : ''} need attention today
            </span>
          </div>
          <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
            {needsAttention.map(co => {
              const inv = co.invoices || {}
              const cmp = co.compliance || {}
              const overdueFilings = parseInt(cmp.overdue||0)
              const dueSoon        = parseInt(cmp.due_this_week||0)
              const unpaidAmt      = parseFloat(inv.unpaid_amount||0)
              const issues = []
              if (overdueFilings > 0) issues.push(`${overdueFilings} filing${overdueFilings>1?'s':''} overdue`)
              if (dueSoon > 0)        issues.push(`${dueSoon} due this week`)
              if (unpaidAmt > 50000)  issues.push(`${fmtK(unpaidAmt)} unpaid`)

              return (
                <div key={co.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, background: overdueFilings > 0 ? '#fef2f2' : '#fffbeb', border:`1px solid ${overdueFilings > 0 ? '#fecaca' : '#fde68a'}` }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
                    {co.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--navy)' }}>{co.name}</div>
                    <div style={{ fontSize:11, color: overdueFilings > 0 ? '#dc2626' : '#ca8a04', fontWeight:500 }}>
                      {issues.join(' · ')}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7, flexShrink:0 }}>
                    <button
                      onClick={() => { selectCompany(co); setPage && setPage('compliance') }}
                      style={{ padding:'6px 12px', borderRadius:7, border:'none', background: overdueFilings > 0 ? '#dc2626' : '#ca8a04', color:'white', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}
                    >
                      {overdueFilings > 0 ? 'File Now →' : 'Prepare →'}
                    </button>
                    <button
                      onClick={() => askAI(co, `Give me a quick summary of ${co.name}'s compliance and financial status. What needs urgent attention?`)}
                      title="Ask AI about this client"
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--gray-200)', background:'var(--white)', color:'var(--navy)', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
                    >
                      <MessageCircle size={12}/> Ask AI
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter + Sort */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--gray-500)', fontWeight:600 }}>Filter:</span>
        {[['all','All','var(--navy)','rgba(15,23,42,0.08)'], ['good','Healthy','#16a34a','#f0fdf4'], ['warning','Warning','#ca8a04','#fffbeb'], ['critical','Critical','#dc2626','#fef2f2']].map(([v,l,color,bg]) => (
          <button key={v} onClick={()=>setFilter(v)} style={{ padding:'5px 14px', borderRadius:20, border:`1.5px solid ${filter===v?color:'var(--gray-200)'}`, background:filter===v?bg:'var(--white)', color:filter===v?color:'var(--gray-500)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)', transition:'all 0.15s' }}>
            {v!=='all' && <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:color, marginRight:5 }}/>}{l}
            {v!=='all' && (
              <span style={{ marginLeft:5, background:filter===v?color:'var(--gray-200)', color:filter===v?'white':'var(--gray-500)', borderRadius:10, padding:'1px 6px', fontSize:10 }}>
                {companies.filter(c=>c.health===v).length}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'var(--gray-500)', fontWeight:600 }}>Sort:</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--gray-200)', fontSize:12, fontFamily:'var(--font-body)', color:'var(--navy)', background:'var(--white)', cursor:'pointer' }}>
            <option value="overdue">Most Overdue</option>
            <option value="revenue">Revenue ↓</option>
            <option value="score">Compliance Score ↓</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {/* Company cards */}
      {visible.length === 0 ? (
        <div style={{ background:'var(--white)', borderRadius:18, padding:60, textAlign:'center', border:'1px solid var(--gray-200)' }}>
          <Building2 size={48} color="var(--gray-300)" style={{ marginBottom:16 }}/>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--navy)', marginBottom:8 }}>
            {companies.length === 0 ? 'No companies yet' : 'No companies match this filter'}
          </div>
          <div style={{ fontSize:14, color:'var(--gray-400)', marginBottom:20 }}>
            {companies.length === 0 ? 'Add your first client company to get started' : 'Try changing the filter above'}
          </div>
          {companies.length === 0 && (
            <button onClick={()=>setShowAdd(true)} style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'var(--navy)', color:'var(--white)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
              Add Company
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
          {visible.map(co => {
            const h   = HEALTH[co.health] || HEALTH.good
            const inv = co.invoices || {}
            const cmp = co.compliance || {}
            const isOpen  = selected === co.id
            const profit  = parseFloat(co.net_profit||0)
            const unpaidA = parseFloat(inv.unpaid_amount||0)
            const overdueC = parseInt(cmp.overdue||0)

            return (
              <div key={co.id}
                style={{ background:'var(--white)', borderRadius:16, border: isOpen ? `2px solid var(--navy)` : '1px solid var(--gray-200)', overflow:'hidden', transition:'all 0.2s', cursor:'pointer' }}
                onClick={() => setSelected(isOpen ? null : co.id)}>

                <div style={{ height:4, background:`linear-gradient(90deg, ${h.dot}, ${h.dot}88)` }}/>

                <div style={{ padding:'18px 20px' }}>
                  {/* Company header */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:42, height:42, borderRadius:11, background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontSize:17, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
                        {co.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--navy)', lineHeight:1.2 }}>{co.name}</div>
                        <div style={{ fontSize:11, color:'var(--gray-400)', fontFamily:'monospace', marginTop:1 }}>{co.gstin || co.pan || '—'}</div>
                        <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:1 }}>{co.state_name} · {co.business_type?.replace(/_/g,' ')}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:h.bg, color:h.color, border:`1px solid ${h.border}` }}>{h.label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', border:`2.5px solid ${co.compliance_score>=80?'#16a34a':co.compliance_score>=50?'#f59e0b':'#dc2626'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <span style={{ fontSize:8, fontWeight:700, color:'var(--navy)' }}>{co.compliance_score}</span>
                        </div>
                        <span style={{ fontSize:10, color:'var(--gray-400)' }}>score</span>
                      </div>
                    </div>
                  </div>

                  {/* KPI row — money-impact language */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7, marginBottom:12 }}>
                    {[
                      { label:'Revenue',   value: fmtK(inv.total_revenue||0),    color:'var(--navy)' },
                      { label:'P/L',        value: (profit>=0?'+':'')+fmtK(profit), color:profit>=0?'#16a34a':'#dc2626' },
                      { label: overdueC > 0 ? `${overdueC} overdue` : 'Compliant',
                                            value: overdueC > 0 ? 'Overdue' : 'Clear', color: overdueC > 0 ? '#dc2626' : '#16a34a' },
                      { label: unpaidA > 0 ? fmtK(unpaidA)+' stuck' : 'Paid up',
                                            value: unpaidA > 0 ? `${inv.unpaid_invoices||0} inv` : 'Clear',
                                            color: unpaidA > 0 ? '#f59e0b' : '#16a34a' },
                    ].map(k => (
                      <div key={k.label} style={{ background:'var(--gray-100)', borderRadius:7, padding:'7px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:k.color }}>{k.value}</div>
                        <div style={{ fontSize:9, color:'var(--gray-500)', marginTop:1 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Next deadline */}
                  {co.next_deadline && (
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 11px', background: parseInt(co.next_deadline.days_left)<7?'#fef2f2':'#eff6ff', borderRadius:7, marginBottom:10 }}>
                      <Calendar size={11} color={parseInt(co.next_deadline.days_left)<7?'#dc2626':'#1d4ed8'}/>
                      <span style={{ fontSize:11, color:parseInt(co.next_deadline.days_left)<7?'#dc2626':'#1d4ed8', fontWeight:500 }}>
                        Next: <strong>{co.next_deadline.name}</strong> — {parseInt(co.next_deadline.days_left)<=0 ? 'OVERDUE' : `${parseInt(co.next_deadline.days_left)}d left`}
                      </span>
                    </div>
                  )}

                  <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
                    <span style={{ fontSize:11, color:'var(--gray-400)', display:'flex', alignItems:'center', gap:3 }}>
                      {isOpen ? 'Hide actions' : 'Actions'} <ChevronRight size={11} style={{ transform: isOpen?'rotate(90deg)':'none', transition:'transform 0.2s' }}/>
                    </span>
                  </div>
                </div>

                {/* Expanded actions with AI explain buttons */}
                {isOpen && (
                  <div style={{ padding:'14px 18px', borderTop:'1px solid var(--gray-200)', background:'var(--gray-100)' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                      <button onClick={() => { selectCompany(co); setPage && setPage('dashboard') }} style={{ flex:'1 1 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'9px 12px', borderRadius:7, border:'none', background:'var(--navy)', color:'var(--white)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        <Zap size={12}/> Switch to Company
                      </button>
                      <button onClick={() => { selectCompany(co); setPage && setPage('compliance') }} style={{ flex:'1 1 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'9px 12px', borderRadius:7, border:'1px solid var(--gray-200)', background:'var(--white)', color:'var(--gray-600)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        <Calendar size={12}/> Compliance
                      </button>
                      <button onClick={() => { selectCompany(co); setPage && setPage('gst') }} style={{ flex:'1 1 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'9px 12px', borderRadius:7, border:'1px solid var(--gray-200)', background:'var(--white)', color:'var(--gray-600)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        <BarChart2 size={12}/> GST
                      </button>
                    </div>
                    {/* Explain This buttons — pre-fill chatbot */}
                    <div style={{ borderTop:'1px solid var(--gray-200)', paddingTop:10 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--gray-400)', marginBottom:7, letterSpacing:'0.4px' }}>ASK AI ABOUT THIS CLIENT</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {[
                          { label:'Why profit low?', q: `Why is ${co.name}'s net profit low? Analyse revenue vs expenses.` },
                          { label:'Compliance risk?', q: `What are the compliance risks for ${co.name} right now?` },
                          { label:'GST summary', q: `Give me a GST summary for ${co.name} — output tax, ITC and net payable.` },
                          { label:'Action plan', q: `What are the top 3 actions I should take for ${co.name} today?` },
                        ].map(({ label, q }) => (
                          <button key={label}
                            onClick={() => askAI(co, q)}
                            style={{ padding:'5px 10px', borderRadius:20, border:'1px solid var(--gray-200)', background:'var(--white)', color:'var(--navy)', fontSize:11, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-body)', display:'flex', alignItems:'center', gap:4 }}
                          >
                            <MessageCircle size={10}/> {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Company Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={()=>setShowAdd(false)}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:30, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)' }}>Add New Company</h2>
              <button onClick={()=>setShowAdd(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={20}/></button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              {[
                { label:'Company Name *', key:'name', full:true },
                { label:'PAN *', key:'pan', placeholder:'AABCU9603R', upper:true },
                { label:'GSTIN', key:'gstin', placeholder:'27AABCU9603R1ZX', upper:true },
                { label:'Financial Year', key:'financial_year', placeholder:'2024-25' },
                { label:'FY Start Date', key:'fy_start_date', type:'date' },
                { label:'FY End Date',   key:'fy_end_date',   type:'date' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? 'span 2' : 'span 1' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{f.label}</label>
                  <input type={f.type||'text'} placeholder={f.placeholder||''} value={form[f.key]}
                    onChange={e => setForm({...form, [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value})}
                    style={INP}/>
                </div>
              ))}

              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>State *</label>
                <select value={form.state_code} onChange={e=>onStateChange(e.target.value)} style={INP}>
                  <option value="">— Select State —</option>
                  {INDIAN_STATES.map(([code,name]) => <option key={code} value={code}>{code} — {name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Business Type</label>
                <select value={form.business_type} onChange={e=>setForm({...form,business_type:e.target.value})} style={INP}>
                  {[['private_limited','Private Limited'],['proprietorship','Proprietorship'],['partnership','Partnership'],['llp','LLP'],['public_limited','Public Limited'],['trust','Trust / NGO']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            <div style={{ padding:'9px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, marginBottom:14, fontSize:12, color:'#1d4ed8', display:'flex', gap:7, alignItems:'center' }}>
              <Shield size={12}/> Chart of Accounts (30+ accounts) + compliance calendar auto-created. Deadlines are always current — no 600-day-overdue issues.
            </div>

            {formErr && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'9px 12px', borderRadius:8, marginBottom:12, fontSize:12, display:'flex', gap:7, alignItems:'center' }}><AlertCircle size={12}/>{formErr}</div>}

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:13, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={addCompany} disabled={submitting} style={{ flex:2, padding:11, borderRadius:9, border:'none', background:'linear-gradient(135deg,#C9A84C,#e2c06e)', color:'var(--navy)', fontSize:13, fontWeight:700, cursor:submitting?'not-allowed':'pointer', fontFamily:'var(--font-body)', opacity:submitting?0.7:1 }}>
                {submitting ? 'Creating...' : '⚡ Add Company + Chart of Accounts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
