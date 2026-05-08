import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen, Plus, FileText, CheckCircle, Clock, AlertCircle,
  XCircle, ChevronRight, MessageSquare, Bell, Trash2, Edit3,
  Upload, RefreshCw, X, Send, Calendar, Tag, Building
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')

const api = async (endpoint, options = {}) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const PRIORITY_COLORS = {
  low:    { bg: 'rgba(93,202,165,0.12)', color: '#5DCAA5', label: 'Low' },
  normal: { bg: 'rgba(201,168,76,0.12)', color: '#C9A84C', label: 'Normal' },
  high:   { bg: 'rgba(240,153,123,0.12)', color: '#F0997B', label: 'High' },
  urgent: { bg: 'rgba(226,75,74,0.12)', color: '#E24B4A', label: 'Urgent' },
}

const STATUS_COLORS = {
  open:        { bg: 'rgba(55,138,221,0.12)', color: '#378ADD', label: 'Open' },
  in_progress: { bg: 'rgba(201,168,76,0.12)', color: '#C9A84C', label: 'In Progress' },
  completed:   { bg: 'rgba(93,202,165,0.12)', color: '#5DCAA5', label: 'Completed' },
  cancelled:   { bg: 'rgba(136,135,128,0.12)', color: '#888780', label: 'Cancelled' },
}

const ITEM_STATUS = {
  pending:  { icon: Clock,        color: '#888780', label: 'Pending' },
  uploaded: { icon: Upload,       color: '#378ADD', label: 'Uploaded' },
  approved: { icon: CheckCircle,  color: '#5DCAA5', label: 'Approved' },
  rejected: { icon: XCircle,      color: '#E24B4A', label: 'Rejected' },
}

const DOC_TYPES = [
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'invoice',        label: 'Invoice / Bill' },
  { value: 'receipt',        label: 'Receipt / Voucher' },
  { value: 'gst',            label: 'GST Document' },
  { value: 'tds',            label: 'TDS Certificate' },
  { value: 'payroll',        label: 'Payroll / Salary' },
  { value: 'contract',       label: 'Contract / Agreement' },
  { value: 'other',          label: 'Other' },
]

const QUICK_TEMPLATES = [
  {
    title: 'Monthly GST Documents',
    period: 'Monthly',
    items: [
      { document_name: 'Sales Invoices', document_type: 'invoice' },
      { document_name: 'Purchase Bills', document_type: 'invoice' },
      { document_name: 'Bank Statement', document_type: 'bank_statement' },
      { document_name: 'Credit/Debit Notes', document_type: 'gst' },
    ]
  },
  {
    title: 'TDS Filing Documents',
    period: 'Quarterly',
    items: [
      { document_name: 'Payment Vouchers', document_type: 'receipt' },
      { document_name: 'TDS Certificates Received', document_type: 'tds' },
      { document_name: 'Challan Receipts', document_type: 'tds' },
    ]
  },
  {
    title: 'Year-End Audit Pack',
    period: 'Annual',
    items: [
      { document_name: 'All Bank Statements (12 months)', document_type: 'bank_statement' },
      { document_name: 'Fixed Asset Register', document_type: 'other' },
      { document_name: 'Loan Statements', document_type: 'other' },
      { document_name: 'Stock Inventory List', document_type: 'other' },
      { document_name: 'Director Personal Tax Docs', document_type: 'other' },
    ]
  },
]

