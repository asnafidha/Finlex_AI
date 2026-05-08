import { useState } from 'react'
import { Shield, Zap, Clock, TrendingUp, ChevronRight, CheckCircle, Star, AlertCircle } from 'lucide-react'

const styles = {
  page: { minHeight:'100vh', background:'var(--navy)', color:'var(--white)', fontFamily:'var(--font-body)', overflowX:'hidden' },
  nav:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 60px', borderBottom:'1px solid rgba(201,168,76,0.15)', position:'sticky', top:0, zIndex:100, background:'rgba(15,31,75,0.95)', backdropFilter:'blur(12px)' },
  logo: { fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, background:'linear-gradient(135deg, #C9A84C, #e2c06e)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', letterSpacing:'-0.5px' },
}

export default function Landing({ onLogin }) {
  const [mode, setMode]         = useState('login') // 'login' or 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async () => {
    if (!email || !password) { setError('Email and password required'); return }
    if (mode==='register' && !name) { setError('Name required'); return }
    setLoading(true); setError('')
    try {
      await onLogin(email, password, name, mode)
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  const inputStyle = {
    width:'100%', padding:'12px 14px', borderRadius:8,
    border:'1.5px solid rgba(255,255,255,0.15)', fontSize:14,
    fontFamily:'var(--font-body)', color:'var(--white)',
    background:'rgba(255,255,255,0.08)', outline:'none',
    marginBottom:12,
  }

  const features = [
    { icon:<Zap size={24}/>, title:'GST Automation', desc:'Auto-generate invoices, calculate CGST/SGST/IGST, and track GST returns.', bullets:['CGST/SGST/IGST auto-calculation','GSTR-1, 3B tracking','One-click filing prep'] },
    { icon:<TrendingUp size={24}/>, title:'Real Accounting Engine', desc:'Double-entry bookkeeping, ledger, trial balance, P&L and balance sheet.', bullets:['Auto journal entries','Balanced books guaranteed','Real-time financial reports'] },
    { icon:<Clock size={24}/>, title:'Compliance Calendar', desc:'Never miss a deadline. Smart alerts for GST, TDS, ITR and ROC.', bullets:['Full Indian compliance calendar','Smart pre-alerts','Penalty prevention'] },
  ]

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.logo}>FinLex AI</div>
        <div style={{ display:'flex', gap:32, alignItems:'center' }}>
          <span style={{ color:'rgba(255,255,255,0.7)', fontSize:15, cursor:'pointer' }}>Features</span>
          <span style={{ color:'rgba(255,255,255,0.7)', fontSize:15, cursor:'pointer' }}>Pricing</span>
        </div>
      </nav>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 420px', gap:60, maxWidth:1100, margin:'0 auto', padding:'80px 40px', alignItems:'center' }}>
        {/* Left — hero */}
        <div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(201,168,76,0.12)', border:'1px solid rgba(201,168,76,0.3)', color:'var(--gold)', padding:'6px 16px', borderRadius:50, fontSize:13, fontWeight:500, marginBottom:28 }}>
            <Star size={13}/> India's First AI-Powered CA Platform
          </div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:58, fontWeight:900, lineHeight:1.1, marginBottom:24, letterSpacing:'-2px' }}>
            Your CA.<br/><span style={{ background:'linear-gradient(135deg, #C9A84C, #e2c06e)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Always On.</span>
          </h1>
          <p style={{ fontSize:18, color:'rgba(255,255,255,0.65)', maxWidth:500, lineHeight:1.7, marginBottom:40 }}>
            FinLex AI handles GST filing, bookkeeping, compliance tracking and financial reporting — with a real double-entry accounting engine.
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:40 }}>
            {[
              { num:'₹30,000 Cr+', label:'Market Size' },
              { num:'1.4M+',       label:'Companies in India' },
              { num:'100%',        label:'Double-Entry Accuracy' },
            ].map((s,i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(201,168,76,0.15)', borderRadius:12, padding:'20px 16px', textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, color:'var(--gold)', marginBottom:4 }}>{s.num}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {features.map((f,i) => (
              <div key={i} style={{ display:'flex', gap:14, padding:'16px 20px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(201,168,76,0.12)', borderRadius:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(201,168,76,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', flexShrink:0 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{f.title}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — auth form */}
        <div style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:20, padding:36, backdropFilter:'blur(12px)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'var(--white)', marginBottom:6 }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:28 }}>
            {mode === 'login' ? 'Sign in to your FinLex account' : 'Start your free trial today'}
          </div>

          {/* Mode toggle */}
          <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, marginBottom:24 }}>
            {['login','register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex:1, padding:'9px', borderRadius:8, border:'none', fontSize:13, fontWeight:600,
                background: mode===m ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: mode===m ? 'var(--white)' : 'rgba(255,255,255,0.45)',
                cursor:'pointer', fontFamily:'var(--font-body)', textTransform:'capitalize',
                transition:'all 0.15s',
              }}>{m === 'login' ? 'Sign In' : 'Register'}</button>
            ))}
          </div>

          {mode === 'register' && (
            <input
              type="text" placeholder="Your full name"
              value={name} onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="email" placeholder="Email address"
            value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key==='Enter' && handleSubmit()}
            style={{ ...inputStyle, marginBottom:0 }}
          />

          {error && (
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(220,38,38,0.15)', border:'1px solid rgba(220,38,38,0.3)', color:'#fca5a5', padding:'10px 14px', borderRadius:8, fontSize:13, marginTop:12 }}>
              <AlertCircle size={14}/> {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            marginTop:20, padding:'14px', borderRadius:10, border:'none',
            background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
            color:'var(--navy)', fontSize:15, fontWeight:700, cursor:'pointer',
            fontFamily:'var(--font-body)', opacity: loading ? 0.8 : 1,
          }}>
            {loading ? 'Please wait...' : mode==='login' ? <><ChevronRight size={16}/> Sign In</> : <><ChevronRight size={16}/> Create Account</>}
          </button>

          <div style={{ marginTop:20, padding:16, background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.15)', borderRadius:10 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:8, fontWeight:600 }}>DEMO CREDENTIALS</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', fontFamily:'monospace' }}>fida@example.com</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', fontFamily:'monospace' }}>password123</div>
          </div>
        </div>
      </div>
    </div>
  )
}