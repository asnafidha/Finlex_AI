const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')

router.use(auth)

//  Helper: fetch real company data 
async function getCompanyContext(company_id) {
  try {
    const today = new Date()
    const month = today.getMonth() + 1
    const year = today.getFullYear()

    const { rows: plRows } = await pool.query(
      `SELECT a.type,a.name,
              COALESCE(SUM(jel.credit_amount),0)-COALESCE(SUM(jel.debit_amount),0) AS amount
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.type IN ('revenue','expense')
       GROUP BY a.id,a.type,a.name ORDER BY a.type DESC,a.code`,
      [company_id]
    )
    const revenue = plRows.filter(r => r.type === 'revenue')
    const expenses = plRows.filter(r => r.type === 'expense')
    const total_revenue = revenue.reduce((s, r) => s + parseFloat(r.amount), 0)
    const total_expense = expenses.reduce((s, r) => s + Math.abs(parseFloat(r.amount)), 0)
    const net_profit = total_revenue - total_expense

    const { rows: gstRows } = await pool.query(
      `SELECT invoice_type,COUNT(*) as count,
              COALESCE(SUM(cgst_amount),0) as cgst,
              COALESCE(SUM(sgst_amount),0) as sgst,
              COALESCE(SUM(igst_amount),0) as igst
       FROM invoices WHERE company_id=$1 AND status!='cancelled'
         AND EXTRACT(MONTH FROM invoice_date)=$2::numeric AND EXTRACT(YEAR FROM invoice_date)=$3::numeric`,
      [company_id, month, year]
    )
    const sales = gstRows.find(r => r.invoice_type === 'sale') || {}
    const output_tax = parseFloat(sales.cgst || 0) + parseFloat(sales.sgst || 0) + parseFloat(sales.igst || 0)

    // Fix: Read ITC from actual Input GST account balances (1004=CGST, 1005=SGST, 1006=IGST)
    // These are debited when purchase invoices are created and credited when ITC is utilised
    const { rows: itcAccRows } = await pool.query(
      `SELECT a.code,
             COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted = true
       WHERE a.company_id = $1 AND a.code IN('1004', '1005', '1006')
       GROUP BY a.id, a.code, a.opening_balance`,
      [company_id]
    )
    const input_tax = itcAccRows.reduce((s, r) => s + parseFloat(r.balance || 0), 0)

    const { rows: unpaidRows } = await pool.query(
      `SELECT invoice_number, invoice_type, party_name, total_amount, due_date
       FROM invoices WHERE company_id = $1 AND payment_status IN('unpaid', 'partial') AND status != 'cancelled'
       ORDER BY due_date ASC LIMIT 10`, [company_id]
    )

    const { rows: compRows } = await pool.query(
      `SELECT name, type, due_date, status,
             CEIL(EXTRACT(EPOCH FROM(due_date - NOW())) / 86400) as days_left
       FROM compliance_deadlines WHERE company_id = $1 ORDER BY due_date ASC LIMIT 15`, [company_id]
    )
    const overdue = compRows.filter(r => r.status === 'pending' && parseFloat(r.days_left) < 0)
    const upcoming = compRows.filter(r => r.status === 'pending' && parseFloat(r.days_left) >= 0)
    const completed = compRows.filter(r => r.status === 'completed')

    const { rows: tdsRows } = await pool.query(
      `SELECT section, COUNT(*) as count, SUM(gross_amount) as gross, SUM(tds_amount) as tds
       FROM tds_entries WHERE company_id = $1 GROUP BY section ORDER BY tds DESC`, [company_id]
    )
    const total_tds = tdsRows.reduce((s, r) => s + parseFloat(r.tds || 0), 0)

    const { rows: bankRows } = await pool.query(
      `SELECT a.code, a.name,
      COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted = true
       WHERE a.company_id = $1 AND a.code IN('1001', '1002')
       GROUP BY a.id, a.code, a.name, a.opening_balance`, [company_id]
    )

    const { rows: invSummary } = await pool.query(
      `SELECT invoice_type, COUNT(*) as total,
      COUNT(*) FILTER(WHERE payment_status = 'paid') as paid,
      COUNT(*) FILTER(WHERE payment_status = 'unpaid') as unpaid,
      COALESCE(SUM(total_amount), 0) as total_amount
       FROM invoices WHERE company_id = $1 AND status != 'cancelled' GROUP BY invoice_type`, [company_id]
    )

    return {
      financial_summary: { total_revenue, total_expense, net_profit, is_profit: net_profit >= 0, revenue_breakdown: revenue.map(r => ({ account: r.name, amount: parseFloat(r.amount) })), expense_breakdown: expenses.map(r => ({ account: r.name, amount: Math.abs(parseFloat(r.amount)) })) },
      gst_this_month: { month: today.toLocaleString('default', { month: 'long' }), year, output_tax, input_tax_credit: input_tax, net_gst_payable: output_tax - input_tax },
      unpaid_invoices: unpaidRows.map(r => ({ invoice: r.invoice_number, type: r.invoice_type, party: r.party_name, amount: parseFloat(r.total_amount), due: r.due_date })),
      compliance: { overdue: overdue.map(r => ({ name: r.name, type: r.type, due: r.due_date, days_overdue: Math.abs(parseFloat(r.days_left)) })), upcoming: upcoming.map(r => ({ name: r.name, type: r.type, due: r.due_date, days_left: parseFloat(r.days_left) })), completed: completed.length, total_overdue: overdue.length },
      tds: { total_tds_deducted: total_tds, by_section: tdsRows.map(r => ({ section: r.section, transactions: parseInt(r.count), gross: parseFloat(r.gross), tds: parseFloat(r.tds) })) },
      cash_and_bank: bankRows.map(r => ({ account: r.name, balance: parseFloat(r.balance) })),
      invoice_summary: invSummary.map(r => ({ type: r.invoice_type, total: parseInt(r.total), paid: parseInt(r.paid), unpaid: parseInt(r.unpaid), total_amount: parseFloat(r.total_amount) })),
    }
  } catch (err) {
    console.error('Error fetching company context:', err)
    return {}
  }
}


//  Helper: fetch ALL companies for CA users 
async function getCAContext(userId) {
  try {
    const { rows: companies } = await pool.query(
      `SELECT c.id, c.name, c.gstin FROM companies c
       JOIN ca_company_access cca ON cca.company_id = c.id
       WHERE cca.ca_id = $1`, [userId]
    )
    if (!companies.length) return null
    const summaries = []
    for (const co of companies) {
      try {
        const ctx = await getCompanyContext(co.id)
        summaries.push({
          company: co.name, gstin: co.gstin,
          revenue: ctx.financial_summary?.total_revenue || 0,
          expenses: ctx.financial_summary?.total_expense || 0,
          net_profit: ctx.financial_summary?.net_profit || 0,
          itc: (ctx.cash_and_bank || []).find(b => b.account?.includes('Input')) || 0,
          overdue_compliances: ctx.compliance?.total_overdue || 0,
          unpaid_invoices: (ctx.invoice_summary || []).find(i => i.type === 'sale')?.unpaid || 0,
          tds_total: ctx.tds?.total_tds_deducted || 0,
        })
      } catch { }
    }
    return summaries
  } catch { return null }
}

