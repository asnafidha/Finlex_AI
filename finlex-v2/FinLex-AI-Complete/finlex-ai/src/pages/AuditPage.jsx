import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { accounts, reports } from '../services/api'
import { Download, Shield, AlertTriangle, AlertCircle, CheckCircle, RefreshCw, Zap, TrendingDown, FileText, BookOpen } from 'lucide-react'
import * as XLSX from 'xlsx'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')

async function exportToExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtK = (n) => {
  const v = parseFloat(n || 0)
  if (v >= 1e7) return '₹' + (v/1e7).toFixed(1) + ' Cr'
  if (v >= 1e5) return '₹' + (v/1e5).toFixed(1) + ' L'
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const typeColors = {
  asset:     { bg: '#eff6ff', color: '#1d4ed8' },
  liability: { bg: '#f5f3ff', color: '#6d28d9' },
  equity:    { bg: '#ecfdf5', color: '#065f46' },
  revenue:   { bg: '#fef3c7', color: '#92400e' },
  expense:   { bg: '#fef2f2', color: '#dc2626' },
}

const SEVERITY_CONFIG = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: AlertCircle,    label: 'Critical' },
  high:     { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: AlertTriangle,  label: 'High' },
  medium:   { color: '#ca8a04', bg: '#fffbeb', border: '#fde68a', icon: AlertTriangle,  label: 'Medium' },
  low:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: CheckCircle,    label: 'Low' },
}

const CATEGORY_ICONS = {
  TDS: '🏛️', GST: '📋', Accounting: '📊', Compliance: '⚖️', Tax: '💰',
}