// LIGHT THEME STYLES (matching Credit Notes page)
const styles = {
  page: { 
    padding: '24px',
    background: 'var(--gray-50)',
    minHeight: '100vh',
    fontFamily: 'var(--font-body, DM Sans, sans-serif)',
    animation: 'fadeUp 0.5s ease'
  },
  card: { 
    background: 'var(--white)', 
    borderRadius: 16, 
    padding: 24, 
    border: '1px solid var(--gray-100)', 
    boxShadow: '0 1px 8px rgba(0,0,0,0.04)' 
  },
  primaryBtn: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: 6, 
    padding: '10px 18px', 
    borderRadius: 10, 
    border: 'none', 
    background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', 
    color: 'var(--navy)', 
    fontSize: 13, 
    fontWeight: 700, 
    cursor: 'pointer', 
    fontFamily: 'var(--font-body)' 
  },
  ghostBtn: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: 6, 
    padding: '8px 14px', 
    borderRadius: 9, 
    border: '1.5px solid var(--gray-200)', 
    background: 'var(--white)', 
    color: 'var(--gray-600)', 
    fontSize: 13, 
    cursor: 'pointer', 
    fontFamily: 'var(--font-body)' 
  },
  input: { 
    width: '100%', 
    padding: '9px 12px', 
    borderRadius: 9, 
    border: '1.5px solid var(--gray-200)', 
    fontSize: 13, 
    fontFamily: 'var(--font-body)', 
    outline: 'none', 
    boxSizing: 'border-box', 
    background: 'var(--white)', 
    color: 'var(--navy)' 
  },
  label: { 
    display: 'block', 
    fontSize: 11, 
    fontWeight: 600, 
    color: 'var(--gray-400)', 
    marginBottom: 4, 
    textTransform: 'uppercase', 
    letterSpacing: '0.5px' 
  },
  overlay: { 
    position: 'fixed', 
    inset: 0, 
    background: 'rgba(0,0,0,0.45)', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    zIndex: 1000, 
    backdropFilter: 'blur(4px)' 
  },
  modal: { 
    background: 'var(--white)', 
    borderRadius: 20, 
    padding: 28, 
    width: '90%', 
    maxWidth: 600, 
    maxHeight: '90vh', 
    overflowY: 'auto', 
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)' 
  },
  modalHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  closeBtn: { 
    background: 'none', 
    border: 'none', 
    cursor: 'pointer', 
    color: 'var(--gray-400)', 
    padding: 4 
  },
  badge: (color, bg) => ({ 
    display: 'inline-flex', 
    alignItems: 'center', 
    padding: '3px 10px', 
    borderRadius: 100, 
    fontSize: 11, 
    fontWeight: 600, 
    color, 
    background: bg 
  }),
  statCard: { 
    background: 'var(--white)', 
    borderRadius: 10, 
    padding: '14px 18px', 
    flex: 1, 
    minWidth: 100,
    border: '1px solid var(--gray-100)'
  },
}

