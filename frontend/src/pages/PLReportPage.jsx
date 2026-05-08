import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { reports } from '../services/api'
import { Download, TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtK = (n) => {
  const v = parseFloat(n || 0)
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr'
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L'
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function exportToExcel(pl, companyName, from, to) {
  const period = from && to ? `${from}_to_${to}` : 'FullYear'
  const rows = [
    { Section: 'REVENUE', Code: '', Account: '', Amount: '' },
    ...pl.revenue.map(r => ({ Section: '', Code: r.code, Account: r.name, Amount: parseFloat(r.amount) })),
    { Section: 'Total Revenue', Code: '', Account: '', Amount: parseFloat(pl.total_revenue) },
    { Section: '', Code: '', Account: '', Amount: '' },
    { Section: 'EXPENSES', Code: '', Account: '', Amount: '' },
    ...pl.expenses.map(r => ({ Section: '', Code: r.code, Account: r.name, Amount: parseFloat(r.amount) })),
    { Section: 'Total Expenses', Code: '', Account: '', Amount: parseFloat(pl.total_expenses) },
    { Section: '', Code: '', Account: '', Amount: '' },
    { Section: pl.is_profit ? 'NET PROFIT' : 'NET LOSS', Code: '', Account: '', Amount: parseFloat(pl.net_profit) },
  ]
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'P&L')
  XLSX.writeFile(wb, `ProfitLoss_${companyName}_${period}.xlsx`)
}

export default function PLReportPage() {
  const { company } = useAuth()
  const [pl, setPl]           = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast]     = useState(null)

  // Default to current Indian financial year (Apr–Mar)
  const now = new Date()
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const [from, setFrom] = useState(`${fyStartYear}-04-01`)
  const [to,   setTo]   = useState(`${fyStartYear + 1}-03-31`)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const data = await reports.pl(company.id, from || undefined, to || undefined)
      setPl(data)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [company])

  const margin = pl && parseFloat(pl.total_revenue) > 0
    ? ((parseFloat(pl.net_profit) / parseFloat(pl.total_revenue)) * 100).toFixed(1)
    : null

  const marginColor = margin === null
    ? 'var(--gray-400)'
    : parseFloat(margin) >= 20 ? '#16a34a'
    : parseFloat(margin) >= 10 ? '#d97706'
    : '#dc2626'

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 12, padding: '12px 18px', fontSize: 13, color: toast.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Profit & Loss</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Revenue, expenses and net profit for the selected period</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--navy)', background: 'var(--white)', outline: 'none' }} />
          <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--navy)', background: 'var(--white)', outline: 'none' }} />
          <button onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <RefreshCw size={14} /> Apply
          </button>
          {pl && (
            <button onClick={() => exportToExcel(pl, company?.name || 'Company', from, to)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <Download size={14} /> Export Excel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--gray-400)', fontSize: 15 }}>Loading P&L...</div>
      ) : !pl ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--gray-400)', fontSize: 15 }}>
          Select a date range and click Apply.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              {
                label: 'Total Revenue',
                value: fmtK(pl.total_revenue),
                sub: `${pl.revenue.length} account${pl.revenue.length !== 1 ? 's' : ''}`,
                color: '#16a34a', bg: '#f0fdf4', border: '#86efac', Icon: TrendingUp,
              },
              {
                label: 'Total Expenses',
                value: fmtK(pl.total_expenses),
                sub: `${pl.expenses.length} account${pl.expenses.length !== 1 ? 's' : ''}`,
                color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', Icon: TrendingDown,
              },
              {
                label: pl.is_profit ? 'Net Profit' : 'Net Loss',
                value: fmtK(Math.abs(pl.net_profit)),
                sub: pl.is_profit ? 'Profitable period ✓'
                  : parseFloat(margin) > -10 ? 'Marginal loss — within normal range'
                  : parseFloat(margin) > -20 ? 'Moderate loss — review expenses'
                  : parseFloat(margin) > -40 ? 'Significant loss — action needed'
                  : 'Critical loss — urgent attention required',
                color: pl.is_profit ? '#16a34a' : '#dc2626',
                bg: pl.is_profit ? '#f0fdf4' : '#fef2f2',
                border: pl.is_profit ? '#86efac' : '#fca5a5',
                Icon: pl.is_profit ? TrendingUp : TrendingDown,
              },
              {
                label: 'Profit Margin',
                value: margin !== null ? `${margin}%` : '—',
                sub: margin === null ? 'No revenue yet'
                  : parseFloat(margin) >= 20 ? 'Healthy margin'
                  : parseFloat(margin) >= 10 ? 'Moderate margin'
                  : parseFloat(margin) < -40 ? 'Critical — urgent action'
                  : parseFloat(margin) < -20 ? 'Significant loss'
                  : 'Low — review costs',
                color: marginColor,
                bg: margin === null ? 'var(--gray-100)'
                  : parseFloat(margin) >= 20 ? '#f0fdf4'
                  : parseFloat(margin) >= 10 ? '#fffbeb' : '#fef2f2',
                border: margin === null ? 'var(--gray-200)'
                  : parseFloat(margin) >= 20 ? '#86efac'
                  : parseFloat(margin) >= 10 ? '#fde68a' : '#fca5a5',
                Icon: TrendingUp,
              },
            ].map((c, i) => (
              <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '18px 20px', border: `1px solid ${c.border}`, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <c.Icon size={15} color={c.color} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>{c.value}</div>
                <div style={{ fontSize: 11, color: c.color }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Revenue + Expense Tables side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Revenue */}
            <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div style={{ background: '#f0fdf4', padding: '14px 20px', borderBottom: '1px solid #86efac', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>REVENUE</div>
                  <div style={{ fontSize: 11, color: '#16a34a', opacity: 0.8 }}>Income earned this period</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', fontFamily: 'var(--font-display)' }}>{fmt(pl.total_revenue)}</div>
              </div>
              {pl.revenue.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>No revenue recorded in this period</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-100)' }}>
                      {['Code', 'Account', 'Amount'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pl.revenue.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'var(--white)' : '#f9fafb' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--gray-400)' }}>{r.code}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#16a34a', textAlign: 'right' }}>{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #86efac', background: '#f0fdf4' }}>
                      <td colSpan={2} style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Total Revenue</td>
                      <td style={{ padding: '11px 16px', fontSize: 14, fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>{fmt(pl.total_revenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Expenses */}
            <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div style={{ background: '#fef2f2', padding: '14px 20px', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>EXPENSES</div>
                  <div style={{ fontSize: 11, color: '#dc2626', opacity: 0.8 }}>Costs incurred this period</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', fontFamily: 'var(--font-display)' }}>{fmt(pl.total_expenses)}</div>
              </div>
              {pl.expenses.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>No expenses recorded in this period</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-100)' }}>
                      {['Code', 'Account', 'Amount'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pl.expenses.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'var(--white)' : '#f9fafb' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--gray-400)' }}>{r.code}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #fca5a5', background: '#fef2f2' }}>
                      <td colSpan={2} style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>Total Expenses</td>
                      <td style={{ padding: '11px 16px', fontSize: 14, fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>{fmt(pl.total_expenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* Net Profit / Loss Banner */}
          <div style={{
            background: pl.is_profit ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)',
            border: `1.5px solid ${pl.is_profit ? '#86efac' : '#fca5a5'}`,
            borderRadius: 16, padding: '22px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {pl.is_profit ? <TrendingUp size={28} color="#16a34a" /> : <TrendingDown size={28} color="#dc2626" />}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: pl.is_profit ? '#166534' : '#991b1b', fontFamily: 'var(--font-display)' }}>
                  {pl.is_profit ? 'Net Profit' : 'Net Loss'} for the period
                </div>
                <div style={{ fontSize: 13, color: pl.is_profit ? '#16a34a' : '#dc2626', marginTop: 3 }}>
                  {from} &nbsp;→&nbsp; {to}
                  {margin !== null && `  ·  Profit margin: ${margin}%`}
                  {!pl.is_profit && parseFloat(margin) < -20 && (
                    <span style={{ marginLeft:8, fontSize:11, background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:20, fontWeight:600 }}>
                      ⚠️ {parseFloat(margin) < -40 ? 'Critical — urgent action needed' : 'Significant loss — review required'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'var(--font-display)', color: pl.is_profit ? '#16a34a' : '#dc2626' }}>
              {pl.is_profit ? '+' : '−'}{fmtK(Math.abs(pl.net_profit))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}