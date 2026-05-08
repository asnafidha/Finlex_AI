import { useState, useEffect } from 'react'
import { Plus, TrendingDown, Eye, CheckCircle, AlertCircle, X, Info } from 'lucide-react'
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

export default function DepreciationPage() {
  const { company } = useAuth()
  const [schedules, setSchedules]   = useState([])
  const [rates, setRates]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [preview, setPreview]       = useState(null)
  const [previewSched, setPreviewSched] = useState(null)
  const [toast, setToast]           = useState(null)
  const [postForm, setPostForm]     = useState(null) // { id, fy, date }
  const [accounts, setAccounts]     = useState([])

  const [form, setForm] = useState({
    asset_name: '', method: 'WDV', cost: '', salvage_value: 0,
    useful_life_years: '', wdv_rate: '0.15', purchase_date: '',
    financial_year: '2024-25'
  })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [s, r, a] = await Promise.all([
        request(`/depreciation/schedules?company_id=${company.id}`),
        request('/depreciation/reference-rates'),
        request(`/accounts?company_id=${company.id}`)
      ])
      setSchedules(s); setRates(r); setAccounts(a)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company])

  const loadPreview = async (id) => {
    if (previewSched === id) { setPreviewSched(null); setPreview(null); return }
    setPreviewSched(id)
    try { const d = await request(`/depreciation/schedules/${id}/preview`); setPreview(d) }
    catch (e) { showToast(e.message, 'error') }
  }

  const submit = async () => {
    if (!form.asset_name || !form.cost || !form.purchase_date)
      return showToast('Asset name, cost and purchase date are required', 'error')
    if (form.method === 'SLM' && !form.useful_life_years)
      return showToast('Useful life (years) required for SLM', 'error')
    if (form.method === 'WDV' && !form.wdv_rate)
      return showToast('WDV rate required', 'error')
    try {
      await request('/depreciation/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...form, company_id: company.id, cost: parseFloat(form.cost), salvage_value: parseFloat(form.salvage_value || 0) })
      })
      showToast('Depreciation schedule created')
      setShowForm(false); load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const postDep = async () => {
    try {
      const res = await request(`/depreciation/schedules/${postForm.id}/post`, {
        method: 'POST',
        body: JSON.stringify({ financial_year: postForm.fy, post_date: postForm.date })
      })
      showToast(`Depreciation posted: ${fmt(res.dep_amount)}`)
      setPostForm(null); load()
    } catch (e) { showToast(e.message, 'error') }
  }

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
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Depreciation</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>SLM (Companies Act) & WDV (Income Tax Act) schedules</p>
        </div>
        <button onClick={() => setShowForm(true)} style={S.primaryBtn}><Plus size={15} /> Add Asset</button>
      </div>

      {/* Reference rates info */}
      {rates && (
        <div style={{ ...S.card, marginBottom: 20, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Info size={16} color="#2563eb" style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 13, marginBottom: 6 }}>Common IT Act WDV Rates</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
                {Object.entries(rates.income_tax_wdv_rates).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, color: '#1e40af' }}>{k}: <strong>{(v * 100).toFixed(0)}%</strong></span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedules */}
      {loading ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 60 }}>
          <TrendingDown size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
          <div style={{ color: 'var(--gray-400)', fontSize: 14 }}>No assets added yet. Add your first asset to begin.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {schedules.map(s => (
            <div key={s.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #0f1f4b,#243370)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingDown size={18} color="#C9A84C" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>{s.asset_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{s.method} · Cost {fmtShort(s.cost)} · Purchased {new Date(s.purchase_date).toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Dep. Posted</div>
                    <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>{fmtShort(s.total_dep_posted)}</div>
                  </div>
                  <button onClick={() => setPostForm({ id: s.id, fy: '2024-25', date: new Date().toISOString().split('T')[0] })} style={S.ghostBtn}>Post FY Dep</button>
                  <button onClick={() => loadPreview(s.id)} style={S.ghostBtn}><Eye size={13} /> {previewSched === s.id ? 'Hide' : 'Preview'}</button>
                </div>
              </div>

              {previewSched === s.id && preview && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--gray-100)', paddingTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 10 }}>
                    Full depreciation schedule — Total: {fmtShort(preview.total_depreciation)}
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          {['Year', 'Opening WDV', 'Depreciation', 'Closing WDV'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--gray-400)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.years.map((y, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                            <td style={{ padding: '6px 10px', color: 'var(--gray-600)' }}>Year {y.year}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--navy)' }}>{fmt(y.opening_wdv)}</td>
                            <td style={{ padding: '6px 10px', color: '#dc2626', fontWeight: 600 }}>−{fmt(y.dep_amount)}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--navy)', fontWeight: 500 }}>{fmt(y.closing_wdv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Post Depreciation Modal */}
      {postForm && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 440 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Post Depreciation</span>
              <button onClick={() => setPostForm(null)} style={S.closeBtn}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Financial Year</label>
                <input value={postForm.fy} onChange={e => setPostForm(f => ({ ...f, fy: e.target.value }))} placeholder="2024-25" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Post Date</label>
                <input type="date" value={postForm.date} onChange={e => setPostForm(f => ({ ...f, date: e.target.value }))} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPostForm(null)} style={S.ghostBtn}>Cancel</button>
              <button onClick={postDep} style={S.primaryBtn}><CheckCircle size={14} /> Post Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Asset Modal */}
      {showForm && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 560 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Add Asset</span>
              <button onClick={() => setShowForm(false)} style={S.closeBtn}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Asset Name *</label>
                <input value={form.asset_name} onChange={e => setForm(f => ({ ...f, asset_name: e.target.value }))} placeholder="e.g. Dell Server, Maruti Swift" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Method *</label>
                <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={S.input}>
                  <option value="WDV">WDV — Income Tax Act</option>
                  <option value="SLM">SLM — Companies Act</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Cost (₹) *</label>
                <input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="500000" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Salvage Value (₹)</label>
                <input type="number" value={form.salvage_value} onChange={e => setForm(f => ({ ...f, salvage_value: e.target.value }))} placeholder="0" style={S.input} />
              </div>
              {form.method === 'SLM' ? (
                <div>
                  <label style={S.label}>Useful Life (years) *</label>
                  <input type="number" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))} placeholder="5" style={S.input} />
                </div>
              ) : (
                <div>
                  <label style={S.label}>WDV Rate (e.g. 0.15 = 15%) *</label>
                  <input type="number" step="0.01" value={form.wdv_rate} onChange={e => setForm(f => ({ ...f, wdv_rate: e.target.value }))} placeholder="0.15" style={S.input} />
                </div>
              )}
              <div>
                <label style={S.label}>Purchase Date *</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Financial Year *</label>
                <input value={form.financial_year} onChange={e => setForm(f => ({ ...f, financial_year: e.target.value }))} placeholder="2024-25" style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={S.ghostBtn}>Cancel</button>
              <button onClick={submit} style={S.primaryBtn}><CheckCircle size={14} /> Create Schedule</button>
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