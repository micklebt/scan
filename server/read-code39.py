import re
import sys
import numpy as np
import json

PATTERN = re.compile(r"\bB\d{4}\b", re.IGNORECASE)

def main():
    if len(sys.argv) < 2:
        return 0
    pdf_path = sys.argv[1]
    output_all = "--all" in sys.argv[2:]
    try:
        import fitz
        import zxingcpp
    except Exception:
        return 0

    try:
        doc = fitz.open(pdf_path)
    except Exception:
        return 0

    try:
        found = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=300, colorspace=fitz.csGRAY)
            image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
            results = zxingcpp.read_barcodes(image)
            for result in results:
                text = str(result.text or "").strip().upper()
                if PATTERN.fullmatch(text):
                    if output_all:
                        found.append({"page": i, "code": text})
                        break
                    print(text)
                    return 0
                match = PATTERN.search(text)
                if match:
                    code = match.group(0).upper()
                    if output_all:
                        found.append({"page": i, "code": code})
                        break
                    print(code)
                    return 0
        if output_all:
            print(json.dumps(found))
    finally:
        doc.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
