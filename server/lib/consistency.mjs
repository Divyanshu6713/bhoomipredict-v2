/**
 * Data-consistency validation.
 *
 * Checks that the one source of truth really is one: that stage status,
 * case counts, authorities, geography and risk bands agree with each other
 * wherever they are shown. Served at /api/validation and run by the smoke
 * tests; a failing check names its examples.
 */
import { effectiveProjects } from './projects.mjs';
import { allInterventions, allAlerts } from './workflow.mjs';
import { authorityOptions, LIFECYCLE_STAGES } from '../domain/registry.mjs';
import { inDistrict, stateAt } from '../domain/geography.mjs';

export function runConsistencyChecks(store) {
  const { list } = effectiveProjects();
  const checks = [];
  const check = (id, label, failures, detail = '') => checks.push({ id, label, passed: failures.length === 0, failures: failures.length, examples: failures.slice(0, 5), detail });

  check('compensation-before-award', 'No compensation recorded before an award can exist (stage before Valuation)',
    list.filter((p) => p.currentStageIndex < 4 && p.compensationCompletionPct > 0).map((p) => `${p.id}: ${p.compensationCompletionPct}% at ${p.currentStage}`),
    'Project compensation completion is measured across parcels at or beyond the Compensation stage, so it must be 0 before Valuation.');

  check('possession-before-stage', 'No possession recorded before the Possession stage',
    list.filter((p) => p.currentStageIndex < 6 && (p.possessionCompletionPct ?? 0) > 0).map((p) => `${p.id}: ${p.possessionCompletionPct}% at ${p.currentStage}`));

  check('completed-has-date', 'Every COMPLETED stage has an actual completion date',
    list.flatMap((p) => p.stages.filter((s) => s.status === 'COMPLETED' && !s.actualCompletion).map((s) => `${p.id}: ${s.name}`)));

  check('status-order', 'Stages before the frontier are COMPLETED, after it PENDING, and the frontier is active',
    list.flatMap((p) => p.stages.filter((s, i) => (i < p.currentStageIndex && s.status !== 'COMPLETED') || (i > p.currentStageIndex && s.status !== 'PENDING') || (i === p.currentStageIndex && !['IN_PROGRESS', 'DELAYED', 'BLOCKED'].includes(s.status))).map((s) => `${p.id}: ${s.name} is ${s.status}`)));

  check('residual-explained', 'Completed stages with open cases carry a residual-backlog explanation',
    list.flatMap((p) => p.stages.filter((s) => s.status === 'COMPLETED' && s.openCases > 0 && !/residual case/.test(s.explanation)).map((s) => `${p.id}: ${s.name}`)));

  // Case counts: stage open counts must equal a direct scan of the case store.
  const countFailures = [];
  for (const p of list) {
    if (p.storeIndex === undefined) continue;
    const start = store.ranges[p.storeIndex * 2];
    const end = store.ranges[p.storeIndex * 2 + 1];
    const open = new Array(LIFECYCLE_STAGES.length).fill(0);
    for (let row = start; row < end; row++) if (store.col.observed[row] === 0) open[store.col.stageIdx[row]]++;
    p.stages.forEach((s, i) => {
      if (s.openCases !== open[i]) countFailures.push(`${p.id}: ${s.name} shows ${s.openCases}, store has ${open[i]}`);
    });
    const sum = open.reduce((a, b) => a + b, 0);
    if (sum !== p.openCases) countFailures.push(`${p.id}: project open ${p.openCases} vs case store ${sum}`);
  }
  check('case-counts', 'Stage and project open-case counts equal the case store', countFailures);

  check('no-aviation-outside-airports', 'Aviation authorities (AAI / MoCA) appear only on airport projects',
    list.filter((p) => p.type !== 'Airport' && p.network.nodes.some((n) => /Airports Authority of India|Civil Aviation/.test(n.name))).map((p) => `${p.id} (${p.type})`));

  check('authority-eligible', 'Every primary authority is eligible for its project type, state and district',
    list.filter((p) => !authorityOptions({ projectType: p.type, subtype: p.subtype, state: p.state, district: p.district }).includes(p.authority)).map((p) => `${p.id}: ${p.authority} for ${p.type} in ${p.district}, ${p.state}`));

  check('state-authority-sets', 'Karnataka projects route land records to SSLR; Uttar Pradesh projects to the UP Revenue Department',
    list.filter((p) => {
      const lr = p.network.nodes.find((n) => n.code === 'LAND_RECORDS')?.name ?? '';
      if (p.state === 'Karnataka') return !/SSLR/.test(lr);
      if (p.state === 'Uttar Pradesh') return !/U\.P\./.test(lr);
      return false;
    }).map((p) => `${p.id}: ${p.network.nodes.find((n) => n.code === 'LAND_RECORDS')?.name}`));

  check('district-head-designation', 'District heads use the state designation (Deputy Commissioner in Karnataka, District Magistrate in Uttar Pradesh)',
    list.filter((p) => {
      const dh = p.network.nodes.find((n) => n.code === 'DISTRICT_HEAD')?.name ?? '';
      if (p.state === 'Karnataka') return !dh.startsWith('Deputy Commissioner');
      if (p.state === 'Uttar Pradesh') return !dh.startsWith('District Magistrate');
      return false;
    }).map((p) => `${p.id}: ${p.network.nodes.find((n) => n.code === 'DISTRICT_HEAD')?.name}`));

  check('project-location-in-state', 'Project locations fall inside their state boundary',
    list.filter((p) => stateAt(p.lat, p.lon) !== p.state).map((p) => `${p.id}: ${p.lat},${p.lon} is in ${stateAt(p.lat, p.lon) ?? 'no state'}, not ${p.state}`));

  // A deterministic sample of case coordinates against their district polygon.
  const caseFailures = [];
  const step = Math.max(1, Math.floor(store.rows / 3000));
  for (let row = 0; row < store.rows; row += step) {
    const d = store.districtTable[store.col.districtIdx[row]];
    if (!inDistrict(d.key, store.col.lat[row], store.col.lon[row])) caseFailures.push(`LAC-${500000 + row}: outside ${d.district}, ${d.state}`);
  }
  check('case-location-in-district', `Case coordinates fall inside their district polygon (sample of ${Math.ceil(store.rows / step)})`, caseFailures);

  const cuts = store.riskBands;
  check('risk-band-thresholds', 'Risk bands follow the deployed probability cut-offs',
    list.filter((p) => {
      const b = p.delayProbability >= cuts.critical ? 'Critical' : p.delayProbability >= cuts.high ? 'High' : p.delayProbability >= cuts.medium ? 'Medium' : 'Low';
      return b !== p.riskBand;
    }).map((p) => `${p.id}: p=${p.delayProbability} band ${p.riskBand}`));

  const ids = new Set(list.map((p) => p.id));
  check('workflow-references', 'Every intervention and alert points at an existing project and a dependency in its network',
    [
      ...allInterventions().filter((i) => !ids.has(i.projectId)).map((i) => `${i.id}: missing project`),
      ...allInterventions().filter((i) => !list.find((p) => p.id === i.projectId)?.network.nodes.some((n) => n.name === i.responsible_department)).map((i) => `${i.id}: owner ${i.responsible_department} not in network`),
      ...allAlerts().filter((a) => !ids.has(a.projectId)).map((a) => `${a.id}: missing project`),
    ]);

  return {
    ranAt: new Date().toISOString(),
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    checks,
  };
}
