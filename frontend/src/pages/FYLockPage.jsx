import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Lock, Unlock, AlertTriangle, CheckCircle, Shield, Calendar, User } from 'lucide-react'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')

const request = async (endpoint, options = {}) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...options.headers }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

export default function FYLockPage() {
  const { company } = useAuth()
  const [lockStatus, setLockStatus] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [acting, setActing]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [confirmUnlock, setConfirmUnlock] = useState(false)

  useEffect(() => {
    if (company?.id) loadStatus()
  }, [company])

  const loadStatus = async () => {
    setLoading(true); setError('')
    try {
      const data = await request(`/fy-lock/${company.id}`)
      setLockStatus(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const lockFY = async () => {
    if (!window.confirm(`Lock FY ${lockStatus?.financial_year}?\n\nThis will prevent all new journal entries and invoice creation. Only unlock if corrections are needed.`)) return
    setActing(true); setError(''); setSuccess('')
    try {
      const data = await request(`/fy-lock/${company.id}/lock`, { method: 'POST' })
      setSuccess(data.message)
      loadStatus()
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  const unlockFY = async () => {
    setActing(true); setError(''); setSuccess('')
    try {
      const data = await request(`/fy-lock/${company.id}/unlock`, { method: 'POST' })
      setSuccess(data.message)
      setConfirmUnlock(false)
      loadStatus()
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
          Financial Year Lock
        </h1>
        <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>Lock the financial year after filing to prevent backdated entries</p>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={14} /> {error}</div>}
      {success && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={14} /> {success}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
      ) : lockStatus && (
        <>
          {/* Status banner */}
          <div style={{
            background: lockStatus.fy_locked
              ? 'linear-gradient(135deg, #7f1d1d, #991b1b)'
              : 'linear-gradient(135deg, var(--navy), #1e3a8a)',
            borderRadius: 16, padding: '24px 28px', marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {lockStatus.fy_locked ? <Lock size={24} color="#fca5a5" /> : <Unlock size={24} color="var(--gold)" />}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 600 }}>
                  FY {lockStatus.financial_year} — {lockStatus.name}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--white)' }}>
                  {lockStatus.fy_locked ? '🔒 Financial Year is LOCKED' : '🔓 Financial Year is OPEN'}
                </div>
                {lockStatus.fy_locked && lockStatus.fy_locked_at && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    Locked on {new Date(lockStatus.fy_locked_at).toLocaleString('en-IN')}
                    {lockStatus.locked_by_name && ` by ${lockStatus.locked_by_name}`}
                  </div>
                )}
              </div>
            </div>
            <div>
              {lockStatus.fy_locked ? (
                <button onClick={() => setConfirmUnlock(true)} disabled={acting}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: 13, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
                  <Unlock size={15} /> Unlock FY
                </button>
              ) : (
                <button onClick={lockFY} disabled={acting}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: acting ? 0.7 : 1 }}>
                  <Lock size={15} /> {acting ? 'Locking...' : 'Lock Financial Year'}
                </button>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* What locking does */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={16} color="#dc2626" />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>When FY is Locked</div>
              </div>
              {[
                '❌ No new invoices can be created',
                '❌ No journal entries can be posted',
                '❌ No payments can be recorded',
                '✅ All reports remain viewable',
                '✅ Audit trail preserved',
                '✅ Can be unlocked by CA if needed',
              ].map((item, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--gray-600)', padding: '6px 0', borderBottom: i < 5 ? '1px solid var(--gray-100)' : 'none' }}>{item}</div>
              ))}
            </div>

            {/* When to lock */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={16} color="#16a34a" />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>When to Lock</div>
              </div>
              {[
                '✅ After ITR for the year is filed',
                '✅ After GSTR-9 annual return is filed',
                '✅ After statutory audit is complete',
                '✅ After all books are finalized',
                '⚠️ Do NOT lock before finalizing P&L',
                '⚠️ Locking is reversible — CA can unlock',
              ].map((item, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--gray-600)', padding: '6px 0', borderBottom: i < 5 ? '1px solid var(--gray-100)' : 'none' }}>{item}</div>
              ))}
            </div>
          </div>

          {/* FY details */}
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Financial Year Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { label: 'Company', value: lockStatus.name, Icon: User },
                { label: 'Financial Year', value: lockStatus.financial_year, Icon: Calendar },
                { label: 'FY Period', value: lockStatus.fy_start_date && lockStatus.fy_end_date ? `${new Date(lockStatus.fy_start_date).toLocaleDateString('en-IN')} → ${new Date(lockStatus.fy_end_date).toLocaleDateString('en-IN')}` : '1 Apr → 31 Mar', Icon: Calendar },
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--gray-100)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <item.Icon size={16} color="var(--gray-400)" />
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Unlock confirmation modal */}
      {confirmUnlock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--white)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={20} color="#ca8a04" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Unlock Financial Year?</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>This will allow new entries to be posted</div>
              </div>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
              ⚠️ Unlocking FY {lockStatus?.financial_year} will allow backdated entries. Only proceed if you need to make genuine corrections. Inform your auditor if ITR has already been filed.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmUnlock(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--gray-200)', background: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={unlockFY} disabled={acting} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: '#dc2626', color: 'var(--white)', fontSize: 14, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: acting ? 0.7 : 1 }}>
                {acting ? 'Unlocking...' : 'Yes, Unlock FY'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}