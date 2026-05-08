import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { accounts, reports } from '../services/api'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'

async function exportToExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const typeColors = {
  asset: { bg: '#eff6ff', color: '#1d4ed8' },
  liability: { bg: '#f5f3ff', color: '#6d28d9' },
  equity: { bg: '#ecfdf5', color: '#065f46' },
  revenue: { bg: '#fef3c7', color: '#92400e' },
  expense: { bg: '#fef2f2', color: '#dc2626' },
}

export default function AuditPage() {
  const { company } = useAuth()
  const [tab, setTab] = useState('accounts')
  const [accountList, setAccountList] = useState([])
  const [balanceSheet, setBalanceSheet] = useState(null)
  const [trialBalance, setTrialBalance] = useState(null)
  const [ledger, setLedger] = useState([])
  const [selectedAcc, setSelectedAcc] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (company?.id) loadData()
  }, [company, tab])

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
  })

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Accounts & Reports</h1>
            <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Chart of accounts, balance sheet, trial balance and ledger</p>
          </div>
          {/* Context-aware Export Excel button */}
          {tab !== 'accounts' && (
            <button
              onClick={async () => {
                try {
                  if (tab === 'trial-balance' && trialBalance?.accounts) {
                    await exportToExcel(
                      trialBalance.accounts.map(a => ({ Code: a.code, Account: a.name, Type: a.type, Debit: parseFloat(a.total_debit || 0), Credit: parseFloat(a.total_credit || 0), Balance: parseFloat(a.balance || 0) })),
                      `TrialBalance_${company?.name}.xlsx`
                    )
                  } else if (tab === 'balance-sheet' && balanceSheet) {
                    const rows = [
                      ...balanceSheet.assets.map(a => ({ Section: 'Assets', Account: a.name, Amount: parseFloat(a.closing_balance || 0) })),
                      ...balanceSheet.liabilities.map(a => ({ Section: 'Liabilities', Account: a.name, Amount: parseFloat(a.closing_balance || 0) })),
                      { Section: 'Equity', Account: 'Net Profit', Amount: parseFloat(balanceSheet.net_profit || 0) },
                    ]
                    await exportToExcel(rows, `BalanceSheet_${company?.name}.xlsx`)
                  } else if (tab === 'ledger' && ledger.length > 0) {
                    await exportToExcel(
                      ledger.map(r => ({ Date: new Date(r.entry_date).toLocaleDateString('en-IN'), Entry: r.entry_number, Account: r.account_name, Narration: r.narration, Debit: parseFloat(r.debit_amount || 0), Credit: parseFloat(r.credit_amount || 0), Balance: parseFloat(r.running_balance || 0) })),
                      `Ledger_${company?.name}.xlsx`
                    )
                  }
                } catch (e) { alert('Excel export failed: ' + e.message) }
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
        {[['accounts', 'Chart of Accounts'], ['trial-balance', 'Trial Balance'], ['balance-sheet', 'Balance Sheet'], ['ledger', 'Ledger']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading...</div>
      ) : (
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
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: t.bg, color: t.color, textTransform: 'capitalize' }}>{acc.type}</span>
                        </td>
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
          {tab === 'trial-balance' && trialBalance && (
            <div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Debit', value: fmt(trialBalance.total_debit), color: '#1d4ed8' },
                  { label: 'Total Credit', value: fmt(trialBalance.total_credit), color: '#6d28d9' },
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
                      {['Code', 'Account', 'Type', 'Debit', 'Credit', 'Balance'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.accounts.map((acc, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-600)' }}>{acc.code}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{acc.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)', textTransform: 'capitalize' }}>{acc.type}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>{parseFloat(acc.total_debit) > 0 ? fmt(acc.total_debit) : '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{parseFloat(acc.total_credit) > 0 ? fmt(acc.total_credit) : '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: parseFloat(acc.balance) >= 0 ? 'var(--navy)' : '#dc2626' }}>{fmt(acc.balance)}</td>
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
              {/* Assets */}
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

              {/* Liabilities + Equity */}
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
                <input
                  placeholder="Filter by account code (e.g. 1003)"
                  value={selectedAcc}
                  onChange={e => setSelectedAcc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadData()}
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--navy)', background: 'var(--white)', outline: 'none', width: 280 }}
                />
                <button onClick={loadData} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: 'var(--white)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Search
                </button>
              </div>
              <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                {ledger.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>No entries found. Try a different account code.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--navy)' }}>
                        {['Date', 'Entry No', 'Account', 'Narration', 'Debit', 'Credit', 'Balance'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)' }}>{new Date(row.entry_date).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-600)' }}>{row.entry_number}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--navy)' }}>{row.account_name}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--gray-600)', maxWidth: 200 }}>{row.narration}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>{parseFloat(row.debit_amount) > 0 ? fmt(row.debit_amount) : '—'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{parseFloat(row.credit_amount) > 0 ? fmt(row.credit_amount) : '—'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: row.running_balance >= 0 ? 'var(--navy)' : '#dc2626' }}>{fmt(row.running_balance)}</td>
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