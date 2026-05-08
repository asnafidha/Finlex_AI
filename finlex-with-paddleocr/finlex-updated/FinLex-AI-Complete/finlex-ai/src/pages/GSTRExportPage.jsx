import { useState, useEffect } from 'react'
import { Download, FileText, TrendingUp, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react'
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

const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()

export default function GSTRExportPage() {
  const { company } = useAuth()
  const [tab, setTab]           = useState('gstr1')
  const [month, setMonth]       = useState(new Date().getMonth() + 1)
  const [year, setYear]         = useState(CURRENT_YEAR - 1)
  const [gstr1, setGstr1]       = useState(null)
  const [gstr3b, setGstr3b]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { if (company?.id) loadData() }, [company, month, year, tab])

  const loadData = async () => {
    setLoading(true); setError('')
    try {
      const params = `company_id=${company.id}&month=${month}&year=${year}`
      if (tab === 'gstr1') {
        const data = await request(`/gstr/gstr1?${params}`)
        setGstr1(data)
      } else {
        const data = await request(`/gstr/gstr3b?${params}`)
        setGstr3b(data)
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const downloadJSON = async () => {
    try {
      const params = `company_id=${company.id}&type=${tab}&month=${month}&year=${year}`
      const res = await fetch(`${BASE_URL}/gstr/export-json?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${tab}_${year}_${String(month).padStart(2,'0')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError('Export failed: ' + err.message) }
  }

  const downloadCSV = async () => {
    try {
      const params = `company_id=${company.id}&type=${tab}&month=${month}&year=${year}`
      const res = await fetch(`${BASE_URL}/gstr/export-csv?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${tab}_${year}_${String(month).padStart(2,'0')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError('Export failed: ' + err.message) }
  }

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      padding: '9px 24px', borderRadius: 9, border: 'none',
      background: tab === id ? 'var(--navy)' : 'transparent',
      color: tab === id ? 'var(--white)' : 'var(--gray-600)',
      fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
    }}>{label}</button>
  )

  const selStyle = {
    padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--gray-200)',
    fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--navy)',
    background: 'var(--white)', cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
            GST Returns Export
          </h1>
          <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Generate GSTR-1 and GSTR-3B from your invoice data</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={downloadCSV} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 10, border: '1.5px solid var(--gray-200)', background: 'var(--white)',
            color: 'var(--navy)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}><Download size={15} /> CSV</button>
          <button onClick={downloadJSON} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)',
            color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}><Download size={15} /> JSON Export</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--white)', borderRadius: 12, padding: 4, border: '1px solid var(--gray-200)' }}>
          {tabBtn('gstr1', 'GSTR-1')}
          {tabBtn('gstr3b', 'GSTR-3B')}
        </div>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={selStyle}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selStyle}>
          {[CURRENT_YEAR-2, CURRENT_YEAR-1, CURRENT_YEAR, CURRENT_YEAR+1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          borderRadius: 8, border: '1.5px solid var(--gray-200)', background: 'var(--white)',
          color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading GST data...</div>
      ) : tab === 'gstr1' && gstr1 ? (
        <GSTR1View data={gstr1} />
      ) : tab === 'gstr3b' && gstr3b ? (
        <GSTR3BView data={gstr3b} />
      ) : null}
    </div>
  )
}

function GSTR1View({ data }) {
  const { summary, b2b, b2c, b2cl, hsn_summary } = data
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          { label: 'Total Invoices', value: summary.total_invoices, color: '#3b82f6' },
          { label: 'Taxable Value',  value: '₹' + parseFloat(summary.total_taxable).toLocaleString('en-IN'), color: '#10b981' },
          { label: 'Total Tax',      value: '₹' + (parseFloat(summary.total_cgst) + parseFloat(summary.total_sgst) + parseFloat(summary.total_igst)).toLocaleString('en-IN'), color: '#f59e0b' },
          { label: 'Invoice Value',  value: '₹' + parseFloat(summary.total_value).toLocaleString('en-IN'), color: '#8b5cf6' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--white)', borderRadius: 14, padding: '20px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 12, color: 'var(--gray-600)', fontWeight: 500, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* B2B Table */}
      {b2b?.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }}>B2B</div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Business to Business ({b2b.length} invoices)</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-100)' }}>
                {['Invoice No','Date','Party','GSTIN','Taxable','CGST','SGST','IGST','Total'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b2b.map((inv, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{inv.invoice_number}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--navy)' }}>{inv.party_name}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--gray-600)', fontFamily: 'var(--font-mono)' }}>{inv.gstin}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(inv.taxable_value).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(inv.cgst).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(inv.sgst).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(inv.igst).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>₹{parseFloat(inv.invoice_value).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* HSN Summary */}
      {hsn_summary?.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>HSN / SAC Summary</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-100)' }}>
                {['HSN/SAC','Description','Qty','Taxable Value','CGST','SGST','IGST'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-600)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hsn_summary.map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'var(--font-mono)' }}>{h.hsn_sac_code}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--gray-600)' }}>{h.description}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>{h.total_quantity}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(h.taxable_value).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(h.cgst).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(h.sgst).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>₹{parseFloat(h.igst).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GSTR3BView({ data }) {
  const { outward_supplies, itc_available, tax_payable } = data
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
      {/* 3.1 Outward Supplies */}
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={18} color="#1d4ed8" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>SECTION 3.1</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Outward Supplies</div>
          </div>
        </div>
        {[
          { label: 'Taxable Value', value: outward_supplies?.taxable_value },
          { label: 'CGST',          value: outward_supplies?.cgst },
          { label: 'SGST',          value: outward_supplies?.sgst },
          { label: 'IGST',          value: outward_supplies?.igst },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--gray-200)' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>₹{parseFloat(r.value || 0).toLocaleString('en-IN')}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Total Tax</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>₹{parseFloat(outward_supplies?.total_tax || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Section 4 ITC */}
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={18} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>SECTION 4</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>ITC Available</div>
          </div>
        </div>
        {[
          { label: 'CGST ITC', value: itc_available?.cgst },
          { label: 'SGST ITC', value: itc_available?.sgst },
          { label: 'IGST ITC', value: itc_available?.igst },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--gray-200)' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>₹{parseFloat(r.value || 0).toLocaleString('en-IN')}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Total ITC</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>₹{parseFloat(itc_available?.total_itc || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Tax Payable */}
      <div style={{ background: 'var(--navy)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color="#C9A84C" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SECTION 6</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Tax Payable</div>
          </div>
        </div>
        {[
          { label: 'Output Tax',    value: tax_payable?.output_tax,    color: 'rgba(255,255,255,0.7)' },
          { label: 'ITC Utilized',  value: tax_payable?.itc_utilized,  color: '#10b981' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: r.color }}>₹{parseFloat(r.value || 0).toLocaleString('en-IN')}</span>
          </div>
        ))}
        <div style={{ marginTop: 16, padding: '16px', background: 'rgba(201,168,76,0.15)', borderRadius: 10, border: '1px solid rgba(201,168,76,0.3)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>NET PAYABLE TO GOVT</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: '#C9A84C' }}>
            ₹{parseFloat(tax_payable?.net_payable || 0).toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </div>
  )
}