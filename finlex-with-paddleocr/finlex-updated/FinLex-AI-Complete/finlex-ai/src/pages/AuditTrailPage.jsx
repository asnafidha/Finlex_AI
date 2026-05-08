import { useState, useEffect } from 'react'
import { Shield, RefreshCw, Search, User, Clock } from 'lucide-react'
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

// ALL possible action types including AI ones
const ACTION_COLORS = {
  CREATE:                    { bg: '#ecfdf5', color: '#16a34a' },
  UPDATE:                    { bg: '#eff6ff', color: '#1d4ed8' },
  DELETE:                    { bg: '#fef2f2', color: '#dc2626' },
  LOGIN:                     { bg: '#f5f3ff', color: '#6d28d9' },
  EXPORT:                    { bg: '#fffbeb', color: '#92400e' },
  AI_DOCUMENT_INGESTED:      { bg: '#fdf4ff', color: '#7e22ce' },
  BANK_STATEMENT_IMPORTED:   { bg: '#f0f9ff', color: '#0369a1' },
  INVOICE_CANCELLED:         { bg: '#fef2f2', color: '#dc2626' },
}

const getActionColor = (action) =>
  ACTION_COLORS[action] || { bg: '#f4f6fb', color: '#4a5578' }

const getActionLabel = (action) => {
  const labels = {
    AI_DOCUMENT_INGESTED:    'AI Ingested',
    BANK_STATEMENT_IMPORTED: 'Bank Import',
    INVOICE_CANCELLED:       'Cancelled',
  }
  return labels[action] || action
}

export default function AuditTrailPage() {
  const { company }             = useAuth()
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => { if (company?.id) loadLogs() }, [company])

  const loadLogs = async () => {
    setLoading(true); setError('')
    try {
      const data = await request(`/audit-trail?company_id=${company.id}&limit=200`)
      setLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setLogs([])
    } finally { setLoading(false) }
  }

  // Get unique action types for filter tabs
  const actionTypes = ['all', ...new Set(logs.map(l => l.action).filter(Boolean))]

  const filtered = logs.filter(l => {
    const matchSearch = !search ||
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.table_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(l.new_values || {}).toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || l.action === filter
    return matchSearch && matchFilter
  })

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setFilter(id)} style={{
      padding: '7px 14px', borderRadius: 7, border: 'none',
      background: filter === id ? 'var(--navy)' : 'var(--white)',
      color: filter === id ? 'var(--white)' : 'var(--gray-600)',
      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
      whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Audit Trail</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Complete log of every action in your books</p>
        </div>
        <button onClick={loadLogs} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
          borderRadius: 10, border: '1.5px solid var(--gray-200)', background: 'var(--white)',
          color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--white)', borderRadius: 10, padding: 4, border: '1px solid var(--gray-200)', flexWrap: 'wrap' }}>
          {actionTypes.map(id => tabBtn(id, id === 'all' ? 'All' : getActionLabel(id)))}
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by action, table, user or data..."
            style={{
              width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
              border: '1.5px solid var(--gray-200)', fontSize: 13,
              fontFamily: 'var(--font-body)', color: 'var(--navy)',
              background: 'var(--white)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{filtered.length} records</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading audit log...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 60, textAlign: 'center', border: '1px solid var(--gray-200)' }}>
          <Shield size={48} color="var(--gray-400)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>No audit logs yet</div>
          <div style={{ fontSize: 14, color: 'var(--gray-400)' }}>Every action — invoice creation, document ingestion, bank imports — will appear here</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
          {/* Log table */}
          <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy)' }}>
                  {['Action', 'Table', 'Details', 'User', 'Time'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => {
                  const ac = getActionColor(log.action)
                  // Parse new_values for a summary line
                  let summary = ''
                  try {
                    const nv = typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values
                    if (nv?.vendor)      summary = `${nv.vendor} — ₹${parseFloat(nv.amount||0).toLocaleString('en-IN')}`
                    else if (nv?.file_name) summary = nv.file_name
                    else if (nv?.transactions_processed !== undefined) summary = `${nv.transactions_processed} transactions`
                  } catch { summary = '' }

                  return (
                    <tr key={i}
                      onClick={() => setSelected(selected?.id === log.id ? null : log)}
                      style={{
                        background: selected?.id === log.id ? '#f0f4ff' : i%2===0 ? 'var(--white)' : 'var(--gray-100)',
                        borderBottom: '1px solid var(--gray-200)', cursor: 'pointer',
                      }}>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: ac.bg, color: ac.color, whiteSpace: 'nowrap' }}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-mono)' }}>{log.table_name || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{summary || (log.record_id ? `ID: ${log.record_id}` : '—')}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={12} color="var(--gold)" />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{log.user_name || 'System'}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{log.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          {new Date(log.created_at).toLocaleString('en-IN')}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', position: 'sticky', top: 20, alignSelf: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Action Details</div>
                <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 20 }}>×</button>
              </div>
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Action',  getActionLabel(selected.action)],
                  ['Table',   selected.table_name || '—'],
                  ['Record',  selected.record_id ? `#${selected.record_id}` : '—'],
                  ['User',    selected.user_name || 'System'],
                  ['Time',    new Date(selected.created_at).toLocaleString('en-IN')],
                  ['IP',      selected.ip_address || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--gray-400)', fontWeight: 500 }}>{k}</span>
                    <span style={{ color: 'var(--navy)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v}</span>
                  </div>
                ))}
              </div>
              {selected.new_values && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>DATA</div>
                  <pre style={{ background: '#ecfdf5', padding: 12, borderRadius: 8, fontSize: 11, color: '#166534', fontFamily: 'var(--font-mono)', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(
                      typeof selected.new_values === 'string' ? JSON.parse(selected.new_values) : selected.new_values,
                      null, 2
                    )}
                  </pre>
                </div>
              )}
              {!selected.old_values && !selected.new_values && (
                <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 20, fontSize: 13 }}>No data recorded for this action</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}