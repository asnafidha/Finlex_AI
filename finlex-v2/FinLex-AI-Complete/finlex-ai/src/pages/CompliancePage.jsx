import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Clock, AlertCircle, Shield, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { compliance as complianceApi } from '../services/api'

const statusConfig = {
  overdue:   { color:'#dc2626', bg:'#fef2f2', label:'Overdue'  },
  urgent:    { color:'#ea580c', bg:'#fff7ed', label:'Urgent'   },
  upcoming:  { color:'#ca8a04', bg:'#fefce8', label:'Upcoming' },
  safe:      { color:'#16a34a', bg:'#f0fdf4', label:'On Track' },
  completed: { color:'#6b7280', bg:'#f9fafb', label:'Done'     },
  pending:   { color:'#ea580c', bg:'#fff7ed', label:'Pending'  },
}

const typeColors = {
  GST:         { bg:'#eff6ff', color:'#1d4ed8' },
  TDS:         { bg:'#f5f3ff', color:'#6d28d9' },
  ITR:         { bg:'#ecfdf5', color:'#065f46' },
  ROC:         { bg:'#fef3c7', color:'#92400e' },
  ADVANCE_TAX: { bg:'#fce7f3', color:'#9d174d' },
  MCA:         { bg:'#e0f2fe', color:'#0369a1' },
  OTHER:       { bg:'#f4f6fb', color:'#4a5578' },
}

// Penalty estimate per day late by type
const PENALTY_PER_DAY = { GST: 50, TDS: 200, ITR: 1000, ROC: 100, ADVANCE_TAX: 0 }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Toast notification component ─────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 2000,
      background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
      borderRadius: 12, padding: '14px 18px', minWidth: 300, maxWidth: 400,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      animation: 'fadeUp 0.3s ease',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {toast.type === 'success'
          ? <CheckCircle size={16} color="#16a34a" />
          : <AlertCircle size={16} color="#dc2626" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: toast.type === 'success' ? '#15803d' : '#dc2626', marginBottom: toast.detail ? 3 : 0 }}>
          {toast.title}
        </div>
        {toast.detail && (
          <div style={{ fontSize: 12, color: toast.type === 'success' ? '#166534' : '#7f1d1d' }}>{toast.detail}</div>
        )}
      </div>
      <button onClick={onDismiss} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 0, flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  )
}

