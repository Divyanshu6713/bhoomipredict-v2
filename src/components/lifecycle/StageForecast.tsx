import { CalendarRange, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui';
import { KeyValue } from '@/components/ui/primitives';
import { CASE_RISK_BAND_CUTS, RISK_HEX, riskFromScore } from '@/lib/risk';
import { formatDate, formatVsTarget } from '@/lib/format';
import type { ProjectForecast, RiskLevel } from '@/data/types';

/** A stage's "late by more than 30 days" probability uses the case-level cut-offs: it is one milestone's chance, not a mean. */
const bandOf = (p: number): RiskLevel => (p * 100 >= CASE_RISK_BAND_CUTS.critical ? 'Critical' : p * 100 >= CASE_RISK_BAND_CUTS.high ? 'High' : p * 100 >= CASE_RISK_BAND_CUTS.medium ? 'Medium' : 'Low');

/** Probability of delay at every remaining stage, with P50 / P80 completion and the chance of missing the sanctioned target. */
export function StageForecast({ forecast, className }: { forecast: ProjectForecast; className?: string }) {
  const remaining = forecast.stages.filter((s) => s.phase !== 'completed');
  const c = forecast.completion;
  const miss = Math.round(c.probabilityMissTarget * 100);
  return (
    <Card className={className}>
      <CardHeader
        title="When will each remaining step finish?"
        subtitle={`Chance each remaining step runs more than 30 days late, and the dates it is likely to finish by — from ${forecast.runs.toLocaleString('en-IN')} simulated schedules`}
        icon={<CalendarRange className="h-4 w-4" />}
      />
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-xs font-medium text-ink-3">
              <tr>
                <th className="py-1.5 pr-3">Step</th>
                <th className="py-1.5 pr-3">Chance of 30+ days late</th>
                <th className="py-1.5 pr-3 text-right">Expected delay</th>
                <th className="py-1.5 pr-3 text-right">Planned finish</th>
                <th className="py-1.5 pr-3 text-right" title="Half of the simulated schedules finish by this date (P50)">Likely finish</th>
                <th className="py-1.5 text-right" title="Four in five simulated schedules finish by this date (P80)">Safe estimate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {remaining.map((s) => {
                const p = s.delayProbability ?? 0;
                // The current step's probability is the project's headline probability, so it takes the project bands (same colour as the risk card).
                const color = RISK_HEX[s.phase === 'current' ? riskFromScore(Math.round(p * 100)) : bandOf(p)];
                return (
                  <tr key={s.stage}>
                    <td className="py-2 pr-3">
                      <span className={cn('font-semibold text-ink', s.phase === 'current' && 'text-brand')}>{s.stage}</span>
                      <span className="block text-2xs text-ink-3" title={s.basis}>
                        {s.phase === 'current' ? 'current step · ' : ''}
                        {s.phase === 'current' ? 'from the model’s score of the pending parcels' : `${Math.round((s.historicalDelayRate ?? 0) * 100)}% of past projects were late here · adjusted for this one`}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-3">
                          <span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: color }} />
                        </span>
                        <span className="w-9 text-right font-bold num" style={{ color }}>
                          {Math.round(p * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right num" title={s.delayIfLateDays !== undefined ? `${Math.round(p * 100)}% chance × about ${s.delayIfLateDays} days if it slips` : undefined}>
                      {s.expectedSlipDays} d
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-3 num">{s.plannedCompletion ? formatDate(s.plannedCompletion) : '—'}</td>
                    <td className="py-2 pr-3 text-right num">{s.p50Completion ? formatDate(s.p50Completion) : '—'}</td>
                    <td className="py-2 text-right num">{s.p80Completion ? formatDate(s.p80Completion) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          <KeyValue
            columns={2}
            rows={[
              { label: 'Chance of missing target', value: `${miss}%`, tone: miss >= 50 ? 'text-red-700 dark:text-red-300' : miss >= 25 ? 'text-amber-700' : 'text-emerald-700', hint: `target ${formatDate(c.targetCompletionDate)}` },
              { label: 'Likely finish vs target', value: formatVsTarget(c.daysVsTarget), tone: c.daysVsTarget > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700', hint: `${formatDate(c.p50)} vs ${formatDate(c.targetCompletionDate)}` },
              { label: 'Likely completion', value: formatDate(c.p50), hint: 'an even chance of finishing by (P50)' },
              { label: 'Safe estimate', value: formatDate(c.p80), hint: 'four-in-five chance of finishing by (P80)' },
            ]}
          />
          <p className="text-xs text-ink-3">
            <span className="font-medium text-ink-2">Expected delay</span> = chance of slipping × average delay if it slips — the model&rsquo;s own definition, and the same figure as the risk card for the current step.{' '}
            <span className="font-medium text-ink-2">Likely finish</span> is the middle simulated outcome, so planned finish + expected delay need not equal it exactly.
          </p>
          <p className="flex gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {forecast.projectEffectLogOdds >= 0 ? 'This project runs riskier than a typical one at this step' : 'This project runs safer than a typical one at this step'}.{' '}
              <span title={`Project effect ${forecast.projectEffectLogOdds >= 0 ? '+' : ''}${forecast.projectEffectLogOdds} log-odds, decaying ×${forecast.effectDecay} per later stage`}>{forecast.caveat}</span>
            </span>
          </p>
        </div>
      </div>
    </Card>
  );
}
