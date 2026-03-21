import json
import re
import sys


def extract_value(patterns, text):
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()
    return None


def extract_document_date(text):
    period_patterns = [
        r"\bto\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})",
        r"\bthrough\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})",
    ]
    val = extract_value(period_patterns, text)
    if val:
        return val
    prioritized = [
        r"\bstatement\s+date\b[\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
        r"\binvoice\s+date\b[\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
        r"\bdate\s+of\s+statement\b[\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
        r"\bdate\b[\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
    ]
    val = extract_value(prioritized, text)
    if val:
        return val
    generic = re.search(r"\b([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b", text, flags=re.IGNORECASE)
    return generic.group(1) if generic else None


def normalize_notes(text):
    compact = " ".join(text.split())
    return compact[:500] if compact else None


def extract_description(text):
    patterns = [
        r"\b(preferred\s+credit\s+line)\b",
        r"\b(statement\s+summary)\b",
        r"\b(account\s+summary)\b",
    ]
    value = extract_value(patterns, text)
    if value:
        return " ".join(value.split())
    return None


def extract_source_name(text):
    source_patterns = [
        (r"\bkey\s*bank\b|\bkeybank\b", "Key Bank"),
        (r"\binternal\s+revenue\s+service\b|\birs\b", "IRS"),
        (r"\bu\.?\s*s\.?\s*small\s+business\s+administration\b|\bsba\b", "U.S. Small Business Administration"),
        (r"\bu\.?\s*s\.?\s*department\s+of\s+treasury\b|\btreasury\b", "U.S. Department of the Treasury"),
        (r"\bsocial\s+security\s+administration\b|\bssa\b", "Social Security Administration"),
    ]
    for pattern, label in source_patterns:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return label
    return None


def run_ocr(pdf_path):
    import os
    import shutil
    import fitz
    import pytesseract
    from PIL import Image
    import numpy as np

    if not shutil.which("tesseract"):
        default_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(default_tesseract):
            pytesseract.pytesseract.tesseract_cmd = default_tesseract

    doc = fitz.open(pdf_path)
    chunks = []
    try:
        for page in doc:
            variants = []
            for dpi in (250, 300, 400):
                pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
                img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
                variants.append(img)

                arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
                bw = np.where(arr > 165, 255, 0).astype(np.uint8)
                variants.append(Image.fromarray(bw, mode="L"))

            page_text = []
            for img in variants:
                for cfg in ("--psm 6", "--psm 4", "--psm 11"):
                    try:
                        text = pytesseract.image_to_string(img, config=cfg)
                        if text and text.strip():
                            page_text.append(text)
                    except Exception:
                        continue
            if page_text:
                chunks.append("\n".join(page_text))
    finally:
        doc.close()
    return "\n".join(chunks)


def extract_text_layer(pdf_path):
    import fitz

    doc = fitz.open(pdf_path)
    chunks = []
    try:
        for page in doc:
            chunks.append(page.get_text("text") or "")
    finally:
        doc.close()
    return "\n".join(chunks)


def extract_total_amount(text):
    labeled = [
        r"\bminimum\s+payment\s+due\b[\s\S]{0,80}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
        r"\bnew\s+balance\b[\s\S]{0,80}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
        r"\bamount\s+now\s+due\b[\s\S]{0,120}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
        r"\b(?:total\s+amount\s+due|amount\s+due|balance\s+due|invoice\s+total|total\s+due)\b[\s\S]{0,120}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
        r"\binstallment\s+amount\b[\s\S]{0,120}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
        r"\btotal\b[^\n\r]{0,20}?\$?\s*([0-9][0-9,]*\.[0-9]{2})",
    ]
    value = extract_value(labeled, text)
    if value:
        return value
    all_amounts = re.findall(r"\$?\s*([0-9][0-9,]*\.[0-9]{2})", text, flags=re.IGNORECASE)
    if not all_amounts:
        return None
    try:
        normalized = sorted(all_amounts, key=lambda s: float(s.replace(",", "")))
        return normalized[-1]
    except Exception:
        return all_amounts[-1]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({}))
        return 0

    pdf_path = sys.argv[1]
    text_parts = []
    try:
        text_parts.append(extract_text_layer(pdf_path))
    except Exception:
        pass

    try:
        text_parts.append(run_ocr(pdf_path))
    except Exception:
        pass

    text = "\n".join([p for p in text_parts if p and p.strip()])
    if not text.strip():
        print(json.dumps({}))
        return 0

    metadata = {
        "docDate": extract_document_date(text),
        "customerName": extract_value(
            [
                r"\b(?:customer|vendor|bill to|sold to)[:\s]+([^\n\r]+)",
                r"\bname[:\s]+([^\n\r]+)",
            ],
            text,
        ),
        "accountNumber": extract_value(
            [
                r"\b(?:account|reference|ref|invoice)\s*(?:number|no|#)\s*[:\s]*([A-Za-z0-9\-_/]{3,})",
                r"\baccount\s*#\s*([A-Za-z0-9\-_/]{3,})",
            ],
            text,
        ),
        "totalAmount": extract_total_amount(text),
        "notes": extract_description(text) or normalize_notes(text),
    }
    source_name = extract_source_name(text)
    if not metadata["customerName"] and source_name:
        metadata["customerName"] = source_name
    metadata["sourceName"] = source_name
    print(json.dumps(metadata))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
