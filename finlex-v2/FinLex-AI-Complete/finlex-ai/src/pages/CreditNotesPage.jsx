import { useState, useEffect } from 'react'
import { Plus, FileText, X, CheckCircle, AlertCircle, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'
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
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const EMPTY_FORM = {
  note_type: 'credit', note_number: '', note_date: new Date().toISOString().split('T')[0],
  party_name: '', party_gstin: '', reason: '', original_invoice_id: '',
  items: [{ description: '', quantity: 1, rate: '', gst_rate: 18 }]
}

export default function CreditNotesPage() {
  const { company } = useAuth()
  const [notes, setNotes]       = useState([])
  const [tab, setTab]           = useState('credit')
  const [loading, setLoading]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [toast, setToast]       = useState(null)
  const [invoices, setInvoices] = useState([])

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [n, inv] = await Promise.all([
        request(`/credit-notes?company_id=${company.id}&note_type=${tab}`),
        request(`/invoices?company_id=${company.id}&invoice_type=${tab === 'credit' ? 'sale' : 'purchase'}`)
      ])
      setNotes(n); setInvoices(inv)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company, tab])

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, rate: '', gst_rate: 18 }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const updateItem = (i, key, val) => setForm(f => {
    const items = [...f.items]; items[i] = { ...items[i], [key]: val }; return { ...f, items }
  })

  const calcTotals = () => {
    return form.items.reduce((acc, item) => {
      const taxable = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0)
      const gst = taxable * parseFloat(item.gst_rate || 18) / 100
      return { taxable: acc.taxable + taxable, gst: acc.gst + gst, total: acc.total + taxable + gst }
    }, { taxable: 0, gst: 0, total: 0 })
  }

  const submit = async () => {
    if (!form.note_number || !form.party_name || form.items.some(i => !i.description || !i.rate))
      return showToast('Fill all required fields', 'error')
    try {
      await request('/credit-notes', { method: 'POST', body: JSON.stringify({
        ...form, company_id: company.id,
        original_invoice_id: form.original_invoice_id ? parseInt(form.original_invoice_id) : null
      })})
      showToast(`${form.note_type === 'credit' ? 'Credit' : 'Debit'} note created successfully`)
      setShowForm(false); setForm(EMPTY_FORM); load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const totals = calcTotals()
  const S = styles

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 12, padding: '12px 18px', fontSize: 13, color: toast.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Credit / Debit Notes</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Manage partial returns, discounts and GSTR-2B reconciliation</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, note_type: tab }) }} style={S.primaryBtn}>
          <Plus size={15} /> New {tab === 'credit' ? 'Credit' : 'Debit'} Note
        </button>
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        {['credit', 'debit'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: tab === t ? 'var(--navy)' : 'transparent', color: tab === t ? 'var(--white)' : 'var(--gray-600)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
            {t === 'credit' ? <><ArrowDownLeft size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Credit Notes</> : <><ArrowUpRight size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Debit Notes</>}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Notes', value: notes.length, sub: 'this period' },
          { label: 'Total Value', value: fmt(notes.reduce((s, n) => s + parseFloat(n.total_amount || 0), 0)), sub: 'all notes' },
          { label: 'GST Impact', value: fmt(notes.reduce((s, n) => s + parseFloat(n.cgst_amount || 0) + parseFloat(n.sgst_amount || 0) + parseFloat(n.igst_amount || 0), 0)), sub: 'to reverse' },
        ].map(c => (
          <div key={c.label} style={S.card}>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 600, marginBottom: 6 }}>{c.label.toUpperCase()}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}><RefreshCw size={20} className="spin" /> Loading...</div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <FileText size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
            <div style={{ color: 'var(--gray-400)', fontSize: 14 }}>No {tab} notes yet. Create your first one.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--gray-100)' }}>
                {['Note No', 'Date', 'Party', 'Against Invoice', 'Taxable', 'GST', 'Total', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--gray-400)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notes.map(n => (
                <tr key={n.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '12px 12px' }}><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--navy)', fontSize: 12 }}>{n.note_number}</span></td>
                  <td style={{ padding: '12px 12px', color: 'var(--gray-600)' }}>{fmtDate(n.note_date)}</td>
                  <td style={{ padding: '12px 12px', fontWeight: 500, color: 'var(--navy)' }}>{n.party_name}</td>
                  <td style={{ padding: '12px 12px', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{n.original_invoice_number || '—'}</td>
                  <td style={{ padding: '12px 12px', color: 'var(--gray-600)' }}>{fmt(n.taxable_amount)}</td>
                  <td style={{ padding: '12px 12px', color: 'var(--gray-600)' }}>{fmt(parseFloat(n.cgst_amount || 0) + parseFloat(n.sgst_amount || 0) + parseFloat(n.igst_amount || 0))}</td>
                  <td style={{ padding: '12px 12px', fontWeight: 700, color: 'var(--navy)' }}>{fmt(n.total_amount)}</td>
                  <td style={{ padding: '12px 12px' }}><span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{n.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showForm && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 700 }}>
            <div style={S.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
                New {form.note_type === 'credit' ? 'Credit' : 'Debit'} Note
              </span>
              <button onClick={() => setShowForm(false)} style={S.closeBtn}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Type</label>
                <select value={form.note_type} onChange={e => setForm(f => ({ ...f, note_type: e.target.value }))} style={S.input}>
                  <option value="credit">Credit Note (Sales Return)</option>
                  <option value="debit">Debit Note (Purchase Return)</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Note Number *</label>
                <input value={form.note_number} onChange={e => setForm(f => ({ ...f, note_number: e.target.value }))} placeholder="CN-001" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Note Date *</label>
                <input type="date" value={form.note_date} onChange={e => setForm(f => ({ ...f, note_date: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Against Invoice (optional)</label>
                <select value={form.original_invoice_id} onChange={e => {
                  const inv = invoices.find(i => i.id === parseInt(e.target.value))
                  setForm(f => ({ ...f, original_invoice_id: e.target.value, party_name: inv?.party_name || f.party_name, party_gstin: inv?.party_gstin || f.party_gstin }))
                }} style={S.input}>
                  <option value="">— Select invoice —</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {i.party_name}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Party Name *</label>
                <input value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} placeholder="Customer / Vendor name" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Party GSTIN</label>
                <input value={form.party_gstin} onChange={e => setForm(f => ({ ...f, party_gstin: e.target.value }))} placeholder="27AABCU9603R1ZX" style={S.input} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Reason</label>
                <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Goods returned / Discount / Damaged goods" style={S.input} />
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 13 }}>Items</span>
                <button onClick={addItem} style={S.ghostBtn}><Plus size={13} /> Add Item</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Description *" style={S.input} />
                  <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="Qty" style={S.input} />
                  <input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', e.target.value)} placeholder="Rate ₹" style={S.input} />
                  <select value={item.gst_rate} onChange={e => updateItem(i, 'gst_rate', e.target.value)} style={S.input}>
                    {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                  {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={14} /></button>}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>Taxable: <strong>{fmt(totals.taxable)}</strong></span>
              <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>GST: <strong>{fmt(totals.gst)}</strong></span>
              <span style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 700 }}>Total: {fmt(totals.total)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={S.ghostBtn}>Cancel</button>
              <button onClick={submit} style={S.primaryBtn}><CheckCircle size={14} /> Create Note</button>
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