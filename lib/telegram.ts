const PAIR_LABELS: Record<string, string> = {
  bajaj: 'Bajaj Pair Trade',
  grasim: 'Grasim Pair Trade',
  both: 'Bajaj & Grasim',
}

const DASHBOARD_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bajaj-pair-trade.vercel.app'

export async function sendTelegramAlert(
  chatId: string,
  pair: string,
  threshold: number,
  currentSpread: number,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')

  const label = PAIR_LABELS[pair] ?? pair
  const text =
    `🔔 *Spread Alert — ${label}*\n\n` +
    `Current spread: *${currentSpread.toFixed(2)}%*\n` +
    `Threshold: ≥ ${threshold.toFixed(2)}%\n\n` +
    `[View Dashboard](${DASHBOARD_URL})`

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram API error: ${err}`)
  }
}
