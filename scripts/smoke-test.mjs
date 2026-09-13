/**
 * End-to-end functional smoke tests against a real API process.
 *
 *   npm run test:smoke
 *
 * Starts its own API instance on a spare port with a throwaway runtime
 * directory (BP_RUNTIME_DIR), so the demo workflow state is never touched, then
 * exercises the platform through HTTP exactly as the UI does: authority
 * mapping, lifecycle and case separation, risk, recommendations, interventions,
 * alerts, GIS data, roles and scoping, CRUD, CSV validation, documents, audit
 * and the consistency checks. Exits non-zero on any failure.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.BP_TEST_PORT ?? 5199);
const BASE = `http://localhost:${PORT}/api`;
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-smoke-'));

let passed = 0;
let failed = 0;
const failures = [];
const ok = (cond, label, detail = '') => {
  if (cond) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function call(method, p, { token, body, raw, type } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (raw !== undefined) headers['Content-Type'] = type ?? 'application/octet-stream';
  const res = await fetch(`${BASE}${p}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV or binary */
  }
  return { status: res.status, json, text };
}
const get = (p, token) => call('GET', p, { token });

async function login(userId) {
  const r = await call('POST', '/auth/login', { body: { userId } });
  if (!r.json?.token) throw new Error(`login failed for ${userId}: ${r.text}`);
  return r.json.token;
}

const names = (p) => p.network.nodes.map((n) => n.name).join(' | ');
const node = (p, code) => p.network.nodes.find((n) => n.code === code);

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BP_API_PORT: String(PORT), BP_RUNTIME_DIR: runtime },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));
  const stop = () => server.kill();
  process.on('exit', stop);

  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    await run();
  } finally {
    stop();
    fs.rmSync(runtime, { recursive: true, force: true });
  }

  console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

