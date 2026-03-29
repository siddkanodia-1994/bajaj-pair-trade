#!/usr/bin/env python3
"""
Seed historical EOD market cap from PDF into Supabase eod_prices table.

PDF: "Market cap -2017-2019.pdf"
Coverage: 2 Jan 2017 – 31 Dec 2018 (2 Jan 2019 onward already in DB from main PDF)

Columns per row (pivot table format):
  date (DD/MM/YY) | fin_mcap (₹ cr) | finsv_mcap (₹ cr)

No price data in this PDF — fin_price and finsv_price will be 0 (placeholder).

Usage:
  pip install pdfplumber requests
  python3 scripts/seed_2017_2019.py
"""

import re
import sys
import pdfplumber
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
PDF_PATH = "/Users/siddhantkanodia/Documents/Claude Working Folder/Bajaj Pair Trade/Market cap -2017-2019.pdf"
SUPABASE_URL = "https://abzfkjicqstrauejklel.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiemZramljcXN0cmF1ZWprbGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzI5ODMsImV4cCI6MjA5MDAwODk4M30.DGdmVnEfT_U1khehKJtiyJELr6cJn58mydruWm_DIdQ"
BATCH_SIZE = 500

# ── Helpers ───────────────────────────────────────────────────────────────────
DATE_RE = re.compile(r'^\d{2}/\d{2}/\d{2}')

def fix_split_numbers(s: str) -> str:
    """Fix pdfplumber column-split artifacts.
    '1 ,02,221.82' → '1,02,221.82'  (space-comma split)
    '4 6,938.31'   → '46,938.31'    (space-before-digit-comma split)
    """
    s = re.sub(r'(\d) ,(\d)', r'\1,\2', s)
    s = re.sub(r'(\d) (\d,)', r'\1\2', s)
    return s

def parse_num(s: str) -> float:
    """Parse Indian-format number: '1,02,221.82' → 102221.82"""
    return float(s.replace(',', '').strip())

def parse_date(s: str) -> str:
    """Convert DD/MM/YY → YYYY-MM-DD"""
    return datetime.strptime(s.strip(), "%d/%m/%y").strftime("%Y-%m-%d")

# ── Parse PDF ─────────────────────────────────────────────────────────────────
rows = []
errors = []
skipped = 0

print(f"[seed_2017_2019] Reading: {PDF_PATH}")
with pdfplumber.open(PDF_PATH) as pdf:
    print(f"[seed_2017_2019] Total pages: {len(pdf.pages)}")
    for page_num, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        if not text:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not DATE_RE.match(line):
                continue  # skip header/blank lines

            # Extract exactly 8-char date, then rest.
            # When fin_mcap ≥ 1,00,000 pdfplumber omits the space, e.g. '28/08/171,00,627.14'
            m = re.match(r'^(\d{2}/\d{2}/\d{2})(.*)', line)
            if not m:
                continue
            date_str = m.group(1)
            rest = fix_split_numbers(m.group(2).strip())
            nums = re.findall(r'[\d,]+\.?\d*', rest)

            if len(nums) < 2:
                errors.append(f"Page {page_num}: expected 2 numbers, got {nums}: {line!r}")
                continue

            try:
                date       = parse_date(date_str)
                fin_mcap   = parse_num(nums[0])
                finsv_mcap = parse_num(nums[1])

                # Skip rows already in DB (2019-01-01 onward)
                if date >= '2019-01-01':
                    skipped += 1
                    continue

                rows.append({
                    "date":        date,
                    "fin_price":   0,        # no price data in this PDF; placeholder
                    "fin_mcap":    round(fin_mcap, 4),
                    "finsv_price": 0,        # no price data in this PDF; placeholder
                    "finsv_mcap":  round(finsv_mcap, 4),
                    "source":      "pdf_2017_2019",
                })
            except Exception as e:
                errors.append(f"Page {page_num}: parse error on {line!r}: {e}")

print(f"[seed_2017_2019] Parsed {len(rows)} rows, {skipped} skipped (2019+), {len(errors)} errors")
if errors:
    print("[seed_2017_2019] First 10 errors:")
    for e in errors[:10]:
        print(f"  {e}")

if not rows:
    print("[seed_2017_2019] No rows to insert. Exiting.")
    sys.exit(1)

# Sanity check
print(f"[seed_2017_2019] Date range: {rows[0]['date']} → {rows[-1]['date']}")
print(f"[seed_2017_2019] Sample first row: {rows[0]}")
print(f"[seed_2017_2019] Sample last row:  {rows[-1]}")

# ── Upsert to Supabase ────────────────────────────────────────────────────────
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

url = f"{SUPABASE_URL}/rest/v1/eod_prices?on_conflict=date"
total_inserted = 0

print(f"\n[seed_2017_2019] Upserting {len(rows)} rows in batches of {BATCH_SIZE}...")
for i in range(0, len(rows), BATCH_SIZE):
    batch = rows[i:i + BATCH_SIZE]
    resp = requests.post(url, json=batch, headers=headers)
    if resp.status_code not in (200, 201):
        print(f"  ERROR batch {i//BATCH_SIZE + 1}: HTTP {resp.status_code} — {resp.text[:200]}")
        sys.exit(1)
    total_inserted += len(batch)
    print(f"  Batch {i//BATCH_SIZE + 1}: {len(batch)} rows upserted ({total_inserted}/{len(rows)} total)")

print(f"\n[seed_2017_2019] Done. {total_inserted} rows upserted to eod_prices (source='pdf_2017_2019').")
