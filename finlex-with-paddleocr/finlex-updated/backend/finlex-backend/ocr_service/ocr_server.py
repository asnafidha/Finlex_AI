"""
PaddleOCR Microservice for FinLex
Runs on port 5001 — receives base64 image, returns extracted text.

Install deps:
  pip install paddlepaddle paddleocr flask pillow

Run:
  python ocr_server.py
"""

import base64
import io
import json
import logging
import os

from flask import Flask, request, jsonify
from PIL import Image
from paddleocr import PaddleOCR

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Initialise once at startup (downloads models on first run ~200 MB)
# use_angle_cls=True handles rotated text (common in scanned invoices)
ocr_engine = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)


def base64_to_pil(b64_string: str) -> Image.Image:
    """Decode base64 string to PIL Image."""
    # Strip data-URI prefix if present (e.g. "data:image/jpeg;base64,...")
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]
    img_bytes = base64.b64decode(b64_string)
    return Image.open(io.BytesIO(img_bytes)).convert('RGB')


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'engine': 'PaddleOCR'})


@app.route('/ocr', methods=['POST'])
def run_ocr():
    """
    Expects JSON body:
      { "base64": "<base64-encoded image>", "mime": "image/jpeg" }

    Returns:
      { "text": "<full extracted text>", "lines": ["line1", "line2", ...] }
    """
    try:
        body = request.get_json(force=True)
        if not body or 'base64' not in body:
            return jsonify({'error': 'Missing base64 field'}), 400

        pil_img = base64_to_pil(body['base64'])

        # Save to temp buffer for PaddleOCR (it accepts numpy arrays too)
        import numpy as np
        img_array = np.array(pil_img)

        result = ocr_engine.ocr(img_array, cls=True)

        lines = []
        if result and result[0]:
            for line in result[0]:
                # line = [ [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence) ]
                text_fragment = line[1][0]
                confidence = line[1][1]
                if confidence > 0.4:  # filter low-confidence noise
                    lines.append(text_fragment)

        full_text = '\n'.join(lines)
        return jsonify({'text': full_text, 'lines': lines})

    except Exception as e:
        logging.exception('OCR error')
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('OCR_PORT', 5001))
    app.run(host='0.0.0.0', port=port)
