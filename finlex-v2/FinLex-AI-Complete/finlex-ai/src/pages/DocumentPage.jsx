import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, Zap, AlertCircle, RefreshCw, Save,
         Edit3, Eye, Camera, BookOpen, Calendar, Shield, Search,
         AlertTriangle, FileCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BASE_URL = 'http://localhost:5000/api'
const getToken = () => localStorage.getItem('finlex_token')
const fmt = (n) => '₹' + Math.abs(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

// ── Extract text from PDF using PDF.js ────────────────────────
async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = resolve
      script.onerror = () => reject(new Error('Failed to load PDF.js'))
      document.head.appendChild(script)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts = []
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const pageContent = await page.getTextContent()
    const pageText = pageContent.items.map(item => item.str).join(' ')
    pageTexts.push(pageText)
    fullText += pageText + '\n'
  }
  return { fullText: fullText.trim(), pageTexts, numPages: pdf.numPages }
}

// ── Convert PDF page to base64 image for Vision OCR ──────────
async function pdfPageToBase64(file, pageNum = 1) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = resolve
      script.onerror = () => reject(new Error('Failed to load PDF.js'))
      document.head.appendChild(script)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: 2.0 })
  const canvas = document.createElement('canvas')
  canvas.width  = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  return { base64, numPages: pdf.numPages, width: viewport.width, height: viewport.height }
}

// ── Convert image file to base64 ─────────────────────────────
async function imageToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(file)
  })
}