export default function ClientCollabPage() {
  const { user } = useAuth()
  const [companyId, setCompanyId] = useState(null)
  const [companies, setCompanies] = useState([])
  const [requests, setRequests] = useState([])
  const [summary, setSummary] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [comment, setComment] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  // Create form state
  const [form, setForm] = useState({ title: '', description: '', due_date: '', priority: 'normal', period: '', items: [] })
  const [newItem, setNewItem] = useState({ document_name: '', document_type: 'other', is_required: true })

  useEffect(() => {
    fetch(`${BASE_URL}/companies`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.companies || [])
        setCompanies(list)
        if (list.length > 0) setCompanyId(list[0].id)
      }).catch(console.error)
  }, [])

  const loadRequests = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [reqs, summ, notifs] = await Promise.all([
        api(`/client-collab/requests?company_id=${companyId}`),
        api(`/client-collab/summary?company_id=${companyId}`),
        api(`/client-collab/notifications?unread_only=true`),
      ])
      setRequests(reqs)
      setSummary(summ)
      setNotifications(notifs)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { loadRequests() }, [loadRequests])

  const loadSelected = async (id) => {
    try {
      const data = await api(`/client-collab/requests/${id}`)
      setSelected(data)
    } catch (err) { console.error(err) }
  }

  const handleCreate = async () => {
    if (!form.title) return
    try {
      await api('/client-collab/requests', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, ...form })
      })
      setShowCreate(false)
      setForm({ title: '', description: '', due_date: '', priority: 'normal', period: '', items: [] })
      loadRequests()
    } catch (err) { alert(err.message) }
  }

  const applyTemplate = (tpl) => {
    setForm(f => ({ ...f, title: tpl.title, period: tpl.period, items: [...tpl.items] }))
  }

  const addItem = () => {
    if (!newItem.document_name) return
    setForm(f => ({ ...f, items: [...f.items, { ...newItem }] }))
    setNewItem({ document_name: '', document_type: 'other', is_required: true })
  }

  const removeFormItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const updateItemStatus = async (itemId, status) => {
    try {
      await api(`/client-collab/items/${itemId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      loadSelected(selected.id)
      loadRequests()
    } catch (err) { alert(err.message) }
  }

  const sendComment = async () => {
    if (!comment.trim() || !selected) return
    try {
      await api(`/client-collab/requests/${selected.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message: comment })
      })
      setComment('')
      loadSelected(selected.id)
    } catch (err) { alert(err.message) }
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete this request?')) return
    try {
      await api(`/client-collab/requests/${id}`, { method: 'DELETE' })
      setSelected(null)
      loadRequests()
    } catch (err) { alert(err.message) }
  }

  const markNotifsRead = async () => {
    await api('/client-collab/notifications/mark-read', { method: 'PATCH' })
    setNotifications([])
  }

  const filtered = requests.filter(r => {
    if (activeTab === 'all') return true
    if (activeTab === 'open') return r.status === 'open'
    if (activeTab === 'in_progress') return r.status === 'in_progress'
    if (activeTab === 'completed') return r.status === 'completed'
    return true
  })

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
  ]

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
            Client Collaboration
          </h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Request, track, and manage documents from clients</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Company selector */}
          {companies.length > 1 && (
            <select
              value={companyId || ''}
              onChange={e => setCompanyId(Number(e.target.value))}
              style={{ ...styles.input, width: 200 }}
            >
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Notifications bell */}
          <div style={{ position: 'relative' }}>
            <button style={{ ...styles.ghostBtn, position: 'relative' }} onClick={() => { setShowNotifs(!showNotifs); if (notifications.length) markNotifsRead() }}>
              <Bell size={15} />
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: '#E24B4A', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  {notifications.length}
                </span>
              )}
            </button>
            {showNotifs && (
              <div style={{ position: 'absolute', right: 0, top: 44, width: 320, background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 16, zIndex: 50, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Notifications</div>
                {notifications.length === 0
                  ? <div style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '12px 0' }}>All caught up</div>
                  : notifications.map(n => (
                    <div key={n.id} style={{ fontSize: 12, color: 'var(--gray-600)', padding: '8px 0', borderBottom: '1px solid var(--gray-100)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{n.request_title}</span><br />{n.message}
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          <button style={styles.primaryBtn} onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Request
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Open', val: summary.open_requests, color: '#378ADD' },
            { label: 'In Progress', val: summary.in_progress, color: '#C9A84C' },
            { label: 'Completed', val: summary.completed, color: '#5DCAA5' },
            { label: 'Overdue', val: summary.overdue, color: '#E24B4A' },
            { label: 'Docs Pending', val: summary.pending_docs, color: '#888780' },
            { label: 'Docs Approved', val: summary.approved_docs, color: '#5DCAA5' },
          ].map(item => (
            <div key={item.label} style={styles.statCard}>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.val || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--gray-200)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 18px', border: 'none', background: 'transparent',
            color: activeTab === t.key ? 'var(--navy)' : 'var(--gray-500)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Two-column layout: list + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap: 20 }}>

        {/* Request list */}
        <div>
          {loading && <div style={{ color: 'var(--gray-400)', fontSize: 13, padding: 20, textAlign: 'center' }}>Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)' }}>
              <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 14 }}>No requests yet</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Create your first document request</div>
            </div>
          )}

          {filtered.map(r => {
            const prio = PRIORITY_COLORS[r.priority] || PRIORITY_COLORS.normal
            const stat = STATUS_COLORS[r.status] || STATUS_COLORS.open
            const progress = r.total_items > 0 ? Math.round((parseInt(r.approved_items) / parseInt(r.total_items)) * 100) : 0
            const isActive = selected?.id === r.id

            return (
              <div key={r.id}
                onClick={() => { setSelected(null); loadSelected(r.id) }}
                style={{ 
                  ...styles.card, 
                  borderColor: isActive ? 'var(--gold)' : 'var(--gray-100)',
                  cursor: 'pointer',
                  marginBottom: 14,
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', flex: 1 }}>{r.title}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={styles.badge(prio.color, prio.bg)}>{prio.label}</span>
                    <span style={styles.badge(stat.color, stat.bg)}>{stat.label}</span>
                  </div>
                </div>

                {r.period && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 8 }}><Tag size={10} style={{ marginRight: 4 }} />{r.period}</div>}

                {r.due_date && (
                  <div style={{ fontSize: 11, color: new Date(r.due_date) < new Date() && r.status !== 'completed' ? '#E24B4A' : 'var(--gray-400)', marginBottom: 10 }}>
                    <Calendar size={10} style={{ marginRight: 4 }} />Due: {new Date(r.due_date).toLocaleDateString('en-IN')}
                  </div>
                )}

                {/* Progress bar */}
                {parseInt(r.total_items) > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>
                      <span>{r.approved_items}/{r.total_items} docs approved</span>
                      <span>{progress}%</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#9A7A35,#C9A84C)', borderRadius: 10, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--gray-400)' }}>
                  <span><FileText size={10} style={{ marginRight: 3 }} />{r.total_items} items</span>
                  {parseInt(r.pending_items) > 0 && <span style={{ color: '#F0997B' }}><Clock size={10} style={{ marginRight: 3 }} />{r.pending_items} pending</span>}
                  {parseInt(r.uploaded_items) > 0 && <span style={{ color: '#378ADD' }}><Upload size={10} style={{ marginRight: 3 }} />{r.uploaded_items} uploaded</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ ...styles.card, maxHeight: '80vh', overflowY: 'auto' }}>
            {/* Detail header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{selected.title}</div>
                {selected.period && <div style={{ fontSize: 12, color: 'var(--gold)' }}>{selected.period}</div>}
                {selected.description && <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 6, lineHeight: 1.5 }}>{selected.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => deleteRequest(selected.id)} style={{ ...styles.ghostBtn, padding: '6px 10px' }}><Trash2 size={13} /></button>
                <button onClick={() => setSelected(null)} style={{ ...styles.ghostBtn, padding: '6px 10px' }}><X size={13} /></button>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '20px 0' }} />

            {/* Checklist items */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 12 }}>
              Document Checklist
            </div>

            {selected.items?.map(item => {
              const ist = ITEM_STATUS[item.status] || ITEM_STATUS.pending
              const IstIcon = ist.icon
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--gray-100)' }}>
                  <IstIcon size={15} style={{ color: ist.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{item.document_name}</div>
                    {item.document_type && item.document_type !== 'other' && (
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{DOC_TYPES.find(d => d.value === item.document_type)?.label || item.document_type}</div>
                    )}
                    {item.notes && <div style={{ fontSize: 11, color: '#F0997B', marginTop: 2 }}>{item.notes}</div>}
                    {item.file_name && <div style={{ fontSize: 11, color: '#378ADD', marginTop: 2 }}>{item.file_name}</div>}
                  </div>
                  {!item.is_required && <span style={styles.badge('var(--gray-400)', 'var(--gray-100)')}>Optional</span>}
                  {/* Action buttons based on current status */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {item.status === 'uploaded' && (
                      <>
                        <button onClick={() => updateItemStatus(item.id, 'approved')} style={{ padding: '4px 10px', background: 'rgba(93,202,165,0.12)', border: '1px solid rgba(93,202,165,0.3)', color: '#5DCAA5', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => updateItemStatus(item.id, 'rejected')} style={{ padding: '4px 10px', background: 'rgba(226,75,74,0.12)', border: '1px solid rgba(226,75,74,0.3)', color: '#E24B4A', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
                      </>
                    )}
                    {item.status === 'pending' && (
                      <button onClick={() => updateItemStatus(item.id, 'uploaded')} style={{ padding: '4px 10px', background: 'rgba(55,138,221,0.12)', border: '1px solid rgba(55,138,221,0.3)', color: '#378ADD', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Mark Uploaded</button>
                    )}
                    {item.status === 'rejected' && (
                      <button onClick={() => updateItemStatus(item.id, 'pending')} style={{ padding: '4px 10px', background: 'var(--gray-100)', border: '1px solid var(--gray-200)', color: 'var(--gray-600)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Reset</button>
                    )}
                  </div>
                </div>
              )
            })}

            {selected.items?.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>No checklist items yet</div>
            )}

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '20px 0' }} />

            {/* Comments / thread */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 12 }}>
              <MessageSquare size={12} style={{ marginRight: 4 }} />Thread
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {selected.comments?.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '12px 0' }}>No comments yet</div>
              )}
              {selected.comments?.map(c => (
                <div key={c.id} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--gray-100)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{c.user_name || 'CA'}</span>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>{c.message}</div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                placeholder="Add a note or message..."
                style={{ ...styles.input, flex: 1 }}
              />
              <button onClick={sendComment} style={styles.primaryBtn}><Send size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div style={styles.overlay} onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
                New Document Request
              </span>
              <button onClick={() => setShowCreate(false)} style={styles.closeBtn}><X size={18} /></button>
            </div>

            {/* Quick templates */}
            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>Quick Templates</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {QUICK_TEMPLATES.map(tpl => (
                  <button key={tpl.title} onClick={() => applyTemplate(tpl)} style={{ ...styles.ghostBtn, fontSize: 12, padding: '6px 12px' }}>
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '20px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={styles.label}>Request Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. March 2025 GST Documents" style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Period</label>
                <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="e.g. March 2025" style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Priority</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={styles.input}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={styles.label}>Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Any notes for the client..." rows={2} style={{ ...styles.input, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '20px 0' }} />

            {/* Checklist items */}
            <label style={styles.label}>Document Checklist</label>

            {form.items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 8 }}>
                <CheckCircle size={13} style={{ color: '#5DCAA5', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--navy)' }}>{item.document_name}</span>
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{DOC_TYPES.find(d => d.value === item.document_type)?.label}</span>
                <button onClick={() => removeFormItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer' }}><X size={13} /></button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={newItem.document_name}
                onChange={e => setNewItem(n => ({ ...n, document_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Add document name..."
                style={{ ...styles.input, flex: 1 }}
              />
              <select value={newItem.document_type} onChange={e => setNewItem(n => ({ ...n, document_type: e.target.value }))} style={{ ...styles.input, width: 150 }}>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <button onClick={addItem} style={{ ...styles.ghostBtn, padding: '8px 14px' }}><Plus size={14} /></button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowCreate(false)} style={styles.ghostBtn}>Cancel</button>
              <button onClick={handleCreate} style={styles.primaryBtn}><Plus size={14} /> Create Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}