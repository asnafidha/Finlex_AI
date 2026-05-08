import { useState, useEffect } from 'react'
import { TrendingUp, Download, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const request = async (endpoint) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

const fmt    = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtShort = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default function ITRPage() {
  const { company }           = useAuth()
  const [data, setData]       = useState(null)
  const [regime, setRegime]   = useState('new')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => { if (company?.id) loadComputation() }, [company, regime])

  const loadComputation = async () => {
    setLoading(true); setError('')
    try {
      const res = await request(`/itr/computation?company_id=${company.id}&regime=${regime}&fy=2024-25`)
      setData(res)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>ITR Preparation</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Tax computation from your P&L data — FY 2024-25</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadComputation} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            borderRadius: 10, border: '1.5px solid var(--gray-200)', background: 'var(--white)',
            color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}><RefreshCw size={14} /> Recalculate</button>
          {data?.itr_json && (
            <button onClick={() => {
              const blob = new Blob([JSON.stringify(data.itr_json, null, 2)], { type: 'application/json' })
              const a    = document.createElement('a')
              a.href     = URL.createObjectURL(blob)
              a.download = `ITR_${company?.name?.replace(/\s+/g,'_')}_FY${data.financial_year || '2024-25'}.json`
              a.click()
            }} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
              color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}><Download size={14} /> Export ITR JSON</button>
          )}
        </div>
      </div>

      {/* Regime toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        {['new','old'].map(r => (
          <button key={r} onClick={() => setRegime(r)} style={{
            padding: '9px 28px', borderRadius: 9, border: 'none',
            background: regime === r ? 'var(--navy)' : 'transparent',
            color: regime === r ? 'var(--white)' : 'var(--gray-600)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            textTransform: 'capitalize',
          }}>{r} Regime</button>
        ))}
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Computing tax liability...</div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Regime Comparison Banner */}
          <div style={{
            background: data.comparison.recommended === 'new' ? 'linear-gradient(135deg, #0f1f4b, #243370)' : 'linear-gradient(135deg, #065f46, #047857)',
            borderRadius: 16, padding: '20px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid rgba(201,168,76,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle size={28} color="#C9A84C" />
              <div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>RECOMMENDED REGIME</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--white)', textTransform: 'capitalize' }}>
                  {data.comparison.recommended} Regime — Save {fmtShort(data.comparison.savings)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                { label: 'New Regime Tax', value: fmtShort(data.comparison.new_regime), active: data.comparison.recommended === 'new' },
                { label: 'Old Regime Tax', value: fmtShort(data.comparison.old_regime), active: data.comparison.recommended === 'old' },
              ].map((r, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 16px', background: r.active ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.08)', borderRadius: 10, border: r.active ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: r.active ? '#C9A84C' : 'rgba(255,255,255,0.7)' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Income Computation */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Income Computation</h3>
              {[
                { label: 'Gross Revenue',        value: data.income_computation.gross_revenue,        color: '#10b981' },
                { label: 'Less: Total Expenses', value: data.income_computation.total_expenses,        color: '#dc2626', prefix: '(−)' },
                { label: 'Net Profit',           value: data.income_computation.net_profit,            color: 'var(--navy)', bold: true },
                { label: 'Less: Std Deduction',  value: data.income_computation.standard_deduction,   color: '#f59e0b', prefix: '(−)' },
                { label: 'Taxable Income',       value: data.income_computation.taxable_income,        color: 'var(--navy)', bold: true },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--gray-200)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 15 : 13, fontWeight: r.bold ? 700 : 600, color: r.color }}>
                    {r.prefix && <span style={{ marginRight: 2, fontSize: 11 }}>{r.prefix}</span>}
                    {fmt(r.value)}
                  </span>
                </div>
              ))}
            </div>

            {/* Tax Computation */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Tax Computation</h3>

              {/* Slab breakdown */}
              {data.tax_computation.breakdown.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--gray-100)', marginBottom: 8, border: '1px solid var(--gray-200)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{s.slab} @ {s.rate}%</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Taxable: {fmtShort(s.taxable_amount)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{fmtShort(s.tax)}</div>
                </div>
              ))}

              <div style={{ marginTop: 12, borderTop: '2px solid var(--gray-200)', paddingTop: 12 }}>
                {[
                  { label: 'Income Tax',       value: data.tax_computation.income_tax },
                  { label: '4% Cess',          value: data.tax_computation.cess_4_percent },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{fmt(r.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--navy)', borderRadius: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Total Tax</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#C9A84C' }}>{fmt(data.tax_computation.total_tax)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tax Payment Summary */}
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Tax Payment Summary</h3>
            <p style={{ fontSize:13, color:'var(--gray-500)', marginBottom:20 }}>
              TDS/Advance Tax figures come from accounts 1007, 1008, 1009. Record payments there to see accurate numbers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Total Tax Liability', value: fmt(data.tax_computation.total_tax),          color: '#dc2626', bg: '#fef2f2' },
                { label: 'TDS Deducted on Us',  value: fmt(data.tax_payment.tds_deducted),            color: '#3b82f6', bg: '#eff6ff' },
                { label: 'Advance Tax Paid',    value: fmt(data.tax_payment.advance_tax_paid),        color: '#10b981', bg: '#ecfdf5' },
                { label: 'Self Assessment Tax', value: fmt(data.tax_payment.self_assessment_tax),     color: '#f59e0b', bg: '#fffbeb' },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${s.color}22` }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-600)', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {/* Net payable / refund banner */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'18px 24px', borderRadius:12,
              background: data.tax_payment.refund_due > 0
                ? 'linear-gradient(135deg,#064e3b,#065f46)'
                : data.tax_payment.net_tax_payable > 0
                  ? 'linear-gradient(135deg,#7f1d1d,#991b1b)'
                  : 'linear-gradient(135deg,#1e3a5f,#1e40af)',
            }}>
              <div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>
                  {data.tax_payment.refund_due > 0 ? '🎉 REFUND DUE' : data.tax_payment.net_tax_payable > 0 ? '⚠️ TAX PAYABLE' : '✅ NO BALANCE DUE'}
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'#C9A84C' }}>
                  {data.tax_payment.refund_due > 0
                    ? fmt(data.tax_payment.refund_due)
                    : fmt(data.tax_payment.net_tax_payable)}
                </div>
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'right', lineHeight:1.8 }}>
                <div>Tax Liability: {fmt(data.tax_computation.total_tax)}</div>
                <div>Less Prepaid: {fmt(data.tax_payment.total_prepaid || 0)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}