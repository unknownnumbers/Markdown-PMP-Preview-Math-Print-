from pathlib import Path
import re
import pypdfium2 as pdfium
from pypdf import PdfReader

root=Path(__file__).resolve().parent.parent/"tmp/pdfs/pagination"
pdf=pdfium.PdfDocument(str(root/"complete.pdf"))
text="".join(page.extract_text() or "" for page in PdfReader(root/"complete.pdf").pages)
text=re.sub(r"\s+","",text)
for i in range(120):assert f"ITEM_{i:03}" in text,i
for value in ["ROW_START","ROW_END","REF_COMPLETE","LAST_CELL_COMPLETE","LAST_REFERENCE","DOCUMENT_COMPLETE","purely$(n-2)$-unrectifiableset"]:assert value in text,value
assert "\ufffe" not in text
count=len(pdf)
pdf.close()
selected=pdfium.PdfDocument(str(root/"range.pdf"))
assert len(selected)==2
selected.close()
print({"pages":count,"itemsVerified":120,"literalCodePreserved":True,"rangePages":2})