//  POST /api/ai/chat 
router.post('/chat', async (req, res) => {
  const { messages, company } = req.body
  if (!messages || !messages.length)
    return res.status(400).json({ error: 'messages required' })

  try {
    let companyData = {}
    let caData = null

    if (company?.id) {
      companyData = await getCompanyContext(company.id)
    }
    // ALWAYS load CA portfolio for cross-company queries ("which company has highest revenue?")
    caData = await getCAContext(req.user.id)

    const d = companyData
    const systemPrompt = `You are FinLex AI, an expert CA assistant for Indian businesses.You specialize in GST, TDS, ITR, Indian tax law, accounting, and ROC compliance.
      ${ company ? `\nCOMPANY: ${company.name} | GSTIN: ${company.gstin || 'N/A'} | State: ${company.state_name || 'N/A'} | FY: ${company.financial_year || '2024-25'}` : '' }
${
      d && Object.keys(d).length > 0 ? `
REAL FINANCIAL DATA:
P&L: Revenue ₹${d.financial_summary?.total_revenue?.toLocaleString('en-IN')} | Expenses ₹${d.financial_summary?.total_expense?.toLocaleString('en-IN')} | Net Profit ₹${d.financial_summary?.net_profit?.toLocaleString('en-IN')}
Revenue: ${d.financial_summary?.revenue_breakdown?.map(r => `${r.account} ₹${r.amount?.toLocaleString('en-IN')}`).join(', ')}
Expenses: ${d.financial_summary?.expense_breakdown?.map(r => `${r.account} ₹${r.amount?.toLocaleString('en-IN')}`).join(', ')}
GST (${d.gst_this_month?.month} ${d.gst_this_month?.year}): Output ₹${d.gst_this_month?.output_tax?.toLocaleString('en-IN')} | ITC ₹${d.gst_this_month?.input_tax_credit?.toLocaleString('en-IN')} | Net Payable ₹${d.gst_this_month?.net_gst_payable?.toLocaleString('en-IN')}
UNPAID (${d.unpaid_invoices?.length}): ${d.unpaid_invoices?.map(i => `${i.invoice} ${i.party} ₹${i.amount?.toLocaleString('en-IN')}`).join(', ') || 'None'}
COMPLIANCE: ${d.compliance?.total_overdue} overdue | Overdue: ${d.compliance?.overdue?.map(c => `${c.name}(${c.days_overdue}d)`).join(', ') || 'None'} | Upcoming: ${d.compliance?.upcoming?.slice(0, 5).map(c => `${c.name}(${Math.round(c.days_left)}d)`).join(', ') || 'None'}
TDS: ₹${d.tds?.total_tds_deducted?.toLocaleString('en-IN')} | ${d.tds?.by_section?.map(t => `${t.section} ₹${t.tds?.toLocaleString('en-IN')}`).join(', ') || 'None'}
CASH & BANK: ${d.cash_and_bank?.map(b => `${b.account} ₹${b.balance?.toLocaleString('en-IN')}`).join(' | ') || 'N/A'}
INVOICES: ${d.invoice_summary?.map(i => `${i.type}: ${i.total} total, ${i.unpaid} unpaid, ₹${i.total_amount?.toLocaleString('en-IN')}`).join(' | ') || 'N/A'}
` : ''
    }
Always use real data when answering.Keep responses concise.Use ₹ for amounts.Use bullet points where helpful.
      ${
        caData && caData.length > 0 ? `
CA PORTFOLIO — ${caData.length} client${caData.length > 1 ? 's' : ''}:
${caData.map(c => `• ${c.company}: Revenue ₹${(c.revenue || 0).toLocaleString('en-IN')} | Profit ₹${(c.net_profit || 0).toLocaleString('en-IN')} | TDS ₹${(c.tds_total || 0).toLocaleString('en-IN')} | Overdue: ${c.overdue_compliances} | Unpaid invoices: ${c.unpaid_invoices}`).join('\n')}
` : ''
    } `

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ process.env.GROQ_API_KEY } ` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'AI error' })
    res.json({ text: data.choices?.[0]?.message?.content || 'No response from AI.' })
  } catch (err) {
    console.error('AI chat error:', err)
    res.status(500).json({ error: err.message })
  }
})

//  GST Treatment classifier 
function classifyGST(desc, category, amount) {
  const d = (desc || '').toLowerCase()
  const c = (category || '').toLowerCase()
  if (amount > 0) {
    if (c.includes('salary') || d.includes('salary')) return 'Exempt — Salary Income'
    if (c.includes('transfer') || d.includes('upi') || d.includes('neft') || d.includes('imps')) return 'Exempt — Money Transfer'
    if (c.includes('refund') || d.includes('refund')) return 'Refund — No GST'
    return 'Exempt — Non-GST Credit'
  }
  if (c.includes('withdrawal') || d.includes('atm')) return 'Exempt — Cash Withdrawal'
  if (c.includes('transfer') || d.includes('upi') || d.includes('neft') || d.includes('imps')) return 'Exempt — Money Transfer'
  if (c.includes('fuel') || d.includes('fuel') || d.includes('petrol') || d.includes('diesel')) return 'GST @ 28% — No ITC (Fuel)'
  if (c.includes('dining') || d.includes('restaurant') || d.includes('swiggy') || d.includes('zomato')) return 'GST @ 5% — No ITC (Restaurant)'
  if (c.includes('recharge') || d.includes('recharge') || d.includes('mobile')) return 'GST @ 18% — ITC Claimable (Telecom)'
  if (d.includes('electricity') || d.includes('electric')) return 'GST @ 18% — ITC Claimable (Utility)'
  if (d.includes('internet') || d.includes('broadband')) return 'GST @ 18% — ITC Claimable (Internet)'
  if (c.includes('purchase') || d.includes('grocery') || d.includes('supermarket')) return 'GST @ 5-12% — No ITC (Retail)'
  if (d.includes('amazon') || d.includes('flipkart') || d.includes('myntra')) return 'GST @ 18% — ITC Claimable (if B2B)'
  if (c.includes('medical') || d.includes('pharmacy') || d.includes('hospital')) return 'Exempt / GST @ 5% — No ITC (Medical)'
  if (c.includes('insurance') || d.includes('insurance')) return 'GST @ 18% — ITC Claimable (Insurance)'
  if (d.includes('rent') || d.includes('lease')) return 'GST @ 18% — ITC Claimable (Rent)'
  if (d.includes('salary') || d.includes('payroll')) return 'Exempt — Salary Expense'
  return 'Verify — Check GST Applicability'
}

//  Document type classifier 
function classifyDocument(text) {
  const t = text.toLowerCase()

  // Strong invoice signals
  const invoiceScore = [
    /gstin/i, /hsn/i, /sac/i, /invoice\s*(no|number|#)/i,
    /taxable\s*amount/i, /cgst/i, /sgst/i, /igst/i,
    /place\s*of\s*supply/i, /e-?way\s*bill/i, /bill\s*to/i, /ship\s*to/i,
  ].filter(r => r.test(t)).length

  // Strong bank statement signals
  const bankScore = [
    /account\s*(no|number|statement)/i, /opening\s*balance/i, /closing\s*balance/i,
    /transaction\s*(date|id|ref)/i, /debit|credit/i, /withdrawal/i,
    /upi\s*(ref|id|txn)/i, /neft|rtgs|imps/i, /atm\s*(withdrawal|cash)/i,
    /available\s*balance/i, /mini\s*statement/i, /passbook/i,
  ].filter(r => r.test(t)).length

  // Receipt signals (pos/payment receipts)
  const receiptScore = [
    /receipt\s*(no|#)/i, /pos\s*(terminal|txn)/i, /merchant/i,
    /approval\s*code/i, /card\s*(no|number)/i,
  ].filter(r => r.test(t)).length

  if (bankScore > invoiceScore && bankScore >= 2) return 'bank'
  if (receiptScore > invoiceScore && receiptScore >= 2) return 'receipt'
  if (invoiceScore >= 2) return 'invoice'
  // fallback: look at filename clues handled in caller
  return 'unknown'
}

//  Vision OCR helper — calls Claude vision API 
async function extractWithVision(base64Data, mimeType) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: base64Data },
            },
            {
              type: 'text',
              text: `Extract all invoice data from this image.Return ONLY valid JSON, no explanation, no markdown, no backticks:
    { "invoiceNo": "", "date": "YYYY-MM-DD", "vendorName": "", "vendorGSTIN": "", "buyerName": "", "buyerGSTIN": "", "placeOfSupply": "", "invoiceType": "purchase", "items": [{ "desc": "", "hsn": "", "qty": 1, "rate": 0, "gstRate": 18 }], "subtotal": 0, "cgst": 0, "sgst": 0, "igst": 0, "total": 0, "warnings": [] }

    CRITICAL - invoiceType detection:
    - Set invoiceType = "sale" if: invoice number starts with SAL / INV / SALES, vendorName matches the buyer company, or document says "Tax Invoice" issued BY the company TO a customer
      - Set invoiceType = "purchase" if: invoice number starts with PUR / BILL / VENDOR, or document is a bill FROM a vendor TO the company
        - Default to "purchase" only if truly unclear

If this is a bank statement or receipt(not an invoice), return:
    { "detected_type": "bank", "transactions": [{ "date": "YYYY-MM-DD", "desc": "", "amount": 0, "category": "Other" }] }

Return ONLY the JSON object.No text before or after.`
            }
          ]
        }]
      })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Vision API error')
    const content = data.content?.[0]?.text || ""
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim()
    return JSON.parse(cleaned)
  } catch (err) {
    throw new Error('Vision extraction failed: ' + err.message)
  }
}

//  POST /api/ai/extract-document 
// Frontend sends either text_content (digital PDF) OR vision_base64 (scanned/image)
router.post('/extract-document', async (req, res) => {
  const { tab, file_name, text_content, page_texts, vision_base64, vision_mime, use_vision } = req.body

  try {
    //  Vision OCR path: scanned PDF or image file 
    if (use_vision && vision_base64) {
      let parsed
      try {
        parsed = await extractWithVision(vision_base64, vision_mime || 'image/jpeg')
      } catch (vErr) {
        return res.status(500).json({ error: 'Vision OCR failed. Ensure ANTHROPIC_API_KEY is set. Error: ' + vErr.message })
      }

      // If vision returned bank-style data
      if (parsed.detected_type === 'bank' && parsed.transactions) {
        const transactions = parsed.transactions.map(t => ({
          ...t,
          gst: classifyGST(t.desc, t.category, t.amount),
        }))
        return res.json({ detected_type: 'bank', transactions })
      }

      // Invoice from vision
      return res.json({
        detected_type: 'invoice',
        extracted: parsed,
        all_invoices: [parsed],
        multi_invoice: false,
        invoice_count: 1,
        via_ocr: true,
      })
    }

    //  Multi-page PDF: process each page independently 
    if (page_texts && Array.isArray(page_texts) && page_texts.length > 1) {
      const results = []
      for (let i = 0; i < page_texts.length; i++) {
        const pageContent = (page_texts[i] || '').trim()
        if (!pageContent || pageContent.length < 40) continue  // blank/header page

        // Quick check: skip obvious bank statement pages, process everything else
        // (invoices may be classified as 'unknown' for messy/OCR PDFs)
        const pageDetected = classifyDocument(pageContent)
        if (pageDetected === 'bank') continue  // skip bank pages, process invoice+unknown

        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              max_tokens: 1500,
              messages: [
                { role: 'system', content: 'Extract invoice data and return ONLY valid JSON. No explanation, no markdown, no backticks. Just pure JSON.' },
                {
                  role: 'user', content: `Extract invoice data from this page. Return ONLY valid JSON:
{"invoiceNo":"","date":"YYYY-MM-DD","vendorName":"","vendorGSTIN":"","buyerName":"","buyerGSTIN":"","placeOfSupply":"","invoiceType":"purchase","items":[{"desc":"","hsn":"","qty":1,"rate":0,"gstRate":18}],"subtotal":0,"cgst":0,"sgst":0,"igst":0,"total":0,"warnings":[]}

CRITICAL - invoiceType: set "sale" if invoice number has SAL/INV prefix OR vendor is the same company. Set "purchase" if it is a bill from external vendor.

Page text:
${pageContent.slice(0, 4000)}`
                }
              ],
            }),
          })
          const gd = await groqRes.json()
          if (!groqRes.ok) continue
          let rawText = gd.choices?.[0]?.message?.content || ''
          rawText = rawText.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim()
          try {
            const parsed = JSON.parse(rawText)
            if (parsed && parsed.invoiceNo !== undefined) results.push(parsed)
          } catch { }
        } catch { }
      }

      if (results.length === 0) {
        return res.status(400).json({ error: 'No invoices found in the uploaded PDF pages. Ensure the PDF contains digital (selectable) text, not scanned images.' })
      }
      // Always return multi_invoice=true when we had a multi-page PDF input
      // so the frontend enters batch-save mode even for 1 result
      return res.json({
        detected_type: 'invoice',
        extracted: results[0],
        all_invoices: results,
        multi_invoice: true,          // always true for multi-page PDFs
        invoice_count: results.length,
      })
    }

    const content = (text_content || '').slice(0, 6000)

    if (!content.trim()) {
      return res.status(400).json({ error: 'No text content received. For scanned PDFs (image-only), text extraction is not supported — please use a digital/selectable PDF or a CSV file.' })
    }

    //  Auto-classify document type 
    let detected = classifyDocument(content)

    // Fallback: use filename hints
    if (detected === 'unknown') {
      const fn = (file_name || '').toLowerCase()
      if (fn.includes('statement') || fn.includes('bank') || fn.includes('passbook')) detected = 'bank'
      else if (fn.includes('invoice') || fn.includes('bill') || fn.includes('receipt')) detected = 'invoice'
      else detected = tab  // last resort: trust what user selected
    }

    // If user explicitly chose a tab and classifier is uncertain, respect user
    if (detected === 'unknown') detected = tab

    //  Build prompt based on detected type 
    let prompt = ''

    if (detected === 'invoice') {
      prompt = `Extract invoice data from this document text.

IMPORTANT: If the document contains MULTIPLE SEPARATE invoices (look for different invoice numbers, different vendors, or clear page breaks between invoices), return a JSON ARRAY with one object per invoice.
If the document has only ONE invoice, return a single JSON object (NOT an array).

Format for each invoice:
{"invoiceNo":"","date":"YYYY-MM-DD","vendorName":"","vendorGSTIN":"","buyerName":"","buyerGSTIN":"","placeOfSupply":"","invoiceType":"purchase","items":[{"desc":"","hsn":"","qty":1,"rate":0,"gstRate":18}],"subtotal":0,"cgst":0,"sgst":0,"igst":0,"total":0,"warnings":[]}

CRITICAL - invoiceType detection rules:
- "sale" if: invoice number starts with SAL/INV/SALES, or the vendorGSTIN matches the buyer company GSTIN, or it is clearly a Tax Invoice issued TO a customer
- "purchase" if: invoice number starts with PUR/BILL, or it is a bill/invoice received FROM a vendor
- When unclear, check invoice number prefix: SAL=sale, PUR=purchase

Multiple invoices: [{...invoice1...},{...invoice2...}]
Single invoice: {...invoice...}

Document text:
${content}

Return ONLY valid JSON (object or array), no explanation, no markdown, no backticks.`

    } else {
      // bank statement OR receipt → extract as transactions
      prompt = `Extract all transactions from this document and return ONLY a valid JSON array, no explanation, no markdown:
[{"date":"YYYY-MM-DD","desc":"","amount":0,"category":""}]
Rules:
- positive amount = money coming IN (credit/salary/refund)
- negative amount = money going OUT (debit/purchase/payment)
- category must be exactly one of: Salary, Purchase, Withdrawal, Transfer, Bill Payment, Recharge, Dining, Fuel, Medical, Insurance, Refund, Other
- If document is a single receipt/payment (not a statement), return a single-item array

Data:
${content}

Return ONLY the JSON array.`
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: 'You are a document extraction AI for Indian accounting. Extract data accurately and return ONLY valid JSON. No explanation, no markdown, no backticks. Just pure JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const groqData = await groqRes.json()
    if (!groqRes.ok) return res.status(500).json({ error: groqData.error?.message || 'AI extraction error' })

    let rawText = groqData.choices?.[0]?.message?.content || ''
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch (e) {
      // Primary parse failed — try extracting JSON substring
      try {
        const jsonMatch = rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          console.error('AI raw response (no JSON found):', rawText.slice(0, 300))
          return res.status(500).json({ error: 'AI could not extract structured data. Try a clearer or digital PDF, or use CSV format.' })
        }
      } catch (e2) {
        console.error('AI raw response (JSON parse failed):', rawText.slice(0, 300))
        return res.status(500).json({ error: 'AI returned malformed data. Please try again or use a different file format.' })
      }
    }

    if (detected === 'invoice') {
      // Support multi-invoice: AI may return array or single object
      const isMulti = Array.isArray(parsed)
      res.json({
        detected_type: 'invoice',
        extracted: isMulti ? parsed[0] : parsed,
        all_invoices: isMulti ? parsed : [parsed],
        multi_invoice: isMulti && parsed.length > 1,
        invoice_count: isMulti ? parsed.length : 1,
      })
    } else {
      const transactions = (Array.isArray(parsed) ? parsed : []).map(t => ({
        ...t,
        gst: classifyGST(t.desc, t.category, t.amount),
      }))
      res.json({ detected_type: 'bank', transactions })
    }
  } catch (err) {
    console.error('Document extraction error:', err)
    res.status(500).json({ error: err.message })
  }
})

//  POST /api/ai/ingest-invoice 
// Autonomous pipeline: extracted JSON → invoice → journal → ITC → compliance → TDS → audit
router.post('/ingest-invoice', async (req, res) => {
  const { extracted, company, file_name } = req.body
  if (!extracted || !company?.id)
    return res.status(400).json({ error: 'extracted data and company required' })

  const client = await pool.connect()
  const pipeline = []   // track what got triggered
  const warnings = [...(extracted.warnings || [])]

  try {
    await client.query('BEGIN')

    const company_id = company.id
    const userId = req.user.id

    //  0. Guard: FY lock 
    const { rows: fyRows } = await client.query(
      'SELECT fy_locked, financial_year FROM companies WHERE id=$1', [company_id]
    )
    if (fyRows.length && fyRows[0].fy_locked) {
      await client.query('ROLLBACK')
      return res.status(423).json({
        error: `Financial year ${fyRows[0].financial_year} is locked. AI ingest is blocked during a locked FY.`,
        fy_locked: true, code: 'FY_LOCKED'
      })
    }

    //  0b. Guard: Period lock 
    const entryDate = extracted.date || new Date().toISOString().split('T')[0]
    const { rows: periodRows } = await client.query(
      `SELECT id, period_name FROM financial_periods
       WHERE company_id=$1 AND $2 BETWEEN start_date AND end_date AND is_closed=true LIMIT 1`,
      [company_id, entryDate]
    )
    if (periodRows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'Period is locked',
        details: `Period "${periodRows[0].period_name}" is closed. AI ingest blocked for date ${entryDate}.`
      })
    }

    //  1. Resolve company state 
    const { rows: [comp] } = await client.query(
      'SELECT state_code FROM companies WHERE id=$1', [company_id]
    )

    const companyState = comp?.state_code || ''
    const partyState = extracted.placeOfSupply || companyState
    const isInterState = partyState && companyState && partyState !== companyState

    //  2. Build line items with GST 
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0
    const items = (extracted.items || []).map(item => {
      const taxable = parseFloat(item.qty || 1) * parseFloat(item.rate || 0)
      const gstRate = parseFloat(item.gstRate || 18)
      const igst = isInterState ? (taxable * gstRate) / 100 : 0
      const cgst = !isInterState ? (taxable * gstRate) / 200 : 0
      const sgst = !isInterState ? (taxable * gstRate) / 200 : 0
      subtotal += taxable
      totalCgst += cgst
      totalSgst += sgst
      totalIgst += igst
      return {
        description: item.desc || 'Item', hsn_sac_code: item.hsn || null,
        quantity: parseFloat(item.qty || 1), unit: 'NOS',
        rate: parseFloat(item.rate || 0), taxable_amount: taxable,
        gst_rate: gstRate,
        cgst_rate: isInterState ? 0 : gstRate / 2, sgst_rate: isInterState ? 0 : gstRate / 2,
        igst_rate: isInterState ? gstRate : 0,
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: taxable + cgst + sgst + igst,
      }
    })

    // Use AI-extracted GST if items had no rates (fallback)
    if (items.length === 0) {
      totalCgst = parseFloat(extracted.cgst || 0)
      totalSgst = parseFloat(extracted.sgst || 0)
      totalIgst = parseFloat(extracted.igst || 0)
      subtotal = parseFloat(extracted.subtotal || 0)
    }
    // ALWAYS recalculate from items — never trust AI total (AI confuses net-of-TDS with gross total)
    const totalAmount = subtotal + totalCgst + totalSgst + totalIgst

    //  3. Create Invoice 
    const invNum = extracted.invoiceNo || `DOC-${Date.now()}`
    // Check duplicate
    const { rows: dup } = await client.query(
      `SELECT id FROM invoices WHERE company_id=$1 AND invoice_number=$2 AND status != 'cancelled'`,
      [company_id, invNum]
    )
    if (dup.length) {
      warnings.push(`Invoice ${invNum} already exists — skipped duplicate creation.`)
      await client.query('ROLLBACK')
      return res.json({ success: false, warnings, pipeline: ['duplicate_skipped'] })
    }

    const { rows: [invoice] } = await client.query(
      `INSERT INTO invoices
       (company_id,invoice_type,invoice_number,invoice_date,
        party_name,party_gstin,party_state,
        subtotal,taxable_amount,cgst_amount,sgst_amount,igst_amount,
        total_amount,notes,status,payment_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'confirmed','unpaid')
       RETURNING *`,
      [company_id,
        (() => {
          const t = (extracted.invoiceType || 'purchase').toLowerCase().trim()
          if (t === 'sales') return 'sale'
          if (t === 'purchases') return 'purchase'
          if (t === 'sale' || t === 'purchase') return t
          // Also check invoice number prefix as fallback
          const num = (extracted.invoiceNo || '').toUpperCase()
          if (num.startsWith('SAL') || num.startsWith('INV')) return 'sale'
          return 'purchase'
        })(),
        invNum,
        extracted.date || new Date().toISOString().split('T')[0],
        extracted.vendorName || extracted.buyerName || 'Unknown Party',
        extracted.vendorGSTIN || extracted.buyerGSTIN || null,
        partyState,
        subtotal, subtotal, totalCgst, totalSgst, totalIgst, totalAmount,
        `Auto-ingested from: ${file_name || 'document'}`]
    )
    pipeline.push('invoice_created')

    // Insert line items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items
         (invoice_id,description,hsn_sac_code,quantity,unit,rate,taxable_amount,
          gst_rate,cgst_rate,sgst_rate,igst_rate,cgst_amount,sgst_amount,igst_amount,total_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [invoice.id, item.description, item.hsn_sac_code, item.quantity, item.unit,
        item.rate, item.taxable_amount, item.gst_rate, item.cgst_rate, item.sgst_rate,
        item.igst_rate, item.cgst_amount, item.sgst_amount, item.igst_amount, item.total_amount]
      )
    }

    //  4. Auto Journal Entry 
    const getAcc = async (code) => {
      const { rows } = await client.query(
        'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code]
      )
      return rows[0]?.id
    }
    const addLine = async (jeId, account_id, debit, credit, narration) => {
      if (!account_id) { warnings.push(`Account missing for: ${narration}`); return }
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
         VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit || 0, credit || 0, narration]
      )
    }

    const { rows: [{ count }] } = await client.query(
      'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id]
    )
    const entryNum = `JE-${String(parseInt(count) + 1).padStart(4, '0')}`
    const isSale = invoice.invoice_type === 'sale'

    const { rows: [je] } = await client.query(
      `INSERT INTO journal_entries
       (company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
       VALUES($1,$2,$3,'invoice',$4,$5,true,$6) RETURNING id`,
      [company_id, entryNum, invoice.invoice_date, invoice.id,
        `${isSale ? 'Sales' : 'Purchase'} Invoice ${invoice.invoice_number} — ${invoice.party_name} [AI Ingested]`,
        userId]
    )

    if (isSale) {
      await addLine(je.id, await getAcc('1003'), totalAmount, 0, 'Accounts Receivable')
      await addLine(je.id, await getAcc('4001'), 0, subtotal, 'Sales Revenue')
      if (totalCgst > 0) await addLine(je.id, await getAcc('2002'), 0, totalCgst, 'CGST Payable')
      if (totalSgst > 0) await addLine(je.id, await getAcc('2003'), 0, totalSgst, 'SGST Payable')
      if (totalIgst > 0) await addLine(je.id, await getAcc('2004'), 0, totalIgst, 'IGST Payable')
    } else {
      await addLine(je.id, await getAcc('5001'), subtotal, 0, 'Purchases')
      if (totalCgst > 0) await addLine(je.id, await getAcc('1004'), totalCgst, 0, 'GST Input CGST')
      if (totalSgst > 0) await addLine(je.id, await getAcc('1005'), totalSgst, 0, 'GST Input SGST')
      if (totalIgst > 0) await addLine(je.id, await getAcc('1006'), totalIgst, 0, 'GST Input IGST')
      await addLine(je.id, await getAcc('2001'), 0, totalAmount, 'Accounts Payable')
    }
    pipeline.push('journal_entry_created')

    //  5. ITC Register — auto-flag claimable ITC 
    const totalITC = totalCgst + totalSgst + totalIgst
    let itcStatus = null
    if (!isSale && totalITC > 0) {
      // ITC is already in the purchase invoice + journal (accounts 1004/1005/1006)
      // Just annotate so frontend can display it
      itcStatus = {
        claimable: totalITC,
        cgst: totalCgst, sgst: totalSgst, igst: totalIgst,
        note: 'ITC recorded in Input Tax accounts (1004/1005/1006). Reconcile in GSTR-2B.',
      }
      pipeline.push('itc_recorded')
    }

    //  6. Compliance Calendar — add GSTR-3B deadline if GST found 
    if (totalITC > 0 || (isSale && (totalCgst + totalSgst + totalIgst) > 0)) {
      const invDate = new Date(invoice.invoice_date)
      const nextMonth = new Date(invDate.getFullYear(), invDate.getMonth() + 1, 20)
      const dueDateStr = nextMonth.toISOString().split('T')[0]
      const periodStr = `${invDate.toLocaleString('default', { month: 'long' })} ${invDate.getFullYear()}`

      // Only add if not already present for this period
      const { rows: existing } = await client.query(
        `SELECT id FROM compliance_deadlines WHERE company_id=$1 AND type='GST' AND period=$2`,
        [company_id, periodStr]
      )
      if (!existing.length) {
        await client.query(
          `INSERT INTO compliance_deadlines(company_id,type,name,due_date,financial_year,period,status)
           VALUES($1,'GST','GSTR-3B Filing',$2,$3,$4,'pending')`,
          [company_id, dueDateStr,
            invDate.getMonth() >= 3
              ? `${invDate.getFullYear()}-${invDate.getFullYear() + 1}`
              : `${invDate.getFullYear() - 1}-${invDate.getFullYear()}`,
            periodStr]
        )
        pipeline.push('compliance_deadline_added')
      }
    }

    //  7. TDS Detection — auto-create TDS entry + journal if applicable 
    let tdsHint = null
    const vendorName = (invoice.party_name || '').toLowerCase()
    const TDS_KEYWORDS = [
      { kw: ['consultant', 'consulting', 'advisory'], section: '194J', rate: 10, nature: 'Professional/Technical Services' },
      { kw: ['contractor', 'construction', 'civil', 'works'], section: '194C', rate: 1, nature: 'Contractor Payment' },
      { kw: ['rent', 'lease', 'property', 'building', 'office'], section: '194I', rate: 10, nature: 'Rent' },
      { kw: ['commission', 'brokerage', 'agency'], section: '194H', rate: 5, nature: 'Commission/Brokerage' },
      { kw: ['interest', 'loan', 'finance'], section: '194A', rate: 10, nature: 'Interest' },
      { kw: ['transport', 'logistics', 'freight', 'courier'], section: '194C', rate: 1, nature: 'Transport Contractor' },
      { kw: ['software', 'technology', 'it service', 'saas'], section: '194J', rate: 10, nature: 'Technical Services' },
    ]
    for (const { kw, section, rate, nature } of TDS_KEYWORDS) {
      if (kw.some(k => vendorName.includes(k) || (invoice.party_name || '').toLowerCase().includes(k))) {
        if (!isSale && subtotal >= 30000) {   // TDS threshold ₹30,000
          const tdsAmount = parseFloat((subtotal * rate / 100).toFixed(2))
          const netPayable = parseFloat((subtotal - tdsAmount).toFixed(2))

          tdsHint = {
            section, rate, tds_amount: tdsAmount, net_payable: netPayable, nature,
            note: `TDS @ ${rate}% u/s ${section} auto-deducted. Net payable ₹${netPayable.toLocaleString('en-IN')}.`,
          }

          // Auto-save to tds_entries
          await client.query(
            `INSERT INTO tds_entries(company_id,party_name,section,gross_amount,tds_rate,tds_amount,net_amount,payment_date,payment_nature,invoice_id,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [company_id, invoice.party_name, section, subtotal, rate, tdsAmount, netPayable,
              invoice.invoice_date, nature, invoice.id, userId]
          )

          // Auto TDS journal: reduce Accounts Payable by TDS amount, park in TDS Payable
          // Accounts Payable Dr (reduce what we owe) | TDS Payable Cr
          const apAccId = await getAcc('2001')  // Accounts Payable
          const tdsAccId = await getAcc('2005')  // TDS Payable

          if (apAccId && tdsAccId) {
            const { rows: [{ count: tdsCount }] } = await client.query(
              'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id]
            )
            const tdsEntryNum = `JE-${String(parseInt(tdsCount) + 1).padStart(4, '0')}`
            const { rows: [tdsJe] } = await client.query(
              `INSERT INTO journal_entries
               (company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
               VALUES($1,$2,$3,'tds',$4,$5,true,$6) RETURNING id`,
              [company_id, tdsEntryNum, invoice.invoice_date, invoice.id,
                `TDS @ ${rate}% u/s ${section} on ${invoice.party_name} [Auto-deducted]`, userId]
            )
            await client.query(
              `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
               VALUES($1,$2,$3,0,$4)`,
              [tdsJe.id, apAccId, tdsAmount, `TDS deducted from payable — ${invoice.party_name}`]
            )
            await client.query(
              `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
               VALUES($1,$2,0,$3,$4)`,
              [tdsJe.id, tdsAccId, tdsAmount, `TDS Payable u/s ${section} — to deposit with Govt`]
            )
            tdsHint.journal_entry = tdsEntryNum
          } else {
            warnings.push('TDS Payable or Accounts Payable account missing — TDS journal skipped')
          }

          pipeline.push('tds_auto_deducted')
        }
        break
      }
    }

    //  8. Audit Log 
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values,ip_address)
       VALUES($1,$2,'AI Ingested','invoices',$3,$4,$5)`,
      [company_id, userId, invoice.id,
        JSON.stringify({ file_name, pipeline, vendor: invoice.party_name, amount: totalAmount }),
        req.ip || req.headers['x-forwarded-for'] || null]
    )
    pipeline.push('audit_logged')

    await client.query('COMMIT')

    res.json({
      success: true,
      invoice,
      journal: { entry_number: entryNum },
      itc: itcStatus,
      tds_hint: tdsHint,
      pipeline,
      warnings,
    })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Ingest pipeline error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

//  POST /api/ai/ingest-bank 
// Bank statement transactions → journal entries + bank balance update
router.post('/ingest-bank', async (req, res) => {
  const { transactions, company } = req.body
  if (!transactions?.length || !company?.id)
    return res.status(400).json({ error: 'transactions and company required' })

  const client = await pool.connect()
  const pipeline = []
  const warnings = []
  const journalsCreated = []

  // Category → account code mapping
  const CATEGORY_ACCOUNT = {
    'Salary': { code: '5101', name: 'Salaries & Wages' },
    'Purchase': { code: '5001', name: 'Purchases' },
    'Bill Payment': { code: '5103', name: 'Electricity' },   // generic bill → misc if not matched
    'Recharge': { code: '5104', name: 'Internet & Phone' },
    'Dining': { code: '5112', name: 'Miscellaneous Expense' },
    'Fuel': { code: '5106', name: 'Travel & Conveyance' },
    'Medical': { code: '5112', name: 'Miscellaneous Expense' },
    'Insurance': { code: '5112', name: 'Miscellaneous Expense' },
    'Withdrawal': { code: '1001', name: 'Cash in Hand' },
    'Transfer': { code: '5112', name: 'Miscellaneous Expense' },
    'Refund': { code: '4103', name: 'Other Income' },
    'Other': { code: '5112', name: 'Miscellaneous Expense' },
  }

  // Income categories
  const INCOME_CATEGORIES = new Set(['Salary', 'Refund'])

  try {
    await client.query('BEGIN')

    const company_id = company.id
    const userId = req.user.id

    const getAcc = async (code) => {
      const { rows } = await client.query(
        'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code]
      )
      return rows[0]?.id
    }

    const bankAccId = await getAcc('1002')  // Bank Account
    if (!bankAccId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Bank Account (code 1002) not found for this company' })
    }

    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id]
    )
    let entryCounter = parseInt(countRows[0].count)

    for (const txn of transactions) {
      const amount = parseFloat(txn.amount || 0)
      if (amount === 0) continue

      const isCredit = amount > 0   // money coming in → bank debit
      const absAmount = Math.abs(amount)
      const category = txn.category || 'Other'
      const date = txn.date || new Date().toISOString().split('T')[0]
      const desc = txn.desc || category

      // Resolve contra account
      let contraCode, contraName
      if (isCredit) {
        // Money IN: bank Dr, income/liability Cr
        if (category === 'Salary') {
          contraCode = '5101'; contraName = 'Salaries & Wages'
        } else if (category === 'Refund') {
          contraCode = '4103'; contraName = 'Other Income'
        } else if (category === 'Transfer') {
          contraCode = '1003'; contraName = 'Accounts Receivable'
        } else {
          contraCode = '4103'; contraName = 'Other Income'
        }
      } else {
        // Money OUT: expense/asset Dr, bank Cr
        const mapping = CATEGORY_ACCOUNT[category] || { code: '5112', name: 'Miscellaneous Expense' }
        // Special: Withdrawal → Cash in Hand (asset transfer, not expense)
        contraCode = mapping.code
        contraName = mapping.name
      }

      const contraAccId = await getAcc(contraCode)
      if (!contraAccId) {
        warnings.push(`Account ${contraCode} (${contraName}) missing — skipped: "${desc}"`)
        continue
      }

      entryCounter++
      const entryNum = `JE-${String(entryCounter).padStart(4, '0')}`
      const narration = `${isCredit ? 'Receipt' : 'Payment'}: ${desc} [Bank Import]`

      const { rows: [je] } = await client.query(
        `INSERT INTO journal_entries
         (company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
         VALUES($1,$2,$3,'bank_statement',$4,true,$5) RETURNING id`,
        [company_id, entryNum, date, narration, userId]
      )

      if (isCredit) {
        // Bank Dr | Contra Cr
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
           VALUES($1,$2,$3,0,$4)`,
          [je.id, bankAccId, absAmount, `Bank receipt: ${desc}`]
        )
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
           VALUES($1,$2,0,$3,$4)`,
          [je.id, contraAccId, absAmount, contraName]
        )
      } else {
        // Contra Dr | Bank Cr
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
           VALUES($1,$2,$3,0,$4)`,
          [je.id, contraAccId, absAmount, `${contraName}: ${desc}`]
        )
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
           VALUES($1,$2,0,$3,$4)`,
          [je.id, bankAccId, absAmount, `Bank payment: ${desc}`]
        )
      }

      journalsCreated.push({ entry_number: entryNum, date, amount, desc, category })
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'BANK_STATEMENT_IMPORTED','journal_entries',NULL,$3)`,
      [company_id, userId,
        JSON.stringify({ transactions_processed: journalsCreated.length, warnings_count: warnings.length })]
    )

    pipeline.push('journals_created', 'bank_balance_updated', 'audit_logged')
    await client.query('COMMIT')

    res.json({
      success: true,
      journals_created: journalsCreated.length,
      journals: journalsCreated,
      pipeline,
      warnings,
    })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Bank ingest error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
