'use client'

import { useState, useCallback } from 'react'
import type { TradingRules } from '@/types'
import { setLocalRuleOverride, getLocalRuleOverrides } from '@/lib/local-rules'

interface Props {
  rules: TradingRules
  isOwner: boolean
  onRulesChange: (rules: TradingRules) => void
  apiPath?: string       // default: '/api/rules'
  storageKey?: string    // default: 'bajaj_rule_overrides'
}

// Inline editable number field — saves on blur or Enter
function RuleField({
  value,
  ruleKey,
  label,
  step = 0.1,
  min,
  max,
  isOverridden,
  onSave,
}: {
  value: number
  ruleKey: string
  label?: string
  step?: number
  min?: number
  max?: number
  isOverridden?: boolean
  onSave: (key: string, val: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)

  function commit() {
    const num = parseFloat(draft)
    if (!isNaN(num) && num !== value) {
      setSaving(true)
      onSave(ruleKey, num)
    }
    setEditing(false)
    setSaving(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-20 text-center text-xs bg-slate-700 border border-blue-500 rounded px-1.5 py-0.5 text-white outline-none"
      />
    )
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        onClick={() => { setDraft(String(value)); setEditing(true) }}
        className={`w-20 text-center text-xs rounded px-1.5 py-0.5 transition-colors font-mono
          ${saving ? 'bg-blue-900/50 text-blue-300' :
            isOverridden ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-500 hover:border-amber-600' :
            'bg-slate-700/50 hover:bg-slate-600/60 text-slate-200 hover:text-white border border-slate-600/50 hover:border-slate-500'}
        `}
        title={isOverridden ? 'Locally overridden — click to edit' : 'Click to edit'}
      >
        {value > 0 ? '+' : ''}{value}
      </button>
      {isOverridden && (
        <span className="text-amber-400 text-xs leading-none" title="Locally overridden">●</span>
      )}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
      {description && <p className="text-xs text-slate-500 mt-0.5 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  )
}

export default function RulesTab({ rules, isOwner, onRulesChange, apiPath = '/api/rules', storageKey = 'bajaj_rule_overrides' }: Props) {
  const localOverrides = getLocalRuleOverrides(storageKey)

  const handleSave = useCallback(async (key: string, val: number) => {
    if (isOwner) {
      // Owner: persist to DB
      const body = [{ rule_key: key, rule_value: val }]
      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const updated: TradingRules = await res.json()
        onRulesChange(updated)
      }
    } else {
      // Visitor: save to localStorage only
      setLocalRuleOverride(key as keyof TradingRules, val, storageKey)
      onRulesChange({ ...rules, [key]: val })
    }
  }, [isOwner, rules, onRulesChange, apiPath, storageKey])

  function isOv(key: keyof TradingRules) {
    return !isOwner && key in localOverrides
  }

  return (
    <div className="space-y-6">
      {/* Section A — Signal Entry Rules */}
      <Section
        title="Signal Entry Rules"
        description="Z-score thresholds for each signal. The entry band (±) is the zone around each threshold used to find historical analogs."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
              <th className="text-left pb-2">Signal</th>
              <th className="text-right pb-2">Threshold (SD)</th>
              <th className="text-right pb-2">Entry Band (±SD)</th>
              <th className="text-left pb-2 pl-6">Zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            <tr>
              <td className="py-3">
                <span className="text-green-400 font-semibold">STRONG LONG</span>
                <div className="text-xs text-slate-500">Long BAJAJFINSV / Short BAJFINANCE</div>
              </td>
              <td className="text-right py-3">
                <RuleField value={rules.strong_long_threshold} ruleKey="strong_long_threshold" isOverridden={isOv('strong_long_threshold')} onSave={handleSave} />
              </td>
              <td className="text-right py-3">
                <RuleField value={rules.entry_band} ruleKey="entry_band" isOverridden={isOv('entry_band')} onSave={handleSave} step={0.05} min={0.05} max={1} />
              </td>
              <td className="py-3 pl-6 text-xs text-slate-500">
                z ≤ {rules.strong_long_threshold}
              </td>
            </tr>
            <tr>
              <td className="py-3">
                <span className="text-green-300 font-semibold">LONG</span>
                <div className="text-xs text-slate-500">Long BAJAJFINSV / Short BAJFINANCE</div>
              </td>
              <td className="text-right py-3">
                <RuleField value={rules.long_threshold} ruleKey="long_threshold" isOverridden={isOv('long_threshold')} onSave={handleSave} />
              </td>
              <td className="text-right py-3 text-xs text-slate-600">(shared)</td>
              <td className="py-3 pl-6 text-xs text-slate-500">
                {rules.strong_long_threshold} &lt; z ≤ {rules.long_threshold}
              </td>
            </tr>
            <tr>
              <td className="py-3">
                <span className="text-slate-400 font-semibold">NO TRADE</span>
                <div className="text-xs text-slate-500">Spread within historical norms</div>
              </td>
              <td className="text-right py-3 text-xs text-slate-600">—</td>
              <td className="text-right py-3 text-xs text-slate-600">—</td>
              <td className="py-3 pl-6 text-xs text-slate-500">
                {rules.long_threshold} &lt; z &lt; {rules.short_threshold}
              </td>
            </tr>
            <tr>
              <td className="py-3">
                <span className="text-red-300 font-semibold">SHORT</span>
                <div className="text-xs text-slate-500">Short BAJAJFINSV / Long BAJFINANCE</div>
              </td>
              <td className="text-right py-3">
                <RuleField value={rules.short_threshold} ruleKey="short_threshold" isOverridden={isOv('short_threshold')} onSave={handleSave} />
              </td>
              <td className="text-right py-3 text-xs text-slate-600">(shared)</td>
              <td className="py-3 pl-6 text-xs text-slate-500">
                {rules.short_threshold} ≤ z &lt; {rules.strong_short_threshold}
              </td>
            </tr>
            <tr>
              <td className="py-3">
                <span className="text-red-400 font-semibold">STRONG SHORT</span>
                <div className="text-xs text-slate-500">Short BAJAJFINSV / Long BAJFINANCE</div>
              </td>
              <td className="text-right py-3">
                <RuleField value={rules.strong_short_threshold} ruleKey="strong_short_threshold" isOverridden={isOv('strong_short_threshold')} onSave={handleSave} />
              </td>
              <td className="text-right py-3 text-xs text-slate-600">(shared)</td>
              <td className="py-3 pl-6 text-xs text-slate-500">
                z ≥ {rules.strong_short_threshold}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Visual z-score ruler */}
        <div className="mt-5 pt-4 border-t border-slate-700">
          <div className="text-xs text-slate-500 mb-2">Z-Score Zone Ruler</div>
          <div className="flex items-center gap-0 text-xs h-6 rounded overflow-hidden font-mono">
            <div className="bg-green-800/60 text-green-300 flex-1 flex items-center justify-center h-full border-r border-slate-700">
              Strong Long ≤ {rules.strong_long_threshold}
            </div>
            <div className="bg-green-900/40 text-green-400/70 flex-1 flex items-center justify-center h-full border-r border-slate-700">
              Long ≤ {rules.long_threshold}
            </div>
            <div className="bg-slate-700/40 text-slate-400 flex-1 flex items-center justify-center h-full border-r border-slate-700">
              No Trade
            </div>
            <div className="bg-red-900/40 text-red-400/70 flex-1 flex items-center justify-center h-full border-r border-slate-700">
              Short ≥ {rules.short_threshold}
            </div>
            <div className="bg-red-800/60 text-red-300 flex-1 flex items-center justify-center h-full">
              Strong Short ≥ {rules.strong_short_threshold}
            </div>
          </div>
        </div>
      </Section>

      {/* Section B — Exit Rules */}
      <Section
        title="Exit Rules"
        description="Trades exit when z-score enters the exit zone OR time stop is hit — whichever comes first."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Long Exit Zone</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-32">Lower bound (SD)</div>
              <RuleField value={rules.exit_zone_lo} ruleKey="exit_zone_lo" isOverridden={isOv('exit_zone_lo')} onSave={handleSave} min={-5} max={0} />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-32">Upper bound (SD)</div>
              <RuleField value={rules.exit_zone_hi} ruleKey="exit_zone_hi" isOverridden={isOv('exit_zone_hi')} onSave={handleSave} min={-2} max={2} />
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Short exit zone is mirrored: [{-rules.exit_zone_hi}, {-rules.exit_zone_lo}]
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Add-to-Trade</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-32">Gap (SD further)</div>
              <RuleField value={rules.add_to_trade_gap} ruleKey="add_to_trade_gap" isOverridden={isOv('add_to_trade_gap')} onSave={handleSave} step={0.25} min={0.1} max={3} />
            </div>
            <div className="text-xs text-slate-600 mt-1">
              A 2nd observation is accepted only if z moves {rules.add_to_trade_gap} SD further than the first entry while still in trade.
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Hard Stop</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-32">|Z| threshold</div>
              <RuleField value={rules.hard_stop_z} ruleKey="hard_stop_z" isOverridden={isOv('hard_stop_z')} onSave={handleSave} step={0.1} min={1.5} max={5} />
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Exit immediately if Z ≤ −{rules.hard_stop_z} (long) or Z ≥ +{rules.hard_stop_z} (short). Applies to Active Trade and Analog Observations.
            </div>
          </div>
        </div>
      </Section>

      {/* Section C — Time Stops */}
      <Section
        title="Time Stops (per Horizon)"
        description="Maximum calendar days to hold before forced exit. Applies per-horizon when z-score has not yet reached the exit zone."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-700">
              <th className="text-left pb-2">Horizon</th>
              <th className="text-right pb-2">Time Stop (calendar days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {([
              { h: '5d',  key: 'time_stop_5d'  as keyof TradingRules },
              { h: '20d', key: 'time_stop_20d' as keyof TradingRules },
              { h: '40d', key: 'time_stop_40d' as keyof TradingRules },
              { h: '60d', key: 'time_stop_60d' as keyof TradingRules },
              { h: '90d', key: 'time_stop_90d' as keyof TradingRules },
            ] as const).map(({ h, key }) => (
              <tr key={h}>
                <td className="py-3 text-slate-300 font-medium">{h}</td>
                <td className="py-3 text-right">
                  <RuleField
                    value={rules[key] as number}
                    ruleKey={key}
                    isOverridden={isOv(key)}
                    onSave={handleSave}
                    step={1}
                    min={1}
                    max={365}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}
