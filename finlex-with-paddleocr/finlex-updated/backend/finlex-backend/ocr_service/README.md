# PaddleOCR Microservice

Replaces the former Anthropic Claude vision API for scanned invoice / image OCR.
**Zero API cost** — runs entirely on your machine.

## How it works

```
Scanned image / PDF page
        │
        ▼
 PaddleOCR (local)     ← port 5001, this service
 Extracts raw text
        │
        ▼
 Groq API (DeepSeek)   ← free tier, already in your .env
 Structures text → JSON
        │
        ▼
 FinLex backend returns structured invoice data
```

## Setup

### 1. Install Python deps

```bash
cd ocr_service
pip install -r requirements.txt
```

> First run downloads PaddleOCR models (~200 MB). Subsequent runs are instant.

### 2. Start the OCR service

```bash
python ocr_server.py
# Listening on http://localhost:5001
```

You can also set a custom port:
```bash
OCR_PORT=5002 python ocr_server.py
# and update OCR_SERVICE_URL in your .env accordingly
```

### 3. Verify it's running

```bash
curl http://localhost:5001/health
# {"status": "ok", "engine": "PaddleOCR"}
```

## Running both services together

```bash
# Terminal 1 — OCR service
cd backend/finlex-backend/ocr_service && python ocr_server.py

# Terminal 2 — FinLex backend
cd backend/finlex-backend && npm start
```

## Notes

- Supports JPEG, PNG, WEBP, BMP, and scanned PDF pages (converted to images by the frontend before sending)
- `use_angle_cls=True` handles rotated / tilted text common in mobile-photographed invoices
- Low-confidence text fragments (< 40%) are automatically filtered out
- The DeepSeek-R1 model on Groq strips its own `<think>` reasoning blocks automatically
