import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Users, TrendingUp, TrendingDown, Search, ChevronRight, ArrowLeft, RefreshCw, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

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

const fmt = (n) => '₹' + Math.abs(parseFloat(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function PartyLedgerPage() {
  const { company } = useAuth()
  const [parties, setParties]         = useState([])
  const [loading, setLoading]         = useState(false)
  const [typeFilter, setTypeFilter]   = useState('all')
  const [search, setSearch]           = useState('')
  const [selectedParty, setSelectedParty] = useState(null)
  const [statement, setStatement]     = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (company?.id) loadParties()
  }, [company, typeFilter])

  const loadParties = async () => {
    setLoading(true); setError('')
    try {
      const param = typeFilter !== 'all' ? `&type=${typeFilter}` : ''
      const data = await request(`/party-ledger?company_id=${company.id}${param}`)
      setParties(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadStatement = async (partyName) => {
    setStmtLoading(true); setError('')
    try {
      const data = await request(`/party-ledger/statement?company_id=${company.id}&party_name=${encodeURIComponent(partyName)}`)
      setStatement(data)
    } catch (e) { setError(e.message) }
    finally { setStmtLoading(false) }
  }

  const handlePartyClick = (party) => {
    setSelectedParty(party)
    loadStatement(party.party_name)
  }

  const exportStatement = () => {
    if (!statement) return
    const rows = statement.ledger.map(e => ({
      Date: fmtDate(e.date),
      Reference: e.ref,
      Description: e.description,
      Debit: parseFloat(e.debit || 0),
      Credit: parseFloat(e.credit || 0),
      Balance: parseFloat(e.balance || 0),
      'Balance Type': e.balance >= 0 ? 'Dr' : 'Cr'
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Party Ledger')
    XLSX.writeFile(wb, `PartyLedger_${selectedParty.party_name}_${company?.name}.xlsx`)
  }

  const filtered = parties.filter(p =>
    p.party_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.party_gstin || '').toLowerCase().includes(search.toLowerCase())
  )

  // ── Statement View ────────────────────────────────────────
  if (selectedParty) {
    return (
      <div style={{ animation: 'fadeUp 0.5s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => { setSelectedParty(null); setStatement(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>
                {selectedParty.party_name}
              </h1>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {selectedParty.party_gstin && <span style={{ fontFamily: 'monospace', marginRight: 12 }}>GSTIN: {selectedParty.party_gstin}</span>}
                <span style={{ textTransform: 'capitalize', padding: '2px 8px', borderRadius: 20, background: selectedParty.invoice_type === 'sale' ? '#eff6ff' : '#f5f3ff', color: selectedParty.invoice_type === 'sale' ? '#1d4ed8' : '#6d28d9', fontWeight: 600, fontSize: 11 }}>
                  {selectedParty.invoice_type === 'sale' ? 'Customer' : selectedParty.invoice_type === 'both' ? 'Customer & Vendor' : 'Vendor'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={exportStatement} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Download size={14} /> Export Excel
          </button>
        </div>

        {/* Summary cards */}
        {statement && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Total Invoiced', value: fmt(statement.summary.total_invoiced), color: 'var(--navy)', bg: 'var(--white)' },
              { label: 'Total Paid', value: fmt(statement.summary.total_paid), color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Closing Balance', value: fmt(Math.abs(statement.summary.closing_balance)), color: Math.abs(statement.summary.closing_balance) > 0 ? '#dc2626' : '#16a34a', bg: Math.abs(statement.summary.closing_balance) > 0 ? '#fef2f2' : '#f0fdf4' },
              { label: 'Balance Type', value: statement.summary.balance_type === 'Dr' ? 'Debit (Receivable)' : 'Credit (Payable)', color: statement.summary.balance_type === 'Dr' ? '#1d4ed8' : '#6d28d9', bg: statement.summary.balance_type === 'Dr' ? '#eff6ff' : '#f5f3ff' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '16px 18px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Ledger table */}
        <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {stmtLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-400)' }}>Loading statement...</div>
          ) : statement?.ledger?.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-400)' }}>No transactions found for this party.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy)' }}>
                  {['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Debit' || h === 'Credit' || h === 'Balance' ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement?.ledger?.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--gray-600)' }}>{fmtDate(row.date)}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--navy)', fontWeight: 600 }}>{row.ref || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--navy)' }}>
                      {row.description}
                      {row.payment_mode && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--gray-400)' }}>({row.payment_mode})</span>}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#1d4ed8', fontWeight: parseFloat(row.debit) > 0 ? 600 : 400, textAlign: 'right' }}>
                      {parseFloat(row.debit) > 0 ? fmt(row.debit) : '—'}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#6d28d9', fontWeight: parseFloat(row.credit) > 0 ? 600 : 400, textAlign: 'right' }}>
                      {parseFloat(row.credit) > 0 ? fmt(row.credit) : '—'}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: row.balance >= 0 ? '#1d4ed8' : '#dc2626', textAlign: 'right' }}>
                      {fmt(Math.abs(row.balance))} {row.balance >= 0 ? 'Dr' : 'Cr'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {statement && (
                <tfoot>
                  <tr style={{ background: 'var(--navy)' }}>
                    <td colSpan={3} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>Closing Balance</td>
                    <td colSpan={3} style={{ padding: '12px 16px', fontSize: 15, fontWeight: 700, color: 'var(--gold)', textAlign: 'right' }}>
                      {fmt(Math.abs(statement.summary.closing_balance))} {statement.summary.balance_type}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    )
  }

  // ── Party List View ──────────────────────────────────────
  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Party Ledger</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Customer & vendor balances — Tally-style party ledger view</p>
        </div>
        <button onClick={loadParties} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Parties', value: parties.length, color: 'var(--navy)', Icon: Users },
          { label: 'Total Receivable', value: fmt(parties.filter(p => p.invoice_type === 'sale' || p.invoice_type === 'both').reduce((s, p) => s + parseFloat(p.total_outstanding || 0), 0)), color: '#1d4ed8', Icon: TrendingUp },
          { label: 'Total Payable', value: fmt(parties.filter(p => p.invoice_type === 'purchase' || p.invoice_type === 'both').reduce((s, p) => s + parseFloat(p.total_outstanding || 0), 0)), color: '#dc2626', Icon: TrendingDown },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 20px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <s.Icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 3 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--white)', borderRadius: 12, padding: 4, border: '1px solid var(--gray-200)' }}>
          {[['all', 'All Parties'], ['customer', 'Customers'], ['vendor', 'Vendors']].map(([v, l]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: '7px 18px', borderRadius: 9, border: 'none', background: typeFilter === v ? 'var(--navy)' : 'transparent', color: typeFilter === v ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{l}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party name or GSTIN..."
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--navy)', background: 'var(--white)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '11px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {/* Party list */}
      <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-400)' }}>Loading parties...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-400)' }}>
            <Users size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14 }}>No parties found. Create invoices to see party ledger.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {['Party Name', 'Type', 'GSTIN', 'Invoices', 'Total Invoiced', 'Paid', 'Outstanding', 'Last Invoice', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={i}
                  onClick={() => handlePartyClick(p)}
                  style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)'}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{p.party_name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: p.invoice_type === 'sale' ? '#eff6ff' : '#f5f3ff', color: p.invoice_type === 'sale' ? '#1d4ed8' : '#6d28d9' }}>
                      {p.invoice_type === 'sale' ? 'Customer' : p.invoice_type === 'both' ? 'Customer & Vendor' : 'Vendor'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--gray-500)', fontFamily: 'monospace' }}>{p.party_gstin || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--gray-600)', textAlign: 'center' }}>{p.total_invoices}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--navy)', fontWeight: 600 }}>{fmt(p.total_invoiced)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{fmt(p.total_paid)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: parseFloat(p.total_outstanding) > 0 ? '#dc2626' : '#16a34a' }}>
                      {parseFloat(p.total_outstanding) > 0 ? fmt(p.total_outstanding) : '✓ Clear'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--gray-500)' }}>{fmtDate(p.last_invoice_date)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <ChevronRight size={16} color="var(--gray-300)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}