#!/usr/bin/env python3
"""
Seed historical EOD prices from PDF into Supabase eod_prices table.

PDF: "Bajaj finance Pair trade historical data.pdf"
Coverage: 1 Jan 2019 – 25 Mar 2026

Columns per row (after date):
  fin_mcap (₹ cr) | fin_price (₹) | finsv_mcap (₹ cr) | finsv_price (₹) | fin_shares | finsv_shares

Usage:
  pip install pdfplumber requests
  python3 scripts/seed_from_pdf.py
"""

import re
import sys
import pdfplumber
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
PDF_PATH = "/Users/siddhantkanodia/Documents/Claude Working Folder/Bajaj Pair Trade/Bajaj finance Pair trade historical data.pdf"
SUPABASE_URL = "https://abzfkjicqstrauejklel.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiemZramljcXN0cmF1ZWprbGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzI5ODMsImV4cCI6MjA5MDAwODk4M30.DGdmVnEfT_U1khehKJtiyJELr6cJn58mydruWm_DIdQ"
BATCH_SIZE = 500

# ── Helpers ───────────────────────────────────────────────────────────────────
DATE_RE = re.compile(r'^\d{2}/\d{2}/\d{2}')

def fix_split_numbers(line: str) -> str:
    """Fix pdfplumber column-split artifacts: '1 ,002.1' → '1,002.1'"""
    return re.sub(r'(\d) ,(\d)', r'\1,\2', line)

def parse_num(s: str) -> float:
    """Parse Indian-format number: '1,53,557.5' → 153557.5"""
    return float(s.replace(',', '').strip())

def parse_date(s: str) -> str:
    """Convert DD/MM/YY → YYYY-MM-DD (year 19xx handled by %y in Python)"""
    return datetime.strptime(s.strip(), "%d/%m/%y").strftime("%Y-%m-%d")

def extract_numbers(text: str):
    """Extract all numeric tokens (with commas) from a string."""
    return re.findall(r'[\d,]+\.?\d*', text)

# ── Parse PDF ─────────────────────────────────────────────────────────────────
rows = []
errors = []

print(f"[seed_pdf] Reading: {PDF_PATH}")
with pdfplumber.open(PDF_PATH) as pdf:
    print(f"[seed_pdf] Total pages: {len(pdf.pages)}")
    for page_num, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        if not text:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not DATE_RE.match(line):
                continue  # skip header/blank lines
            line = fix_split_numbers(line)

            # Split off date
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            date_str, rest = parts

            nums = extract_numbers(rest)
            if len(nums) < 6:
                errors.append(f"Page {page_num}: expected 6 numbers, got {len(nums)}: {line!r}")
                continue

            try:
                date        = parse_date(date_str)
                fin_mcap    = parse_num(nums[0])
                fin_price   = parse_num(nums[1])
                finsv_mcap  = parse_num(nums[2])
                finsv_price = parse_num(nums[3])
                # nums[4] = fin_shares, nums[5] = finsv_shares (not stored in eod_prices)

                rows.append({
                    "date":        date,
                    "fin_price":   round(fin_price, 4),
                    "fin_mcap":    round(fin_mcap, 4),
                    "finsv_price": round(finsv_price, 4),
                    "finsv_mcap":  round(finsv_mcap, 4),
                    "source":      "pdf",
                })
            except Exception as e:
                errors.append(f"Page {page_num}: parse error on {line!r}: {e}")

print(f"[seed_pdf] Parsed {len(rows)} rows, {len(errors)} errors")
if errors:
    print("[seed_pdf] First 10 errors:")
    for e in errors[:10]:
        print(f"  {e}")

if not rows:
    print("[seed_pdf] No rows to insert. Exiting.")
    sys.exit(1)

# Sanity check
print(f"[seed_pdf] Date range: {rows[0]['date']} → {rows[-1]['date']}")
print(f"[seed_pdf] Sample first row: {rows[0]}")
print(f"[seed_pdf] Sample last row:  {rows[-1]}")

# ── Upsert to Supabase ────────────────────────────────────────────────────────
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

url = f"{SUPABASE_URL}/rest/v1/eod_prices?on_conflict=date"
total_inserted = 0

print(f"\n[seed_pdf] Upserting {len(rows)} rows in batches of {BATCH_SIZE}...")
for i in range(0, len(rows), BATCH_SIZE):
    batch = rows[i:i + BATCH_SIZE]
    resp = requests.post(url, json=batch, headers=headers)
    if resp.status_code not in (200, 201):
        print(f"  ERROR batch {i//BATCH_SIZE + 1}: HTTP {resp.status_code} — {resp.text[:200]}")
        sys.exit(1)
    total_inserted += len(batch)
    print(f"  Batch {i//BATCH_SIZE + 1}: {len(batch)} rows upserted ({total_inserted}/{len(rows)} total)")

print(f"\n[seed_pdf] Done. {total_inserted} rows upserted to eod_prices (source='pdf').")
