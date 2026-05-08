import { useState, useEffect } from 'react'
import { Users, Plus, X, CheckCircle, AlertCircle, RefreshCw, Calculator } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const req = async (endpoint, options = {}) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...options.headers }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmt2 = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const NOW = new Date()
const EMPTY = {
  employee_name: '', employee_pan: '',
  month: NOW.getMonth() + 1, year: NOW.getFullYear(),
  gross_salary: '', basic: '', hra: '', allowances: '',
  pf_employee: '', pf_employer: '',
  esic_employee: '', esic_employer: '',
  tds_amount: '0', other_deductions: '0',
  payment_date: NOW.toISOString().split('T')[0],
  payment_mode: 'bank',
}

export default function PayrollPage() {
  const { company }           = useAuth()
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState({ total_gross:0, total_net:0, total_tds:0, total_pf:0, count:0 })
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [calc, setCalc]       = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState(null)
  const [filterMonth, setFilterMonth] = useState(NOW.getMonth() + 1)
  const [filterYear, setFilterYear]   = useState(NOW.getFullYear())

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const data = await req(`/payroll?company_id=${company.id}&month=${filterMonth}&year=${filterYear}`)
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setSummary(data.summary || { total_gross:0, total_net:0, total_tds:0, total_pf:0, count:0 })
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company, filterMonth, filterYear])

  const autoCalc = async () => {
    if (!form.gross_salary) return showToast('Enter gross salary first', 'error')
    setCalcLoading(true)
    try {
      const data = await req('/payroll/calculate', {
        method: 'POST',
        body: JSON.stringify({ gross_salary: parseFloat(form.gross_salary), basic: parseFloat(form.basic || 0) || undefined })
      })
      setCalc(data)
      // Auto-fill computed values
      setForm(f => ({
        ...f,
        basic:        data.pf.wage_ceiling < parseFloat(f.basic || 0) ? String(data.pf.wage_ceiling) : (f.basic || String(Math.round(parseFloat(f.gross_salary)*0.5))),
        pf_employee:  String(data.pf.employee),
        pf_employer:  String(data.pf.employer),
        esic_employee: String(data.esic.employee),
        esic_employer: String(data.esic.employer),
      }))
    } catch (e) { showToast(e.message, 'error') }
    finally { setCalcLoading(false) }
  }

  const netSalary = () => {
    const gross = parseFloat(form.gross_salary || 0)
    const deds  = parseFloat(form.pf_employee || 0)
                + parseFloat(form.esic_employee || 0)
                + parseFloat(form.tds_amount || 0)
                + parseFloat(form.other_deductions || 0)
    return Math.max(0, gross - deds)
  }

  const submit = async () => {
    if (!form.employee_name || !form.gross_salary)
      return showToast('Employee name and gross salary are required', 'error')
    setSaving(true)
    try {
      const payload = {
        ...form,
        company_id: company.id,
        gross_salary:     parseFloat(form.gross_salary),
        basic:            parseFloat(form.basic || 0),
        hra:              parseFloat(form.hra || 0),
        allowances:       parseFloat(form.allowances || 0),
        pf_employee:      parseFloat(form.pf_employee || 0),
        pf_employer:      parseFloat(form.pf_employer || 0),
        esic_employee:    parseFloat(form.esic_employee || 0),
        esic_employer:    parseFloat(form.esic_employer || 0),
        tds_amount:       parseFloat(form.tds_amount || 0),
        other_deductions: parseFloat(form.other_deductions || 0),
        month:            parseInt(form.month),
        year:             parseInt(form.year),
      }
      await req('/payroll', { method: 'POST', body: JSON.stringify(payload) })
      showToast('Salary entry posted with journal entry')
      setShowForm(false); setForm(EMPTY); setCalc(null); load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const S = styles
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, background: toast.type==='error'?'#fef2f2':'#f0fdf4', border:`1px solid ${toast.type==='error'?'#fca5a5':'#86efac'}`, borderRadius:12, padding:'12px 18px', fontSize:13, color: toast.type==='error'?'#dc2626':'#16a34a', display:'flex', alignItems:'center', gap:8, boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
          {toast.type==='error' ? <AlertCircle size={14}/> : <CheckCircle size={14}/>} {toast.msg}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Payroll</h1>
          <p style={{ color:'var(--gray-600)', fontSize:15 }}>PF ceiling ₹15,000 · ESIC threshold ₹21,000 · Sec 192 TDS</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <select value={filterMonth} onChange={e => setFilterMonth(+e.target.value)} style={{ ...S.input, width:100 }}>
            {months.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(+e.target.value)} style={{ ...S.input, width:90 }}>
            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} style={S.ghostBtn}><RefreshCw size={14}/></button>
          <button onClick={() => { setForm({...EMPTY, month:filterMonth, year:filterYear}); setCalc(null); setShowForm(true) }} style={S.primaryBtn}><Plus size={15}/> Add Salary</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Gross',   value:fmt(summary.total_gross),  bg:'#ecfdf5', color:'#065f46' },
          { label:'PF (Emp+Er)',   value:fmt(summary.total_pf),     bg:'#fef3c7', color:'#92400e' },
          { label:'TDS Deducted',  value:fmt(summary.total_tds),    bg:'#dbeafe', color:'#1e40af' },
          { label:'Employees',     value:summary.count,             bg:'#f3e8ff', color:'#6b21a5' },
        ].map(c => (
          <div key={c.label} style={{ background:c.bg, padding:16, borderRadius:12 }}>
            <div style={{ fontSize:11, color:c.color, fontWeight:600, marginBottom:4, textTransform:'uppercase' }}>{c.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ ...S.card, textAlign:'center', padding:40, color:'var(--gray-400)' }}>Loading...</div>
      ) : entries.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60 }}>
          <Users size={40} color="var(--gray-300)" style={{ marginBottom:12 }}/>
          <p style={{ color:'var(--gray-400)', fontSize:14 }}>No entries for {months[filterMonth-1]} {filterYear}.</p>
        </div>
      ) : (
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1.5px solid var(--gray-100)' }}>
                {['Employee','Month','Gross','Basic','PF Emp','PF Er','ESIC','TDS','Net Salary'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:h==='Employee'||h==='Month'?'left':'right', color:'var(--gray-400)', fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e,i) => (
                <tr key={e.id||i} style={{ borderBottom:'1px solid var(--gray-50)' }}>
                  <td style={{ padding:'11px 12px', fontWeight:500, color:'var(--navy)' }}>{e.employee_name}</td>
                  <td style={{ padding:'11px 12px', color:'var(--gray-500)' }}>{months[e.month-1]} {e.year}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right' }}>{fmt(e.gross_salary)}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', color:'var(--gray-500)' }}>{fmt(e.basic)}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', color:'#d97706' }}>{fmt(e.pf_employee)}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', color:'#d97706' }}>{fmt(e.pf_employer)}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', color:'#7c3aed' }}>{fmt((+e.esic_employee||0)+(+e.esic_employer||0))}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', color:'#dc2626' }}>{fmt(e.tds_amount)}</td>
                  <td style={{ padding:'11px 12px', textAlign:'right', fontWeight:700, color:'#16a34a' }}>{fmt(e.net_salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth:640 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--navy)' }}>Add Employee Salary</span>
              <button onClick={() => setShowForm(false)} style={S.closeBtn}><X size={18}/></button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={S.label}>Employee Name *</label>
                <input value={form.employee_name} onChange={e => setForm(f=>({...f,employee_name:e.target.value}))} placeholder="Full name" style={S.input}/>
              </div>
              <div>
                <label style={S.label}>PAN</label>
                <input value={form.employee_pan} onChange={e => setForm(f=>({...f,employee_pan:e.target.value.toUpperCase()}))} placeholder="ABCDE1234F" style={S.input}/>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={S.label}>Month</label>
                  <select value={form.month} onChange={e=>setForm(f=>({...f,month:+e.target.value}))} style={S.input}>
                    {months.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={S.label}>Year</label>
                  <select value={form.year} onChange={e=>setForm(f=>({...f,year:+e.target.value}))} style={S.input}>
                    {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Gross Salary (₹) *</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input type="number" value={form.gross_salary} onChange={e=>setForm(f=>({...f,gross_salary:e.target.value}))} placeholder="50000" style={{...S.input,flex:1}}/>
                  <button onClick={autoCalc} disabled={calcLoading} style={{ ...S.ghostBtn, padding:'9px 12px', whiteSpace:'nowrap' }}><Calculator size={13}/> {calcLoading?'...':'Auto-Calc'}</button>
                </div>
              </div>
              <div>
                <label style={S.label}>Basic (₹)</label>
                <input type="number" value={form.basic} onChange={e=>setForm(f=>({...f,basic:e.target.value}))} placeholder="25000" style={S.input}/>
              </div>
            </div>

            {/* Auto-calc result banner */}
            {calc && (
              <div style={{ background:'#eff6ff', borderRadius:10, padding:'12px 14px', margin:'14px 0', fontSize:12, color:'#1e40af' }}>
                <strong>Auto-calculated:</strong>&nbsp;
                PF employee ₹{calc.pf.employee} (12% of ₹{calc.pf.wage_ceiling}) · PF employer ₹{calc.pf.employer} ·
                ESIC {calc.esic.applicable ? `₹${calc.esic.employee} emp / ₹${calc.esic.employer} er` : 'not applicable (gross > ₹21,000)'}
                {calc.pf.note && <div style={{ marginTop:4 }}>{calc.pf.note}</div>}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginTop:4 }}>
              {[
                { key:'pf_employee',  label:'PF Employee (₹)', placeholder:'1800' },
                { key:'pf_employer',  label:'PF Employer (₹)', placeholder:'1800' },
                { key:'esic_employee',label:'ESIC Employee (₹)',placeholder:'0' },
                { key:'esic_employer',label:'ESIC Employer (₹)',placeholder:'0' },
                { key:'tds_amount',   label:'TDS u/s 192 (₹)', placeholder:'0' },
                { key:'other_deductions', label:'Other Deductions (₹)', placeholder:'0' },
              ].map(f => (
                <div key={f.key}>
                  <label style={S.label}>{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e=>setForm(ff=>({...ff,[f.key]:e.target.value}))} placeholder={f.placeholder} style={S.input}/>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14 }}>
              <div>
                <label style={S.label}>Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))} style={S.input}/>
              </div>
              <div>
                <label style={S.label}>Payment Mode</label>
                <select value={form.payment_mode} onChange={e=>setForm(f=>({...f,payment_mode:e.target.value}))} style={S.input}>
                  <option value="bank">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            {/* Net salary preview */}
            <div style={{ background:'var(--gray-50)', borderRadius:10, padding:'12px 16px', marginTop:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, color:'var(--gray-600)' }}>Net Salary = Gross − PF emp − ESIC emp − TDS − Other</span>
              <span style={{ fontSize:16, fontWeight:700, color:'#16a34a' }}>{fmt2(netSalary())}</span>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
              <button onClick={() => setShowForm(false)} style={S.ghostBtn}>Cancel</button>
              <button onClick={submit} disabled={saving} style={S.primaryBtn}><CheckCircle size={14}/> {saving?'Saving...':'Post Salary Entry'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: { background:'var(--white)', borderRadius:16, padding:24, border:'1px solid var(--gray-100)', boxShadow:'0 1px 8px rgba(0,0,0,0.04)' },
  primaryBtn: { display:'flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg, #C9A84C, #e2c06e)', color:'var(--navy)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' },
  ghostBtn: { display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, border:'1.5px solid var(--gray-200)', background:'var(--white)', color:'var(--gray-600)', fontSize:13, cursor:'pointer', fontFamily:'var(--font-body)' },
  input: { width:'100%', padding:'9px 12px', borderRadius:9, border:'1.5px solid var(--gray-200)', fontSize:13, fontFamily:'var(--font-body)', outline:'none', boxSizing:'border-box', background:'var(--white)', color:'var(--navy)' },
  label: { display:'block', fontSize:11, fontWeight:600, color:'var(--gray-400)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(4px)' },
  modal: { background:'var(--white)', borderRadius:20, padding:28, width:'90%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 },
  closeBtn: { background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)', padding:4 },
}