export default function AuditPage() {
  const { company } = useAuth()
  const [tab, setTab]               = useState('risk')
  const [accountList, setAccountList] = useState([])
  const [balanceSheet, setBalanceSheet] = useState(null)
  const [trialBalance, setTrialBalance] = useState(null)
  const [ledger, setLedger]         = useState([])
  const [selectedAcc, setSelectedAcc] = useState('')
  const [loading, setLoading]       = useState(false)

  // Risk sweep state
  const [sweepData, setSweepData]   = useState(null)
  const [sweeping, setSweeping]     = useState(false)
  const [sweepError, setSweepError] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (company?.id) {
      if (tab === 'risk') runSweep()
      else loadData()
    }
  }, [company, tab])

  const runSweep = async () => {
    if (!company?.id) return
    setSweeping(true); setSweepError('')
    try {
      const res = await fetch(`${BASE_URL}/audit/risk-sweep?company_id=${company.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sweep failed')
      setSweepData(data)
    } catch (err) {
      setSweepError(err.message)
    } finally {
      setSweeping(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (tab === 'accounts') {
        const data = await accounts.list(company.id)
        setAccountList(data)
      } else if (tab === 'balance-sheet') {
        const data = await reports.balanceSheet(company.id)
        setBalanceSheet(data)
      } else if (tab === 'trial-balance') {
        const data = await reports.trialBalance(company.id)
        setTrialBalance(data)
      } else if (tab === 'ledger') {
        const data = await reports.ledger(company.id, selectedAcc || null)
        setLedger(data)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const tabStyle = (t) => ({
    padding: '9px 18px', borderRadius: 9, border: 'none',
    background: tab === t ? 'var(--navy)' : 'transparent',
    color: tab === t ? 'var(--white)' : 'var(--gray-600)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-body)', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 6,
  })

  // Filter findings
  const filteredFindings = (sweepData?.findings || []).filter(f => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false
    if (filterCategory !== 'all' && f.category !== filterCategory) return false
    return true
  })

  const categories = [...new Set((sweepData?.findings || []).map(f => f.category))]

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
              Accounts & Audit
            </h1>
            <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>AI risk sweep, chart of accounts, balance sheet and ledger</p>
          </div>
          {tab === 'risk' && sweepData && (
            <button onClick={runSweep} disabled={sweeping} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: sweeping ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: sweeping ? 0.7 : 1 }}>
              <RefreshCw size={14} style={{ animation: sweeping ? 'spin 1s linear infinite' : 'none' }} />
              {sweeping ? 'Scanning...' : 'Re-scan'}
            </button>
          )}
          {tab !== 'accounts' && tab !== 'risk' && (
            <button
              onClick={async () => {
                try {
                  if (tab === 'trial-balance' && trialBalance?.accounts) {
                    await exportToExcel(trialBalance.accounts.map(a => ({ Code: a.code, Account: a.name, Type: a.type, 'Opening Debit': parseFloat(a.opening_debit||0), 'Opening Credit': parseFloat(a.opening_credit||0), 'Period Debit': parseFloat(a.period_debit||0), 'Period Credit': parseFloat(a.period_credit||0), 'Closing Debit': parseFloat(a.closing_debit||0), 'Closing Credit': parseFloat(a.closing_credit||0) })), `TrialBalance_${company?.name}.xlsx`)
                  } else if (tab === 'balance-sheet' && balanceSheet) {
                    await exportToExcel([...balanceSheet.assets.map(a => ({ Section: 'Assets', Account: a.name, Amount: parseFloat(a.closing_balance||0) })), ...balanceSheet.liabilities.map(a => ({ Section: 'Liabilities', Account: a.name, Amount: parseFloat(a.closing_balance||0) })), { Section: 'Equity', Account: 'Net Profit', Amount: parseFloat(balanceSheet.net_profit||0) }], `BalanceSheet_${company?.name}.xlsx`)
                  } else if (tab === 'ledger' && ledger.length > 0) {
                    await exportToExcel(ledger.map(r => ({ Date: new Date(r.entry_date).toLocaleDateString('en-IN'), Entry: r.entry_number, Account: r.account_name, Narration: r.narration, Debit: parseFloat(r.debit_amount||0), Credit: parseFloat(r.credit_amount||0), Balance: parseFloat(r.running_balance||0) })), `Ledger_${company?.name}.xlsx`)
                  }
                } catch (e) { alert('Export failed: ' + e.message) }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              <Download size={14} /> Export Excel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        <button onClick={() => setTab('risk')} style={tabStyle('risk')}><Shield size={13} /> AI Risk Sweep</button>
        {[['accounts','Chart of Accounts'],['trial-balance','Trial Balance'],['balance-sheet','Balance Sheet'],['ledger','Ledger']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{l}</button>
        ))}
      </div>

      {/* ── AI RISK SWEEP TAB ───────────────────────────────── */}
      {tab === 'risk' && (
        <>
          {sweeping && (
            <div style={{ background: 'linear-gradient(135deg, var(--navy), #1e3a8a)', borderRadius: 16, padding: '28px 32px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap size={24} color="#C9A84C" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--white)', marginBottom: 4 }}>
                  AI Risk Sweep Running...
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  Checking 12 compliance rules — TDS, GST, double-entry, blocked ITC, capital misclassification...
                </div>
              </div>
            </div>
          )}

          {sweepError && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              {sweepError}
            </div>
          )}

          {sweepData && !sweeping && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 13, marginBottom: 22 }}>
                {[
                  { label: 'Total Findings', value: sweepData.summary.total, color: 'var(--navy)', bg: 'var(--white)', border: 'var(--gray-200)' },
                  { label: 'Critical', value: sweepData.summary.critical, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                  { label: 'High', value: sweepData.summary.high, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
                  { label: 'Medium', value: sweepData.summary.medium, color: '#ca8a04', bg: '#fffbeb', border: '#fde68a' },
                  { label: 'Total Risk', value: fmtK(sweepData.summary.total_risk_amount), color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${s.border}`, boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* No findings = clean */}
              {sweepData.summary.total === 0 && (
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: 16, padding: '32px', textAlign: 'center', border: '1.5px solid #86efac' }}>
                  <CheckCircle size={40} color="#16a34a" style={{ marginBottom: 12 }} />
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 6 }}>All Clear — No Issues Found</div>
                  <div style={{ fontSize: 13, color: '#16a34a' }}>12 compliance rules checked. Books are clean.</div>
                </div>
              )}

              {sweepData.summary.total > 0 && (
                <>
                  {/* Filters */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600 }}>FILTER:</span>
                    {['all','critical','high','medium','low'].map(s => (
                      <button key={s} onClick={() => setFilterSeverity(s)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filterSeverity===s ? 'var(--navy)' : 'var(--gray-200)'}`, background: filterSeverity===s ? 'var(--navy)' : 'var(--white)', color: filterSeverity===s ? 'var(--white)' : 'var(--gray-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
                        {s === 'all' ? 'All' : s}
                      </button>
                    ))}
                    <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>|</span>
                    {['all',...categories].map(c => (
                      <button key={c} onClick={() => setFilterCategory(c)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filterCategory===c ? 'var(--navy)' : 'var(--gray-200)'}`, background: filterCategory===c ? 'var(--navy)' : 'var(--white)', color: filterCategory===c ? 'var(--white)' : 'var(--gray-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        {c === 'all' ? 'All Categories' : `${CATEGORY_ICONS[c] || '📌'} ${c}`}
                      </button>
                    ))}
                  </div>

                  {/* Findings list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredFindings.map((finding) => {
                      const sev = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.medium
                      const SevIcon = sev.icon
                      const isExpanded = expandedId === finding.id
                      return (
                        <div key={finding.id} style={{ background: 'var(--white)', borderRadius: 14, border: `1.5px solid ${isExpanded ? sev.border : 'var(--gray-200)'}`, boxShadow: 'var(--shadow-sm)', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                          {/* Finding header */}
                          <div
                            onClick={() => setExpandedId(isExpanded ? null : finding.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', background: isExpanded ? sev.bg : 'var(--white)' }}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: sev.bg, border: `1px solid ${sev.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <SevIcon size={16} color={sev.color} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, textTransform: 'uppercase', flexShrink: 0 }}>{sev.label}</span>
                                <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>{CATEGORY_ICONS[finding.category] || '📌'} {finding.category}</span>
                                {finding.invoice && <span style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{finding.invoice}</span>}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{finding.title}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {finding.risk_amount > 0 && (
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: sev.color }}>{fmtK(finding.risk_amount)}</div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>risk exposure</div>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${sev.border}` }}>
                              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7, marginBottom: 14 }}>
                                {finding.description}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                <div style={{ background: 'var(--gray-100)', borderRadius: 8, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Law / Section</div>
                                  <div style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 600 }}>{finding.law}</div>
                                </div>
                                <div style={{ background: sev.bg, borderRadius: 8, padding: '10px 14px', border: `1px solid ${sev.border}` }}>
                                  <div style={{ fontSize: 10, color: sev.color, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Recommended Action</div>
                                  <div style={{ fontSize: 12, color: sev.color, fontWeight: 600 }}>{finding.action}</div>
                                </div>
                              </div>
                              {finding.date && (
                                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                                  Transaction date: {new Date(finding.date).toLocaleDateString('en-IN')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Swept at */}
                  <div style={{ marginTop: 16, fontSize: 12, color: 'var(--gray-400)', textAlign: 'right' }}>
                    Last swept: {new Date(sweepData.swept_at).toLocaleString('en-IN')} · {sweepData.rules_checked} rules checked
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {loading && tab !== 'risk' && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading...</div>
      )}

      {!loading && (
        <>
          {/* Chart of Accounts */}
          {tab === 'accounts' && (
            <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    {['Code', 'Account Name', 'Type', 'Nature', 'System'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accountList.map((acc, i) => {
                    const t = typeColors[acc.type] || typeColors.asset
                    return (
                      <tr key={acc.id} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', color: 'var(--gray-600)' }}>{acc.code}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{acc.name}</td>
                        <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: t.bg, color: t.color, textTransform: 'capitalize' }}>{acc.type}</span></td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)', textTransform: 'capitalize' }}>{acc.nature}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: acc.is_system ? '#16a34a' : 'var(--gray-400)' }}>{acc.is_system ? '✓ System' : 'Custom'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Trial Balance */}
          {tab === 'trial-balance' && !trialBalance && !loading && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)', fontSize: 15 }}>No trial balance data. Add journal entries or opening balances to get started.</div>
          )}
          {tab === 'trial-balance' && trialBalance && (
            <div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Closing Debit',  value: fmt(trialBalance.total_closing_debit),  color: '#1d4ed8' },
                  { label: 'Total Closing Credit', value: fmt(trialBalance.total_closing_credit), color: '#6d28d9' },
                  { label: 'Balanced', value: trialBalance.is_balanced ? '✓ Yes' : '✗ No', color: trialBalance.is_balanced ? '#16a34a' : '#dc2626' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 20px', border: '1px solid var(--gray-200)', flex: 1, boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--font-display)' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--navy)' }}>
                      {['Code','Account','Type','Op. Dr','Op. Cr','Period Dr','Period Cr','Closing Dr','Closing Cr'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.accounts.map((acc, i) => (
                      <tr key={i} style={{ background: i%2===0?'var(--white)':'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-600)' }}>{acc.code}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{acc.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)', textTransform: 'capitalize' }}>{acc.type}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#1d4ed8', textAlign: 'right' }}>{parseFloat(acc.opening_debit)>0.005?fmt(acc.opening_debit):'—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#6d28d9', textAlign: 'right' }}>{parseFloat(acc.opening_credit)>0.005?fmt(acc.opening_credit):'—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#1d4ed8', textAlign: 'right' }}>{parseFloat(acc.period_debit)>0.005?fmt(acc.period_debit):'—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#6d28d9', textAlign: 'right' }}>{parseFloat(acc.period_credit)>0.005?fmt(acc.period_credit):'—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#1e40af', textAlign: 'right' }}>{parseFloat(acc.closing_debit)>0.005?fmt(acc.closing_debit):'—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#5b21b6', textAlign: 'right' }}>{parseFloat(acc.closing_credit)>0.005?fmt(acc.closing_credit):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {tab === 'balance-sheet' && balanceSheet && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ background: '#eff6ff', padding: '14px 20px', borderBottom: '1px solid var(--gray-200)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>ASSETS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>{fmt(balanceSheet.total_assets)}</div>
                </div>
                {balanceSheet.assets.filter(a => parseFloat(a.closing_balance) !== 0).map((acc, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--gray-200)', fontSize: 13 }}>
                    <span style={{ color: 'var(--navy)' }}>{acc.name}</span>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmt(acc.closing_balance)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ background: '#f5f3ff', padding: '14px 20px', borderBottom: '1px solid var(--gray-200)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#6d28d9' }}>LIABILITIES</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>{fmt(balanceSheet.total_liabilities)}</div>
                  </div>
                  {balanceSheet.liabilities.filter(a => parseFloat(a.closing_balance) !== 0).map((acc, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--gray-200)', fontSize: 13 }}>
                      <span style={{ color: 'var(--navy)' }}>{acc.name}</span>
                      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmt(acc.closing_balance)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                  <div style={{ background: '#ecfdf5', padding: '14px 20px', borderBottom: '1px solid var(--gray-200)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>EQUITY + PROFIT</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>{fmt(balanceSheet.total_equity)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', fontSize: 13 }}>
                    <span style={{ color: 'var(--navy)' }}>Net Profit (Current Year)</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(balanceSheet.net_profit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderTop: '2px solid var(--navy)', fontSize: 14, fontWeight: 700 }}>
                    <span style={{ color: 'var(--navy)' }}>Balanced</span>
                    <span style={{ color: balanceSheet.is_balanced ? '#16a34a' : '#dc2626' }}>{balanceSheet.is_balanced ? '✓ Yes' : '✗ No'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ledger */}
          {tab === 'ledger' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                <input placeholder="Filter by account code (e.g. 1003)" value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadData()} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--navy)', background: 'var(--white)', outline: 'none', width: 280 }} />
                <button onClick={loadData} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: 'var(--white)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Search</button>
              </div>
              <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                {ledger.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>No entries found. Try a different account code.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--navy)' }}>
                        {['Date','Entry No','Account','Narration','Debit','Credit','Balance'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row, i) => (
                        <tr key={i} style={{ background: i%2===0?'var(--white)':'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)' }}>{new Date(row.entry_date).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-600)' }}>{row.entry_number}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--navy)' }}>{row.account_name}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)', maxWidth: 200 }}>{row.narration}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>{parseFloat(row.debit_amount)>0?fmt(row.debit_amount):'—'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{parseFloat(row.credit_amount)>0?fmt(row.credit_amount):'—'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: row.running_balance>=0?'var(--navy)':'#dc2626' }}>{fmt(row.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}