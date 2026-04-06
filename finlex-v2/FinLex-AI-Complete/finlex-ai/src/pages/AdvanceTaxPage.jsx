import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, AlertCircle, TrendingUp, Plus, X, RefreshCw } from 'lucide-react'
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
const fmtShort = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default function AdvanceTaxPage() {
  const { company } = useAuth()
  const [plan, setPlan]         = useState(null)
  const [regime, setRegime]     = useState('new')
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)
  const [payModal, setPayModal] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const d = await request(`/advance-tax/plan?company_id=${company.id}&regime=${regime}&fy=2024-25`)
      setPlan(d)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company, regime])

  const recordPayment = async () => {
    try {
      await request('/advance-tax/record-payment', {
        method: 'POST',
        body: JSON.stringify({ company_id: company.id, ...payModal })
      })
      showToast('Payment recorded and journal entry created')
      setPayModal(null); load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const statusStyle = (status) => ({
    paid:     { bg: '#f0fdf4', color: '#16a34a', label: '✓ Paid' },
    overdue:  { bg: '#fef2f2', color: '#dc2626', label: '⚠ Overdue' },
    upcoming: { bg: '#eff6ff', color: '#2563eb', label: '→ Upcoming' },
  }[status] || { bg: '#f3f4f6', color: '#6b7280', label: status })

  const S = styles

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 12, padding: '12px 18px', fontSize: 13, color: toast.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Advance Tax Planner</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Quarterly instalment schedule — avoid interest u/s 234B/234C</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--white)', borderRadius: 12, padding: 4, border: '1px solid var(--gray-200)' }}>
            {['new','old'].map(r => (
              <button key={r} onClick={() => setRegime(r)} style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: regime === r ? 'var(--navy)' : 'transparent', color: regime === r ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={load} style={S.ghostBtn}><RefreshCw size={14} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Computing advance tax plan...</div>
      ) : !plan ? null : plan.advance_tax_required === false ? (
        <div style={{ ...S.card, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle size={28} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 700, color: '#166534', fontSize: 16 }}>Advance Tax Not Required</div>
              <div style={{ color: '#16a34a', fontSize: 13 }}>{plan.message}</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tax summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Estimated Tax', value: fmtShort(plan.tax_summary?.total_tax) },
              { label: 'TDS Credit', value: fmtShort(plan.tax_summary?.tds_receivable), sub: 'reduces liability' },
              { label: 'Net Tax Liability', value: fmtShort(plan.tax_summary?.net_tax_for_advance) },
              { label: 'Paid So Far', value: fmtShort(plan.tax_summary?.total_advance_paid), highlight: true },
            ].map(c => (
              <div key={c.label} style={{ ...S.card, background: c.highlight ? 'linear-gradient(135deg, #0f1f4b, #243370)' : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: c.highlight ? 'rgba(255,255,255,0.5)' : 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.highlight ? '#C9A84C' : 'var(--navy)' }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Advice banner */}
          <div style={{ ...S.card, marginBottom: 24, background: plan.tax_summary?.remaining_to_pay > 0 ? 'linear-gradient(135deg, #fef9ec, #fef3c7)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: `1px solid ${plan.tax_summary?.remaining_to_pay > 0 ? '#fde68a' : '#86efac'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={20} color={plan.tax_summary?.remaining_to_pay > 0 ? '#d97706' : '#16a34a'} />
              <span style={{ fontWeight: 600, color: plan.tax_summary?.remaining_to_pay > 0 ? '#92400e' : '#166534', fontSize: 14 }}>{plan.advice}</span>
            </div>
          </div>

          {/* Instalments */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
            {plan.instalments?.map((inst) => {
              const ss = statusStyle(inst.status)
              return (
                <div key={inst.instalment} style={{ ...S.card, border: `1.5px solid ${inst.status === 'overdue' ? '#fca5a5' : inst.status === 'paid' ? '#86efac' : 'var(--gray-200)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>Instalment {inst.instalment}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{inst.label}</div>
                    </div>
                    <span style={{ background: ss.bg, color: ss.color, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{ss.label}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, marginBottom: 4 }}>CUMULATIVE DUE ({inst.cumulative_pct}%)</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{fmtShort(inst.cumulative_due)}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, marginBottom: 4 }}>THIS INSTALMENT</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{fmtShort(inst.this_instalment)}</div>
                    </div>
                  </div>

                  {inst.shortfall > 0 && (
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
                      Shortfall: {fmt(inst.shortfall)}{inst.interest_risk ? ' · ' + inst.interest_risk : ''}
                    </div>
                  )}

                  {inst.status !== 'paid' && (
                    <button onClick={() => setPayModal({ amount: inst.this_instalment, payment_date: inst.due_date, challan_no: '', instalment: inst.instalment })} style={{ ...S.ghostBtn, width: '100%', justifyContent: 'center' }}>
                      <Plus size={13} /> Record Payment
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 440 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Record Advance Tax Payment</span>
              <button onClick={() => setPayModal(null)} style={S.closeBtn}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Amount (₹) *</label>
                <input type="number" value={payModal.amount} onChange={e => setPayModal(p => ({ ...p, amount: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Payment Date *</label>
                <input type="date" value={payModal.payment_date} onChange={e => setPayModal(p => ({ ...p, payment_date: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Challan Number</label>
                <input value={payModal.challan_no} onChange={e => setPayModal(p => ({ ...p, challan_no: e.target.value }))} placeholder="BSR code / Challan no." style={S.input} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', background: 'var(--gray-50)', borderRadius: 8, padding: '8px 12px' }}>
                This will debit Account 1015 (Advance Tax Paid) and credit Bank Account, and mark the Q{payModal.instalment} compliance deadline as completed.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPayModal(null)} style={S.ghostBtn}>Cancel</button>
              <button onClick={recordPayment} style={S.primaryBtn}><CheckCircle size={14} /> Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: { background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-100)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)', color: 'var(--navy)' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--white)', borderRadius: 20, padding: 28, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 },
}