import { useState, useEffect } from 'react'
import { Plus, Trash2, Download, Send, CheckCircle, CreditCard, X, XCircle, FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { invoices as invoicesApi, payments as paymentsApi } from '../services/api'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

// ── PDF Generator (no library needed — pure HTML print) ───────
function generateInvoicePDF(inv, items) {
  const isInter = inv.igst_amount > 0
  const gstTotal = parseFloat(inv.cgst_amount||0) + parseFloat(inv.sgst_amount||0) + parseFloat(inv.igst_amount||0)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${inv.invoice_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #0f1f4b; padding-bottom: 20px; }
  .company-name { font-size: 24px; font-weight: 700; color: #0f1f4b; }
  .invoice-title { font-size: 20px; font-weight: 700; color: #c9a84c; text-align: right; }
  .invoice-meta { text-align: right; margin-top: 6px; color: #555; font-size: 12px; }
  .party-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .party-box { background: #f8f9fa; padding: 14px; border-radius: 8px; }
  .party-box h4 { font-size: 11px; color: #888; font-weight: 600; margin-bottom: 8px; letter-spacing: 1px; }
  .party-box p { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 4px; }
  .party-box span { font-size: 12px; color: #555; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #0f1f4b; }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; color: #c9a84c; font-weight: 600; letter-spacing: 0.5px; }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  tbody td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #eee; }
  .totals-total { display: flex; justify-content: space-between; padding: 10px 14px; background: #0f1f4b; color: white; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 6px; }
  .totals-total span:last-child { color: #c9a84c; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; background: ${inv.payment_status === 'paid' ? '#dcfce7' : '#fff7ed'}; color: ${inv.payment_status === 'paid' ? '#166534' : '#c2410c'}; }
  .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px; text-align: center; font-size: 11px; color: #888; }
  .itc-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: #166534; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company-name">FinLex AI</div>
    <div style="font-size:12px;color:#555;margin-top:4px;">CA Accounting Platform</div>
  </div>
  <div>
    <div class="invoice-title">${inv.invoice_type.toUpperCase()} INVOICE</div>
    <div class="invoice-meta">
      <div style="font-size:15px;font-weight:700;color:#111;">${inv.invoice_number}</div>
      <div>Date: ${new Date(inv.invoice_date).toLocaleDateString('en-IN')}</div>
      <div style="margin-top:4px;"><span class="status-badge">${inv.payment_status.toUpperCase()}</span></div>
    </div>
  </div>
</div>

<div class="party-section">
  <div class="party-box">
    <h4>${inv.invoice_type === 'sale' ? 'BILL TO' : 'VENDOR'}</h4>
    <p>${inv.party_name}</p>
    ${inv.party_gstin ? `<span>GSTIN: ${inv.party_gstin}</span>` : ''}
    ${inv.party_state ? `<div style="font-size:12px;color:#555;margin-top:4px;">State Code: ${inv.party_state}</div>` : ''}
  </div>
  <div class="party-box">
    <h4>INVOICE DETAILS</h4>
    <p>Invoice No: ${inv.invoice_number}</p>
    <p style="margin-top:4px;">Date: ${new Date(inv.invoice_date).toLocaleDateString('en-IN')}</p>
    ${inv.due_date ? `<p style="margin-top:4px;">Due: ${new Date(inv.due_date).toLocaleDateString('en-IN')}</p>` : ''}
  </div>
</div>

${items && items.length > 0 ? `
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Description</th>
      <th>HSN/SAC</th>
      <th>Qty</th>
      <th>Rate</th>
      <th>Taxable</th>
      <th>GST%</th>
      <th>Amount</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((item, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${item.description}</td>
      <td style="font-family:monospace">${item.hsn_sac_code || '-'}</td>
      <td>${item.quantity}</td>
      <td>${fmt(item.rate)}</td>
      <td>${fmt(item.taxable_amount)}</td>
      <td>${item.gst_rate}%</td>
      <td style="font-weight:600">${fmt(item.total_amount)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : ''}

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Taxable Amount</span><span>${fmt(inv.taxable_amount)}</span></div>
    ${!isInter ? `
    <div class="totals-row"><span>CGST</span><span>${fmt(inv.cgst_amount)}</span></div>
    <div class="totals-row"><span>SGST</span><span>${fmt(inv.sgst_amount)}</span></div>` : `
    <div class="totals-row"><span>IGST</span><span>${fmt(inv.igst_amount)}</span></div>`}
    <div class="totals-total"><span>Total Amount</span><span>${fmt(inv.total_amount)}</span></div>
  </div>
</div>

${!isInter && gstTotal > 0 ? `
<div class="itc-box">
  ✅ ITC Claimable: CGST ${fmt(inv.cgst_amount)} + SGST ${fmt(inv.sgst_amount)} = ${fmt(gstTotal)}
</div>` : ''}

${inv.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400e;">📝 Notes: ${inv.notes}</div>` : ''}

<div class="footer">
  Generated by FinLex AI • ${new Date().toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'})}
</div>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

export default function GSTPage() {
  const { company } = useAuth()
  const [activeTab, setActiveTab]     = useState('invoices')
  const [invoiceList, setInvoiceList] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [showPayment, setShowPayment] = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState('')
  const [error, setError]             = useState('')
  const [cancelling, setCancelling]   = useState(null) // invoice id being cancelled

  const [form, setForm] = useState({
    invoice_type: 'sale',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    party_name: '',
    party_gstin: '',
    party_state: '',
    notes: '',
    tds_section: '',
    tds_amount: '',
  })
  const [items, setItems] = useState([
    { description: '', hsn_sac_code: '', quantity: 1, unit: 'NOS', rate: 0, gst_rate: 18 }
  ])

  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'bank',
    reference: '',
  })

  useEffect(() => {
    if (company?.id) loadInvoices()
  }, [company, activeTab])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const type = activeTab === 'sales' ? 'sale' : activeTab === 'purchases' ? 'purchase' : null
      const data = await invoicesApi.list(company.id, type)
      setInvoiceList(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const updateItem = (i, field, val) => {
    const copy = [...items]
    copy[i][field] = ['quantity','rate','gst_rate'].includes(field) ? parseFloat(val)||0 : val
    setItems(copy)
  }

  const subtotal = items.reduce((s, it) => s + (it.quantity * it.rate), 0)
  const cgst     = items.reduce((s, it) => s + (it.quantity * it.rate * it.gst_rate) / 200, 0)
  const sgst     = cgst
  const igst     = items.reduce((s, it) => s + (it.quantity * it.rate * it.gst_rate) / 100, 0)
  const isInter  = form.party_state && company?.state_code && form.party_state !== company?.state_code
  const total    = isInter ? subtotal + igst : subtotal + cgst + sgst

  const handleCreateInvoice = async () => {
    setSubmitting(true); setError(''); setSuccess('')
    try {
      await invoicesApi.create({ company_id: company.id, ...form, items })
      setSuccess('Invoice created successfully!')
      setShowForm(false)
      setForm({ invoice_type:'sale', invoice_number:'', invoice_date: new Date().toISOString().split('T')[0], party_name:'', party_gstin:'', party_state:'', notes:'', tds_section:'', tds_amount:'' })
      setItems([{ description:'', hsn_sac_code:'', quantity:1, unit:'NOS', rate:0, gst_rate:18 }])
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally { setSubmitting(false) }
  }

  const handlePayment = async () => {
    setSubmitting(true); setError(''); setSuccess('')
    try {
      await paymentsApi.create({
        company_id: company.id,
        payment_type: showPayment.invoice_type === 'sale' ? 'received' : 'made',
        invoice_id: showPayment.id,
        ...payForm,
      })
      setSuccess('Payment recorded!')
      setShowPayment(null)
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally { setSubmitting(false) }
  }

  // ── Cancel Invoice ──────────────────────────────────────────
  const handleCancelInvoice = async (inv) => {
    if (!window.confirm(`Cancel invoice ${inv.invoice_number}? This will reverse all journal entries.`)) return
    setCancelling(inv.id)
    setError(''); setSuccess('')
    try {
      const res = await fetch(`${BASE_URL}/invoices/${inv.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cancel failed')
      setSuccess(`Invoice ${inv.invoice_number} cancelled and journal reversed.`)
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally { setCancelling(null) }
  }

  // ── Download PDF ────────────────────────────────────────────
  const handleDownloadPDF = async (inv) => {
    try {
      // Fetch full invoice with items
      const res = await fetch(`${BASE_URL}/invoices/${inv.id}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
      const data = await res.json()
      generateInvoicePDF(data, data.items || [])
    } catch (err) {
      setError('PDF generation failed: ' + err.message)
    }
  }

  const tabStyle = (t) => ({
    padding: '9px 22px', borderRadius: 9, border: 'none',
    background: activeTab === t ? 'var(--navy)' : 'transparent',
    color: activeTab === t ? 'var(--white)' : 'var(--gray-600)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-body)', transition: 'all 0.2s',
  })

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid var(--gray-200)', fontSize: 13,
    fontFamily: 'var(--font-body)', color: 'var(--navy)',
    background: 'var(--gray-100)', outline: 'none',
  }

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--navy)', marginBottom:4 }}>GST Filing & Invoicing</h1>
          <p style={{ color:'var(--gray-600)', fontSize:15 }}>Manage invoices, GST calculations and payments</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display:'flex', alignItems:'center', gap:8, padding:'12px 20px',
          borderRadius:10, border:'none', background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
          color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer',
          fontFamily:'var(--font-body)',
        }}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {success && <div style={{ background:'#ecfdf5', color:'#16a34a', padding:'12px 16px', borderRadius:8, marginBottom:16, fontSize:13, fontWeight:500 }}>{success}</div>}
      {error   && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'12px 16px', borderRadius:8, marginBottom:16, fontSize:13, fontWeight:500 }}>{error}</div>}

      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--white)', borderRadius:12, padding:4, width:'fit-content', border:'1px solid var(--gray-200)' }}>
        {[['invoices','All Invoices'],['sales','Sales'],['purchases','Purchases']].map(([t,l]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>{l}</button>
        ))}
      </div>

      <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--gray-400)' }}>Loading invoices...</div>
        ) : invoiceList.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--gray-400)' }}>No invoices yet. Click "New Invoice" to create one.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--navy)' }}>
                {['Invoice No','Type','Date','Party','Taxable','GST','Total','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:12, fontWeight:600, color:'var(--gold)', letterSpacing:'0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoiceList.map((inv, i) => (
                <tr key={inv.id} style={{
                  background: inv.status === 'cancelled' ? '#fef2f2' : i%2===0 ? 'var(--white)' : 'var(--gray-100)',
                  borderBottom:'1px solid var(--gray-200)',
                  opacity: inv.status === 'cancelled' ? 0.6 : 1,
                }}>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, color:'var(--navy)' }}>
                    {inv.invoice_number}
                    {inv.status === 'cancelled' && <span style={{ fontSize:10, marginLeft:6, color:'#dc2626', fontWeight:600 }}>CANCELLED</span>}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6,
                      background: inv.invoice_type==='sale' ? '#eff6ff' : '#f5f3ff',
                      color: inv.invoice_type==='sale' ? '#1d4ed8' : '#6d28d9' }}>
                      {inv.invoice_type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'var(--gray-600)' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'var(--navy)' }}>{inv.party_name}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'var(--gray-600)' }}>{fmt(inv.taxable_amount)}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'var(--gray-600)' }}>
                    {fmt(parseFloat(inv.cgst_amount||0)+parseFloat(inv.sgst_amount||0)+parseFloat(inv.igst_amount||0))}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:'var(--navy)' }}>{fmt(inv.total_amount)}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20,
                      background: inv.payment_status==='paid' ? '#f0fdf4' : inv.status==='cancelled' ? '#fef2f2' : '#fff7ed',
                      color: inv.payment_status==='paid' ? '#16a34a' : inv.status==='cancelled' ? '#dc2626' : '#ea580c' }}>
                      {inv.status === 'cancelled' ? 'cancelled' : inv.payment_status}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      {/* PDF Download */}
                      <button
                        onClick={() => handleDownloadPDF(inv)}
                        title="Download PDF"
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                        <FileText size={12} /> PDF
                      </button>

                      {/* Pay button */}
                      {inv.payment_status !== 'paid' && inv.status !== 'cancelled' && (
                        <button
                          onClick={() => { setShowPayment(inv); setPayForm({ amount: inv.total_amount, payment_date: new Date().toISOString().split('T')[0], payment_mode:'bank', reference:'' }) }}
                          title="Record Payment"
                          style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'none', background:'linear-gradient(135deg, #C9A84C, #e2c06e)', color:'var(--navy)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                          <CreditCard size={12} /> Pay
                        </button>
                      )}
                      {inv.payment_status === 'paid' && <CheckCircle size={16} color="#16a34a" />}

                      {/* Cancel button */}
                      {inv.status !== 'cancelled' && inv.payment_status !== 'paid' && (
                        <button
                          onClick={() => handleCancelInvoice(inv)}
                          disabled={cancelling === inv.id}
                          title="Cancel Invoice"
                          style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:11, fontWeight:600, cursor: cancelling === inv.id ? 'not-allowed' : 'pointer', fontFamily:'var(--font-body)', opacity: cancelling === inv.id ? 0.5 : 1 }}>
                          <XCircle size={12} /> {cancelling === inv.id ? '...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:32, width:'100%', maxWidth:700, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, color:'var(--navy)' }}>Create Invoice</h2>
              <button onClick={() => setShowForm(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-600)' }}><X size={20}/></button>
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {['sale','purchase'].map(t => (
                <button key={t} onClick={() => setForm({...form, invoice_type:t})} style={{
                  padding:'8px 20px', borderRadius:8, border:'2px solid',
                  borderColor: form.invoice_type===t ? 'var(--navy)' : 'var(--gray-200)',
                  background: form.invoice_type===t ? 'var(--navy)' : 'var(--white)',
                  color: form.invoice_type===t ? 'var(--white)' : 'var(--gray-600)',
                  fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)', textTransform:'capitalize',
                }}>{t}</button>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
              {[
                { label:'Invoice No', key:'invoice_number' },
                { label:'Date', key:'invoice_date', type:'date' },
                { label:'Party Name', key:'party_name' },
                { label:'Party GSTIN', key:'party_gstin' },
                { label:'Party State Code', key:'party_state', placeholder:'e.g. 27' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>{f.label.toUpperCase()}</label>
                  <input type={f.type||'text'} placeholder={f.placeholder||''} value={form[f.key]}
                    onChange={e => setForm({...form, [f.key]:e.target.value})} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* TDS Fields — only for purchases */}
            {form.invoice_type === 'purchase' && (
              <div style={{ background:'#fffbeb', borderRadius:10, padding:'14px 16px', marginBottom:20, border:'1px solid #fde68a' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#92400e', marginBottom:10 }}>TDS Deducted at Source (optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#78350f', display:'block', marginBottom:5 }}>TDS SECTION</label>
                    <select value={form.tds_section} onChange={e=>setForm({...form, tds_section:e.target.value})}
                      style={{ ...inputStyle, background:'#fffef7' }}>
                      <option value=''>None</option>
                      {[['194C','194C — Contractors (1%/2%)'],['194I','194I — Rent (10%)'],['194J','194J — Professional Fees (10%)'],['194A','194A — Interest (10%)'],['194H','194H — Commission (5%)'],['194B','194B — Lottery (30%)']].map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#78350f', display:'block', marginBottom:5 }}>TDS AMOUNT (₹)</label>
                    <input type='number' placeholder='0.00' value={form.tds_amount}
                      onChange={e=>setForm({...form, tds_amount:e.target.value})}
                      style={{ ...inputStyle, background:'#fffef7' }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <label style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>Line Items</label>
                <button onClick={() => setItems([...items, { description:'', hsn_sac_code:'', quantity:1, rate:0, gst_rate:18 }])}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid var(--gold)', color:'var(--gold)', background:'rgba(201,168,76,0.08)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <Plus size={12} /> Add Item
                </button>
              </div>
              {items.map((item, i) => (
                <div key={i} style={{ background:'var(--gray-100)', borderRadius:10, padding:14, marginBottom:10, border:'1px solid var(--gray-200)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.8fr 1fr 1fr 0.7fr auto', gap:10, alignItems:'end' }}>
                    {[
                      { label:'Description', key:'description', type:'text' },
                      { label:'HSN/SAC', key:'hsn_sac_code', type:'text' },
                      { label:'Qty', key:'quantity', type:'number' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:10, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type} value={item[f.key]} onChange={e => updateItem(i, f.key, e.target.value)}
                          style={{ width:'100%', padding:'7px 10px', borderRadius:6, border:'1px solid var(--gray-200)', fontSize:12, fontFamily:'var(--font-body)', background:'var(--white)' }} />
                      </div>
                    ))}
                    {/* Unit dropdown */}
                    <div>
                      <label style={{ fontSize:10, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:4 }}>UNIT</label>
                      <select value={item.unit||'NOS'} onChange={e => updateItem(i, 'unit', e.target.value)}
                        style={{ width:'100%', padding:'7px 6px', borderRadius:6, border:'1px solid var(--gray-200)', fontSize:12, fontFamily:'var(--font-body)', background:'var(--white)' }}>
                        {['NOS','KGS','MTR','LTR','SQM','CBM','HRS','DAYS','PCS','BOX','PKT','SET','PAIR','DOZ','TON'].map(u=>(
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    {[
                      { label:'Rate (₹)', key:'rate', type:'number' },
                      { label:'GST %', key:'gst_rate', type:'number' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:10, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type} value={item[f.key]} onChange={e => updateItem(i, f.key, e.target.value)}
                          style={{ width:'100%', padding:'7px 10px', borderRadius:6, border:'1px solid var(--gray-200)', fontSize:12, fontFamily:'var(--font-body)', background:'var(--white)' }} />
                      </div>
                    ))}
                    <button onClick={() => setItems(items.filter((_,idx)=>idx!==i))}
                      style={{ padding:8, borderRadius:6, border:'none', background:'#fef2f2', color:'#dc2626', cursor:'pointer' }}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'var(--navy)', borderRadius:12, padding:'16px 20px', marginBottom:20, color:'var(--white)' }}>
              {isInter ? (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                  <span>IGST ({items[0]?.gst_rate}%)</span><span>{fmt(igst)}</span>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                    <span>CGST</span><span>{fmt(cgst)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                    <span>SGST</span><span>{fmt(sgst)}</span>
                  </div>
                </>
              )}
              {form.tds_section && parseFloat(form.tds_amount||0)>0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'rgba(255,255,255,0.6)' }}>
                  <span>Less: TDS u/s {form.tds_section}</span>
                  <span style={{color:'#fca5a5'}}>− {fmt(form.tds_amount)}</span>
                </div>
              )}
              <div style={{ borderTop:'1px solid rgba(201,168,76,0.3)', paddingTop:10, marginTop:6, display:'flex', justifyContent:'space-between', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--gold)' }}>
                <span>Net Payable</span>
                <span>{fmt(total - parseFloat(form.tds_amount||0))}</span>
              </div>
            </div>

            {error && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}

            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowForm(false)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:14, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handleCreateInvoice} disabled={submitting} style={{
                flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:12, borderRadius:10, border:'none',
                background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
                color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)',
                opacity: submitting ? 0.7 : 1,
              }}>
                <Send size={16}/> {submitting ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:32, width:'100%', maxWidth:440 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)' }}>Record Payment</h2>
              <button onClick={() => setShowPayment(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-600)' }}><X size={20}/></button>
            </div>

            <div style={{ background:'var(--gray-100)', borderRadius:10, padding:14, marginBottom:20, border:'1px solid var(--gray-200)' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--navy)', marginBottom:4 }}>{showPayment.invoice_number}</div>
              <div style={{ fontSize:12, color:'var(--gray-600)' }}>{showPayment.party_name}</div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--navy)', marginTop:8 }}>{fmt(showPayment.total_amount)}</div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
              {[
                { label:'Amount (₹)', key:'amount', type:'number' },
                { label:'Payment Date', key:'payment_date', type:'date' },
                { label:'Reference (UTR/Cheque)', key:'reference', type:'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>{f.label.toUpperCase()}</label>
                  <input type={f.type} value={payForm[f.key]} onChange={e => setPayForm({...payForm, [f.key]:e.target.value})} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:5 }}>PAYMENT MODE</label>
                <select value={payForm.payment_mode} onChange={e => setPayForm({...payForm, payment_mode:e.target.value})} style={inputStyle}>
                  <option value="bank">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            {error && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}

            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowPayment(null)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:14, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handlePayment} disabled={submitting} style={{
                flex:2, padding:12, borderRadius:10, border:'none',
                background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
                color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)',
                opacity: submitting ? 0.7 : 1,
              }}>
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}