//  GST & TAX RULES KNOWLEDGE BASE (RAG source) 
// This is the static rules corpus. In production, replace with vector DB + CBDT/GSTN circulars.
const TAX_RULES_KB = `
=== INCOME TAX — FY 2024-25 (Finance Act 2024) ===
New Regime Slabs: 0-3L:0%, 3-7L:5%, 7-10L:10%, 10-12L:15%, 12-15L:20%, >15L:30%
Old Regime Slabs: 0-2.5L:0%, 2.5-5L:5%, 5-10L:20%, >10L:30%
Standard Deduction: New=₹75,000 | Old=₹50,000
Sec 87A Rebate: New regime ≤₹7L→₹25,000 cap | Old regime ≤₹5L→₹12,500 cap
Surcharge: New regime capped at 25%; Old regime 10%/15%/25%/37%
Health & Education Cess: 4% on (tax after rebate + surcharge)
Advance Tax: Sec 208 — not required if total tax < ₹10,000. Instalments: 15% by Jun15, 45% by Sep15, 75% by Dec15, 100% by Mar15.
Sec 234B: Interest 1%/month if advance tax < 90% of assessed tax.
Sec 234C: Interest 1%/month on shortfall in each instalment.
Sec 234A: Interest 1%/month on tax due after Jul 31 filing deadline.

=== TDS — KEY SECTIONS ===
Sec 192: Salary — slab rate, threshold ₹2.5L/₹3L
Sec 194A: Interest — Banks ₹40,000 threshold (₹50,000 seniors); Others ₹5,000
Sec 194C: Contractors — ₹30,000 per payment OR ₹1,00,000 aggregate FY. Rates: Individual 1%, Company 2%
Sec 194H: Commission — ₹15,000 threshold, 5%
Sec 194I(a): Rent Plant&Machinery — 2%; Sec 194I(b): Rent Land/Building/Furniture — 10%; threshold ₹2,40,000/year
Sec 194J: Professional Services — 10%; Technical Services / Call Centre — 2% (post Budget 2020)
Sec 194Q: Purchase of goods >₹50L by buyer with >₹10Cr turnover — 0.1%
Sec 206AA: PAN not available → rate = max(applicable rate, 20%)
TDS Deposit: 7th of following month (March: Apr 30). Quarterly return: 31 Jul, 31 Oct, 31 Jan, 31 May.

=== GST ===
GSTR-1 monthly filers (>₹5Cr): 11th of following month
GSTR-1 QRMP quarterly filers (<₹5Cr): 13th of month after quarter end
GSTR-3B: 20th of following month (some states 22nd/24th for QRMP)
GSTR-9 annual: Dec 31 of following FY
ITC Rule 88A order: IGST→IGST→CGST→SGST | CGST→CGST→IGST | SGST→SGST→IGST | No CGST↔SGST cross
Late fee GSTR-1: ₹50/day max ₹10,000 (₹25 CGST+₹25 SGST); NIL: ₹20/day max ₹500
Late fee GSTR-3B: ₹50/day max ₹10,000; Interest on unpaid tax 18%p.a.
Credit Note time limit: Sep 30 of following FY or annual return filing, whichever earlier (Sec 34)
RCM: GST on services from unregistered dealers, import of services — buyer pays GST
B2B invoices: threshold GSTIN-wise; B2CL: inter-state >₹2.5L invoice value; B2CS: all others
HSN mandatory: >₹5Cr turnover: 6 digits; others: 4 digits; ≤₹1.5Cr: optional

=== PF / ESIC ===
EPF: 12% employee + 12% employer on basic, wage ceiling ₹15,000 (EPF cap ₹1,800/month)
EPS: 8.33% of ₹15,000 (₹1,250) from employer share; balance 3.67% to EPF
ESIC: Applicable if gross ≤₹21,000/month. Employee 0.75%, Employer 3.25%.
Professional Tax: State-specific; Maharashtra max ₹2,500/year; deductible under old regime.

=== ADVANCE TAX INTEREST ===
234B: 1%/month if advance tax paid < 90% of final tax
234C: Q1 shortfall (paid<15%): 1%/month×3; Q2 (paid<45%): 1%/month×3; Q3 (paid<75%): 1%/month×3; Q4 (paid<100%): 1%/month×1
`

