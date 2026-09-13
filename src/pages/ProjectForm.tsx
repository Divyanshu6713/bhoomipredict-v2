import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Network, Save } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Select, SkeletonCard } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { Field, inputClass } from '@/components/ui/Modal';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { ApiError, createProject, fetchProject, fetchScenarioOptions, updateProject } from '@/api/client';
import { LIFECYCLE_STAGES } from '@/data/types';

type Form = Record<string, string | boolean>;

const EMPTY: Form = {
  name: '',
  type: 'National Highway',
  subtype: '',
  state: '',
  district: '',
  subDistrict: '',
  authority: '',
  priority: 'Important',
  landRequirementHa: '',
  totalParcels: '',
  affectedFamilies: '0',
  currentStage: 'Land Identification',
  startDate: '',
  targetCompletionDate: '',
  compensationCompletionPct: '0',
  possessionCompletionPct: '0',
  rrProgressPct: '0',
  avgDocumentCompleteness: '70',
  legalCases: '0',
  dominantOwnership: 'Joint',
  stakeholderResponsiveness: 'Moderate',
  approvalDelayDays: '0',
  lat: '',
  lon: '',
  forestLand: false,
  crossesRailway: false,
  crossesHighway: false,
};

/** Fields a corpus project may change (mirrors EDITABLE in server/lib/projects.mjs). */
const EDITABLE = ['name', 'subtype', 'authority', 'priority', 'stakeholderResponsiveness', 'startDate', 'targetCompletionDate', 'compensationCompletionPct', 'possessionCompletionPct', 'rrProgressPct', 'avgDocumentCompleteness', 'legalCases', 'affectedFamilies', 'approvalDelayDays', 'dominantOwnership', 'forestLand', 'crossesRailway', 'crossesHighway', 'lat', 'lon', 'district', 'subDistrict'];
const NUMERIC = ['landRequirementHa', 'totalParcels', 'affectedFamilies', 'compensationCompletionPct', 'possessionCompletionPct', 'rrProgressPct', 'avgDocumentCompleteness', 'legalCases', 'approvalDelayDays', 'lat', 'lon'];

