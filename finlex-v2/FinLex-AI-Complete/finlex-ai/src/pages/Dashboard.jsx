import { useState, useEffect } from 'react'
import {
  AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  FileText, Calendar, ArrowRight, Bell, Zap, RefreshCw,
  AlertCircle, Activity, Shield, CreditCard, BookOpen
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ca, reports, compliance, invoices, actions as actionsApi } from '../services/api'
import { RevenueExpensesChart, ProfitLossChart, ExpenseBreakdownChart, ComplianceScoreChart } from '../components/Charts'

const fmt  = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })
const fmtK = (n) => {
  const v = parseFloat(n || 0)
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(1) + 'Cr'
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L'
  if (v >= 1e3) return '₹' + (v / 1e3).toFixed(1) + 'K'
  return '₹' + v.toLocaleString('en-IN')
}

const PRIORITY_STYLE = {
  critical: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', badgeBg: '#dc2626', badge: 'URGENT' },
  warning:  { bg: '#fffbeb', border: '#fde68a', color: '#ca8a04', badgeBg: '#ca8a04', badge: 'ACTION' },
  info:     { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', badgeBg: '#3b82f6', badge: 'INFO'   },
}

const ACTION_ICONS = {
  overdue_filing:  AlertCircle,
  upcoming_filing: Clock,
  unpaid_invoices: CreditCard,
  itc_gap:         CheckCircle,
  tds_pending:     Shield,
  vendor_payables: BookOpen,
}

const statusStyle = (s) => ({
  overdue:   { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  urgent:    { bg: '#fff7ed', color: '#ea580c', label: 'Urgent' },
  upcoming:  { bg: '#fefce8', color: '#ca8a04', label: 'Upcoming' },
  safe:      { bg: '#f0fdf4', color: '#16a34a', label: 'On Track' },
  pending:   { bg: '#fff7ed', color: '#ea580c', label: 'Pending' },
  completed: { bg: '#f0fdf4', color: '#16a34a', label: 'Done' },
}[s] || { bg: '#f4f6fb', color: '#4a5578', label: s })

function generateInsights(pl, complianceData, invoiceData, actionsList) {
  const insights = []
  if (pl) {
    const profit   = parseFloat(pl.net_profit || 0)
    const revenue  = parseFloat(pl.total_revenue || 0)   // excl. GST — from revenue accounts
    const expenses = parseFloat(pl.total_expenses || 0)  // from expense accounts

    if (profit < 0) {
      insights.push({ Icon: TrendingDown, text: `Loss of ${fmtK(Math.abs(profit))} — expenses exceed revenue`, color: '#dc2626', bg: '#fef2f2' })
    } else if (revenue > 0) {
      const margin = ((profit / revenue) * 100).toFixed(1)
      insights.push({ Icon: TrendingUp, text: `Profit margin ${margin}% — ${parseFloat(margin) > 15 ? 'healthy' : 'below 15%, review expenses'}`, color: parseFloat(margin) > 15 ? '#16a34a' : '#ca8a04', bg: parseFloat(margin) > 15 ? '#f0fdf4' : '#fffbeb' })
    }
    if (revenue > 0 && expenses > revenue * 0.8) {
      insights.push({ Icon: AlertTriangle, text: `Expenses at ${((expenses / revenue) * 100).toFixed(0)}% of revenue — cost control needed`, color: '#ca8a04', bg: '#fffbeb' })
    }
  }
  const overdueCnt = parseInt(complianceData?.overdue || 0)
  if (overdueCnt > 0) insights.push({ Icon: AlertCircle, text: `${overdueCnt} compliance filing${overdueCnt > 1 ? 's' : ''} overdue — penalty risk growing daily`, color: '#dc2626', bg: '#fef2f2' })
  const unpaidAmt = parseFloat(invoiceData?.unpaid_amount || 0)
  const unpaidCnt = parseInt(invoiceData?.unpaid_invoices || 0)
  if (unpaidAmt > 0) insights.push({ Icon: CreditCard, text: `${fmtK(unpaidAmt)} stuck in ${unpaidCnt} unpaid invoice${unpaidCnt > 1 ? 's' : ''} — cash flow risk`, color: '#ca8a04', bg: '#fffbeb' })
  const itcAction = actionsList?.find(a => a.type === 'itc_gap')
  if (itcAction) insights.push({ Icon: CheckCircle, text: `${fmtK(itcAction.amount)} ITC claimable — reconcile GSTR-2B to recover input tax`, color: '#1d4ed8', bg: '#eff6ff' })
  const tdsAction = actionsList?.find(a => a.type === 'tds_pending')
  if (tdsAction) insights.push({ Icon: Shield, text: `${fmtK(tdsAction.amount)} TDS not yet deposited — interest accruing after due date`, color: '#7c3aed', bg: '#f5f3ff' })
  return insights.slice(0, 5)
}

export default function Dashboard({ setPage }) {
  const { company, selectCompany } = useAuth()
  const [data, setData]               = useState(null)
  const [pl, setPl]                   = useState(null)
  const [deadlines, setDeadlines]     = useState([])
  const [recentInvoices, setRecentInvoices] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [actionSummary, setActionSummary] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [actionsLoading, setActionsLoading] = useState(false)
  const [error, setError]             = useState(null)
  const [myCompanies, setMyCompanies] = useState([])

  useEffect(() => { loadData() }, [company])

  // Auto-refresh when user returns to dashboard tab (fixes stale data after delete/add)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadData() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [company])

  const loadData = async () => {
    setLoading(true); setError(null)
    try {
      const dashboard = await ca.dashboard()
      setData(dashboard)
      let activeCompany = company
      if (!activeCompany && dashboard.companies?.length > 0) {
        activeCompany = dashboard.companies[0]
        selectCompany(activeCompany)
      }
      setMyCompanies(dashboard.companies || [])
      if (activeCompany?.id) {
        const [plData, comp, invs] = await Promise.all([
          reports.pl(activeCompany.id),
          compliance.list(activeCompany.id),
          invoices.list(activeCompany.id),
        ])
        setPl(plData)
        setDeadlines(comp.slice(0, 5))
        setRecentInvoices(invs.filter(i => i.status !== 'cancelled').slice(0, 4))
        loadActions(activeCompany.id)
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const loadActions = async (company_id) => {
    setActionsLoading(true)
    try {
      const res = await actionsApi.list(company_id)
      setActionItems(res.actions || [])
      setActionSummary(res.summary || null)
    } catch (e) { console.error('Actions load failed:', e) }
    finally { setActionsLoading(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <Activity size={28} color="var(--gray-300)" style={{ marginBottom: 10 }} />
        <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Loading your financial data...</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ color: '#dc2626', fontSize: 15, marginBottom: 12 }}>Error: {error}</div>
      <button onClick={loadData} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14 }}>Retry</button>
    </div>
  )

  const activeCompanyData = myCompanies.find(c => c.id === company?.id) || myCompanies[0]
  const compInvoices      = activeCompanyData?.invoices   || {}
  const compCompliance    = activeCompanyData?.compliance || {}
  const unpaidAmt         = parseFloat(compInvoices.unpaid_amount || 0)
  const insights          = generateInsights(pl, compCompliance, compInvoices, actionItems)
  const criticalCount     = actionSummary?.critical || 0

  const statCards = [
    {
      // Use PL revenue (excl GST) so it matches Net Profit calculation
      label: 'Revenue',
      value: fmtK(pl?.total_revenue || 0),
      sub:   `${compInvoices.total_sales || 0} invoices raised`,
      Icon: TrendingUp, color: '#3b82f6', bg: '#eff6ff'
    },
    {
      label: 'Net Profit',
      value: fmtK(pl?.net_profit || 0),
      sub:   (pl?.net_profit || 0) >= 0 ? 'Profitable period' : 'Expenses exceed revenue',
      Icon: (pl?.net_profit || 0) >= 0 ? TrendingUp : TrendingDown,
      color: (pl?.net_profit || 0) >= 0 ? '#10b981' : '#dc2626',
      bg:    (pl?.net_profit || 0) >= 0 ? '#ecfdf5' : '#fef2f2'
    },
    {
      label: unpaidAmt > 0 ? `${fmtK(unpaidAmt)} receivable` : 'Receivables',
      value: unpaidAmt > 0 ? `${compInvoices.unpaid_invoices || 0} unpaid` : 'All paid',
      sub:   unpaidAmt > 0 ? 'Cash not yet collected' : 'No outstanding invoices',
      Icon: CreditCard,
      color: unpaidAmt > 0 ? '#f59e0b' : '#10b981',
      bg:    unpaidAmt > 0 ? '#fffbeb' : '#ecfdf5'
    },
    {
      label: 'Compliance',
      value: `${activeCompanyData?.compliance_score || 0}/100`,
      sub:   parseInt(compCompliance.overdue || 0) > 0
        ? `${compCompliance.overdue} overdue — penalty risk`
        : 'All filings on track',
      Icon:  parseInt(compCompliance.overdue || 0) > 0 ? AlertCircle : Shield,
      color: (activeCompanyData?.compliance_score || 0) >= 80 ? '#10b981' : '#f59e0b',
      bg:    (activeCompanyData?.compliance_score || 0) >= 80 ? '#ecfdf5' : '#fffbeb'
    },
  ]

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>Dashboard</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 14 }}>{company?.name || 'Select a company'} — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── TODAY'S FOCUS STRIP ──────────────────────────────── */}
      {actionItems.length > 0 && (() => {
        const focusItems = []
        const overdueFilings = actionItems.filter(a => a.type === 'overdue_filing').length
        const upcomingFilings = actionItems.filter(a => a.type === 'upcoming_filing').length
        const unpaidAction  = actionItems.find(a => a.type === 'unpaid_invoices')
        const itcAction     = actionItems.find(a => a.type === 'itc_gap')
        if (overdueFilings > 0)  focusItems.push(`File ${overdueFilings} overdue return${overdueFilings > 1 ? 's' : ''}`)
        if (upcomingFilings > 0) focusItems.push(`Prepare ${upcomingFilings} upcoming filing${upcomingFilings > 1 ? 's' : ''}`)
        if (unpaidAction)        focusItems.push(`Recover ${fmtK(unpaidAction.amount)} in receivables`)
        if (itcAction)           focusItems.push(`Claim ${fmtK(itcAction.amount)} ITC`)
        if (focusItems.length === 0) return null
        return (
          <div style={{ background: 'linear-gradient(135deg, var(--navy), #1a3a6e)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <Zap size={13} color="var(--gold)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.3px' }}>TODAY'S FOCUS</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {focusItems.map((item, i) => (
                  <span key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', marginRight: 2 }}>·</span>}
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => {
              const el = document.getElementById('action-center')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: 'var(--gold)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Start Now
            </button>
          </div>
        )
      })()}

      {/* ── 1. STAT CARDS ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: 'var(--white)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--gray-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 500 }}>{s.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.Icon size={15} color={s.color} />
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 2. ACTION CENTER ─────────────────────────────────── */}
      {(actionItems.length > 0 || actionsLoading) && (
        <div id="action-center" style={{ background: 'var(--white)', borderRadius: 16, border: `1.5px solid ${criticalCount > 0 ? '#fecaca' : '#fde68a'}`, marginBottom: 24, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: criticalCount > 0 ? '#fef2f2' : '#fffbeb', borderBottom: `1px solid ${criticalCount > 0 ? '#fecaca' : '#fde68a'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={14} color={criticalCount > 0 ? '#dc2626' : '#ca8a04'} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: criticalCount > 0 ? '#dc2626' : '#92400e' }}>Action Center</span>
              {criticalCount > 0 && (
                <span style={{ background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{criticalCount} urgent</span>
              )}
            </div>
            {actionSummary && (
              <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>{actionSummary.total} item{actionSummary.total !== 1 ? 's' : ''} · {fmtK(actionSummary.total_risk_amount)} total impact</span>
            )}
          </div>
          {actionsLoading ? (
            <div style={{ padding: '16px 18px', color: 'var(--gray-400)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
              <RefreshCw size={12} /> Loading actions...
            </div>
          ) : (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {actionItems.map((action) => {
                const s    = PRIORITY_STYLE[action.priority] || PRIORITY_STYLE.info
                const Icon = ACTION_ICONS[action.type] || AlertCircle
                return (
                  <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={14} color={s.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 1 }}>{action.title}</div>
                      <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{action.amount_label}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.badgeBg, color: 'white' }}>{s.badge}</span>
                      <button onClick={() => setPage(action.page)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 7, border: `1px solid ${s.border}`, background: 'var(--white)', color: s.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                        {action.cta} <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 3. AI INSIGHTS ───────────────────────────────────── */}
      {insights.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', marginBottom: 24, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--gray-200)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={13} color="var(--gold)" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>AI Insights</span>
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>auto-generated from live data</span>
          </div>
          <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 7 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, background: ins.bg, border: `1px solid ${ins.color}22` }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: `${ins.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <ins.Icon size={13} color={ins.color} />
                </div>
                <span style={{ fontSize: 12, color: ins.color, fontWeight: 500, lineHeight: 1.5 }}>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. DEADLINES + RECENT INVOICES ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--gray-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Compliance Deadlines</h3>
              {parseInt(compCompliance.overdue || 0) > 0 && (
                <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>{compCompliance.overdue} overdue</span>
              )}
            </div>
            <button onClick={() => setPage('compliance')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--gold)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          {deadlines.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '20px 0', fontSize: 13 }}>No deadlines found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deadlines.map((d) => {
                const s        = statusStyle(d.status)
                const isOverdue = d.status === 'overdue' || (d.status === 'pending' && d.days_left < 0)
                const penaltyMap = { GST: 50, TDS: 200, ITR: 1000, ROC: 100 }
                const daysLate   = Math.abs(d.days_left || 0)
                const penalty    = isOverdue ? Math.min(daysLate * (penaltyMap[d.type] || 50), 10000) : 0
                return (
                  <div key={`${d.type}_${d.name}_${d.due_date}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: isOverdue ? '#fef2f2' : 'var(--gray-100)', border: `1px solid ${isOverdue ? '#fecaca' : 'var(--gray-200)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--navy)', color: 'var(--gold)' }}>{d.type}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: isOverdue ? '#dc2626' : 'var(--gray-400)' }}>
                          {isOverdue ? `${daysLate}d overdue${penalty > 0 ? ` · ₹${penalty.toLocaleString('en-IN')} penalty risk` : ''}` : `Due ${new Date(d.due_date).toLocaleDateString('en-IN')} · ${d.days_left}d left`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: s.bg, color: s.color }}>{s.label}</span>
                      {isOverdue && (
                        <button onClick={() => setPage('compliance')} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>File</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--gray-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Recent Invoices</h3>
              {parseInt(compInvoices.unpaid_invoices || 0) > 0 && (
                <span style={{ background: '#fffbeb', color: '#ca8a04', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>{fmtK(compInvoices.unpaid_amount || 0)} pending</span>
              )}
            </div>
            <button onClick={() => setPage('gst')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--gold)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          {recentInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '20px 0', fontSize: 13 }}>No invoices yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {recentInvoices.map((inv, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-200)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={13} color="var(--gray-400)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{inv.invoice_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{inv.party_name}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmt(inv.total_amount)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: inv.payment_status === 'paid' ? '#10b981' : '#f59e0b' }} />
                      <span style={{ fontSize: 11, color: inv.payment_status === 'paid' ? '#10b981' : '#f59e0b', fontWeight: 600, textTransform: 'capitalize' }}>{inv.payment_status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {pl && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-200)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>P&L Summary</div>
              {[
                { label: 'Revenue',    val: pl.total_revenue,  color: '#10b981' },
                { label: 'Expenses',   val: pl.total_expenses, color: '#dc2626' },
                { label: 'Net Profit', val: pl.net_profit,     color: (pl.net_profit || 0) >= 0 ? '#10b981' : '#dc2626', bold: true },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, paddingTop: r.bold ? 5 : 0, borderTop: r.bold ? '1px solid var(--gray-200)' : 'none' }}>
                  <span style={{ fontSize: r.bold ? 13 : 12, fontWeight: r.bold ? 700 : 400, color: 'var(--gray-600)' }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 13 : 12, fontWeight: r.bold ? 700 : 600, color: r.color }}>{fmt(r.val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. CHARTS ─────────────────────────────────────────── */}
      {pl && (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Financial Analytics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 22, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', borderTop: '3px solid var(--gold)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>Revenue vs Expenses</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Current financial year</div>
              <RevenueExpensesChart revenue={pl.total_revenue || 0} expenses={pl.total_expenses || 0} />
            </div>
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 22, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', borderTop: '3px solid #ef4444' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>Expense Breakdown</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>By expense account</div>
              <ExpenseBreakdownChart data={(pl.expenses || []).slice(0, 8).map(e => ({ account: e.name, amount: e.amount }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 22, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', borderTop: `3px solid ${(pl.net_profit || 0) >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>Profit / Loss</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Net profit = Revenue − Expenses</div>
              <ProfitLossChart revenue={pl.total_revenue || 0} expenses={pl.total_expenses || 0} />
            </div>
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 22, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', borderTop: '3px solid var(--navy)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3, width: '100%' }}>Compliance Score</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12, width: '100%' }}>
                {parseInt(compCompliance.overdue || 0) > 0 ? `${compCompliance.overdue} overdue filing${compCompliance.overdue > 1 ? 's' : ''} reducing score` : 'Based on filings and deadlines'}
              </div>
              <div style={{ width: 200 }}><ComplianceScoreChart score={activeCompanyData?.compliance_score || 0} /></div>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, color: (activeCompanyData?.compliance_score || 0) >= 80 ? '#10b981' : (activeCompanyData?.compliance_score || 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                {(activeCompanyData?.compliance_score || 0) >= 80
                  ? <><CheckCircle size={12} /> Excellent compliance</>
                  : (activeCompanyData?.compliance_score || 0) >= 50
                  ? <><AlertTriangle size={12} /> Needs attention</>
                  : <><AlertCircle size={12} /> Critical — act now</>}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── TRUST BAR ─────────────────────────────────────────── */}
      <div style={{ marginTop: 24, padding: '12px 18px', background: 'var(--white)', borderRadius: 12, border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {[
          { Icon: Shield, text: 'AES-256 encrypted data' },
          { Icon: CheckCircle, text: 'GST verified calculations' },
          { Icon: Clock, text: 'Real-time sync' },
          { Icon: FileText, text: 'Audit trail on every action' },
        ].map(({ Icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={12} color="var(--gray-400)" />
            <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}