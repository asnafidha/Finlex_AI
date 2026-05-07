import { useState, useEffect, useCallback } from 'react'
import {
    CreditCard, RefreshCw, AlertCircle, CheckCircle, Clock,
    TrendingDown, TrendingUp, RotateCcw, PlusCircle, ChevronDown,
    ChevronUp, FileText, Banknote, Building2, Smartphone, ArrowDownLeft, ArrowUpRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const fmt = (n) => '₹' + Math.abs(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const PAYMENT_MODES = [
    { value: 'bank', label: 'Bank Transfer', icon: Building2 },
    { value: 'upi', label: 'UPI', icon: Smartphone },
    { value: 'neft', label: 'NEFT', icon: Building2 },
    { value: 'rtgs', label: 'RTGS', icon: Building2 },
    { value: 'cheque', label: 'Cheque', icon: FileText },
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
]

const MODE_COLORS = {
    bank: '#1d4ed8', upi: '#7c3aed', neft: '#0891b2',
    rtgs: '#0891b2', cheque: '#ca8a04', cash: '#16a34a', credit_card: '#dc2626',
}

const AGING_COLORS = {
    not_due: '#16a34a', '0_30': '#1d4ed8', '31_60': '#ca8a04',
    '61_90': '#ea580c', over_90: '#dc2626',
}

function api(path, opts = {}) {
    return fetch(`${BASE_URL}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
    }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'API error'); return d })
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon }) {
    return (
        <div style={{ background: 'var(--white)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{value}</div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// Tab 1: Payment History
// ══════════════════════════════════════════════════════════════
function PaymentHistory({ company_id }) {
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reversing, setReversing] = useState(null)
    const [reverseModal, setReverseModal] = useState(null)
    const [reverseReason, setReverseReason] = useState('')

    const load = useCallback(async () => {
        setLoading(true); setError('')
        try {
            const data = await api(`/payments?company_id=${company_id}`)
            setPayments(data)
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }, [company_id])

    useEffect(() => { load() }, [load])

    const handleReverse = async () => {
        if (!reverseModal || !reverseReason.trim()) return
        setReversing(reverseModal.journal_entry_id)
        try {
            await api(`/payments/${reverseModal.journal_entry_id}/reverse`, {
                method: 'POST',
                body: JSON.stringify({ reason: reverseReason }),
            })
            setReverseModal(null)
            setReverseReason('')
            load()
        } catch (e) { setError('Reversal failed: ' + e.message) }
        finally { setReversing(null) }
    }

    const totalReceived = payments.filter(p => !p.is_reversed && !p.is_reversal && p.amount_paid > 0).reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0)
    const totalReversed = payments.filter(p => p.is_reversed).length

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                <StatCard label="Total Payments" value={payments.filter(p => !p.is_reversal).length} color="#1d4ed8" icon={CheckCircle} />
                <StatCard label="Amount Collected" value={fmt(totalReceived)} color="#16a34a" icon={TrendingUp} />
                <StatCard label="Reversed" value={totalReversed} color="#dc2626" icon={RotateCcw} />
            </div>

            {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            {/* Table */}
            <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>All Payments</h3>
                    <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'transparent', color: 'var(--gray-600)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>Loading payments…</div>
                ) : payments.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>No payments recorded yet.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--navy)' }}>
                                {['Entry#', 'Date', 'Invoice', 'Party', 'Mode', 'Amount', 'Status', 'Action'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((p, i) => {
                                const modeMatch = p.narration?.match(/\[([A-Z_]+)\]/)
                                const mode = modeMatch ? modeMatch[1].toLowerCase() : 'bank'
                                const isRev = p.is_reversal
                                const wasRevd = p.is_reversed
                                return (
                                    <tr key={p.journal_entry_id} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)', opacity: wasRevd ? 0.55 : 1 }}>
                                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.entry_number}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{fmtDate(p.payment_date)}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#1d4ed8', fontWeight: 500 }}>{p.invoice_number || '—'}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{p.party_name || '—'}</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: (MODE_COLORS[mode] || '#6b7280') + '18', color: MODE_COLORS[mode] || '#6b7280', textTransform: 'uppercase' }}>
                                                {mode.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: isRev ? '#dc2626' : '#16a34a' }}>
                                            {isRev ? '−' : '+'}{fmt(p.amount_paid)}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            {isRev ? (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#fef2f2', color: '#dc2626' }}>Reversal</span>
                                            ) : wasRevd ? (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280' }}>Reversed</span>
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a' }}>Posted</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            {!isRev && !wasRevd && (
                                                <button
                                                    onClick={() => setReverseModal(p)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                                                >
                                                    <RotateCcw size={11} /> Reverse
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Reversal Modal */}
            {reverseModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--white)', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Reverse Payment</h3>
                        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 18 }}>
                            Reversing <strong>{reverseModal.entry_number}</strong> — {fmt(reverseModal.amount_paid)} for {reverseModal.party_name || reverseModal.invoice_number}
                        </p>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 6 }}>Reason (required)</label>
                        <textarea
                            value={reverseReason}
                            onChange={e => setReverseReason(e.target.value)}
                            placeholder="e.g. Payment made in error, duplicate payment..."
                            rows={3}
                            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--gray-200)', padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-body)', resize: 'none', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setReverseModal(null); setReverseReason('') }} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'transparent', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                            <button
                                onClick={handleReverse}
                                disabled={!reverseReason.trim() || reversing === reverseModal.journal_entry_id}
                                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: (!reverseReason.trim() || reversing) ? 0.6 : 1 }}
                            >
                                {reversing ? 'Reversing…' : 'Confirm Reversal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// Tab 2: Aging Report
// ══════════════════════════════════════════════════════════════
function AgingReport({ company_id }) {
    const [type, setType] = useState('receivable')
    const [aging, setAging] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        setLoading(true); setError(''); setAging(null)
        try {
            const data = await api(`/payments/aging?company_id=${company_id}&type=${type}`)
            setAging(data)
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }, [company_id, type])

    useEffect(() => { load() }, [load])

    const BUCKETS = [
        { key: 'not_due', label: 'Not Due', color: AGING_COLORS.not_due },
        { key: '0_30', label: '0–30 days', color: AGING_COLORS['0_30'] },
        { key: '31_60', label: '31–60 days', color: AGING_COLORS['31_60'] },
        { key: '61_90', label: '61–90 days', color: AGING_COLORS['61_90'] },
        { key: 'over_90', label: '90+ days', color: AGING_COLORS.over_90 },
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Toggle */}
            <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: 'receivable', label: 'Accounts Receivable (AR)', icon: ArrowDownLeft },
                { v: 'payable', label: 'Accounts Payable (AP)', icon: ArrowUpRight }].map(({ v, label, icon: Icon }) => (
                    <button key={v} onClick={() => setType(v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: `1px solid ${type === v ? 'var(--navy)' : 'var(--gray-200)'}`, background: type === v ? 'var(--navy)' : 'transparent', color: type === v ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}>
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>Loading aging report…</div>}

            {aging && (
                <>
                    {/* Bucket Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
                        {BUCKETS.map(b => (
                            <div key={b.key} style={{ background: 'var(--white)', borderRadius: 12, padding: '14px 16px', border: `1px solid ${b.color}30`, boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: b.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{b.label}</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>{fmt(aging.totals[b.key] || 0)}</div>
                                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{(aging.buckets[b.key] || []).length} invoices</div>
                            </div>
                        ))}
                    </div>

                    {/* Grand total */}
                    <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Total Outstanding {type === 'receivable' ? 'Receivable' : 'Payable'}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{fmt(aging.totals.grand_total || 0)}</span>
                    </div>

                    {/* Detail per bucket */}
                    {BUCKETS.filter(b => (aging.buckets[b.key] || []).length > 0).map(b => (
                        <div key={b.key} style={{ background: 'var(--white)', borderRadius: 14, border: `1px solid ${b.color}30`, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ padding: '12px 18px', background: b.color + '0f', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.label}</span>
                                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>· {(aging.buckets[b.key] || []).length} invoices · {fmt(aging.totals[b.key] || 0)}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--gray-100)' }}>
                                        {['Party', 'Invoice', 'Invoice Date', 'Due Date', 'Total', 'Paid', 'Outstanding', 'Days'].map(h => (
                                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-600)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(aging.buckets[b.key] || []).map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                                            <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{row.party_name}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 12, color: '#1d4ed8', fontFamily: 'var(--font-mono)' }}>{row.invoice_number}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{fmtDate(row.invoice_date)}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{fmtDate(row.due_date)}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--navy)' }}>{fmt(row.invoice_total)}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 13, color: '#16a34a' }}>{fmt(row.total_paid)}</td>
                                            <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: b.color }}>{fmt(row.outstanding)}</td>
                                            <td style={{ padding: '9px 14px' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: b.color + '18', color: b.color }}>
                                                    {row.days_overdue < 0 ? `${Math.abs(row.days_overdue)}d left` : `${row.days_overdue}d`}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {aging.totals.grand_total === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>No outstanding {type} invoices. 🎉</div>
                    )}
                </>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// Tab 3: Advance / On-Account Payments
// ══════════════════════════════════════════════════════════════
function AdvancePayments({ company_id }) {
    const [advances, setAdvances] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({
        payment_type: 'received',
        party_name: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'bank',
        reference: '',
        notes: '',
    })
    const [formErr, setFormErr] = useState('')

    const load = useCallback(async () => {
        setLoading(true); setError('')
        try {
            const data = await api(`/payments/advances?company_id=${company_id}`)
            setAdvances(data)
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }, [company_id])

    useEffect(() => { load() }, [load])

    const handleSave = async () => {
        setFormErr('')
        if (!form.party_name.trim()) return setFormErr('Party name is required')
        if (!form.amount || parseFloat(form.amount) <= 0) return setFormErr('Valid amount is required')
        setSaving(true)
        try {
            await api('/payments/advance', {
                method: 'POST',
                body: JSON.stringify({ company_id, ...form, amount: parseFloat(form.amount) }),
            })
            setShowForm(false)
            setForm({ payment_type: 'received', party_name: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank', reference: '', notes: '' })
            load()
        } catch (e) { setFormErr(e.message) }
        finally { setSaving(false) }
    }

    const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Advance / On-Account Payments</h3>
                    <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '4px 0 0' }}>Payments received or made before an invoice is raised</p>
                </div>
                <button onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--navy)', color: 'var(--gold)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <PlusCircle size={14} /> Record Advance
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 18 }}>New Advance Payment</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                        {/* Payment type */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Type</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[{ v: 'received', label: 'Received (AR)', color: '#16a34a' }, { v: 'made', label: 'Paid (AP)', color: '#dc2626' }].map(({ v, label, color }) => (
                                    <button key={v} onClick={() => setF('payment_type', v)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${form.payment_type === v ? color : 'var(--gray-200)'}`, background: form.payment_type === v ? color + '18' : 'transparent', color: form.payment_type === v ? color : 'var(--gray-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Amount */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Amount (₹)</label>
                            <input type="number" value={form.amount} onChange={e => setF('amount', e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                        {/* Party */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Party Name</label>
                            <input type="text" value={form.party_name} onChange={e => setF('party_name', e.target.value)} placeholder="Customer / Vendor name" style={inputStyle} />
                        </div>
                        {/* Date */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Payment Date</label>
                            <input type="date" value={form.payment_date} onChange={e => setF('payment_date', e.target.value)} style={inputStyle} />
                        </div>
                        {/* Mode */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Payment Mode</label>
                            <select value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)} style={inputStyle}>
                                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        {/* Reference */}
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 5 }}>Reference / UTR (optional)</label>
                            <input type="text" value={form.reference} onChange={e => setF('reference', e.target.value)} placeholder="Txn ref, cheque no..." style={inputStyle} />
                        </div>
                    </div>

                    {formErr && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>{formErr}</div>}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowForm(false); setFormErr('') }} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'transparent', color: 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: 'var(--gold)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Saving…' : 'Record Advance'}
                        </button>
                    </div>
                </div>
            )}

            {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            {/* List */}
            <div style={{ background: 'var(--white)', borderRadius: 14, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>Loading…</div>
                ) : advances.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>No advance payments recorded yet.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--navy)' }}>
                                {['Entry#', 'Date', 'Description', 'Received', 'Paid Out', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {advances.map((a, i) => (
                                <tr key={a.id} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)', opacity: a.is_reversed ? 0.5 : 1 }}>
                                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--navy)', fontWeight: 600 }}>{a.entry_number}</td>
                                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gray-600)' }}>{fmtDate(a.entry_date)}</td>
                                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--navy)' }}>{a.narration}</td>
                                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{parseFloat(a.received) > 0 ? fmt(a.received) : '—'}</td>
                                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{parseFloat(a.paid_out) > 0 ? fmt(a.paid_out) : '—'}</td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: a.is_reversed ? '#f3f4f6' : '#f0fdf4', color: a.is_reversed ? '#6b7280' : '#16a34a' }}>
                                            {a.is_reversed ? 'Reversed' : 'Posted'}
                                        </span>
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

const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--gray-200)', fontSize: 13, color: 'var(--navy)',
    fontFamily: 'var(--font-body)', outline: 'none', background: 'white',
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════
export default function PaymentsPage() {
    const { company } = useAuth()
    const [tab, setTab] = useState('history')

    if (!company?.id) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <AlertCircle size={40} color="var(--gray-400)" style={{ marginBottom: 12 }} />
                <div style={{ color: 'var(--gray-500)', fontSize: 15 }}>Please select a company first.</div>
            </div>
        )
    }

    const TABS = [
        { id: 'history', label: '📋 Payment History' },
        { id: 'aging', label: '⏱ Aging Report' },
        { id: 'advances', label: '💼 Advance Payments' },
    ]

    return (
        <div style={{ animation: 'fadeUp 0.5s ease' }}>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
                    Payments
                </h1>
                <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>
                    Payment history, aging analysis, reversal, and advance payments
                </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: tab === t.id ? 'var(--navy)' : 'transparent', color: tab === t.id ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'history' && <PaymentHistory company_id={company.id} />}
            {tab === 'aging' && <AgingReport company_id={company.id} />}
            {tab === 'advances' && <AdvancePayments company_id={company.id} />}
        </div>
    )
}