async function run() {
  section('Authentication & API integrity');
  ok((await get('/projects')).status === 401, 'data endpoints require a session');
  const admin = await login('u-national');
  const health = await get('/health');
  ok(health.status === 200 && health.json.rows === 350000, 'health reports the full corpus', `${health.json?.rows} rows`);
  for (const p of ['/projects?pageSize=2', '/projects/map', '/cases?pageSize=2', '/dashboard/summary', '/alerts?pageSize=2', '/interventions?pageSize=2', '/metrics', '/facets', '/registry', '/geo', '/audit', '/documents', '/retrain/status', '/scenario/options?state=Karnataka', '/export/manifest']) {
    const r = await get(p, admin);
    ok(r.status === 200, `GET ${p}`, String(r.status));
  }
  ok((await get('/upload/template', admin)).text.startsWith('project_name,project_type'), 'GET /upload/template returns the CSV header');

  const detail = async (id, token = admin) => (await get(`/projects/${id}`, token)).json;

  section('A. Karnataka + Irrigation (LAP-1000)');
  const A = await detail('LAP-1000');
  ok(A.project.type === 'Irrigation' && A.project.state === 'Karnataka', 'scenario project resolved', `${A.project.name}`);
  ok(!/Airports Authority|Civil Aviation/.test(names(A.project)), 'no aviation dependency on an irrigation project');
  ok(/SSLR/.test(node(A.project, 'LAND_RECORDS')?.name ?? ''), 'SSLR appears as the land-records dependency', node(A.project, 'LAND_RECORDS')?.name);
  ok(node(A.project, 'LAND_RECORDS')?.category === 'land_records' && node(A.project, 'PRIMARY')?.name !== node(A.project, 'LAND_RECORDS')?.name, 'SSLR is not labelled the acquiring authority');
  ok(/Neeravari|Water Resources/.test(A.project.authority), 'Karnataka irrigation body as primary', A.project.authority);
  ok(node(A.project, 'DISTRICT_HEAD')?.name === 'Deputy Commissioner, Mandya', 'district head is the Deputy Commissioner, Mandya');
  ok(A.project.framework.id === 'RFCTLARR' && Boolean(node(A.project, 'SIA_UNIT')), 'RFCTLARR framework with SIA dependency');

  section('B. Karnataka + National Highway (LAP-1001)');
  const B = await detail('LAP-1001');
  ok(B.project.framework.id === 'NH_ACT', 'NH Act framework', B.project.framework.short);
  ok(/Competent Authority for Land Acquisition/.test(node(B.project, 'LA_OFFICER')?.name ?? ''), 'CALA as competent authority', node(B.project, 'LA_OFFICER')?.name);
  ok(/Road Transport/.test(node(B.project, 'CENTRAL_SANCTION')?.name ?? ''), 'MoRTH central notification dependency');
  ok(!node(B.project, 'SIA_UNIT'), 'no SIA chapter under the NH Act');

  section('C. Uttar Pradesh + National Highway (LAP-1002)');
  const C = await detail('LAP-1002');
  ok(node(C.project, 'DISTRICT_HEAD')?.name.startsWith('District Magistrate'), 'UP district head is the District Magistrate', node(C.project, 'DISTRICT_HEAD')?.name);
  ok(/U\.P\./.test(node(C.project, 'LAND_RECORDS')?.name ?? ''), 'UP land records department', node(C.project, 'LAND_RECORDS')?.name);
  ok(node(B.project, 'LAND_RECORDS').name !== node(C.project, 'LAND_RECORDS').name && node(B.project, 'DISTRICT_HEAD').name.split(',')[0] !== node(C.project, 'DISTRICT_HEAD').name.split(',')[0], 'Karnataka and UP highway networks differ');

  section('D. Uttar Pradesh + Industrial / Urban (LAP-1003, LAP-1004)');
  const D1 = await detail('LAP-1003');
  const D2 = await detail('LAP-1004');
  ok(/UPSIDA|YEIDA/.test(D1.project.authority), 'UP industrial authority', D1.project.authority);
  ok(/Development Authority/.test(D2.project.authority) && Boolean(node(D2.project, 'URBAN_LOCAL_BODY')), 'UP urban development authority and ULB dependency', D2.project.authority);
  ok(/Additional District Magistrate \(Land Acquisition\)/.test(node(D1.project, 'LA_OFFICER')?.name ?? ''), 'ADM (Land Acquisition) under RFCTLARR in UP');

  section('E. Railway (LAP-1006 suburban, LAP-1007 DFC)');
  const E1 = await detail('LAP-1006');
  const E2 = await detail('LAP-1007');
  ok(/K-RIDE/.test(E1.project.authority) && E1.project.framework.id === 'RFCTLARR', 'Karnataka suburban rail via K-RIDE under RFCTLARR');
  ok(/DFCCIL/.test(E2.project.authority) && E2.project.framework.id === 'RAILWAYS_ACT', 'freight corridor via DFCCIL under the Railways Act');

  section('F. Airport (LAP-1005)');
  const F = await detail('LAP-1005');
  ok(/Civil Aviation|Airports Authority/.test(node(F.project, 'AVIATION')?.name ?? ''), 'aviation clearance dependency present on the airport', node(F.project, 'AVIATION')?.name);

  section('G. Completed stage with open objection cases (LAP-1000)');
  const obj = A.project.stages[3];
  ok(obj.status === 'COMPLETED' && obj.openCases > 0, 'Objection / Claims is COMPLETED and still has open cases', `${obj.openCases} open`);
  ok(/residual case/.test(obj.explanation) && obj.caseBacklog === 'OPEN' && obj.resolutionPct < 100, 'the residual backlog is explained, not contradicted', obj.explanation);
  const scan = (await get(`/projects/LAP-1000/cases?stage=${encodeURIComponent(obj.name)}&pageSize=1`, admin)).json;
  ok(scan.total === obj.openCases, 'stage open count equals the case registry', `${scan.total} = ${obj.openCases}`);

  section('H. Compensation backlog');
  const list = (await get('/projects?pageSize=500', admin)).json.projects;
  let H = null;
  for (const p of list.filter((x) => x.currentStageIndex >= 5 && x.actionCount > 0)) {
    const d = await detail(p.id);
    if (d.recommendations.some((r) => r.code === 'COMPENSATION_BACKLOG')) {
      H = d;
      break;
    }
  }
  ok(Boolean(H), 'a compensation-backlog project exists', H?.project.id);
  if (H) {
    const rec = H.recommendations.find((r) => r.code === 'COMPENSATION_BACKLOG');
    ok(rec.trigger.metric === 'compensation_completion_percentage' && rec.trigger.value < rec.trigger.threshold, 'trigger value is below its threshold', `${rec.trigger.value} < ${rec.trigger.threshold}`);
    ok(H.project.network.nodes.some((n) => n.name === rec.responsibleAuthority.name), 'owner comes from the project network', rec.responsibleAuthority.name);
    ok(H.interventions.some((i) => i.code === 'COMPENSATION_BACKLOG'), 'the recommendation is in the intervention queue');
  }

  section('I. Critical-risk project');
  const crit = list.find((p) => p.riskBand === 'Critical');
  ok(Boolean(crit), 'at least one Critical project', crit?.id);
  if (crit) {
    const d = await detail(crit.id);
    ok(d.project.delayProbability >= 0.78, 'probability respects the Critical cut-off', String(d.project.delayProbability));
    ok(d.alerts.some((a) => a.code === 'CRITICAL_RISK' && a.severity === 'Critical'), 'Critical risk raises a Critical alert');
    const mapRow = (await get('/projects/map', admin)).json.projects.find((m) => m.id === crit.id);
    ok(mapRow?.riskScore === d.project.riskScore, 'GIS marker uses the same risk as the project page');
  }

  section('J. Low-risk project');
  const low = list.find((p) => p.riskBand === 'Low');
  const lowD = await detail(low.id);
  ok(lowD.project.delayProbability < 0.3 && !lowD.recommendations.some((r) => r.code === 'CRITICAL_RISK' || r.code === 'HIGH_RISK'), 'no model-risk triggers on a Low project', `${low.id} ${low.riskScore}%`);

  section('Explainability');
  const kase = (await get('/cases/LAC-500001', admin)).json;
  ok(kase.explanation.basis.includes('TreeSHAP'), 'case explanation is TreeSHAP on the deployed ensemble');
  const metrics = (await get('/metrics', admin)).json;
  const featureNames = new Set(metrics.featureSpec.map((f) => f.label));
  ok(kase.case.featureContributions.length > 0 && kase.case.featureContributions.every((f) => featureNames.has(f.label)), 'every contribution is a feature the model uses');
  ok(metrics.importance.shap.some((f) => f.feature === 'pending_dependency_actions'), 'pending department actions are a real model feature');

  section('Scenario scoring');
  const score = async (ctx, pending = [], signals = {}) => call('POST', '/scenario/score', { token: admin, body: { context: ctx, pending, signals } });
  const irr = (await score({ state: 'Karnataka', district: 'Mandya', projectType: 'Irrigation', stage: 'Notification' })).json;
  const air = (await score({ state: 'Karnataka', district: 'Mandya', projectType: 'Airport', subtype: 'Greenfield airport', stage: 'Notification' })).json;
  ok(!irr.dependencies.nodes.some((n) => /Airports Authority|Civil Aviation/.test(n.name)), 'Irrigation scenario has no aviation dependency');
  ok(air.dependencies.nodes.some((n) => /Civil Aviation/.test(n.name)), 'Airport scenario introduces civil aviation');
  const up = (await score({ state: 'Uttar Pradesh', district: 'Aligarh', projectType: 'Irrigation', stage: 'Notification' })).json;
  ok(irr.stateProfile.districtHead !== up.stateProfile.districtHead && irr.context.primaryAuthority !== up.context.primaryAuthority, 'changing state changes the authority set', `${irr.context.primaryAuthority} → ${up.context.primaryAuthority}`);
  const hassan = (await score({ state: 'Karnataka', district: 'Hassan', projectType: 'Irrigation', stage: 'Notification' })).json;
  ok(hassan.dependencies.nodes.find((n) => n.code === 'DISTRICT_HEAD').name.endsWith('Hassan') && hassan.context.districtRate !== irr.context.districtRate, 'changing district changes district responsibility and history');
  const pend = (await score({ state: 'Karnataka', district: 'Mandya', projectType: 'Irrigation', stage: 'Notification' }, ['LAND_RECORDS', 'SIA_UNIT'])).json;
  ok(pend.result.probability > irr.result.probability && pend.dependencies.pendingCount === 2, 'pending department actions raise the score', `${irr.result.riskScore} → ${pend.result.riskScore}`);
  const bad = await score({ state: 'Karnataka', district: 'Mandya', projectType: 'Irrigation', primaryAuthority: 'Airports Authority of India (AAI)', stage: 'Notification' });
  ok(bad.status === 422, 'an ineligible acquiring body is rejected', String(bad.status));
  const legacy = await call('POST', '/predict', { token: admin, body: { record: { project_type: 'Irrigation', authority: 'Airports Authority of India (AAI)', state: 'Karnataka' } } });
  ok(legacy.status === 422, 'legacy /predict rejects Irrigation + AAI', String(legacy.status));

  section('Roles & jurisdiction');
  const dc = await login('u-ka-mandya-dc');
  const dcList = (await get('/projects?pageSize=500', dc)).json;
  ok(dcList.total > 0 && dcList.projects.every((p) => p.state === 'Karnataka' && p.districts.includes('Mandya')), 'Mandya DC sees only Mandya projects', `${dcList.total} projects`);
  ok((await get('/projects/LAP-1002', dc)).status === 403, 'Mandya DC cannot open a UP project');
  const adm = await login('u-up-kanpur-adm');
  ok((await get('/projects/LAP-1000', adm)).status === 403, 'UP ADM cannot open a Karnataka project');
  ok((await call('POST', '/projects', { token: dc, body: {} })).status === 403, 'district admin cannot create projects');
  const viewer = await login('u-policy');
  const someIntervention = (await get('/interventions?pageSize=1', admin)).json.items[0];
  ok((await call('PATCH', `/interventions/${encodeURIComponent(someIntervention.id)}`, { token: viewer, body: { status: 'ACKNOWLEDGED' } })).status === 403, 'policy viewer cannot change interventions');
  const nhai = await login('u-nhai-piu');
  const nhaiList = (await get('/projects?pageSize=500', nhai)).json.projects;
  ok(nhaiList.length > 0 && nhaiList.every((p) => p.authority.includes('NHAI') || p.supportingDepartments.some((d) => d.includes('NHAI'))), 'NHAI profile is scoped to NHAI projects', `${nhaiList.length}`);
  const dcDash = (await get('/dashboard/summary', dc)).json;
  ok(dcDash.kpis.totalProjects === dcList.total, 'dashboard and registry agree for the same role');

  section('National hierarchy & positions');
  const hier = (await get('/hierarchy')).json;
  ok(hier.states.length === 36 && hier.states.filter((x) => x.type === 'State').length === 28 && hier.states.filter((x) => x.type !== 'State').length === 8, 'hierarchy lists all 28 States and 8 Union Territories');
  ok(hier.states.every((st) => hier.organisations.some((o) => o.id === `st:${st.code}` && o.kind === 'state_government') && hier.organisations.some((o) => o.id === `st:${st.code}:revenue`)), 'every State / UT has a government and a revenue department');
  ok(['in:morth', 'in:mor', 'in:mop', 'in:mocoal', 'in:mopsw', 'in:mod', 'in:mohua', 'in:dolr', 'in:moefcc', 'in:nhai'].every((id) => hier.organisations.some((o) => o.id === id)), 'central ministries and organisations are catalogued');
  const ladakh = (await get('/hierarchy/options?orgId=st:LA:revenue')).json;
  ok(ladakh.options.district?.length > 0 && ladakh.position.units.state === 'Ladakh', 'a Union Territory resolves its districts', `${ladakh.options.district?.length} districts`);
  const zones = (await get('/hierarchy/options?orgId=in:mor')).json;
  ok(zones.levels.includes('region') && zones.options.region.some((z) => z.id === 'Southern Railway'), 'Ministry of Railways exposes zones as its region level');

  const scoped = async (userId) => (await get('/projects?pageSize=500', await login(userId))).json.projects;
  const morthList = await scoped('u-morth');
  ok(morthList.length > 0 && morthList.every((pr) => ['National Highway', 'Expressway'].includes(pr.type)), 'MoRTH sees only road projects, nationally', `${morthList.length}`);
  ok(new Set(morthList.map((pr) => pr.state)).size > 5, 'a ministry portfolio spans many States', `${new Set(morthList.map((pr) => pr.state)).size} states`);
  const moefList = await scoped('u-moefcc');
  const moefDetail = await detail(moefList[0].id, admin);
  ok(moefList.length > 0 && moefDetail.project.network.nodes.some((n) => n.code === 'FOREST'), 'MoEFCC portfolio is projects with a forest clearance', `${moefList.length}`);
  const dolrList = await scoped('u-dolr');
  ok(dolrList.length > 0 && dolrList.every((pr) => pr.framework === 'RFCTLARR Act, 2013'), 'DoLR portfolio is RFCTLARR proceedings', `${dolrList.length}`);
  const zoneList = await scoped('u-mor-sr');
  ok(zoneList.length > 0 && zoneList.every((pr) => pr.type === 'Railway' && ['Tamil Nadu', 'Kerala'].includes(pr.state)), 'Southern Railway zone sees its railway projects only', `${zoneList.length}`);
  const tiruppur = await scoped('u-mor-tiruppur');
  ok(tiruppur.length > 0 && tiruppur.every((pr) => pr.type === 'Railway' && pr.districts.includes('Tiruppur')), 'India → Railways → Tamil Nadu → Tiruppur scope', `${tiruppur.length}`);
  const mh = await scoped('u-mh-state');
  const nagpur = await scoped('u-mh-nagpur-collector');
  ok(mh.length > 0 && mh.every((pr) => pr.state === 'Maharashtra') && nagpur.length > 0 && nagpur.every((pr) => pr.districts.includes('Nagpur')), 'Maharashtra state and Nagpur district scopes', `${mh.length} / ${nagpur.length}`);
  const tnRoads = await scoped('u-tn-highways');
  ok(tnRoads.every((pr) => pr.state === 'Tamil Nadu' && ['National Highway', 'Expressway'].includes(pr.type)), 'a state roads department sees its state road projects only', `${tnRoads.length}`);

  const wb = await call('POST', '/auth/login', { body: { role: 'DISTRICT_ADMIN', position: { orgId: 'st:WB:revenue', units: { state: 'West Bengal', district: 'Hugli' } } } });
  ok(wb.status === 200 && wb.json.user.position.tier === 'district' && wb.json.user.scopeLabel === 'Hugli, West Bengal', 'a district position can be configured in any State', wb.json?.user?.scopeLabel);
  const wbList = (await get('/projects?pageSize=500', wb.json.token)).json.projects;
  ok(wbList.every((pr) => pr.state === 'West Bengal' && pr.districts.includes('Hugli')), 'configured position is enforced by the API', `${wbList.length}`);
  const od = await call('POST', '/auth/login', { body: { role: 'STATE_ADMIN', position: { orgId: 'st:OD:revenue', units: {} } } });
  const odList = (await get('/projects?pageSize=500', od.json.token)).json.projects;
  ok(od.status === 200 && odList.length > 0 && odList.every((pr) => pr.state === 'Odisha'), 'configured Odisha state position', `${odList.length}`);
  const badTier = await call('POST', '/auth/login', { body: { role: 'LAND_ACQUISITION_OFFICER', position: { orgId: 'in:morth', units: {} } } });
  ok(badTier.status === 422, 'a role not held at the tier is refused', badTier.json?.error);
  const noAdmin = await call('POST', '/auth/login', { body: { role: 'NATIONAL_ADMIN', position: { orgId: 'in:lacc', units: {} } } });
  ok(noAdmin.status === 422, 'national administration cannot be self-configured');

  const natProfile = (await get('/profile', admin)).json;
  ok(natProfile.user.position.tier === 'national' && natProfile.user.position.chain.find((r) => r.level === 'district')?.all === true, 'national profile is not forced to a district');
  const dcProfile = (await get('/profile', dc)).json;
  ok(['Karnataka', 'Mysuru Division', 'Mandya'].every((v) => dcProfile.user.position.chain.some((r) => r.value === v)) && dcProfile.portfolio.totals.projects === dcList.total, 'district profile shows State → Division → District and its portfolio', dcProfile.user.position.chain.map((r) => r.value).join(' > '));

  section('National portfolio drill-down');
  const nat = (await get('/hierarchy/portfolio', admin)).json;
  ok(nat.level === 'sector' && nat.children.reduce((a, c) => a + c.stats.projects, 0) === nat.totals.projects, 'sector totals add up to the national total', `${nat.totals.projects}`);
  ok(nat.children.some((c) => c.id === 'ports' && c.onboarded === false), 'registered sectors without project types are shown as not onboarded');
  const rail = (await get('/hierarchy/portfolio?sector=railways', admin)).json;
  ok(rail.level === 'state' && rail.children.reduce((a, c) => a + c.stats.projects, 0) === rail.totals.projects, 'state totals add up within a sector');
  const leaf = (await get(`/hierarchy/portfolio?sector=railways&state=${encodeURIComponent('Tamil Nadu')}&district=Tiruppur`, admin)).json;
  ok(leaf.level === 'project' && leaf.children.length === tiruppur.length && leaf.path.map((x) => x.label).join('>') === 'India>Railways>Tamil Nadu>Tiruppur', 'drill-down reaches projects');
  const dcNat = (await get('/hierarchy/portfolio', dc)).json;
  ok(dcNat.totals.projects === dcList.total, 'drill-down respects the user scope');
  const dashRoads = (await get('/dashboard/summary?sector=roads', admin)).json;
  const listRoads = (await get('/projects?sector=roads&pageSize=1', admin)).json;
  ok(dashRoads.kpis.totalProjects === listRoads.total && listRoads.total === morthList.length, 'sector filter agrees across dashboard, registry and ministry scope');

  section('Project-type dependencies & issue profiles');
  const reg = (await get('/registry', admin)).json;
  const rule = (t, c) => reg.dependencyMatrix.find((x) => x.projectType === t).dependencies.find((d) => d.code === c).applicability;
  ok(rule('Airport', 'AVIATION') === 'always' && rule('National Highway', 'AVIATION') === 'never' && rule('Irrigation', 'FOREST') === 'conditional', 'declarative dependency matrix');
  ok(reg.issueMatrix.find((x) => x.projectType === 'Power Transmission').issues.find((i) => i.id === 'right_of_way').exposure !== 'never' && reg.issueMatrix.find((x) => x.projectType === 'National Highway').issues.find((i) => i.id === 'right_of_way').exposure === 'never', 'issue exposure follows the framework');
  const nhProject = morthList.find((pr) => pr.type === 'National Highway');
  const nhDetail = await detail(nhProject.id, admin);
  ok(nhDetail.issues.issues.length > 8 && nhDetail.issues.excluded.some((e) => e.id === 'right_of_way') && nhDetail.issues.excluded.some((e) => e.id === 'urban_local_body'), 'highway issue profile excludes right of way and municipal processes');
  ok(nhDetail.provenance.record === 'synthetic' && nhDetail.provenance.risk === 'model', 'project detail declares data provenance');
  const scRow = await call('POST', '/scenario/score', { token: admin, body: { context: { state: 'Odisha', district: 'Khordha', projectType: 'Power Transmission', subtype: '400 kV line', stage: 'Objection / Claims', affectedFamilies: 10 }, pending: ['DISTRICT_HEAD'], signals: {} } });
  ok(scRow.status === 200 && scRow.json.issues.issues.some((i) => i.id === 'right_of_way' && i.status === 'active') && scRow.json.issues.excluded.some((e) => e.id === 'rehabilitation'), 'transmission scenario: right of way active, R&R not applicable');
  const scDam = await call('POST', '/scenario/score', { token: admin, body: { context: { state: 'Gujarat', district: 'Narmada', projectType: 'Irrigation', subtype: 'Reservoir submergence', stage: 'Survey & Verification', affectedFamilies: 400 }, pending: ['FOREST'], signals: {} } });
  ok(scDam.status === 200 && scDam.json.issues.issues.find((i) => i.id === 'forest_environment')?.status === 'active' && scDam.json.issues.issues.some((i) => i.id === 'rehabilitation'), 'reservoir scenario: forest clearance active and R&R applicable');

  section('Data integration layer');
  const integ = (await get('/integrations', admin)).json;
  ok(integ.providers.length >= 9 && integ.connectedOfficialSources === 0 && integ.providers.every((pr) => pr.adapter.mode === 'synthetic' && !pr.connected), 'every provider slot runs a synthetic adapter; none connected');
  const parcel = (await get('/integrations/parcel/LAC-500000', admin)).json;
  const sections = Object.values(parcel.sections);
  ok(sections.length === 5 && sections.every((sec) => sec.provenance?.mode === 'synthetic'), 'parcel data view carries synthetic provenance per section');
  ok(parcel.sections.registration.data === null, 'no registration data is fabricated');
  const outCase = (await get('/cases?pageSize=1&state=Uttar%20Pradesh', admin)).json.rows[0];
  ok((await get(`/integrations/parcel/${outCase.caseId}`, dc)).status === 403, 'integration views respect jurisdiction');
  ok(health.json.product === 'LandPulse AI', 'API identifies as LandPulse AI');

  section('Intervention & alert workflow');
  const slao = await login('u-ka-mandya-slao');
  const mine = (await get('/interventions?mine=1&pageSize=50', slao)).json;
  ok(mine.items.every((i) => i.assigned_role === 'LAND_ACQUISITION_OFFICER'), 'SLAO "mine" lists LAO-assigned interventions', `${mine.total}`);
  const target = (await get('/interventions?pageSize=50', dc)).json.items[0];
  if (target) {
    const ack = await call('PATCH', `/interventions/${encodeURIComponent(target.id)}`, { token: dc, body: { status: 'ACKNOWLEDGED' } });
    ok(ack.status === 200 && ack.json.intervention.status === 'ACKNOWLEDGED', 'district admin acknowledges an intervention');
    const noNote = await call('PATCH', `/interventions/${encodeURIComponent(target.id)}`, { token: dc, body: { status: 'RESOLVED' } });
    ok(noNote.status === 422, 'resolving requires a note');
    const res = await call('PATCH', `/interventions/${encodeURIComponent(target.id)}`, { token: dc, body: { status: 'RESOLVED', note: 'Disbursement camp held' } });
    ok(res.status === 200 && res.json.intervention.status === 'RESOLVED', 'intervention resolved with note');
  }
  const alert = (await get('/alerts?pageSize=1', dc)).json.items[0];
  if (alert) {
    const a = await call('PATCH', `/alerts/${encodeURIComponent(alert.id)}`, { token: dc, body: { status: 'ACKNOWLEDGED' } });
    ok(a.status === 200 && a.json.alert.status === 'ACKNOWLEDGED', 'alert acknowledged');
    ok(alert.link.startsWith('/projects/') || alert.link.startsWith('/cases/'), 'alert links to its object', alert.link);
  }

  section('Project CRUD');
  const invalid = await call('POST', '/projects', { token: admin, body: { name: 'X', type: 'Irrigation', state: 'Karnataka', district: 'Lucknow', totalParcels: 10, landRequirementHa: 5, currentStage: 'Notification', startDate: '2026-02-30', targetCompletionDate: '2027-01-01', compensationCompletionPct: 40, lat: 26.8, lon: 80.9, authority: 'Airports Authority of India (AAI)' } });
  const fields = (invalid.json?.details ?? []).map((d) => d.field);
  ok(invalid.status === 422 && ['name', 'district', 'startDate', 'compensationCompletionPct'].every((f) => fields.includes(f)), 'invalid project rejected with field errors', fields.join(','));
  const created = await call('POST', '/projects', { token: admin, body: { name: 'Smoke Test Ring Road', type: 'Urban Infrastructure', subtype: 'Ring road', state: 'Karnataka', district: 'Mandya', totalParcels: 300, landRequirementHa: 180, affectedFamilies: 90, currentStage: 'Objection / Claims', startDate: '2026-01-10', targetCompletionDate: '2027-12-31', lat: 12.52, lon: 76.9, legalCases: 30 } });
  ok(created.status === 201, 'valid project created', created.json?.project?.id ?? created.text.slice(0, 120));
  const newId = created.json?.project?.id;
  if (newId) {
    const before = await detail(newId);
    ok(before.project.riskBasis === 'surrogate' && before.project.network.dependencyCount > 0, 'new project scored and networked', `${before.project.riskScore}%`);
    const edit = await call('PUT', `/projects/${newId}`, { token: admin, body: { legalCases: 900, avgDocumentCompleteness: 30 } });
    const after = await detail(newId);
    ok(edit.status === 200 && after.project.riskScore > before.project.riskScore, 'edit re-scores the project', `${before.project.riskScore} → ${after.project.riskScore}`);
    const adv = await call('POST', `/projects/${newId}/advance-stage`, { token: admin, body: { completedOn: '2026-09-01' } });
    ok(adv.status === 200 && adv.json.project.currentStage === 'Valuation', 'stage advance moves the frontier', adv.json?.project?.currentStage);
    const del = await call('DELETE', `/projects/${newId}`, { token: admin, body: { reason: 'smoke test cleanup' } });
    ok(del.status === 200 && (await get(`/projects/${newId}`, admin)).status === 404, 'project soft-deleted');
    ok((await call('POST', `/projects/${newId}/restore`, { token: admin })).status === 200, 'project restored');
    const audit = (await get(`/audit?q=${newId}`, admin)).json;
    const actions = audit.entries.map((e) => e.action);
    ok(['project.created', 'project.edited', 'project.stage_completed', 'project.deleted', 'project.restored'].every((a) => actions.includes(a)), 'every change is audited', actions.join(','));
    const editEntry = audit.entries.find((e) => e.action === 'project.edited');
    ok(editEntry?.oldValue && editEntry?.newValue && editEntry.user.role === 'NATIONAL_ADMIN', 'audit carries user, role, old and new values');
  }
  const corpusEdit = await call('PUT', '/projects/LAP-1001', { token: admin, body: { compensationCompletionPct: 5 } });
  ok(corpusEdit.status === 422, 'edit that contradicts the stage is rejected', corpusEdit.json?.details?.[0]?.message);

  section('CSV upload validation');
  const template = (await get('/upload/template', admin)).text;
  const good = await call('POST', '/upload?commit=0', { token: admin, raw: template, type: 'text/csv' });
  ok(good.status === 200 && good.json.ok, 'template row validates');
  const header = template.split('\n')[0];
  const badRow = 'Bad Project,Irrigation,,Karnatka,Mandya,,Airports Authority of India (AAI),Urgent,abc,0,5,Nowhere,2026-13-01,2025-01-01,140,0,0,70,0,Joint,Moderate,0,40.5,120,no,maybe,no';
  const badUp = await call('POST', '/upload?commit=0', { token: admin, raw: `${header}\n${badRow}\n`, type: 'text/csv' });
  const msgs = (badUp.json?.rows?.[0]?.errors ?? []).map((e) => e.message).join(' | ');
  ok(!badUp.json.ok && /not a recognised Indian state/.test(msgs) && /must be a number/.test(msgs) && /between 0 and 100/.test(msgs) && /real date/.test(msgs) && /location in India/.test(msgs) && /Stage "Nowhere"/.test(msgs), 'bad CSV row reports readable errors', `${badUp.json?.rows?.[0]?.errors.length} errors`);
  const missing = await call('POST', '/upload?commit=0', { token: admin, raw: 'project_name,state\nA,Karnataka\n', type: 'text/csv' });
  ok(missing.json.fileErrors.some((e) => /Missing required column/.test(e)), 'missing columns detected');
  const commit = await call('POST', '/upload?commit=1', { token: admin, raw: template, type: 'text/csv' });
  ok(commit.status === 200 && commit.json.created.length === 1, 'valid upload committed', commit.json?.created?.[0]?.id);

  section('Documents');
  const sslr = await login('u-ka-mandya-sslr');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const up1 = await call('POST', `/documents?projectId=LAP-1000&title=${encodeURIComponent('RTC reconciliation — Maddur')}&type=land_record&stage=${encodeURIComponent('Survey & Verification')}&fileName=rtc.pdf`, { token: sslr, raw: pdf, type: 'application/pdf' });
  ok(up1.status === 201, 'land records officer uploads a land record', up1.json?.document?.id ?? up1.text.slice(0, 120));
  const wrongType = await call('POST', `/documents?projectId=LAP-1000&title=Award&type=award&fileName=a.pdf`, { token: sslr, raw: pdf, type: 'application/pdf' });
  ok(wrongType.status === 403, 'land records officer cannot file an award');
  const spoof = await call('POST', `/documents?projectId=LAP-1000&title=Fake&type=land_record&fileName=x.pdf`, { token: sslr, raw: Buffer.from('not a pdf'), type: 'application/pdf' });
  ok(spoof.status === 415, 'content that is not a PDF is rejected');
  if (up1.json?.document) {
    const id = up1.json.document.id;
    ok((await call('PATCH', `/documents/${id}`, { token: sslr, body: { status: 'VERIFIED' } })).status === 403, 'uploader cannot review their own document');
    const rej = await call('PATCH', `/documents/${id}`, { token: dc, body: { status: 'REJECTED', note: 'Survey sketch missing' } });
    ok(rej.status === 200 && rej.json.document.status === 'REJECTED', 'district admin rejects with a note');
    const d = await detail('LAP-1000', dc);
    ok(d.recommendations.some((r) => r.code === 'DOCUMENT_REJECTED'), 'a rejected document feeds the documentation rule');
    const dl = await fetch(`${BASE}/documents/${id}/download?token=${dc}`);
    ok(dl.status === 200 && (await dl.text()).startsWith('%PDF'), 'document downloads');
  }

  section('Case status');
  const cs = await call('PATCH', '/cases/LAC-500001/status', { token: slao, body: { status: 'ESCALATED', note: 'Referred to LARR Authority' } });
  ok(cs.status === 200, 'LAO escalates a case');
  ok((await get('/cases/LAC-500001', slao)).json.case.caseStatus === 'ESCALATED', 'case status persists');

  section('Consistency validation');
  const v = (await get('/validation', admin)).json;
  for (const c of v.checks) ok(c.passed, `consistency: ${c.label}`, c.passed ? '' : c.examples.join(' | '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
