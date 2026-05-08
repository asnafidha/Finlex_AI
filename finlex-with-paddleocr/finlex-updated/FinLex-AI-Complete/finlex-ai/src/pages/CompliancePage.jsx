import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { compliance as complianceApi } from '../services/api'

const statusConfig = {
  overdue:   { color:'#dc2626', bg:'#fef2f2', label:'Overdue',   icon:'🔴' },
  urgent:    { color:'#ea580c', bg:'#fff7ed', label:'Urgent',    icon:'🟠' },
  upcoming:  { color:'#ca8a04', bg:'#fefce8', label:'Upcoming',  icon:'🟡' },
  safe:      { color:'#16a34a', bg:'#f0fdf4', label:'On Track',  icon:'🟢' },
  completed: { color:'#6b7280', bg:'#f9fafb', label:'Completed', icon:'✅' },
  pending:   { color:'#ea580c', bg:'#fff7ed', label:'Pending',   icon:'🟠' },
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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function CompliancePage() {
  const { company }               = useAuth()
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading]     = useState(true)
  const [monthIdx, setMonthIdx]   = useState(new Date().getMonth())
  const [year, setYear]           = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState(null)
  const [filter, setFilter]       = useState('all')
  const [completing, setCompleting] = useState(null)

  useEffect(() => {
    if (company?.id) loadDeadlines()
  }, [company])

  const loadDeadlines = async () => {
    setLoading(true)
    try {
      const data = await complianceApi.list(company.id)
      setDeadlines(data)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }

  const handleComplete = async (id) => {
    setCompleting(id)
    try {
      await complianceApi.complete(id, 'Marked complete')
      await loadDeadlines()
    } catch (err) { console.error(err) }
    finally { setCompleting(null) }
  }

  const firstDay     = new Date(year, monthIdx, 1).getDay()
  const daysInMonth  = new Date(year, monthIdx+1, 0).getDate()

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

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ color:'var(--gray-400)', fontSize:15 }}>Loading compliance calendar...</div>
    </div>
  )

  return (
    <div style={{ animation:'fadeUp 0.5s ease' }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Compliance Calendar</h1>
        <p style={{ color:'var(--gray-600)', fontSize:15 }}>Track every deadline — GST, TDS, ITR, ROC, MCA — in one place</p>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Overdue',   count:counts.overdue,   color:'#dc2626', bg:'#fef2f2', icon:'🔴' },
          { label:'Pending',   count:counts.pending,   color:'#ea580c', bg:'#fff7ed', icon:'🟠' },
          { label:'Completed', count:counts.completed, color:'#16a34a', bg:'#f0fdf4', icon:'✅' },
        ].map((s, i) => (
          <div key={i} style={{ background:'var(--white)', borderRadius:12, padding:20, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{s.icon}</div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:s.color }}>{s.count}</div>
              <div style={{ fontSize:13, color:'var(--gray-600)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:20 }}>
        {/* Calendar */}
        <div style={{ background:'var(--white)', borderRadius:16, padding:20, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <button onClick={() => { if(monthIdx===0){setMonthIdx(11);setYear(y=>y-1)}else setMonthIdx(m=>m-1) }}
              style={{ border:'none', background:'var(--gray-100)', borderRadius:8, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronLeft size={16}/>
            </button>
            <span style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:700, color:'var(--navy)' }}>
              {MONTHS[monthIdx]} {year}
            </span>
            <button onClick={() => { if(monthIdx===11){setMonthIdx(0);setYear(y=>y+1)}else setMonthIdx(m=>m+1) }}
              style={{ border:'none', background:'var(--gray-100)', borderRadius:8, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronRight size={16}/>
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:6 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:600, color:'var(--gray-400)', padding:'4px 0' }}>{d}</div>)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day   = i+1
              const dayDL = getDayDeadlines(day)
              const isSelected = selectedDate === day
              const hasOverdue = dayDL.some(d => d.status==='overdue')
              const hasPending = dayDL.some(d => d.status==='pending')
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)}
                  style={{
                    padding:'6px 4px', borderRadius:8, textAlign:'center', cursor:'pointer',
                    background: isSelected ? 'var(--navy)' : dayDL.length > 0 ? 'var(--gray-100)' : 'transparent',
                    border: dayDL.length > 0 ? '1px solid var(--gray-200)' : '1px solid transparent',
                    transition:'all 0.15s',
                    position:'relative',
                  }}>
                  <div style={{ fontSize:12, fontWeight:dayDL.length>0?700:400, color: isSelected?'var(--white)':'var(--navy)' }}>{day}</div>
                  {dayDL.length > 0 && (
                    <div style={{ display:'flex', justifyContent:'center', gap:2, marginTop:2 }}>
                      {hasOverdue && <div style={{ width:5, height:5, borderRadius:'50%', background:'#dc2626' }}/>}
                      {hasPending && <div style={{ width:5, height:5, borderRadius:'50%', background:'#ea580c' }}/>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {selectedDate && getDayDeadlines(selectedDate).length > 0 && (
            <div style={{ marginTop:16, padding:12, background:'var(--gray-100)', borderRadius:10, border:'1px solid var(--gray-200)' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-600)', marginBottom:8 }}>{MONTHS[monthIdx]} {selectedDate}</div>
              {getDayDeadlines(selectedDate).map((d,i) => {
                const s = statusConfig[d.status] || statusConfig.pending
                const t = typeColors[d.type] || typeColors.OTHER
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:t.bg, color:t.color }}>{d.type}</span>
                    <span style={{ fontSize:12, color:'var(--navy)', flex:1 }}>{d.name}</span>
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color }}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Deadline list */}
        <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:4, padding:12, borderBottom:'1px solid var(--gray-200)', background:'var(--gray-100)' }}>
            {['all','overdue','pending','completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding:'6px 14px', borderRadius:7, border:'none', fontSize:12, fontWeight:600,
                background: filter===f ? 'var(--navy)' : 'var(--white)',
                color: filter===f ? 'var(--white)' : 'var(--gray-600)',
                cursor:'pointer', fontFamily:'var(--font-body)', textTransform:'capitalize',
              }}>{f}</button>
            ))}
          </div>

          <div style={{ maxHeight:480, overflowY:'auto' }}>
            {filteredDeadlines.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--gray-400)' }}>No deadlines found</div>
            ) : filteredDeadlines.map((d, i) => {
              const s = statusConfig[d.status] || statusConfig.pending
              const t = typeColors[d.type]     || typeColors.OTHER
              return (
                <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--gray-200)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:t.bg, color:t.color, minWidth:36, textAlign:'center' }}>{d.type}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>{d.name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2 }}>
                        Due: {new Date(d.due_date).toLocaleDateString('en-IN')}
                        {d.days_left !== undefined && (
                          <span style={{ marginLeft:6, color: d.days_left < 0 ? '#dc2626' : d.days_left < 7 ? '#ea580c' : 'var(--gray-400)' }}>
                            ({d.days_left < 0 ? `${Math.abs(d.days_left)}d overdue` : `${d.days_left}d left`})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20, background:s.bg, color:s.color }}>{s.label}</span>
                    {d.status !== 'completed' && (
                      <button onClick={() => handleComplete(d.id)} disabled={completing===d.id}
                        style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #16a34a', background:'#f0fdf4', color:'#16a34a', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        {completing===d.id ? '...' : 'Mark Done'}
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