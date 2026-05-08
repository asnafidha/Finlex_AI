import { useState, useEffect } from 'react'
import { Save, User, Building2, Lock, Info, Eye, EyeOff,
         AlertCircle, CheckCircle, ChevronRight, Phone, Mail, Hash, MapPin, Briefcase } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const req = async (endpoint, opts = {}) => {
  const r = await fetch(`${BASE_URL}${endpoint}`, {
    ...opts, headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${getToken()}`, ...opts.headers },
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Error')
  return d
}

const TABS = [
  { id:'profile',  label:'Profile',     icon:User,      sub:'Your personal info' },
  { id:'company',  label:'Company',     icon:Building2, sub:'GST, PAN, address' },
  { id:'security', label:'Security',    icon:Lock,      sub:'Password & access' },
  { id:'about',    label:'About',       icon:Info,      sub:'Version & modules' },
]

const INP = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--gray-200)', fontSize:13, fontFamily:'var(--font-body)', color:'var(--navy)', background:'var(--white)', outline:'none', boxSizing:'border-box' }

const F = ({ label, icon:I, children }) => (
  <div>
    <label style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', display:'flex', alignItems:'center', gap:5, marginBottom:7, letterSpacing:'0.05em', textTransform:'uppercase' }}>
      {I && <I size={11}/>} {label}
    </label>
    {children}
  </div>
)

const Sec = ({ title }) => (
  <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-500)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:14, marginTop:4 }}>{title}</div>
)

export default function SettingsPage() {
  const { user, company, selectCompany } = useAuth()
  const [tab, setTab]         = useState('profile')
  const [ok, setOk]           = useState('')
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)
  const [sp, setSp]           = useState({ c:false, n:false, r:false })

  const [prof, setProf] = useState({ name: user?.name||'', email: user?.email||'' })
  const [pwd,  setPwd]  = useState({ current:'', newPass:'', confirm:'' })
  const [co,   setCo]   = useState({ name:'', gstin:'', pan:'', address:'', phone:'', email:'', business_type:'private_limited' })

  useEffect(() => {
    if (company) setCo({ name:company.name||'', gstin:company.gstin||'', pan:company.pan||'',
      address:company.address||'', phone:company.phone||'', email:company.email||'',
      business_type:company.business_type||'private_limited' })
  }, [company])

  const toast = (msg, isErr=false) => {
    isErr ? (setErr(msg), setOk('')) : (setOk(msg), setErr(''))
    setTimeout(() => { setOk(''); setErr('') }, 4000)
  }

  const saveCo = async () => {
    if (!company?.id) return toast('Select a company first', true)
    setBusy(true)
    try { const d = await req(`/companies/${company.id}`, { method:'PUT', body:JSON.stringify(co) }); selectCompany(d); toast('Company saved!') }
    catch(e) { toast(e.message, true) } finally { setBusy(false) }
  }

  const changePwd = async () => {
    if (!pwd.current) return toast('Enter current password', true)
    if (pwd.newPass !== pwd.confirm) return toast('Passwords do not match', true)
    if (pwd.newPass.length < 6) return toast('Min 6 characters', true)
    setBusy(true)
    try { await req('/auth/change-password', { method:'POST', body:JSON.stringify({ current_password:pwd.current, new_password:pwd.newPass }) }); setPwd({ current:'', newPass:'', confirm:'' }); toast('Password changed!') }
    catch(e) { toast(e.message, true) } finally { setBusy(false) }
  }

  return (
    <div style={{ animation:'fadeUp 0.4s ease', maxWidth:940 }}>
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Settings</h1>
        <p style={{ color:'var(--gray-500)', fontSize:15 }}>Manage your account, company and preferences</p>
      </div>

      {(ok||err) && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 18px', borderRadius:12, marginBottom:20, fontSize:13, fontWeight:500,
          background:ok?'#f0fdf4':'#fef2f2', border:`1px solid ${ok?'#bbf7d0':'#fecaca'}`, color:ok?'#15803d':'#dc2626' }}>
          {ok ? <CheckCircle size={15}/> : <AlertCircle size={15}/>} {ok||err}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:24, alignItems:'start' }}>

        {/* ── Nav ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--white)', borderRadius:14, border:'1px solid var(--gray-200)', marginBottom:8 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg, var(--navy), #1e40af)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
              {user?.name?.charAt(0)?.toUpperCase()||'U'}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--navy)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize:11, color:'var(--gray-500)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          {TABS.map(t => {
            const I = t.icon; const a = tab===t.id
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12, border:'none', textAlign:'left', cursor:'pointer', background:a?'var(--navy)':'transparent', color:a?'var(--white)':'var(--gray-600)', transition:'all 0.15s', fontFamily:'var(--font-body)' }}>
                <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', background:a?'rgba(255,255,255,0.15)':'var(--gray-100)', flexShrink:0 }}><I size={15}/></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:a?600:400 }}>{t.label}</div>
                  <div style={{ fontSize:11, color:a?'rgba(255,255,255,0.55)':'var(--gray-400)' }}>{t.sub}</div>
                </div>
                {a && <ChevronRight size={13} style={{ opacity:0.5 }}/>}
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div>

          {/* PROFILE */}
          {tab==='profile' && (
            <div style={{ background:'var(--white)', borderRadius:18, padding:'28px 32px', border:'1px solid var(--gray-200)' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)', marginBottom:24 }}>Profile</h2>
              <div style={{ display:'flex', alignItems:'center', gap:20, padding:'20px 24px', background:'linear-gradient(135deg, var(--navy), #1e40af)', borderRadius:14, marginBottom:28 }}>
                <div style={{ width:60, height:60, borderRadius:'50%', border:'3px solid var(--gold)', background:'rgba(201,168,76,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
                  {user?.name?.charAt(0)?.toUpperCase()||'U'}
                </div>
                <div>
                  <div style={{ fontSize:17, fontWeight:700, color:'var(--white)' }}>{user?.name}</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{user?.email}</div>
                  <span style={{ display:'inline-block', marginTop:8, fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20, background:'rgba(201,168,76,0.2)', color:'var(--gold)' }}>{(user?.role||'CA').toUpperCase()}</span>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
                <F label="Full Name" icon={User}><input value={prof.name} onChange={e=>setProf({...prof,name:e.target.value})} style={INP} placeholder="Your name"/></F>
                <F label="Email" icon={Mail}><input value={prof.email} disabled style={{...INP,background:'var(--gray-100)',color:'var(--gray-500)',cursor:'not-allowed'}}/><div style={{fontSize:11,color:'var(--gray-400)',marginTop:4}}>Cannot be changed</div></F>
              </div>
              <div style={{ padding:'12px 16px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, fontSize:12, color:'#92400e', marginBottom:20 }}>
                ℹ️ Profile name update will take effect on next login.
              </div>
              <button disabled style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 24px', borderRadius:10, border:'none', background:'var(--gray-200)', color:'var(--gray-500)', fontSize:14, fontWeight:600, cursor:'not-allowed', fontFamily:'var(--font-body)' }}>
                <Save size={15}/> Save Profile (Coming Soon)
              </button>
            </div>
          )}

          {/* COMPANY */}
          {tab==='company' && (
            <div style={{ background:'var(--white)', borderRadius:18, padding:'28px 32px', border:'1px solid var(--gray-200)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
                <div>
                  <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Company Details</h2>
                  <p style={{ fontSize:13, color:'var(--gray-500)' }}>Editing: <strong style={{color:'var(--navy)'}}>{company?.name||'— select a company'}</strong></p>
                </div>
                {company?.state_name && <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20, background:'#f0fdf4', color:'#15803d' }}>{company.state_name}</span>}
              </div>

              {!company?.id && <div style={{ padding:'14px 18px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, marginBottom:24, fontSize:13, color:'#1d4ed8', display:'flex', gap:10, alignItems:'center' }}><AlertCircle size={14}/> Select a company from the top navigation bar first.</div>}

              <Sec title="Identity"/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
                <F label="Company Name" icon={Building2}><input value={co.name} onChange={e=>setCo({...co,name:e.target.value})} style={INP} placeholder="Acme Pvt Ltd"/></F>
                <F label="Business Type" icon={Briefcase}>
                  <select value={co.business_type} onChange={e=>setCo({...co,business_type:e.target.value})} style={INP}>
                    {[['private_limited','Private Limited'],['public_limited','Public Limited'],['partnership','Partnership'],['proprietorship','Proprietorship'],['llp','LLP'],['trust','Trust / NGO']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </F>
              </div>

              <Sec title="Tax Registration"/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
                <F label="GSTIN" icon={Hash}><input value={co.gstin} onChange={e=>setCo({...co,gstin:e.target.value.toUpperCase()})} style={{...INP,fontFamily:'var(--font-mono)',letterSpacing:'0.05em'}} placeholder="27AABCU9603R1ZX" maxLength={15}/></F>
                <F label="PAN" icon={Hash}><input value={co.pan} onChange={e=>setCo({...co,pan:e.target.value.toUpperCase()})} style={{...INP,fontFamily:'var(--font-mono)',letterSpacing:'0.05em'}} placeholder="AABCU9603R" maxLength={10}/></F>
              </div>

              <Sec title="Contact"/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <F label="Phone" icon={Phone}><input value={co.phone} onChange={e=>setCo({...co,phone:e.target.value})} style={INP} placeholder="9876543210" type="tel"/></F>
                <F label="Email" icon={Mail}><input value={co.email} onChange={e=>setCo({...co,email:e.target.value})} style={INP} placeholder="accounts@company.com" type="email"/></F>
              </div>
              <F label="Registered Address" icon={MapPin}>
                <textarea value={co.address} onChange={e=>setCo({...co,address:e.target.value})} rows={3} style={{...INP,resize:'vertical',lineHeight:1.6}} placeholder="Full address with PIN code"/>
              </F>

              <div style={{ marginTop:24, display:'flex', gap:14, alignItems:'center' }}>
                <button onClick={saveCo} disabled={busy||!company?.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 28px', borderRadius:10, border:'none', background:company?.id?'linear-gradient(135deg,#C9A84C,#e2c06e)':'var(--gray-200)', color:company?.id?'var(--navy)':'var(--gray-500)', fontSize:14, fontWeight:700, cursor:busy||!company?.id?'not-allowed':'pointer', fontFamily:'var(--font-body)', opacity:busy?0.7:1 }}>
                  <Save size={15}/> {busy?'Saving...':'Save Company Details'}
                </button>
                {company?.id && <span style={{fontSize:12,color:'var(--gray-400)'}}>Changes reflect across all reports immediately</span>}
              </div>
            </div>
          )}

          {/* SECURITY */}
          {tab==='security' && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ background:'var(--white)', borderRadius:18, padding:'28px 32px', border:'1px solid var(--gray-200)' }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>Change Password</h2>
                <p style={{ fontSize:13, color:'var(--gray-500)', marginBottom:24 }}>Minimum 6 characters. You will stay logged in after changing.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:400 }}>
                  {[['Current Password','current','c'],['New Password','newPass','n'],['Confirm New Password','confirm','r']].map(([lbl,k,sf])=>(
                    <F key={k} label={lbl} icon={Lock}>
                      <div style={{position:'relative'}}>
                        <input type={sp[sf]?'text':'password'} value={pwd[k]} onChange={e=>setPwd({...pwd,[k]:e.target.value})} onKeyDown={e=>e.key==='Enter'&&changePwd()} style={{...INP,paddingRight:42}} placeholder="••••••••"/>
                        <button onClick={()=>setSp({...sp,[sf]:!sp[sf]})} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',border:'none',background:'none',cursor:'pointer',color:'var(--gray-400)',padding:0}}>
                          {sp[sf]?<EyeOff size={15}/>:<Eye size={15}/>}
                        </button>
                      </div>
                    </F>
                  ))}
                </div>
                <button onClick={changePwd} disabled={busy||!pwd.current} style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 28px', marginTop:24, borderRadius:10, border:'none', background:pwd.current?'var(--navy)':'var(--gray-200)', color:pwd.current?'var(--white)':'var(--gray-500)', fontSize:14, fontWeight:600, cursor:busy||!pwd.current?'not-allowed':'pointer', fontFamily:'var(--font-body)', opacity:busy?0.7:1 }}>
                  <Lock size={15}/> {busy?'Changing...':'Change Password'}
                </button>
              </div>
              <div style={{ background:'var(--white)', borderRadius:18, padding:'24px 28px', border:'1px solid var(--gray-200)' }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:700, color:'var(--navy)', marginBottom:14 }}>Session Info</h3>
                {[['Auth method','JWT (7-day expiry)'],['Password hashing','bcrypt'],['Token storage','localStorage']].map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 12px', background:'var(--gray-100)', borderRadius:8, marginBottom:8 }}>
                    <span style={{fontSize:12,color:'var(--gray-600)',fontWeight:600}}>{k}</span>
                    <span style={{fontSize:12,color:'var(--navy)',fontFamily:'var(--font-mono)'}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABOUT */}
          {tab==='about' && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ background:'linear-gradient(135deg, var(--navy), #1e3a8a)', borderRadius:18, padding:'32px', textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, color:'var(--gold)' }}>FinLex AI</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.6)', marginTop:4 }}>Your CA. Always On.</div>
                <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:14 }}>
                  {['v2.0.0','Phase 1+2','Production Ready'].map(b=>(
                    <span key={b} style={{fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:20,background:'rgba(201,168,76,0.2)',color:'#C9A84C'}}>{b}</span>
                  ))}
                </div>
              </div>

              <div style={{ background:'var(--white)', borderRadius:18, padding:'24px 28px', border:'1px solid var(--gray-200)' }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:700, color:'var(--navy)', marginBottom:14 }}>Tech Stack</h3>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[['AI','Groq — Llama 3.3 70B','#7c3aed','#f5f3ff'],['Database','PostgreSQL','#1d4ed8','#eff6ff'],['Backend','Node.js + Express','#15803d','#f0fdf4'],['Frontend','React + Vite','#0891b2','#ecfeff'],['PDF','PDF.js (client-side)','#dc2626','#fef2f2'],['Auth','JWT + bcrypt','#ca8a04','#fffbeb']].map(([k,v,color,bg])=>(
                    <div key={k} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:bg,borderRadius:10}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--gray-500)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{k}</div>
                        <div style={{fontSize:13,fontWeight:600,color}}>{v}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background:'var(--white)', borderRadius:18, padding:'24px 28px', border:'1px solid var(--gray-200)' }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:700, color:'var(--navy)', marginBottom:14 }}>Active Modules</h3>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[['✅','Accounting Engine','TB, P&L, Balance Sheet'],['✅','GST Module','GSTR-1/3B + ITC Recon'],['✅','TDS Module','8 sections + auto-journal'],['✅','ITR Computation','New vs Old regime'],['✅','AI Chatbot','Real company data context'],['✅','Document AI','PDF/CSV pipeline'],['✅','Compliance Calendar','GST/TDS/ITR/ROC'],['✅','CA Mission Control','Multi-company view'],['✅','Auto-Journal Engine','Instant on ingest'],['✅','Audit Trail','Every action logged'],['✅','Bank Statement Import','GST classification'],['⏳','GST Portal Filing','Needs GSP licence']].map(([icon,name,desc])=>(
                    <div key={name} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',background:'var(--gray-100)',borderRadius:10}}>
                      <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                      <div><div style={{fontSize:12,fontWeight:700,color:'var(--navy)'}}>{name}</div><div style={{fontSize:11,color:'var(--gray-500)'}}>{desc}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}