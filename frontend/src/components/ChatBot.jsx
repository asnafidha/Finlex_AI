import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Context-aware suggested questions
const getSuggestions = (company) => [
  company ? `Why is ${company.name}'s profit low?` : 'Why is my profit low?',
  'Which invoices are overdue?',
  'Am I at risk for any GST penalties?',
  'What ITC can I claim this month?',
  'Explain my TDS liability',
  'What should I do before month end?',
]

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')

// ────────────────────────────────────────────────────────────────────────────────
// Parse action buttons from AI response
// Looks for patterns like: [Reclassify as Asset] or [Create TDS Entry]
// ────────────────────────────────────────────────────────────────────────────────
const parseActionsFromText = (text) => {
  const actionRegex = /\[(.*?)\]/g
  const actions = []
  let match
  while ((match = actionRegex.exec(text)) !== null) {
    actions.push({
      label: match[1],
      action: match[1].toLowerCase().replace(/\s+/g, '_')
    })
  }
  return actions
}

// ────────────────────────────────────────────────────────────────────────────────
// Clean text by removing action brackets (so they don't show as text + button)
// ────────────────────────────────────────────────────────────────────────────────
const cleanText = (text) => {
  return text.replace(/\[(.*?)\]/g, '').trim()
}

// ────────────────────────────────────────────────────────────────────────────────
// Handle action button clicks - FUZZY MATCHING for intelligent navigation
// ────────────────────────────────────────────────────────────────────────────────
const handleActionClick = (action) => {
  console.log('Action clicked:', action)
  
  const normalizedAction = action.toLowerCase()
  
  // ─── ASSET RECLASSIFICATION ──────────────────────────────────────────────
  if (normalizedAction.includes('reclassify') || 
      normalizedAction.includes('fixed_asset') || 
      normalizedAction.includes('capitalize') ||
      normalizedAction.includes('asset')) {
    const invoiceMatch = action.match(/pur-\d{4}-\d{3,4}/i)
    const invoiceParam = invoiceMatch ? `?invoice=${invoiceMatch[0].toUpperCase()}` : ''
    window.location.href = `/fixed-assets/new${invoiceParam}`
    return
  }
  
  // ─── TDS ACTIONS ─────────────────────────────────────────────────────────
  if (normalizedAction.includes('tds') || 
      normalizedAction.includes('194j') || 
      normalizedAction.includes('194c') || 
      normalizedAction.includes('194i') ||
      normalizedAction.includes('194h') ||
      normalizedAction.includes('194q') ||
      normalizedAction.includes('deduct')) {
    const sectionMatch = action.match(/194[a-z]/i)
    const sectionParam = sectionMatch ? `?section=${sectionMatch[0].toUpperCase()}` : ''
    window.location.href = `/tds/new${sectionParam}`
    return
  }
  
  // ─── GST FILING ──────────────────────────────────────────────────────────
  if (normalizedAction.includes('gstr-1') || 
      normalizedAction.includes('gstr1') || 
      normalizedAction.includes('file_gstr-1') ||
      normalizedAction.includes('gstr_1')) {
    window.location.href = '/gst/export?type=gstr1'
    return
  }
  
  if (normalizedAction.includes('gstr-3b') || 
      normalizedAction.includes('gstr3b') || 
      normalizedAction.includes('file_gstr-3b')) {
    window.location.href = '/gst/export?type=gstr3b'
    return
  }
  
  if (normalizedAction.includes('file_gstr') || normalizedAction.includes('gst_return')) {
    window.location.href = '/gst/export'
    return
  }
  
  // ─── ITC RECONCILIATION ─────────────────────────────────────────────────
  if (normalizedAction.includes('gstr-2b') || 
      normalizedAction.includes('gstr2b') || 
      normalizedAction.includes('reconcile') || 
      normalizedAction.includes('itc') ||
      normalizedAction.includes('claim_itc') ||
      normalizedAction.includes('input_tax')) {
    window.location.href = '/gst/reconciliation'
    return
  }
  
  // ─── COMPLIANCE ──────────────────────────────────────────────────────────
  if (normalizedAction.includes('compliance') || 
      normalizedAction.includes('deadline') || 
      normalizedAction.includes('file_now') ||
      normalizedAction.includes('view_calendar') ||
      normalizedAction.includes('overdue')) {
    window.location.href = '/compliance'
    return
  }
  
  // ─── RECEIVABLES / UNPAID INVOICES ──────────────────────────────────────
  if (normalizedAction.includes('unpaid') || 
      normalizedAction.includes('receivable') || 
      normalizedAction.includes('collect') || 
      normalizedAction.includes('follow_up') ||
      normalizedAction.includes('recover') ||
      normalizedAction.includes('overdue_invoice')) {
    window.location.href = '/invoices?status=unpaid'
    return
  }
  
  // ─── FINANCIAL REPORTS ───────────────────────────────────────────────────
  if (normalizedAction.includes('p&l') || 
      normalizedAction.includes('profit') || 
      normalizedAction.includes('report') ||
      normalizedAction.includes('view_pnl') ||
      normalizedAction.includes('financial_statement')) {
    window.location.href = '/reports/pnl'
    return
  }
  
  if (normalizedAction.includes('balance_sheet') || normalizedAction.includes('trial_balance')) {
    window.location.href = '/reports'
    return
  }
  
  // ─── DEPRECIATION ────────────────────────────────────────────────────────
  if (normalizedAction.includes('depreciation') || normalizedAction.includes('wdv') || normalizedAction.includes('slm')) {
    window.location.href = '/fixed-assets/depreciation'
    return
  }
  
  // ─── ADVANCE TAX ─────────────────────────────────────────────────────────
  if (normalizedAction.includes('advance_tax') || 
      normalizedAction.includes('advance tax') ||
      normalizedAction.includes('pay_tax')) {
    window.location.href = '/tax/advance'
    return
  }
  
  // ─── JOURNAL ENTRIES ─────────────────────────────────────────────────────
  if (normalizedAction.includes('journal') || normalizedAction.includes('create_entry')) {
    window.location.href = '/journal/new'
    return
  }
  
  // ─── PAYROLL ─────────────────────────────────────────────────────────────
  if (normalizedAction.includes('payroll') || normalizedAction.includes('salary') || normalizedAction.includes('pf')) {
    window.location.href = '/payroll'
    return
  }
  
  // ─── BANK RECONCILIATION ─────────────────────────────────────────────────
  if (normalizedAction.includes('bank') || normalizedAction.includes('reconciliation')) {
    window.location.href = '/bank/reconciliation'
    return
  }
  
  // ─── DASHBOARD ───────────────────────────────────────────────────────────
  if (normalizedAction.includes('dashboard') || normalizedAction.includes('mission_control')) {
    window.location.href = '/'
    return
  }
  
  // Fallback - show friendly message with extracted info
  const friendlyName = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const invoiceMatches = action.match(/pur-\d{4}-\d{3,4}/gi) || []
  const salMatches = action.match(/sal-\d{4}-\d{3,4}/gi) || []
  const allInvoices = [...invoiceMatches, ...salMatches]
  
  let message = `🚀 Action: ${friendlyName}\n\n`
  if (allInvoices.length > 0) {
    message += `📋 Invoice references: ${allInvoices.join(', ').toUpperCase()}\n\n`
  }
  message += `✨ This would navigate to the relevant module in production.`
  
  alert(message)
}

