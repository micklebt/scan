import sys


def main():
    if len(sys.argv) < 4:
        return 1

    input_pdf = sys.argv[1]
    page_num = int(sys.argv[2])
    output_png = sys.argv[3]
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 1200

    import fitz

    doc = fitz.open(input_pdf)
    try:
        if page_num < 1 or page_num > doc.page_count:
            return 2
        page = doc.load_page(page_num - 1)
        scale = max(width, 100) / page.rect.width
        matrix = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        pix.save(output_png)
        return 0
    finally:
        doc.close()


if __name__ == "__main__":
    raise SystemExit(main())