export default function DocumentPage() {
  const { company } = useAuth()
  const [tab, setTab]                   = useState('invoice')
  const [stage, setStage]               = useState('upload')
  const [dragOver, setDragOver]         = useState(false)
  const [fileName, setFileName]         = useState('')
  const [extracted, setExtracted]       = useState(null)
  const [editedData, setEditedData]     = useState(null)   // user-edited version
  const [isEditing, setIsEditing]       = useState(false)
  const [bankItems, setBankItems]       = useState([])
  const [detectedType, setDetectedType] = useState(null)
  const [error, setError]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [pipelineResult, setPipelineResult] = useState(null)
  const [multiResults, setMultiResults] = useState([])
  const [confidence, setConfidence]     = useState(null)
  const [wasOCR, setWasOCR]             = useState(false)
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setStage('processing')
    setError('')
    setExtracted(null)
    setEditedData(null)
    setBankItems([])
    setSaved(false)
    setDetectedType(null)
    setConfidence(null)
    setWasOCR(false)

    try {
      const isPDF   = file.type === 'application/pdf'
      const isCSV   = file.type === 'text/csv' || file.name.endsWith('.csv')
      const isTxt   = file.type === 'text/plain' || file.name.endsWith('.txt')
      const isImage = file.type.startsWith('image/')

      let textContent  = ''
      let pdfPageTexts = null
      let visionBase64 = null
      let visionMime   = 'image/jpeg'
      let useVision    = false

      if (isPDF) {
        const pdfResult = await extractPdfText(file)
        textContent  = pdfResult.fullText
        pdfPageTexts = pdfResult.pageTexts

        // If PDF has no selectable text → convert to image for OCR
        if (!textContent || textContent.trim().length < 40) {
          const imgResult = await pdfPageToBase64(file, 1)
          visionBase64 = imgResult.base64
          visionMime   = 'image/jpeg'
          useVision    = true
          setWasOCR(true)
        }
      } else if (isImage) {
        visionBase64 = await imageToBase64(file)
        visionMime   = file.type || 'image/jpeg'
        useVision    = true
        setWasOCR(true)
      } else if (isCSV || isTxt) {
        textContent = await file.text()
      } else {
        textContent = await file.text()
      }

      const response = await fetch(`${BASE_URL}/ai/extract-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          tab,
          file_name:    file.name,
          text_content: textContent,
          page_texts:   pdfPageTexts,
          vision_base64: visionBase64 || null,
          vision_mime:   visionBase64 ? visionMime : null,
          use_vision:    useVision,
          company,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Extraction failed')

      const detected = data.detected_type || tab
      setDetectedType(detected)
      setTab(detected === 'bank' ? 'bank' : 'invoice')

      // Compute confidence score based on how many fields were extracted
      if (detected === 'invoice' && data.extracted) {
        const ext = data.extracted
        const fields = [ext.invoiceNo, ext.date, ext.vendorName, ext.vendorGSTIN, ext.buyerName, ext.total, ext.items?.length > 0]
        const filled = fields.filter(Boolean).length
        setConfidence(Math.round((filled / fields.length) * 100))
      }

      if (detected === 'invoice') {
        setExtracted(data.extracted)
        setEditedData({ ...data.extracted }) // editable copy
        setStage('review')  // go to review step first, not auto-save

        if (data.multi_invoice && data.all_invoices?.length >= 1) {
          setMultiResults([])
          const results = []
          for (let i = 0; i < data.all_invoices.length; i++) {
            const inv = data.all_invoices[i]
            try {
              const r = await fetch(`${BASE_URL}/ai/ingest-invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ extracted: inv, company, file_name: `${file.name} [Page ${i + 1}]` }),
              })
              const d = await r.json()
              results.push({ index: i + 1, invoice_number: inv.invoiceNo || `Invoice ${i + 1}`, vendor: inv.vendorName, success: r.ok && d.success !== false, message: d.error || 'Saved' })
            } catch (e) {
              results.push({ index: i + 1, invoice_number: inv.invoiceNo || `Invoice ${i + 1}`, vendor: inv.vendorName, success: false, message: e.message })
            }
            setMultiResults([...results])
          }
          setSaved(true)
          setStage('done')
        }
      } else {
        setBankItems(data.transactions || [])
        setStage('done')
      }
    } catch (err) {
      setError(err.message)
      setStage('upload')
    }
  }

  const reset = () => {
    setStage('upload'); setFileName(''); setExtracted(null); setEditedData(null)
    setBankItems([]); setError(''); setSaved(false); setPipelineResult(null)
    setDetectedType(null); setMultiResults([]); setConfidence(null)
    setWasOCR(false); setIsEditing(false)
  }

  // ── Confirm & ingest (after review) ──────────────────────────
  const triggerPipeline = async (dataToSave) => {
    if (!dataToSave || !company?.id) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${BASE_URL}/ai/ingest-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ extracted: dataToSave, company, file_name: fileName }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Pipeline failed')
      if (data.success === false && data.pipeline?.includes('duplicate_skipped')) {
        setError(data.warnings?.[0] || 'Duplicate invoice — already in books.')
      } else {
        setPipelineResult(data)
        setSaved(true)
        setStage('done')
      }
    } catch (err) {
      setError('Ingest failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmSave = () => triggerPipeline(editedData)

  // ── Editable field update ─────────────────────────────────────
  const updateField = (field, value) => setEditedData(prev => ({ ...prev, [field]: value }))

  const confColor = confidence >= 85 ? '#16a34a' : confidence >= 60 ? '#ca8a04' : '#dc2626'
  const confLabel = confidence >= 85 ? 'High confidence' : confidence >= 60 ? 'Medium — review fields' : 'Low — please verify all fields'

  return (
    <div style={{ animation: 'fadeUp 0.5s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
          AI Document Ingestion
        </h1>
        <p style={{ color: 'var(--gray-600)', fontSize: 15 }}>
          Upload any financial document — AI extracts, you review, then save to books
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--white)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--gray-200)' }}>
        {[{ id: 'invoice', label: '🧾 Invoice / PDF / Image' }, { id: 'bank', label: '🏦 Bank Statement' }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); reset() }} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: tab === t.id ? 'var(--navy)' : 'transparent', color: tab === t.id ? 'var(--white)' : 'var(--gray-600)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: 16 }}>
          <AlertCircle size={16} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
        </div>
      )}

      {/* ── Upload Zone ─────────────────────────────────────── */}
      {stage === 'upload' && (
        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          style={{ border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--gray-200)'}`, borderRadius: 20, padding: '60px 40px', textAlign: 'center', background: dragOver ? 'rgba(201,168,76,0.04)' : 'var(--white)', cursor: 'pointer', transition: 'all 0.2s', marginBottom: 24 }}
        >
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.csv,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(201,168,76,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Upload size={32} color="var(--gold)" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Drop your document here</h3>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 8 }}>
            {tab === 'invoice' ? 'Supports PDF (digital + scanned), JPG, PNG, CSV' : 'Upload your bank statement CSV or PDF'}
          </p>
          {tab === 'invoice' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 18 }}>
              <Camera size={13} color="#7c3aed" />
              <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500 }}>Scanned & photo invoices supported via AI Vision OCR</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(tab === 'invoice'
              ? ['Digital PDF', 'Scanned PDF', 'Photo (JPG/PNG)', 'GST Invoice', 'Purchase Bill']
              : ['Bank CSV', 'Statement PDF', 'Transaction Export']
            ).map(t => (
              <span key={t} style={{ padding: '4px 12px', borderRadius: 20, background: 'var(--gray-100)', border: '1px solid var(--gray-200)', fontSize: 12, color: 'var(--gray-600)' }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Processing ──────────────────────────────────────── */}
      {stage === 'processing' && (
        <div style={{ background: 'var(--white)', borderRadius: 20, padding: '60px 40px', textAlign: 'center', marginBottom: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'float 1.5s ease infinite' }}>
            <Zap size={32} color="var(--gold)" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>
            {wasOCR ? 'AI Vision OCR scanning document...' : 'AI reading your document...'}
          </h3>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 28 }}>{fileName}</p>
          <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(wasOCR
              ? ['Converting document to image...', 'Running AI Vision OCR...', 'Extracting text from scan...', 'Identifying GST components...', 'Building structured data...']
              : ['Reading document structure...', 'Extracting text and data...', 'Identifying GST components...', 'Validating GSTIN and amounts...', 'Preparing review...']
            ).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--gray-100)', borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', animation: `fadeIn 0.5s ease ${i * 0.4}s both` }} />
                <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Review Step (invoice) — EDITABLE before save ────── */}
      {stage === 'review' && tab === 'invoice' && editedData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header banner */}
          <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Eye size={24} color="var(--gold)" />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Review before saving to books</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{fileName}{wasOCR ? ' · OCR scan' : ' · digital PDF'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <RefreshCw size={12} /> New Upload
              </button>
              <button onClick={() => setIsEditing(!isEditing)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(201,168,76,0.5)', background: isEditing ? 'var(--gold)' : 'transparent', color: isEditing ? 'var(--navy)' : 'var(--gold)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Edit3 size={12} /> {isEditing ? 'Done Editing' : 'Edit Fields'}
              </button>
              <button onClick={confirmSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #C9A84C, #e2c06e)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: saving ? 0.7 : 1 }}>
                <Zap size={13} /> {saving ? 'Saving...' : 'Confirm & Save to Books'}
              </button>
            </div>
          </div>

          {/* Confidence score + OCR notice */}
          {confidence !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--white)', border: `1px solid ${confColor}33`, borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: confColor }}>AI Confidence: {confidence}%</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>— {confLabel}</span>
                  {wasOCR && <span style={{ fontSize: 11, background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>📷 OCR scan</span>}
                </div>
                <div style={{ height: 6, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${confidence}%`, background: confColor, borderRadius: 4, transition: 'width 0.6s ease' }} />
                </div>
              </div>
              {wasOCR && (
                <span style={{ fontSize: 12, color: '#7c3aed', maxWidth: 200, lineHeight: 1.3 }}>
                  Scanned doc — please verify all fields before saving
                </span>
              )}
            </div>
          )}

          {/* Editable fields grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Invoice details */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Invoice Details {isEditing && <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 500 }}>· editing</span>}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { key: 'invoiceNo', label: 'Invoice No.' },
                  { key: 'date', label: 'Date', type: 'date' },
                  { key: 'vendorName', label: 'Vendor Name' },
                  { key: 'vendorGSTIN', label: 'Vendor GSTIN' },
                  { key: 'buyerName', label: 'Buyer Name' },
                  { key: 'buyerGSTIN', label: 'Buyer GSTIN' },
                  { key: 'invoiceType', label: 'Invoice Type' },
                ].map(({ key, label, type }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--gray-100)', borderRadius: 8, gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, minWidth: 90, flexShrink: 0 }}>{label}</span>
                    {isEditing ? (
                      <input
                        value={editedData[key] || ''}
                        onChange={e => updateField(key, e.target.value)}
                        type={type || 'text'}
                        style={{ flex: 1, fontSize: 13, color: 'var(--navy)', fontWeight: 500, border: '1px solid var(--gold)', borderRadius: 6, padding: '3px 8px', background: 'white', fontFamily: 'var(--font-body)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: editedData[key] ? 'var(--navy)' : 'var(--gray-400)', fontWeight: 500 }}>
                        {editedData[key] || '—'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tax breakdown */}
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Tax Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { key: 'subtotal', label: 'Subtotal', bold: false },
                  { key: 'cgst', label: 'CGST', bold: false },
                  { key: 'sgst', label: 'SGST', bold: false },
                  { key: 'igst', label: 'IGST', bold: false },
                  { key: 'total', label: 'Total', bold: true },
                ].filter(f => f.bold || parseFloat(editedData[f.key] || 0) > 0).map(({ key, label, bold }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: bold ? 'var(--navy)' : 'var(--gray-100)', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: bold ? 'rgba(255,255,255,0.7)' : 'var(--gray-600)', fontWeight: bold ? 600 : 400 }}>{label}</span>
                    {isEditing && !bold ? (
                      <input
                        value={editedData[key] || ''}
                        onChange={e => updateField(key, e.target.value)}
                        type="number"
                        style={{ width: 100, textAlign: 'right', fontSize: 13, border: '1px solid var(--gold)', borderRadius: 5, padding: '2px 6px', background: 'white', fontFamily: 'var(--font-body)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontSize: bold ? 16 : 13, color: bold ? 'var(--gold)' : 'var(--navy)', fontWeight: 700 }}>{fmt(editedData[key])}</span>
                    )}
                  </div>
                ))}
              </div>
              {(parseFloat(editedData.cgst || 0) + parseFloat(editedData.sgst || 0) + parseFloat(editedData.igst || 0)) > 0 && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={12} color="#15803d" /> ITC Claimable on save</div>
                  <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    {fmt((parseFloat(editedData.cgst || 0) + parseFloat(editedData.sgst || 0) + parseFloat(editedData.igst || 0)))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line items preview */}
          {editedData.items?.length > 0 && (
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Line Items ({editedData.items.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    {['Description', 'HSN', 'Qty', 'Rate', 'GST%', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editedData.items.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{item.desc}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-600)', fontFamily: 'var(--font-mono)' }}>{item.hsn || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.qty}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>{fmt(item.rate)}</td>
                      <td style={{ padding: '10px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8' }}>{item.gstRate}%</span></td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{fmt(parseFloat(item.qty) * parseFloat(item.rate))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Done — Pipeline Result ────────────────────────────── */}
      {stage === 'done' && tab === 'invoice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle size={26} color="var(--gold)" />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>
                  {multiResults.length > 0 ? `${multiResults.filter(r => r.success).length}/${multiResults.length} invoices saved` : 'Saved to books'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fileName}</div>
              </div>
            </div>
            <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <RefreshCw size={12} /> New Upload
            </button>
          </div>

          {pipelineResult && (
            <div style={{ background: 'var(--white)', borderRadius: 16, padding: 22, border: '1px solid #bbf7d0' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#15803d', marginBottom: 14 }}>Pipeline complete</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10 }}>
                {[
                  { step: 'invoice_created',           Icon: FileText,    label: 'Invoice Created' },
                  { step: 'journal_entry_created',      Icon: BookOpen,    label: 'Journal Posted' },
                  { step: 'itc_recorded',               Icon: CheckCircle, label: 'ITC Recorded' },
                  { step: 'compliance_deadline_added',  Icon: Calendar,    label: 'Deadline Set' },
                  { step: 'tds_auto_deducted',          Icon: Shield,      label: 'TDS Deducted' },
                  { step: 'audit_logged',               Icon: Search,      label: 'Audit Logged' },
                ].map(({ step, Icon, label }) => {
                  const active = pipelineResult.pipeline?.includes(step)
                  return (
                    <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, background: active ? '#f0fdf4' : 'var(--gray-100)', border: `1px solid ${active ? '#bbf7d0' : 'var(--gray-200)'}`, opacity: active ? 1 : 0.4 }}>
                      <Icon size={14} color={active ? '#15803d' : 'var(--gray-400)'} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#15803d' : 'var(--gray-400)' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
              {pipelineResult.tds_hint && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} color="#dc2626" /> TDS u/s {pipelineResult.tds_hint.section} — {pipelineResult.tds_hint.nature}</div>
                  <div style={{ fontSize: 13, color: '#7f1d1d' }}>Deduct {pipelineResult.tds_hint.rate}% = <strong>{fmt(pipelineResult.tds_hint.tds_amount)}</strong> · Net payable: <strong>{fmt(pipelineResult.tds_hint.net_payable)}</strong></div>
                </div>
              )}
              {pipelineResult.itc && (
                <div style={{ marginTop: 10, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} color="#15803d" /> ITC Claimable</div>
                  <div style={{ fontSize: 13, color: '#166534' }}>CGST {fmt(pipelineResult.itc.cgst)} + SGST {fmt(pipelineResult.itc.sgst)} + IGST {fmt(pipelineResult.itc.igst)} = <strong>{fmt(pipelineResult.itc.claimable)}</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Multi-invoice batch results */}
          {multiResults.length > 0 && (
            <div style={{ background: 'var(--white)', borderRadius: 14, padding: 20, border: '1px solid var(--gray-200)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Batch Results ({multiResults.length} invoices)</h3>
              {multiResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < multiResults.length - 1 ? '1px solid var(--gray-200)' : 'none' }}>
                  <span><FileCheck size={13} color={r.success ? '#16a34a' : '#dc2626'} /></span>
                  <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.invoice_number}</span>
                  <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{r.vendor}</span>
                  {!r.success && <span style={{ fontSize: 12, color: '#dc2626' }}>{r.message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bank statement results (unchanged) ──────────────── */}
      {stage === 'done' && tab === 'bank' && bankItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle size={26} color="var(--gold)" />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>
                  {bankItems.length} transactions extracted
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {saved ? `${pipelineResult?.journals_created || 0} journal entries posted` : 'Review and save to books'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!saved && (
                <button
                  onClick={async () => {
                    if (!company?.id) { setError('No company selected'); return }
                    setSaving(true); setError('')
                    try {
                      const resp = await fetch(`${BASE_URL}/ai/ingest-bank`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                        body: JSON.stringify({ transactions: bankItems, company }),
                      })
                      const data = await resp.json()
                      if (!resp.ok) throw new Error(data.error || 'Bank ingest failed')
                      setPipelineResult(data); setSaved(true)
                    } catch (err) { setError('Bank import failed: ' + err.message) }
                    finally { setSaving(false) }
                  }}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--gold)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? <><RefreshCw size={13} /> Saving…</> : <><Save size={13} /> Save to Books</>}
                </button>
              )}
              <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <RefreshCw size={12} /> New Upload
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { label: 'Total Credits', value: fmt(bankItems.filter(i => i.amount > 0).reduce((s, i) => s + i.amount, 0)), color: '#16a34a' },
              { label: 'Total Debits', value: fmt(bankItems.filter(i => i.amount < 0).reduce((s, i) => s + Math.abs(i.amount), 0)), color: '#dc2626' },
              { label: 'Transactions', value: bankItems.length, color: '#1d4ed8' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--gray-200)' }}>
                <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--white)', borderRadius: 16, padding: 24, border: '1px solid var(--gray-200)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>AI-Classified Transactions</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy)' }}>
                  {['Date', 'Description', 'Amount', 'Category', 'GST Treatment'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gold)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bankItems.map((item, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-600)', fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{item.desc}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: item.amount > 0 ? '#16a34a' : '#dc2626' }}>
                      {item.amount > 0 ? '+' : '-'}{fmt(item.amount)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--gray-200)', color: 'var(--navy)' }}>{item.category}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: item.gst?.includes('ITC Claimable') ? '#1d4ed8' : item.gst?.includes('Exempt') ? '#16a34a' : '#ca8a04', fontWeight: 500 }}>
                      {item.gst || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}