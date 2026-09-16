import { CalendarRange, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui';
import { KeyValue } from '@/components/ui/primitives';
import { CASE_RISK_BAND_CUTS, RISK_HEX } from '@/lib/risk';
import { formatDate } from '@/lib/format';
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
        title="Stage-wise delay forecast"
        subtitle={`Probability each remaining stage slips more than 30 days · ${forecast.runs.toLocaleString('en-IN')}-run Monte Carlo on the model's current-stage risk and historical stage behaviour`}
        icon={<CalendarRange className="h-4 w-4" />}
      />
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="py-1.5 pr-3">Stage</th>
                <th className="py-1.5 pr-3">P(late &gt; 30 days)</th>
                <th className="py-1.5 pr-3 text-right">Expected slip</th>
                <th className="py-1.5 pr-3 text-right">Planned</th>
                <th className="py-1.5 pr-3 text-right">P50</th>
                <th className="py-1.5 text-right">P80</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {remaining.map((s) => {
                const p = s.delayProbability ?? 0;
                const color = RISK_HEX[bandOf(p)];
                return (
                  <tr key={s.stage}>
                    <td className="py-2 pr-3">
                      <span className={cn('font-semibold text-ink', s.phase === 'current' && 'text-brand')}>{s.stage}</span>
                      <span className="block text-[10px] text-ink-3" title={s.basis}>
                        {s.phase === 'current' ? 'current · ' : ''}
                        {s.phase === 'current' ? s.basis : `history ${Math.round((s.historicalDelayRate ?? 0) * 100)}% · adjusted for this project`}
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
                    <td className="py-2 pr-3 text-right num">{s.expectedSlipDays} d</td>
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
              { label: 'Chance of missing target', value: `${miss}%`, tone: miss >= 50 ? 'text-rose-600 dark:text-rose-400' : miss >= 25 ? 'text-amber-600' : 'text-emerald-600', hint: `target ${formatDate(c.targetCompletionDate)}` },
              { label: 'Likely overrun (P50)', value: c.p50OverrunDays ? `${c.p50OverrunDays} days` : 'none', hint: 'beyond the sanctioned target' },
              { label: 'Completion P50', value: formatDate(c.p50), hint: 'half of runs finish by' },
              { label: 'Completion P80', value: formatDate(c.p80), hint: 'four in five runs finish by' },
            ]}
          />
          <p className="flex gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[10.5px] leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Project effect {forecast.projectEffectLogOdds >= 0 ? '+' : ''}
            {forecast.projectEffectLogOdds} log-odds vs a typical case at this stage, decaying ×{forecast.effectDecay} per later stage. {forecast.caveat}
          </p>
        </div>
      </div>
    </Card>
  );
}