//  POST /api/ai/compliance-check — RAG-based rule check 
// Checks company's actual data against tax laws and returns violations/warnings
router.post('/compliance-check', async (req, res) => {
  const { company_id, check_types = ['gst', 'tds', 'advance_tax'] } = req.body
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    const company = coRows[0]

    const issues = []
    const today = new Date()

    // GST checks
    if (check_types.includes('gst')) {
      // Check GSTIN presence
      if (!company.gstin) issues.push({ severity: 'warning', category: 'GST', issue: 'Company GSTIN not set. GST invoicing not possible.', law: 'CGST Act Sec 25' })

      // Check for sales invoices without HSN
      const { rows: noHsn } = await pool.query(
        `SELECT COUNT(*) as cnt FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
         WHERE i.company_id=$1 AND i.invoice_type='sale' AND (ii.hsn_sac_code IS NULL OR ii.hsn_sac_code='')`,
        [company_id]
      )
      if (parseInt(noHsn[0].cnt) > 0) {
        issues.push({ severity: 'warning', category: 'GST', issue: `${noHsn[0].cnt} invoice line items missing HSN/SAC code.`, law: 'CGST Rule 46(h) — HSN mandatory for turnover >₹1.5Cr', action: 'Update invoice items with correct HSN/SAC codes' })
      }

      // Check for GSTR-1 overdue (past month)
      const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth()
      const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
      const gstr1Due = new Date(today.getFullYear(), today.getMonth(), 11)
      if (today > gstr1Due) {
        const { rows: prevMonthInv } = await pool.query(
          `SELECT COUNT(*) as cnt FROM invoices WHERE company_id=$1 AND invoice_type='sale' AND status!='cancelled'
           AND EXTRACT(MONTH FROM invoice_date)=$2::numeric AND EXTRACT(YEAR FROM invoice_date)=$3::numeric`,
          [company_id, prevMonth, prevYear]
        )
        if (parseInt(prevMonthInv[0].cnt) > 0) {
          const { rows: gstr1Filed } = await pool.query(
            `SELECT COUNT(*) as cnt FROM compliance_deadlines WHERE company_id=$1 AND type='GST' AND status='completed'
             AND name LIKE '%GSTR-1%' AND due_date BETWEEN $2 AND $3`,
            [company_id, `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`, `${prevYear}-${String(prevMonth).padStart(2, '0')}-30`]
          )
          if (parseInt(gstr1Filed[0].cnt) === 0) {
            issues.push({ severity: 'critical', category: 'GST', issue: `GSTR-1 for ${new Date(prevYear, prevMonth - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} may be unfiled. ${prevMonthInv[0].cnt} invoices exist for that month.`, law: 'CGST Sec 37 — GSTR-1 due 11th of following month', action: 'File GSTR-1 immediately to avoid ₹50/day late fee' })
          }
        }
      }

      // Check credit notes beyond time limit
      const { rows: lateCN } = await pool.query(
        `SELECT n.note_number, n.note_date, i.invoice_date
         FROM credit_debit_notes n LEFT JOIN invoices i ON i.id=n.original_invoice_id
         WHERE n.company_id=$1 AND n.note_type='credit' AND i.invoice_date IS NOT NULL
         AND n.note_date > (DATE_TRUNC('year', i.invoice_date + INTERVAL '1 year') + INTERVAL '6 months')`,
        [company_id]
      )
      if (lateCN.length > 0) {
        issues.push({ severity: 'critical', category: 'GST', issue: `${lateCN.length} credit note(s) issued after CGST Sec 34 time limit.`, notes: lateCN.map(n => n.note_number).join(', '), law: 'CGST Sec 34 — Credit note by Sep 30 of next FY' })
      }
    }

    // TDS checks
    if (check_types.includes('tds')) {
      // Check TDS entries with no PAN
      const { rows: noPan } = await pool.query(
        `SELECT COUNT(*) as cnt, SUM(tds_amount) as total_tds FROM tds_entries
         WHERE company_id=$1 AND (party_pan IS NULL OR party_pan='')`,
        [company_id]
      )
      if (parseInt(noPan[0].cnt) > 0) {
        issues.push({ severity: 'warning', category: 'TDS', issue: `${noPan[0].cnt} TDS entries (₹${parseFloat(noPan[0].total_tds || 0).toLocaleString('en-IN')}) without PAN. Rate should be max(section rate, 20%) per Sec 206AA.`, law: 'Sec 206AA — PAN mandatory, else max(rate,20%)', action: 'Collect PAN from all payees' })
      }

      // Check undeposited TDS
      const { rows: undeposited } = await pool.query(
        `SELECT section, SUM(tds_amount) as tds, MIN(payment_date) as oldest_date
         FROM tds_entries WHERE company_id=$1 AND deposited=false
         GROUP BY section ORDER BY oldest_date`,
        [company_id]
      )
      if (undeposited.length > 0) {
        const totalUndeposited = undeposited.reduce((s, r) => s + parseFloat(r.tds || 0), 0)
        issues.push({ severity: 'critical', category: 'TDS', issue: `₹${totalUndeposited.toLocaleString('en-IN')} TDS deducted but NOT deposited to government.`, sections: undeposited, law: 'Sec 201 — Non-deposit attracts interest 1.5%/month + penalty equal to TDS amount', action: 'Deposit via challan ITNS 281 immediately' })
      }

      // Check TAN not set
      if (!company.tan) {
        issues.push({ severity: 'critical', category: 'TDS', issue: 'TAN (Tax Deduction Account Number) not set for this company.', law: 'Sec 203A — TAN mandatory for all deductors', action: 'Apply for TAN at tin.nsdl.com and update company settings' })
      }

      // Check 194C aggregate
      const fyStart = today.getMonth() >= 3 ? `${today.getFullYear()}-04-01` : `${today.getFullYear() - 1}-04-01`
      const { rows: contractorAgg } = await pool.query(
        `SELECT party_name, SUM(gross_amount) as total, COUNT(*) as payments
         FROM tds_entries WHERE company_id=$1 AND section='194C' AND payment_date >= $2
         GROUP BY party_name HAVING SUM(gross_amount) > 100000`,
        [company_id, fyStart]
      )
      if (contractorAgg.length > 0) {
        contractorAgg.forEach(c => {
          issues.push({ severity: 'info', category: 'TDS', issue: `Contractor ${c.party_name}: FY aggregate ₹${parseFloat(c.total).toLocaleString('en-IN')} across ${c.payments} payments. TDS u/s 194C triggered (>₹1L aggregate).`, law: 'Sec 194C — TDS if aggregate >₹1,00,000/FY', action: 'Verify TDS was deducted on all payments' })
        })
      }
    }

    // Advance tax check
    if (check_types.includes('advance_tax')) {
      // Quick P&L for current FY
      const { rows: plRows } = await pool.query(
        `SELECT
           COALESCE(SUM(jel.credit_amount-jel.debit_amount) FILTER (WHERE a.type='revenue'),0) as revenue,
           COALESCE(SUM(jel.debit_amount-jel.credit_amount) FILTER (WHERE a.type='expense'),0) as expenses
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
         JOIN accounts a ON a.id=jel.account_id
         WHERE je.company_id=$1`, [company_id]
      )
      const net_profit = parseFloat(plRows[0].revenue || 0) - parseFloat(plRows[0].expenses || 0)
      const taxable = Math.max(0, net_profit - 75000)

      // Quick new regime tax estimate
      let est_tax = 0
      if (taxable > 1500000) est_tax = (taxable - 1500000) * 0.30 + 150000
      else if (taxable > 1200000) est_tax = (taxable - 1200000) * 0.20 + 90000
      else if (taxable > 1000000) est_tax = (taxable - 1000000) * 0.15 + 60000
      else if (taxable > 700000) est_tax = (taxable - 700000) * 0.10 + 20000
      else if (taxable > 300000) est_tax = (taxable - 300000) * 0.05
      const rebate = taxable <= 700000 ? Math.min(est_tax, 25000) : 0
      const total_est_tax = Math.round((est_tax - rebate) * 1.04)

      if (total_est_tax >= 10000) {
        const adv_paid = await (async () => {
          const r = await pool.query(
            `SELECT COALESCE(SUM(jel.debit_amount),0) as bal FROM accounts a LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id WHERE a.company_id=$1 AND a.code='1011'`,
            [company_id]
          )
          return parseFloat(r.rows[0]?.bal || 0)
        })()

        const month = today.getMonth() + 1
        if (month > 6 && month <= 9 && adv_paid < total_est_tax * 0.45) {
          issues.push({ severity: 'warning', category: 'Advance Tax', issue: `Estimated tax: ₹${total_est_tax.toLocaleString('en-IN')}. Paid: ₹${adv_paid.toLocaleString('en-IN')}. Q2 instalment (45% = ₹${Math.round(total_est_tax * 0.45).toLocaleString('en-IN')}) due Sep 15.`, law: 'Sec 208/234C — 45% by Sep 15', action: `Pay ₹${Math.max(0, Math.round(total_est_tax * 0.45) - adv_paid).toLocaleString('en-IN')} advance tax via challan ITNS 280` })
        } else if (month > 9 && month <= 12 && adv_paid < total_est_tax * 0.75) {
          issues.push({ severity: 'warning', category: 'Advance Tax', issue: `Q3 instalment (75% = ₹${Math.round(total_est_tax * 0.75).toLocaleString('en-IN')}) due Dec 15. Paid so far: ₹${adv_paid.toLocaleString('en-IN')}.`, law: 'Sec 208/234C', action: `Pay ₹${Math.max(0, Math.round(total_est_tax * 0.75) - adv_paid).toLocaleString('en-IN')} before Dec 15` })
        }
      }
    }

    // Summary
    const critical = issues.filter(i => i.severity === 'critical').length
    const warnings = issues.filter(i => i.severity === 'warning').length
    res.json({
      company: company.name, checked_at: new Date().toISOString(),
      summary: { total_issues: issues.length, critical, warnings, info: issues.filter(i => i.severity === 'info').length },
      issues,
      all_clear: issues.length === 0,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

//  POST /api/ai/audit-analysis — AI-powered audit trail anomaly detection 
router.post('/audit-analysis', async (req, res) => {
  const { company_id, from, to, groq_api_key } = req.body
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    // Pull audit log + journal entries for analysis
    let auditQ = `SELECT al.action, al.table_name, al.record_id, al.new_values, al.old_values, al.created_at, u.name as user_name
                  FROM audit_log al LEFT JOIN users u ON u.id=al.user_id
                  WHERE al.company_id=$1`
    const params = [company_id]
    if (from) { params.push(from); auditQ += ` AND al.created_at>=$${params.length}` }
    if (to) { params.push(to); auditQ += ` AND al.created_at<=$${params.length}` }
    auditQ += ' ORDER BY al.created_at DESC LIMIT 200'
    const { rows: auditRows } = await pool.query(auditQ, params)

    // Pull journal entries for statistical anomalies
    const { rows: jeRows } = await pool.query(
      `SELECT je.entry_number, je.entry_date, je.narration, je.reference_type,
              SUM(jel.debit_amount) as total_debit
       FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       WHERE je.company_id=$1 ${from ? `AND je.entry_date>='${from}'` : ''} ${to ? `AND je.entry_date<='${to}'` : ''}
       GROUP BY je.id ORDER BY je.entry_date DESC LIMIT 100`,
      [company_id]
    )

    // Statistical anomaly detection (without AI — rule-based)
    const anomalies = []

    // 1. Unusually large single journal entry (> 3x median)
    const amounts = jeRows.map(j => parseFloat(j.total_debit || 0)).filter(a => a > 0).sort((a, b) => a - b)
    if (amounts.length > 5) {
      const median = amounts[Math.floor(amounts.length / 2)]
      const outliers = jeRows.filter(j => parseFloat(j.total_debit || 0) > median * 10)
      outliers.forEach(j => {
        anomalies.push({ type: 'large_transaction', severity: 'warning', entry: j.entry_number, amount: parseFloat(j.total_debit), median, ratio: Math.round(parseFloat(j.total_debit) / median), description: `JE ${j.entry_number} (₹${parseFloat(j.total_debit).toLocaleString('en-IN')}) is ${Math.round(parseFloat(j.total_debit) / median)}× the median transaction amount`, date: j.entry_date, narration: j.narration })
      })
    }

    // 2. Multiple cancellations in short period
    const cancellations = auditRows.filter(r => r.action === 'INVOICE_CANCELLED')
    if (cancellations.length > 3) {
      anomalies.push({ type: 'multiple_cancellations', severity: 'warning', count: cancellations.length, description: `${cancellations.length} invoice cancellations detected in the selected period. High cancellation rate may indicate data entry errors or potential misuse.` })
    }

    // 3. Weekend / late-night journal entries
    const oddTimeJEs = jeRows.filter(j => {
      const d = new Date(j.entry_date)
      return d.getDay() === 0 || d.getDay() === 6 // Sunday or Saturday
    })
    if (oddTimeJEs.length > 0) {
      anomalies.push({ type: 'weekend_entries', severity: 'info', count: oddTimeJEs.length, description: `${oddTimeJEs.length} journal entries posted on weekends. Review if intentional.`, entries: oddTimeJEs.slice(0, 5).map(j => j.entry_number) })
    }

    // 4. Round-number entries that might be estimates
    const roundEntries = jeRows.filter(j => {
      const amt = parseFloat(j.total_debit || 0)
      return amt > 10000 && amt % 10000 === 0
    })
    if (roundEntries.length > amounts.length * 0.3) {
      anomalies.push({ type: 'round_number_entries', severity: 'info', count: roundEntries.length, description: `${roundEntries.length} entries have suspiciously round amounts (multiples of ₹10,000). May indicate estimates rather than actual transactions.` })
    }

    // 5. Journal entries without reference (manual with no source document)
    const { rows: unrefJEs } = await pool.query(
      `SELECT COUNT(*) as cnt FROM journal_entries WHERE company_id=$1 AND reference_type='manual' ${from ? `AND entry_date>='${from}'` : ''}`,
      [company_id]
    )
    const totalJEs = jeRows.length
    const manualPct = totalJEs > 0 ? Math.round(parseInt(unrefJEs[0].cnt) / totalJEs * 100) : 0
    if (manualPct > 30) {
      anomalies.push({ type: 'high_manual_entries', severity: 'warning', manual_count: parseInt(unrefJEs[0].cnt), pct: manualPct, description: `${manualPct}% of journal entries are manual (no source document). High manual entry rate increases audit risk.` })
    }

    // Now use AI for narrative analysis if Groq key available
    let ai_narrative = null
    const apiKey = groq_api_key || process.env.GROQ_API_KEY
    if (apiKey && (auditRows.length > 0 || anomalies.length > 0)) {
      try {
        const { rows: coRows } = await pool.query('SELECT name FROM companies WHERE id=$1', [company_id])
        const prompt = `You are a forensic accountant reviewing audit trail data for ${coRows[0]?.name || 'a company'}.

AUDIT TRAIL SUMMARY (last ${auditRows.length} events):
${auditRows.slice(0, 30).map(r => `${new Date(r.created_at).toLocaleDateString('en-IN')} | ${r.user_name} | ${r.action} | ${r.table_name} #${r.record_id}`).join('\n')}

STATISTICAL ANOMALIES DETECTED:
${anomalies.length === 0 ? 'None' : anomalies.map(a => `- ${a.type}: ${a.description}`).join('\n')}

TAX RULES REFERENCE:
${TAX_RULES_KB.slice(0, 2000)}

Provide a concise forensic audit analysis:
1. Key risk areas based on the audit trail patterns
2. Any patterns suggesting potential manipulation or errors
3. Compliance concerns visible in the data
4. 3-5 specific recommendations

Keep the analysis factual, actionable, and under 400 words.`

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 600, temperature: 0.2,
          })
        })
        if (response.ok) {
          const data = await response.json()
          ai_narrative = data.choices?.[0]?.message?.content || null
        }
      } catch (_) { }
    }

    res.json({
      company_id, period: { from, to },
      audit_trail: { total_events: auditRows.length, events: auditRows.slice(0, 50) },
      anomalies: { count: anomalies.length, items: anomalies },
      ai_analysis: ai_narrative,
      generated_at: new Date().toISOString(),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

//  GET /api/ai/rules?query=194C+threshold — RAG rule lookup 
router.get('/rules', (req, res) => {
  const { query } = req.query
  if (!query) return res.json({ rules: TAX_RULES_KB })

  // Simple keyword search through the knowledge base
  const lines = TAX_RULES_KB.split('\n')
  const q = query.toLowerCase()
  const matched = lines.filter(l => l.toLowerCase().includes(q) || l.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q.replace(/[^a-z0-9]/g, '')))
  res.json({ query, matched_rules: matched, total_matched: matched.length })
})