export default function CompliancePage() {
  const { company }               = useAuth()
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading]     = useState(true)
  const [monthIdx, setMonthIdx]   = useState(new Date().getMonth())
  const [year, setYear]           = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState(null)
  const [filter, setFilter]       = useState('all')
  const [completing, setCompleting] = useState(null)
  const [toast, setToast]         = useState(null)

  useEffect(() => { if (company?.id) loadDeadlines() }, [company])

  const showToast = (title, detail, type = 'success') => {
    setToast({ title, detail, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadDeadlines = async () => {
    setLoading(true)
    try {
      const data = await complianceApi.list(company.id)
      setDeadlines(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleComplete = async (d) => {
    setCompleting(d.id)
    try {
      await complianceApi.complete(d.id, 'Marked complete')
      await loadDeadlines()
      // Calculate how much penalty risk was eliminated
      const daysLate  = d.days_left < 0 ? Math.abs(d.days_left) : 0
      const penalty   = Math.min(daysLate * (PENALTY_PER_DAY[d.type] || 50), 10000)
      const detail    = penalty > 0
        ? `Penalty risk reduced by ₹${penalty.toLocaleString('en-IN')}`
        : `${d.name} marked as filed`
      showToast(`${d.type} filing complete`, detail, 'success')
    } catch (err) {
      showToast('Could not mark complete', err.message, 'error')
    }
    finally { setCompleting(null) }
  }

  // Cap days display — never show "-693d overdue", show at most a sensible number
  const formatDays = (d) => {
    if (d.days_left === undefined || d.days_left === null) return ''
    const days = Math.round(d.days_left)
    if (days < 0) {
      const overdue = Math.min(Math.abs(days), 365) // cap at 1 year for display
      return `${overdue}d overdue`
    }
    return `${days}d left`
  }

  const firstDay    = new Date(year, monthIdx, 1).getDay()
  const daysInMonth = new Date(year, monthIdx+1, 0).getDate()

  const getDayDeadlines = (day) => {
    const dateStr = `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return deadlines.filter(d => d.due_date?.startsWith(dateStr))
  }

  const filteredDeadlines = filter === 'all' ? deadlines : deadlines.filter(d => d.status === filter)

  const counts = {
    overdue:   deadlines.filter(d => d.status === 'overdue').length,
    pending:   deadlines.filter(d => d.status === 'pending').length,
    completed: deadlines.filter(d => d.status === 'completed').length,
  }

  const totalPenaltyRisk = deadlines
    .filter(d => d.status === 'overdue')
    .reduce((sum, d) => {
      const days = Math.abs(Math.round(d.days_left || 0))
      return sum + Math.min(days * (PENALTY_PER_DAY[d.type] || 50), 10000)
    }, 0)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ color:'var(--gray-400)', fontSize:15 }}>Loading compliance calendar...</div>
    </div>
  )

  return (
    <div style={{ animation:'fadeUp 0.5s ease' }}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, color:'var(--navy)', marginBottom:2 }}>Compliance Calendar</h1>
        <p style={{ color:'var(--gray-600)', fontSize:14 }}>Track every deadline — GST, TDS, ITR, ROC, Advance Tax — in one place</p>
      </div>

      {/* Summary cards — icons not emoji */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:22 }}>
        {[
          { label:'Overdue filings',  count: counts.overdue,   color:'#dc2626', bg:'#fef2f2', Icon: AlertCircle,
            sub: totalPenaltyRisk > 0 ? `₹${totalPenaltyRisk.toLocaleString('en-IN')} penalty risk` : 'No penalty risk' },
          { label:'Pending filings',  count: counts.pending,   color:'#ea580c', bg:'#fff7ed', Icon: Clock,
            sub: counts.pending > 0 ? 'Action required' : 'Nothing pending' },
          { label:'Completed',        count: counts.completed, color:'#16a34a', bg:'#f0fdf4', Icon: CheckCircle,
            sub: 'Filed on time' },
        ].map((s, i) => (
          <div key={i} style={{ background:'var(--white)', borderRadius:12, padding:'16px 18px', border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <s.Icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, color:s.color }}>{s.count}</div>
              <div style={{ fontSize:12, color:'var(--gray-600)', fontWeight:500 }}>{s.label}</div>
              <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:1 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:20 }}>

        {/* Calendar */}
        <div style={{ background:'var(--white)', borderRadius:16, padding:20, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <button
              onClick={() => { if(monthIdx===0){setMonthIdx(11);setYear(y=>y-1)}else setMonthIdx(m=>m-1) }}
              style={{ border:'none', background:'var(--gray-100)', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronLeft size={14}/>
            </button>
            <span style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:700, color:'var(--navy)' }}>
              {MONTHS[monthIdx]} {year}
            </span>
            <button
              onClick={() => { if(monthIdx===11){setMonthIdx(0);setYear(y=>y+1)}else setMonthIdx(m=>m+1) }}
              style={{ border:'none', background:'var(--gray-100)', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronRight size={14}/>
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:600, color:'var(--gray-400)', padding:'3px 0' }}>{d}</div>)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day      = i+1
              const dayDL    = getDayDeadlines(day)
              const isSelected = selectedDate === day
              const hasOverdue = dayDL.some(d => d.status==='overdue')
              const hasPending = dayDL.some(d => d.status==='pending')
              const isToday    = new Date().getDate()===day && new Date().getMonth()===monthIdx && new Date().getFullYear()===year
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)}
                  style={{
                    padding:'5px 3px', borderRadius:7, textAlign:'center', cursor:'pointer',
                    background: isSelected ? 'var(--navy)' : dayDL.length > 0 ? 'var(--gray-100)' : 'transparent',
                    border: isToday ? '1.5px solid var(--navy)' : dayDL.length > 0 ? '1px solid var(--gray-200)' : '1px solid transparent',
                    transition:'all 0.15s',
                  }}>
                  <div style={{ fontSize:11, fontWeight: dayDL.length>0||isToday ? 700 : 400, color: isSelected?'var(--white)':'var(--navy)' }}>{day}</div>
                  {dayDL.length > 0 && (
                    <div style={{ display:'flex', justifyContent:'center', gap:2, marginTop:2 }}>
                      {hasOverdue && <div style={{ width:4, height:4, borderRadius:'50%', background:'#dc2626' }}/>}
                      {hasPending && !hasOverdue && <div style={{ width:4, height:4, borderRadius:'50%', background:'#ea580c' }}/>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {selectedDate && getDayDeadlines(selectedDate).length > 0 && (
            <div style={{ marginTop:14, padding:12, background:'var(--gray-100)', borderRadius:9, border:'1px solid var(--gray-200)' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--gray-500)', marginBottom:7 }}>{MONTHS[monthIdx]} {selectedDate}</div>
              {getDayDeadlines(selectedDate).map((d,i) => {
                const s = statusConfig[d.status] || statusConfig.pending
                const t = typeColors[d.type] || typeColors.OTHER
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 5px', borderRadius:3, background:t.bg, color:t.color }}>{d.type}</span>
                    <span style={{ fontSize:12, color:'var(--navy)', flex:1 }}>{d.name}</span>
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:8, background:s.bg, color:s.color }}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Deadline list */}
        <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:4, padding:10, borderBottom:'1px solid var(--gray-200)', background:'var(--gray-100)' }}>
            {['all','overdue','pending','completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding:'5px 13px', borderRadius:6, border:'none', fontSize:12, fontWeight:600,
                background: filter===f ? 'var(--navy)' : 'var(--white)',
                color: filter===f ? 'var(--white)' : 'var(--gray-600)',
                cursor:'pointer', fontFamily:'var(--font-body)', textTransform:'capitalize',
              }}>
                {f}
                {f !== 'all' && counts[f] > 0 && (
                  <span style={{ marginLeft:5, fontSize:10, background: filter===f?'rgba(255,255,255,0.2)':'var(--gray-200)', color: filter===f?'white':'var(--gray-600)', borderRadius:8, padding:'1px 5px' }}>
                    {counts[f]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ maxHeight:500, overflowY:'auto' }}>
            {filteredDeadlines.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--gray-400)', fontSize:13 }}>No deadlines found</div>
            ) : filteredDeadlines.map((d) => {
              const s           = statusConfig[d.status] || statusConfig.pending
              const t           = typeColors[d.type] || typeColors.OTHER
              const isOverdue   = d.status === 'overdue'
              const daysDisplay = formatDays(d)
              const daysLate    = d.days_left < 0 ? Math.abs(Math.round(d.days_left)) : 0
              const penalty     = isOverdue ? Math.min(daysLate * (PENALTY_PER_DAY[d.type] || 50), 10000) : 0

              return (
                <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--gray-200)', background: isOverdue ? '#fef2f200' : 'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {/* Status dot */}
                    <div style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0 }} />
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, background:t.bg, color:t.color, minWidth:32, textAlign:'center' }}>{d.type}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>{d.name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:1, display:'flex', gap:6, alignItems:'center' }}>
                        <span>Due {new Date(d.due_date).toLocaleDateString('en-IN')}</span>
                        {daysDisplay && (
                          <span style={{ color: isOverdue ? '#dc2626' : d.days_left < 7 ? '#ea580c' : 'var(--gray-400)', fontWeight: isOverdue ? 600 : 400 }}>
                            · {daysDisplay}
                          </span>
                        )}
                        {penalty > 0 && (
                          <span style={{ color:'#dc2626', fontWeight:600 }}>· ₹{penalty.toLocaleString('en-IN')} risk</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20, background:s.bg, color:s.color }}>{s.label}</span>
                    {d.status !== 'completed' && (
                      <button
                        onClick={() => handleComplete(d)}
                        disabled={completing===d.id}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 11px', borderRadius:7, border:'1px solid #16a34a', background:'#f0fdf4', color:'#16a34a', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        <CheckCircle size={11} />
                        {completing===d.id ? 'Saving...' : 'Mark Done'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}