export default function ProjectForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const existing = useApi((signal) => (id ? fetchProject(id, signal) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing && user) {
      setForm((f) => ({ ...f, state: user.state ?? f.state, district: user.district ?? f.district }));
    }
  }, [editing, user]);

  useEffect(() => {
    const p = existing.data?.project;
    if (!p) return;
    const next: Form = {
      name: p.name,
      type: p.type,
      subtype: p.subtype,
      state: p.state,
      district: p.district,
      subDistrict: p.subDistrict ?? '',
      authority: p.authority,
      priority: p.priority,
      landRequirementHa: String(p.landRequirementHa),
      totalParcels: String(p.totalParcels),
      affectedFamilies: String(p.affectedFamilies),
      currentStage: p.currentStage,
      startDate: p.startDate,
      targetCompletionDate: p.targetCompletionDate,
      compensationCompletionPct: String(p.compensationCompletionPct),
      possessionCompletionPct: String(p.possessionCompletionPct ?? 0),
      rrProgressPct: String(p.rrProgressPct ?? 0),
      avgDocumentCompleteness: String(p.avgDocumentCompleteness),
      legalCases: String(p.legalCases),
      dominantOwnership: p.dominantOwnership,
      stakeholderResponsiveness: p.stakeholderResponsiveness,
      approvalDelayDays: String(existing.data!.summary.approvalDelayDays),
      lat: String(p.lat),
      lon: String(p.lon),
      forestLand: p.flags.forestLand,
      crossesRailway: p.flags.crossesRailway,
      crossesHighway: p.flags.crossesHighway,
    };
    setForm(next);
    setInitial(next);
  }, [existing.data]);

  const options = useApi(
    (signal) => fetchScenarioOptions({ state: String(form.state || ''), district: String(form.district || ''), projectType: String(form.type), subtype: String(form.subtype || '') }, signal),
    [form.state, form.district, form.type, form.subtype],
  );
  const typeDef = options.data?.projectTypes.find((t) => t.name === form.type);
  const districtDef = options.data?.districts?.find((d) => d.district === form.district);

  // Keep dependent selections valid as the context changes.
  useEffect(() => {
    if (typeDef && form.subtype && !typeDef.subtypes.includes(String(form.subtype))) setForm((f) => ({ ...f, subtype: typeDef.subtypes[0] }));
  }, [typeDef, form.subtype]);
  useEffect(() => {
    const opts = options.data?.authorityOptions;
    if (opts && form.authority && !opts.includes(String(form.authority))) setForm((f) => ({ ...f, authority: opts[0] }));
  }, [options.data?.authorityOptions, form.authority]);

  const set = (k: string, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const locked = (k: string) => editing && existing.data?.project.source === 'corpus' && !EDITABLE.includes(k);

  const changed = useMemo(() => Object.keys(form).filter((k) => String(form[k]) !== String(initial[k])), [form, initial]);

  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (editing && !existing.data) return <SkeletonCard lines={10} />;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setGeneral(null);
    const payload: Record<string, unknown> = {};
    const keys = editing ? changed.filter((k) => EDITABLE.includes(k)) : Object.keys(form);
    for (const k of keys) {
      const v = form[k];
      if (typeof v === 'boolean') payload[k] = v;
      else if (v === '') continue;
      else payload[k] = NUMERIC.includes(k) ? Number(v) : v;
    }
    try {
      const res = editing ? await updateProject(id!, payload) : await createProject(payload);
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as Array<{ field: string; message: string }>) map[d.field] = d.message;
        setErrors(map);
        setGeneral(`${err.message}: ${(err.details as unknown[]).length} problem${(err.details as unknown[]).length === 1 ? '' : 's'} to fix.`);
      } else setGeneral((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = (k: string, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} error={errors[k]} hint={locked(k) ? 'Fixed by the case records for corpus projects' : hint}>
      <input value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} disabled={locked(k)} className={cn(inputClass, errors[k] && 'border-rose-500', locked(k) && 'opacity-60')} {...props} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <DemoDataBadge />
      </div>

      {general && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12.5px] font-medium text-rose-700 dark:text-rose-300">{general}</div>}

      <Card>
        <CardHeader title={editing ? `Edit ${existing.data?.project.name}` : 'New acquisition project'} subtitle="Validated server-side: state and district must exist, the acquiring body must be eligible for the type and place, coordinates must fall inside the district, and progress must fit the stage." icon={<Info className="h-4 w-4" />} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">{input('name', 'Project name', { placeholder: 'e.g. Mandya Ring Road — Segment 2' })}</div>
          <Field label="Project type" error={errors.type} hint={locked('type') ? 'Fixed for corpus projects' : undefined}>
            <Select value={String(form.type)} onChange={(v) => set('type', v)} options={(options.data?.projectTypes ?? []).map((t) => ({ label: t.name, value: t.name }))} className={locked('type') ? 'pointer-events-none opacity-60' : ''} />
          </Field>
          <Field label="Subtype" error={errors.subtype}>
            <Select value={String(form.subtype || typeDef?.subtypes[0] || '')} onChange={(v) => set('subtype', v)} options={(typeDef?.subtypes ?? []).map((s) => ({ label: s, value: s }))} />
          </Field>
          <Field label="Priority" error={errors.priority}>
            <Select value={String(form.priority)} onChange={(v) => set('priority', v)} options={['Routine', 'Important', 'Critical'].map((s) => ({ label: s, value: s }))} />
          </Field>
          <Field label="State" error={errors.state} hint={locked('state') ? 'Fixed for corpus projects' : user?.scope !== 'national' ? 'Limited to your jurisdiction' : undefined}>
            <Select value={String(form.state)} onChange={(v) => { set('state', v); set('district', ''); }} options={[{ label: 'Select state', value: '' }, ...(options.data?.states ?? []).map((s) => ({ label: s, value: s }))]} className={locked('state') ? 'pointer-events-none opacity-60' : ''} />
          </Field>
          <Field label="District" error={errors.district}>
            <Select value={String(form.district)} onChange={(v) => { set('district', v); set('subDistrict', ''); }} options={[{ label: 'Select district', value: '' }, ...(options.data?.districts ?? []).map((d) => ({ label: d.district, value: d.district }))]} />
          </Field>
          <Field label="Taluk / tehsil" error={errors.subDistrict}>
            <Select value={String(form.subDistrict)} onChange={(v) => set('subDistrict', v)} options={[{ label: 'Select', value: '' }, ...(districtDef?.subDistricts ?? []).map((s) => ({ label: s, value: s }))]} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Primary acquiring / requiring body" error={errors.authority} hint="Only bodies eligible for this project type in this state and district are offered.">
              <Select value={String(form.authority || options.data?.authorityOptions?.[0] || '')} onChange={(v) => set('authority', v)} options={(options.data?.authorityOptions ?? []).map((a) => ({ label: a, value: a }))} />
            </Field>
          </div>
          {input('landRequirementHa', 'Land area (ha)', { type: 'number', min: 0 })}
          {input('totalParcels', 'Total parcels', { type: 'number', min: 1 })}
          {input('affectedFamilies', 'Affected families', { type: 'number', min: 0 })}
          <Field label="Current stage" error={errors.currentStage} hint={locked('currentStage') ? 'Use "Record milestone achieved" on the project page' : undefined}>
            <Select value={String(form.currentStage)} onChange={(v) => set('currentStage', v)} options={LIFECYCLE_STAGES.map((s) => ({ label: s, value: s }))} className={locked('currentStage') ? 'pointer-events-none opacity-60' : ''} />
          </Field>
          {input('startDate', 'Start date', { type: 'date' })}
          {input('targetCompletionDate', 'Expected completion date', { type: 'date' })}
          {input('compensationCompletionPct', 'Compensation completion %', { type: 'number', min: 0, max: 100 }, 'Must be 0 before Valuation')}
          {input('possessionCompletionPct', 'Possession completion %', { type: 'number', min: 0, max: 100 }, 'Must be 0 before Possession')}
          {input('rrProgressPct', 'R&R completion %', { type: 'number', min: 0, max: 100 })}
          {input('avgDocumentCompleteness', 'Documentation completeness %', { type: 'number', min: 0, max: 100 })}
          {input('legalCases', 'Legal dispute count', { type: 'number', min: 0 })}
          {input('approvalDelayDays', 'Approval delay (days)', { type: 'number', min: 0 })}
          <Field label="Ownership complexity">
            <Select value={String(form.dominantOwnership)} onChange={(v) => set('dominantOwnership', v)} options={['Single', 'Joint', 'Fragmented', 'Disputed'].map((s) => ({ label: s, value: s }))} />
          </Field>
          <Field label="Stakeholder responsiveness">
            <Select value={String(form.stakeholderResponsiveness)} onChange={(v) => set('stakeholderResponsiveness', v)} options={['Low', 'Moderate', 'High'].map((s) => ({ label: s, value: s }))} />
          </Field>
          <div />
          {input('lat', 'Latitude', { type: 'number', step: '0.0001' }, 'Must fall inside the district')}
          {input('lon', 'Longitude', { type: 'number', step: '0.0001' })}
          <div className="flex flex-col justify-end gap-1.5 pb-1">
            {(
              [
                ['forestLand', 'Forest land in alignment'],
                ['crossesRailway', 'Crosses a railway line'],
                ['crossesHighway', 'Crosses a national highway'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked)} className="accent-[rgb(var(--c-brand))]" /> {label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Network className="h-3.5 w-3.5" /> The dependency network, lifecycle and risk are recomputed from these fields when saved.
            {editing && <Badge className="ml-1">{changed.filter((k) => EDITABLE.includes(k)).length} changed</Badge>}
          </p>
          <div className="flex gap-2">
            <Link to={editing ? `/projects/${id}` : '/projects'}>
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button onClick={submit} disabled={busy || (editing && changed.filter((k) => EDITABLE.includes(k)).length === 0)} className="gap-1.5">
              <Save className="h-4 w-4" /> {busy ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
