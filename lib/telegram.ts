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
  currentValue: number,
  operator = '>=',
  metric = 'spread_pct',
) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')

  const label = PAIR_LABELS[pair] ?? pair
  const opLabel = operator === '<=' ? '≤' : '≥'
  const valueStr = metric === 'zscore'
    ? `*${currentValue.toFixed(2)}*`
    : `*${currentValue.toFixed(2)}%*`
  const thresholdStr = metric === 'zscore'
    ? `${opLabel} ${threshold.toFixed(2)}`
    : `${opLabel} ${threshold.toFixed(2)}%`
  const metricLabel = metric === 'zscore' ? 'Z-score' : 'Spread'

  const text =
    `🔔 *${metricLabel} Alert — ${label}*\n\n` +
    `Current ${metricLabel.toLowerCase()}: ${valueStr}\n` +
    `Threshold: ${thresholdStr}\n\n` +
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
