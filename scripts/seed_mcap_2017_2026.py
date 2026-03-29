#!/usr/bin/env python3
"""
Seed authoritative historical market cap from PDF into Supabase eod_prices table.

PDF: "Market cap data 2017-2026.pdf"
Coverage: 2 Jan 2017 – 25 Mar 2026 (all trading days)

PDF format (45 pages, extract_text):
  DD/MM/YY  <fin_mcap>  <finsv_mcap>
  Numbers are plain decimals (no Indian commas) — e.g. 47676.3, 46938.31

Only fin_mcap and finsv_mcap are upserted. Existing fin_price and finsv_price
values from seed_from_pdf.py are preserved (not overwritten).

Usage:
  pip install pdfplumber requests
  python3 scripts/seed_mcap_2017_2026.py
"""

import re
import sys
import pdfplumber
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
PDF_PATH = "/Users/siddhantkanodia/Documents/Claude Working Folder/Bajaj Pair Trade/Market cap data 2017-2026.pdf"
SUPABASE_URL = "https://abzfkjicqstrauejklel.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiemZramljcXN0cmF1ZWprbGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzI5ODMsImV4cCI6MjA5MDAwODk4M30.DGdmVnEfT_U1khehKJtiyJELr6cJn58mydruWm_DIdQ"
BATCH_SIZE = 500

# ── Helpers ───────────────────────────────────────────────────────────────────
DATE_RE = re.compile(r'^\d{2}/\d{2}/\d{2}')

def parse_date(s: str) -> str:
    """Convert DD/MM/YY → YYYY-MM-DD"""
    return datetime.strptime(s.strip(), "%d/%m/%y").strftime("%Y-%m-%d")

# ── Parse PDF ─────────────────────────────────────────────────────────────────
rows = []
errors = []

print(f"[seed_mcap] Reading: {PDF_PATH}")
with pdfplumber.open(PDF_PATH) as pdf:
    print(f"[seed_mcap] Total pages: {len(pdf.pages)}")
    for page_num, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        if not text:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not DATE_RE.match(line):
                continue  # skip header/blank lines

            m = re.match(r'^(\d{2}/\d{2}/\d{2})(.*)', line)
            if not m:
                continue
            date_str = m.group(1)
            rest = m.group(2).strip()

            # Numbers are plain decimals — no Indian commas
            nums = re.findall(r'[\d]+\.?\d*', rest)

            if len(nums) < 2:
                errors.append(f"Page {page_num}: expected 2 numbers, got {nums}: {line!r}")
                continue

            try:
                date = parse_date(date_str)
                fin_mcap   = float(nums[0])
                finsv_mcap = float(nums[1])

                rows.append({
                    "date":       date,
                    "fin_mcap":   round(fin_mcap, 4),
                    "finsv_mcap": round(finsv_mcap, 4),
                    "source":     "pdf_mcap_2017_2026",
                })
            except Exception as e:
                errors.append(f"Page {page_num}: parse error on {line!r}: {e}")

print(f"[seed_mcap] Parsed {len(rows)} rows, {len(errors)} errors")
if errors:
    print("[seed_mcap] First 10 errors:")
    for e in errors[:10]:
        print(f"  {e}")

if not rows:
    print("[seed_mcap] No rows to insert. Exiting.")
    sys.exit(1)

# Sanity check
print(f"[seed_mcap] Date range: {rows[0]['date']} → {rows[-1]['date']}")
print(f"[seed_mcap] Sample first row: {rows[0]}")
print(f"[seed_mcap] Sample last row:  {rows[-1]}")

# ── Upsert to Supabase ────────────────────────────────────────────────────────
# Only date, fin_mcap, finsv_mcap, source are sent.
# Existing fin_price / finsv_price columns are NOT touched on conflict.
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

url = f"{SUPABASE_URL}/rest/v1/eod_prices?on_conflict=date"
total_upserted = 0

print(f"\n[seed_mcap] Upserting {len(rows)} rows in batches of {BATCH_SIZE}...")
for i in range(0, len(rows), BATCH_SIZE):
    batch = rows[i:i + BATCH_SIZE]
    resp = requests.post(url, json=batch, headers=headers)
    if resp.status_code not in (200, 201):
        print(f"  ERROR batch {i//BATCH_SIZE + 1}: HTTP {resp.status_code} — {resp.text[:200]}")
        sys.exit(1)
    total_upserted += len(batch)
    print(f"  Batch {i//BATCH_SIZE + 1}: {len(batch)} rows upserted ({total_upserted}/{len(rows)} total)")

print(f"\n[seed_mcap] Done. {total_upserted} rows upserted to eod_prices (source='pdf_mcap_2017_2026').")
print("[seed_mcap] Verify: SELECT COUNT(*) FROM eod_prices WHERE finsv_mcap < 100 → should be 0.")