export default function ChatBot() {
  const { company } = useAuth()
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([
    { from: 'ai', text: "Hi! I'm FinLex AI — your CA assistant.\n\nAsk me anything about GST, TDS, ITR, compliance deadlines, tax planning, or your financial health. I have access to your live financial data." }
  ])
  const [input, setInput]   = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  // Listen for pre-filled questions from "Explain This" / "Ask AI" buttons
  useEffect(() => {
    const handler = (e) => {
      const { question } = e.detail || {}
      if (question) {
        setOpen(true)
        // Small delay so chat opens first
        setTimeout(() => send(question), 200)
      }
    }
    window.addEventListener('finlex-ask-ai', handler)
    return () => window.removeEventListener('finlex-ask-ai', handler)
  }, [messages, company])

  const send = async (msg) => {
    if (!msg?.trim() || typing) return
    const userMsg = msg.trim()
    const newMessages = [...messages, { from: 'user', text: userMsg }]
    setMessages(newMessages)
    setInput('')
    setTyping(true)

    try {
      // Send full conversation history so AI has context of prior messages
      const history = newMessages.map(m => ({
        role:    m.from === 'user' ? 'user' : 'assistant',
        content: m.text
      }))

      const response = await fetch(`${BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ messages: history, company }),
      })

      const data = await response.json()
      const aiText = data.text || 'Sorry, could not get a response. Please try again.'
      setMessages(m => [...m, { from: 'ai', text: aiText }])
    } catch (err) {
      setMessages(m => [...m, { from: 'ai', text: 'Connection error. Please check the server and try again.' }])
    } finally {
      setTyping(false)
    }
  }

  const suggestions = getSuggestions(company)

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 999,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--navy), #1e3a5f)',
            border: '2px solid rgba(201,168,76,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(15,31,75,0.35)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <MessageCircle size={22} color="var(--gold)" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 380, height: 580,
          background: 'var(--white)', borderRadius: 20,
          border: '1px solid var(--gray-200)',
          boxShadow: '0 12px 48px rgba(15,31,75,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--navy), #1e3a5f)',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid rgba(201,168,76,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color="var(--gold)" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-display)' }}>FinLex AI</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {company ? `${company.name} · live data` : 'CA Assistant'}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => {
              const actions = m.from === 'ai' ? parseActionsFromText(m.text) : []
              const displayText = m.from === 'ai' ? cleanText(m.text) : m.text
              
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                  {/* Message bubble */}
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 13px',
                    borderRadius: m.from === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                    background: m.from === 'user'
                      ? 'linear-gradient(135deg, var(--navy), #1e3a5f)'
                      : 'var(--gray-100)',
                    color: m.from === 'user' ? 'var(--white)' : 'var(--navy)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    fontFamily: 'var(--font-body)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {displayText}
                  </div>
                  
                  {/* Action Buttons - only for AI messages that have actions */}
                  {actions.length > 0 && (
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: 6, 
                      marginTop: 8,
                      maxWidth: '85%',
                    }}>
                      {actions.map((act, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleActionClick(act.action)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 20,
                            border: '1px solid var(--gold)',
                            background: 'rgba(201,168,76,0.08)',
                            color: 'var(--navy)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            fontFamily: 'var(--font-body)',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--gold)'
                            e.currentTarget.style.color = 'var(--navy)'
                            e.currentTarget.style.borderColor = 'var(--gold)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(201,168,76,0.08)'
                            e.currentTarget.style.color = 'var(--navy)'
                            e.currentTarget.style.borderColor = 'var(--gold)'
                          }}
                        >
                          {act.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {typing && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: 'var(--gray-100)', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gray-400)', animation: `bounce 1.2s ease ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested questions — show only when chat is fresh */}
          {messages.length <= 1 && !typing && (
            <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.4px', marginBottom: 2 }}>SUGGESTED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {suggestions.slice(0, 4).map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      padding: '5px 10px', borderRadius: 20,
                      border: '1px solid var(--gray-200)', background: 'var(--white)',
                      color: 'var(--navy)', fontSize: 11, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy)'; e.currentTarget.style.color = 'white' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--navy)' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
              placeholder="Ask about GST, TDS, profit, compliance..."
              disabled={typing}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10,
                border: '1.5px solid var(--gray-200)', fontSize: 13,
                fontFamily: 'var(--font-body)', color: 'var(--navy)',
                background: 'var(--gray-100)', outline: 'none',
                opacity: typing ? 0.6 : 1,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || typing}
              style={{
                width: 38, height: 38, borderRadius: 10, border: 'none',
                background: input.trim() && !typing ? 'var(--navy)' : 'var(--gray-200)',
                color: input.trim() && !typing ? 'var(--gold)' : 'var(--gray-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !typing ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0) }
          30% { transform: translateY(-6px) }
        }
      `}</style>
    </>
  )
}