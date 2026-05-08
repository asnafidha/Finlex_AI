import { useState, useEffect } from 'react'
import { Plus, Trash2, Download, Send, CheckCircle, CreditCard, X, XCircle,
         FileText, TrendingUp, AlertCircle, ChevronDown, ChevronUp, Shield } from 'lucide-react'
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
  const [allInvoices, setAllInvoices] = useState([])  // always full list for stats
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [showReview, setShowReview]   = useState(false)   // Feature M: Review Screen
  const [showPayment, setShowPayment] = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState('')
  const [error, setError]             = useState('')
  const [cancelling, setCancelling]   = useState(null)
  const [showTable, setShowTable]     = useState(true)
  const [toast, setToast]             = useState(null)
  const [alreadyPaid, setAlreadyPaid] = useState(0)  // tracks partial payments

  const showToast = (msg, detail, type = 'success') => {
    setToast({ msg, detail, type })
    setTimeout(() => setToast(null), 4000)
  }

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
      // Always fetch ALL invoices for correct stats regardless of active tab
      const all = await invoicesApi.list(company.id, null)
      setAllInvoices(all)
      // Filter display list based on active tab
      const type = activeTab === 'sales' ? 'sale' : activeTab === 'purchases' ? 'purchase' : null
      setInvoiceList(type ? all.filter(i => i.invoice_type === type) : all)
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

  // ── Feature N: Smart Warnings ─────────────────────────────────
  const smartWarnings = []

  // Warning: GST mismatch — party_state set but GSTIN missing
  if (form.party_state && !form.party_gstin && form.invoice_type === 'sale') {
    smartWarnings.push({ type: 'warn', msg: '⚠ State code provided but GSTIN missing — unregistered B2C party?' })
  }
  // Warning: GSTIN provided but no state code
  if (form.party_gstin && !form.party_state) {
    const gstinState = form.party_gstin.substring(0, 2)
    if (/^\d{2}$/.test(gstinState)) {
      smartWarnings.push({ type: 'info', msg: `ℹ State code auto-detectable from GSTIN: ${gstinState}` })
    }
  }
  // Warning: inter-state but GST showing as CGST/SGST (state mismatch)
  if (form.party_gstin && form.party_state && company?.state_code) {
    const gstinState = form.party_gstin.substring(0, 2)
    if (gstinState !== form.party_state) {
      smartWarnings.push({ type: 'error', msg: `⚠ GST mismatch — GSTIN starts with ${gstinState} but Party State Code is ${form.party_state}` })
    }
  }
  // Warning: TDS applicable (professional fees / rent) but TDS not filled
  if (form.invoice_type === 'purchase' && !form.tds_section) {
    const tdsKeywords = ['rent', 'professional', 'legal', 'consultant', 'advocate', 'ca fee', 'audit', 'contract', 'labour', 'commission']
    const descText = items.map(i => (i.description || '').toLowerCase()).join(' ')
    const partyText = (form.party_name || '').toLowerCase()
    const hasTdsKeyword = tdsKeywords.some(kw => descText.includes(kw) || partyText.includes(kw))
    if (hasTdsKeyword && subtotal >= 30000) {
      smartWarnings.push({ type: 'warn', msg: '⚠ TDS applicable but not filled — this vendor/service may require TDS deduction' })
    }
  }
  // Warning: large invoice with no GSTIN
  if (!form.party_gstin && total > 250000) {
    smartWarnings.push({ type: 'warn', msg: '⚠ Invoice value > ₹2.5L with no GSTIN — this will appear in B2CL in GSTR-1' })
  }
  // Warning: missing invoice number
  if (!form.invoice_number.trim()) {
    smartWarnings.push({ type: 'error', msg: '⚠ Invoice number is required' })
  }
  // Warning: no line items with description
  if (items.some(i => !i.description.trim())) {
    smartWarnings.push({ type: 'warn', msg: '⚠ Some line items have empty description' })
  }

  // ── Feature I: Auto Account hints per line item ────────────────
  const AUTO_ACCOUNT_HINTS = [
    { keywords: ['rent','lease'], name: 'Rent (5102)' },
    { keywords: ['salary','wages','payroll'], name: 'Salaries & Wages (5101)' },
    { keywords: ['electricity','power','eb'], name: 'Electricity (5103)' },
    { keywords: ['internet','broadband','phone','mobile'], name: 'Internet & Phone (5104)' },
    { keywords: ['professional','legal','advocate','ca fee','audit','consultant'], name: 'Professional Fees (5107)' },
    { keywords: ['software','saas','subscription','license'], name: 'Misc Expense (5112)' },
    { keywords: ['travel','conveyance','fuel','petrol','cab'], name: 'Travel & Conveyance (5106)' },
    { keywords: ['office','stationery','supplies','printing'], name: 'Office Supplies (5105)' },
    { keywords: ['purchase','raw material','goods','stock'], name: 'Purchases (5001)' },
    { keywords: ['service','consulting'], name: 'Service Revenue (4002)' },
  ]
  const getAccountHint = (desc) => {
    if (!desc) return null
    const lower = desc.toLowerCase()
    const match = AUTO_ACCOUNT_HINTS.find(r => r.keywords.some(kw => lower.includes(kw)))
    return match ? match.name : null
  }

  // ── Open review screen (Feature M) ────────────────────────────
  const handleReviewAndConfirm = () => {
    setError('')
    const blockingErrors = smartWarnings.filter(w => w.type === 'error')
    if (blockingErrors.length > 0) {
      setError(blockingErrors.map(e => e.msg).join(' • '))
      return
    }
    setShowReview(true)
  }

  const handleCreateInvoice = async () => {
    setSubmitting(true); setError('')
    try {
      const inv = await invoicesApi.create({ company_id: company.id, ...form, items })
      showToast('Invoice created', `${form.invoice_number || 'Invoice'} · ₹${total.toLocaleString('en-IN')} · Journal entry posted`)
      setShowForm(false)
      setShowReview(false)
      setForm({ invoice_type:'sale', invoice_number:'', invoice_date: new Date().toISOString().split('T')[0], party_name:'', party_gstin:'', party_state:'', notes:'', tds_section:'', tds_amount:'' })
      setItems([{ description:'', hsn_sac_code:'', quantity:1, unit:'NOS', rate:0, gst_rate:18 }])
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally { setSubmitting(false) }
  }

  const handlePayment = async () => {
    setSubmitting(true); setError('')
    try {
      await paymentsApi.create({
        company_id: company.id,
        payment_type: showPayment.invoice_type === 'sale' ? 'received' : 'made',
        invoice_id: showPayment.id,
        ...payForm,
      })
      const amt = parseFloat(payForm.amount || 0)
      showToast('Payment recorded', `₹${amt.toLocaleString('en-IN')} ${showPayment.invoice_type === 'sale' ? 'received from' : 'paid to'} ${showPayment.party_name}`)
      setShowPayment(null)
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally { setSubmitting(false) }
  }

  const handleCancelInvoice = async (inv) => {
    if (!window.confirm(`Cancel invoice ${inv.invoice_number}? This will reverse all journal entries.`)) return
    setCancelling(inv.id)
    setError('')
    try {
      const res = await fetch(`${BASE_URL}/invoices/${inv.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cancel failed')
      showToast('Invoice cancelled', `${inv.invoice_number} reversed — journal entries undone`)
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

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:24, right:24, zIndex:2000, background: toast.type==='success'?'#f0fdf4':'#fef2f2', border:`1px solid ${toast.type==='success'?'#bbf7d0':'#fecaca'}`, borderRadius:12, padding:'13px 16px', minWidth:280, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', display:'flex', alignItems:'flex-start', gap:10, animation:'fadeUp 0.3s ease' }}>
          <CheckCircle size={15} color={toast.type==='success'?'#16a34a':'#dc2626'} style={{ flexShrink:0, marginTop:1 }}/>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:toast.type==='success'?'#15803d':'#dc2626' }}>{toast.msg}</div>
            {toast.detail && <div style={{ fontSize:12, color:toast.type==='success'?'#166534':'#7f1d1d', marginTop:2 }}>{toast.detail}</div>}
          </div>
          <button onClick={()=>setToast(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-400)', marginLeft:'auto', padding:0, flexShrink:0 }}><X size={13}/></button>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, color:'var(--navy)', marginBottom:2 }}>GST Filing & Invoicing</h1>
          <p style={{ color:'var(--gray-600)', fontSize:14 }}>Manage invoices, GST calculations and payments</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:9, border:'none', background:'linear-gradient(135deg, #C9A84C, #e2c06e)', color:'var(--navy)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
          <Plus size={15} /> New Invoice
        </button>
      </div>

      {/* GST Summary Cards */}
      {(() => {
        const sales     = allInvoices.filter(i => i.invoice_type==='sale' && i.status!=='cancelled')
        const purchases = allInvoices.filter(i => i.invoice_type==='purchase' && i.status!=='cancelled')
        const totalRevenue   = sales.reduce((s,i) => s + parseFloat(i.total_amount||0), 0)
        const totalGSTOut    = sales.reduce((s,i) => s + parseFloat(i.cgst_amount||0)+parseFloat(i.sgst_amount||0)+parseFloat(i.igst_amount||0), 0)
        const totalITC       = purchases.reduce((s,i) => s + parseFloat(i.cgst_amount||0)+parseFloat(i.sgst_amount||0)+parseFloat(i.igst_amount||0), 0)
        const netGST         = totalGSTOut - totalITC
        const unpaidSales    = sales.filter(i => i.payment_status!=='paid')
        const unpaidAmt      = unpaidSales.reduce((s,i) => s + parseFloat(i.total_amount||0), 0)
        const riskLevel      = netGST > 50000 ? 'High' : netGST > 10000 ? 'Medium' : 'Low'
        const riskColor      = netGST > 50000 ? '#dc2626' : netGST > 10000 ? '#ca8a04' : '#16a34a'

        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:13, marginBottom:22 }}>
            {[
              { label:'Total Revenue', value: fmt(totalRevenue), sub:`${sales.length} invoices`, Icon:TrendingUp, color:'#3b82f6', bg:'#eff6ff' },
              { label:'GST Payable', value: fmt(Math.max(0, netGST)), sub:`Risk: ${riskLevel}`, Icon:AlertCircle, color:riskColor, bg: netGST>50000?'#fef2f2':netGST>10000?'#fffbeb':'#f0fdf4' },
              { label:'ITC Available', value: fmt(totalITC), sub:'Input tax credit', Icon:CheckCircle, color:'#16a34a', bg:'#f0fdf4' },
              { label: unpaidAmt > 0 ? fmt(unpaidAmt)+' stuck' : 'All collected', value: unpaidAmt>0?`${unpaidSales.length} unpaid`:'Clear', sub: unpaidAmt>0?'Receivables pending':'No outstanding', Icon:CreditCard, color:unpaidAmt>0?'#f59e0b':'#16a34a', bg:unpaidAmt>0?'#fffbeb':'#f0fdf4' },
            ].map((s,i) => (
              <div key={i} style={{ background:'var(--white)', borderRadius:12, padding:'14px 16px', border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <span style={{ fontSize:11, color:'var(--gray-500)', fontWeight:500 }}>{s.label}</span>
                  <div style={{ width:28, height:28, borderRadius:7, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <s.Icon size={13} color={s.color}/>
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--navy)', marginBottom:2 }}>{s.value}</div>
                <div style={{ fontSize:11, color:'var(--gray-400)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {error && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'11px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}

      <div style={{ display:'flex', gap:4, marginBottom:16, background:'var(--white)', borderRadius:11, padding:4, width:'fit-content', border:'1px solid var(--gray-200)' }}>
        {[['invoices','All Invoices'],['sales','Sales'],['purchases','Purchases']].map(([t,l]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:activeTab===t?'var(--navy)':'transparent', color:activeTab===t?'var(--white)':'var(--gray-600)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>{l}</button>
        ))}
      </div>

      {/* Collapsible table header */}
      <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--gray-200)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
        <button
          onClick={() => setShowTable(t => !t)}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:'var(--gray-100)', border:'none', borderBottom: showTable?'1px solid var(--gray-200)':'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>
            Invoice Details ({invoiceList.length} invoices)
          </span>
          {showTable ? <ChevronUp size={15} color="var(--gray-500)"/> : <ChevronDown size={15} color="var(--gray-500)"/>}
        </button>

        {showTable && (loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--gray-400)', fontSize:13 }}>Loading invoices...</div>
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
                          onClick={async () => {
                            setShowPayment(inv)
                            // Fetch already paid amount for partial payment display
                            try {
                              const res = await fetch(`${BASE_URL}/payments?company_id=${company.id}`, {
                                headers: { 'Authorization': `Bearer ${getToken()}` }
                              })
                              const payments = await res.json()
                              const paid = payments
                                .filter(p => p.invoice_id === inv.id)
                                .reduce((s, p) => s + parseFloat(p.debit_amount || p.credit_amount || 0), 0)
                              const remaining = parseFloat(inv.total_amount) - paid
                              setAlreadyPaid(paid)
                              setPayForm({ amount: remaining.toFixed(2), payment_date: new Date().toISOString().split('T')[0], payment_mode:'bank', reference:'' })
                            } catch {
                              setAlreadyPaid(0)
                              setPayForm({ amount: inv.total_amount, payment_date: new Date().toISOString().split('T')[0], payment_mode:'bank', reference:'' })
                            }
                          }}
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
        ))}
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
                        {/* Feature I: Auto Account Hint */}
                        {f.key === 'description' && getAccountHint(item.description) && (
                          <div style={{ fontSize:10, color:'#0369a1', marginTop:3, display:'flex', alignItems:'center', gap:3 }}>
                            <span>→</span> <span style={{ fontWeight:600 }}>{getAccountHint(item.description)}</span>
                          </div>
                        )}
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

            {/* Feature N: Smart Warnings */}
            {smartWarnings.length > 0 && (
              <div style={{ marginBottom:14 }}>
                {smartWarnings.map((w, i) => (
                  <div key={i} style={{
                    display:'flex', alignItems:'flex-start', gap:8,
                    padding:'8px 12px', borderRadius:8, marginBottom:6, fontSize:12, fontWeight:500,
                    background: w.type === 'error' ? '#fef2f2' : w.type === 'warn' ? '#fffbeb' : '#eff6ff',
                    color:      w.type === 'error' ? '#b91c1c' : w.type === 'warn' ? '#92400e' : '#1e40af',
                    border:     `1px solid ${w.type === 'error' ? '#fecaca' : w.type === 'warn' ? '#fde68a' : '#bfdbfe'}`,
                  }}>
                    {w.msg}
                  </div>
                ))}
              </div>
            )}

            {error && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}

            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowForm(false)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:14, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handleReviewAndConfirm} disabled={submitting} style={{
                flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:12, borderRadius:10, border:'none',
                background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
                color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)',
                opacity: submitting ? 0.7 : 1,
              }}>
                <Shield size={16}/> Review &amp; Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature M: Review Screen Modal */}
      {showReview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--white)', borderRadius:20, padding:32, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--navy)', display:'flex', alignItems:'center', gap:8 }}>
                <Shield size={20} style={{ color:'var(--gold)' }}/> Confirm Invoice
              </h2>
              <button onClick={() => setShowReview(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--gray-600)' }}><X size={20}/></button>
            </div>

            {/* Summary Table */}
            <div style={{ background:'var(--gray-100)', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:12, letterSpacing:1 }}>INVOICE SUMMARY</div>
              {[
                ['Type',         form.invoice_type.toUpperCase()],
                ['Invoice No',   form.invoice_number || '—'],
                ['Date',         form.invoice_date],
                ['Party',        form.party_name || '—'],
                ['GSTIN',        form.party_gstin || 'Not provided (B2C)'],
                ['State',        form.party_state ? (form.party_state === company?.state_code ? `${form.party_state} (Intra-state → CGST+SGST)` : `${form.party_state} (Inter-state → IGST)`) : '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--gray-200)', fontSize:13 }}>
                  <span style={{ color:'var(--gray-600)', fontWeight:500 }}>{k}</span>
                  <span style={{ fontWeight:600, color:'var(--navy)' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Line Items */}
            <div style={{ background:'var(--gray-100)', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:10, letterSpacing:1 }}>LINE ITEMS ({items.length})</div>
              {items.map((it, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--gray-200)', fontSize:12 }}>
                  <div>
                    <div style={{ fontWeight:600, color:'var(--navy)' }}>{it.description || '(no description)'}</div>
                    <div style={{ color:'var(--gray-600)', fontSize:11 }}>{it.quantity} × {fmt(it.rate)} @ {it.gst_rate}% GST</div>
                    {getAccountHint(it.description) && (
                      <div style={{ color:'#0369a1', fontSize:10, marginTop:2 }}>→ {getAccountHint(it.description)}</div>
                    )}
                  </div>
                  <span style={{ fontWeight:700, color:'var(--navy)' }}>{fmt(it.quantity * it.rate * (1 + it.gst_rate/100))}</span>
                </div>
              ))}
            </div>

            {/* GST + TDS + Net breakdown */}
            <div style={{ background:'var(--navy)', borderRadius:12, padding:'14px 18px', marginBottom:16, color:'var(--white)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'rgba(201,168,76,0.8)', marginBottom:10, letterSpacing:1 }}>FINANCIALS</div>
              {[
                ['Taxable Amount', fmt(subtotal)],
                ...(isInter
                  ? [['IGST', fmt(igst)]]
                  : [['CGST', fmt(cgst)], ['SGST', fmt(sgst)]]
                ),
                ...(form.tds_section && parseFloat(form.tds_amount||0) > 0
                  ? [[`TDS u/s ${form.tds_section}`, `− ${fmt(form.tds_amount)}`]]
                  : []
                ),
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.75)', marginBottom:6 }}>
                  <span>{k}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ borderTop:'1px solid rgba(201,168,76,0.3)', paddingTop:10, marginTop:4, display:'flex', justifyContent:'space-between', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--gold)' }}>
                <span>Net Payable</span>
                <span>{fmt(total - parseFloat(form.tds_amount||0))}</span>
              </div>
            </div>

            {/* Non-blocking warnings in review too */}
            {smartWarnings.filter(w => w.type === 'warn' || w.type === 'info').length > 0 && (
              <div style={{ marginBottom:14 }}>
                {smartWarnings.filter(w => w.type !== 'error').map((w, i) => (
                  <div key={i} style={{
                    padding:'8px 12px', borderRadius:8, marginBottom:6, fontSize:12, fontWeight:500,
                    background: w.type === 'warn' ? '#fffbeb' : '#eff6ff',
                    color:      w.type === 'warn' ? '#92400e' : '#1e40af',
                    border:     `1px solid ${w.type === 'warn' ? '#fde68a' : '#bfdbfe'}`,
                  }}>{w.msg}</div>
                ))}
              </div>
            )}

            {error && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}

            <div style={{ display:'flex', gap:12 }}>
              <button onClick={() => setShowReview(false)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--gray-200)', background:'var(--gray-100)', color:'var(--gray-600)', fontSize:14, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                ← Edit
              </button>
              <button onClick={handleCreateInvoice} disabled={submitting} style={{
                flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:12, borderRadius:10, border:'none',
                background:'linear-gradient(135deg, #C9A84C, #e2c06e)',
                color:'var(--navy)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)',
                opacity: submitting ? 0.7 : 1,
              }}>
                <Send size={16}/> {submitting ? 'Posting...' : 'Post Invoice'}
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
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
                <div>
                  <div style={{ fontSize:10, color:'var(--gray-400)', fontWeight:600 }}>INVOICE TOTAL</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--navy)' }}>{fmt(showPayment.total_amount)}</div>
                </div>
                {alreadyPaid > 0 && (
                  <>
                    <div>
                      <div style={{ fontSize:10, color:'var(--gray-400)', fontWeight:600 }}>ALREADY PAID</div>
                      <div style={{ fontSize:15, fontWeight:700, color:'#16a34a' }}>{fmt(alreadyPaid)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'var(--gray-400)', fontWeight:600 }}>REMAINING</div>
                      <div style={{ fontSize:15, fontWeight:700, color:'#dc2626' }}>{fmt(parseFloat(showPayment.total_amount) - alreadyPaid)}</div>
                    </div>
                  </>
                )}
              </div>
              {alreadyPaid > 0 && (
                <div style={{ marginTop:8, fontSize:11, background:'#fffbeb', color:'#92400e', padding:'6px 10px', borderRadius:6, fontWeight:600 }}>
                  ⚡ Partial payment — enter any amount up to remaining balance
                </div>
              )}
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