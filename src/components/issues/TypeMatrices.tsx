import { Grid3x3, ListTree } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { RegistryOverview } from '@/data/types';

const SHORT: Record<string, string> = {
  PRIMARY: 'Acquiring body',
  CENTRAL_SANCTION: 'Central sanction',
  DISTRICT_HEAD: 'District head',
  LA_OFFICER: 'Acq. officer',
  LAND_RECORDS: 'Land records',
  SUB_DIVISION: 'Tehsil office',
  FOREST: 'Forest',
  SIA_UNIT: 'SIA',
  RR_ADMIN: 'R&R',
  DISPUTE_FORUM: 'Dispute forum',
  TREASURY: 'Treasury',
  REGISTRATION: 'Registration',
  VALUATION_SUPPORT: 'Valuation',
  UTILITIES: 'Utilities',
  AVIATION: 'Aviation',
  RAILWAY_INTERFACE: 'Rail crossing',
  HIGHWAY_INTERFACE: 'NH crossing',
  CONSOLIDATION: 'Consolidation',
  URBAN_LOCAL_BODY: 'Urban local body',
};

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3 text-xs text-ink-3">
      {items.map(([glyph, text]) => (
        <span key={text} className="flex items-center gap-1.5">
          <span className="font-bold text-ink-2">{glyph}</span> {text}
        </span>
      ))}
    </div>
  );
}

/** Which dependencies each project type pulls in — read from the declarative rules in the registry. */
export function DependencyMatrix({ matrix }: { matrix: RegistryOverview['dependencyMatrix'] }) {
  const codes = matrix[0]?.dependencies.map((d) => d.code) ?? [];
  return (
    <Card>
      <CardHeader title="Project type × dependency" subtitle="Declarative rules in the authority registry; hover a ◐ for the condition" icon={<Grid3x3 className="h-4 w-4" />} />
      <Legend items={[['●', 'always part of the network'], ['◐', 'conditional'], ['·', 'never — not offered for this type']]} />
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="sticky left-0 z-[1] bg-surface-2 px-3 py-2 text-left font-medium text-ink-3">Type</th>
              {codes.map((c) => (
                <th key={c} className="px-1 py-2 align-bottom font-semibold text-ink-3">
                  <span className="block w-[58px] text-center leading-tight">{SHORT[c] ?? c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.projectType} className="border-b border-line/60 last:border-0">
                <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-3 py-1.5 font-semibold text-ink">{row.projectType}</td>
                {row.dependencies.map((d) => (
                  <td key={d.code} title={d.applicability === 'conditional' ? `${d.label}: ${d.when.join(' — or — ')}` : `${d.label}: ${d.applicability}`} className={cn('px-1 py-1.5 text-center text-sm', d.applicability === 'always' ? 'text-brand' : d.applicability === 'conditional' ? 'text-amber-700 dark:text-amber-300' : 'text-ink-3/50')}>
                    {d.applicability === 'always' ? '●' : d.applicability === 'conditional' ? '◐' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Which land-acquisition issues each project type is exposed to. */
export function IssueMatrix({ matrix }: { matrix: RegistryOverview['issueMatrix'] }) {
  const issues = matrix[0]?.issues ?? [];
  return (
    <Card>
      <CardHeader title="Project type × land-acquisition issue" subtitle="Key exposures lead each project's issue profile; issues that cannot arise for a type are never shown for it" icon={<ListTree className="h-4 w-4" />} />
      <Legend items={[['●', 'key issue for the type'], ['○', 'possible, depending on the project'], ['·', 'not applicable']]} />
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[1080px] text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="sticky left-0 z-[1] bg-surface-2 px-3 py-2 text-left font-medium text-ink-3">Type</th>
              {issues.map((i) => (
                <th key={i.id} className="px-1 py-2 align-bottom font-semibold text-ink-3">
                  <span className="block w-[62px] text-center leading-tight">{i.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.projectType} className="border-b border-line/60 last:border-0" title={row.typicalDependencies ?? undefined}>
                <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-3 py-1.5 font-semibold text-ink">{row.projectType}</td>
                {row.issues.map((i) => (
                  <td key={i.id} className={cn('px-1 py-1.5 text-center text-sm', i.exposure === 'core' ? 'text-red-700 dark:text-red-300' : i.exposure === 'possible' ? 'text-ink-2' : 'text-ink-3/50')}>
                    {i.exposure === 'core' ? '●' : i.exposure === 'possible' ? '○' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
