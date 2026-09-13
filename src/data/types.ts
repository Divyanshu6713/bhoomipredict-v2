/**
 * Domain model.
 *
 * These shapes mirror what the API serves (see server/index.mjs and
 * server/lib/*). Four levels are distinguished throughout:
 *   PROJECT  an acquisition project, with its dependency network and lifecycle
 *   STAGE    one statutory stage of that project — its status is separate from
 *   CASE     the individual acquisition cases (one per parcel) attached to it
 *   PARCEL   the land unit itself, carried on the case record
 */

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export const RISK_LEVELS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export const LIFECYCLE_STAGES = [
  'Land Identification',
  'Survey & Verification',
  'Notification',
  'Objection / Claims',
  'Valuation',
  'Compensation',
  'Possession',
  'Rehabilitation & Resettlement',
  'Closure',
] as const;

export type StageName = (typeof LIFECYCLE_STAGES)[number];

/** Statutory stage status — decided only by server/domain/lifecycle.mjs. */
export type StageStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'BLOCKED';

export type ProjectType =
  | 'National Highway'
  | 'Expressway'
  | 'Railway'
  | 'Metro Rail'
  | 'Urban Infrastructure'
  | 'Industrial'
  | 'Irrigation'
  | 'Power Transmission'
  | 'Renewable Energy'
  | 'Pipeline'
  | 'Airport';

export type OwnershipComplexity = 'Single' | 'Joint' | 'Fragmented' | 'Disputed';
export type CompensationStatus = 'Not Initiated' | 'Assessed' | 'Awarded' | 'Partially Paid' | 'Paid';
export type PossessionStatus = 'Not Initiated' | 'Notice Issued' | 'Partial' | 'Complete';
export type RRStatus = 'Not Applicable' | 'Not Started' | 'In Progress' | 'Complete';
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type RiskBasis = 'ensemble' | 'ensemble+adjustment' | 'surrogate';

/* ------------------------------------------------------------ authorities */

export interface DependencyNode {
  code: string;
  role: string;
  name: string;
  category: 'acquiring_body' | 'district_administration' | 'acquisition_officer' | 'land_records' | 'clearance' | 'supporting' | 'dispute_forum';
  level: 'central' | 'state' | 'district' | 'sub-district';
  stages: StageName[];
  gate: boolean;
  why: string;
  basis: 'statute' | 'configured' | 'project';
  pendingActionText: string;
  pendingOpenCases?: number;
  pendingCurrentStage?: number;
  pendingShareCurrentStage?: number;
}

export interface Framework {
  id: string;
  name: string;
  short: string;
  mode: 'ownership' | 'right_of_user' | 'right_of_way';
  note: string | null;
  siaRequired: boolean;
}

export interface DependencyNetwork {
  context: { projectType: ProjectType; subtype: string; state: string; district: string | null; subDistrict: string | null; subDistrictLabel: string };
  framework: Framework;
  primaryAuthority: string;
  authorityOptions: string[];
  stateProfile: {
    state: string;
    generic: boolean;
    districtHead: string;
    laOfficer: string;
    subDistrictLabel: string;
    revenueDepartment: string;
    landRecords: { name: string; districtOffice: string; subDistrictOffice: string; portal: string; work: string };
  };
  nodes: DependencyNode[];
  dependencyCount: number;
  note: string;
}

/* -------------------------------------------------------------- lifecycle */

export interface BlockedBy {
  code: string;
  name: string;
  role: string;
  pendingCases: number;
  share: number;
}

export interface ProjectStage {
  name: StageName;
  stageName: StageName;
  index: number;
  status: StageStatus;
  plannedStart: string;
  startDate: string;
  baselineCompletion: string;
  expectedCompletion: string;
  plannedCompletion: string;
  actualStart: string | null;
  actualCompletion: string | null;
  slipDays: number;
  plannedDays: number;
  daysElapsed: number;
  daysRemaining: number;
  delayDays: number;
  openCases: number;
  resolvedCases: number;
  totalCases: number;
  resolutionPct: number | null;
  caseBacklog: 'OPEN' | 'CLEARED' | 'NONE';
  parcelsAhead: number;
  blockedBy: BlockedBy[];
  approvalDelayMean: number;
  riskProbability: number | null;
  milestone: string;
  explanation: string;
}

export interface StageRisk {
  stage: StageName;
  index: number;
  openCases: number;
  riskScore: number | null;
  band: RiskLevel | null;
  mix: [number, number, number, number];
  basis: 'model' | 'observed' | 'no-open-cases';
}

export interface LifecycleSummary {
  currentStatus: StageStatus;
  isDelayed: boolean;
  isBlocked: boolean;
  residualBacklog: number;
  parcelsAhead: number;
  forecastCompletion: string;
  timelineOverrunDays: number;
  notificationStatus: string;
}

export interface Contributor {
  group: string;
  value: number;
  share: number;
  features?: string[];
  direction?: 'increases' | 'reduces';
  label?: string;
}

/** Legacy contributor-keyed prompt, still attached to queue cells. */
export interface Intervention {
  action: string;
  owner: string;
  detail?: string;
}

/* ------------------------------------------------------------- workflow */

export interface Trigger {
  source: 'model' | 'lifecycle' | 'rule' | 'dependency' | 'documents';
  metric: string;
  value: number | string;
  operator: string;
  threshold: number | string | null;
}

export interface Recommendation {
  id: string;
  projectId: string;
  projectName: string;
  code: string;
  category: string;
  severity: Severity;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  title: string;
  reason: string;
  trigger: Trigger;
  stage: StageName;
  responsibleAuthority: { code: string; name: string; role: string } | null;
  supportingAuthorities: string[];
  assignedRole: string;
  recommendedAction: string;
  expectedOutcome?: string;
  dueInDays?: number;
  caseIds: string[];
  alert?: boolean;
  intervention?: boolean;
}

export type InterventionStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
export type AlertStatus = 'UNREAD' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface InterventionItem {
  intervention_id: string;
  id: string;
  project_id: string;
  projectId: string;
  projectName: string;
  state: string;
  district: string;
  districts: string[];
  projectType: ProjectType;
  stage: StageName;
  case_id: string | null;
  caseIds: string[];
  priority: 'P1' | 'P2' | 'P3';
  severity: Severity;
  category: string;
  code: string;
  title: string;
  reason: string;
  risk_score: number;
  riskBand: RiskLevel;
  trigger: Trigger;
  responsible_department: string;
  responsibleAuthority: { code: string; name: string; role: string };
  supportingAuthorities: string[];
  assigned_role: string;
  assignedRoleLabel: string;
  assigneeId: string | null;
  assigneeName: string | null;
  recommended_action: string;
  expectedOutcome: string;
  created_at: string;
  due_date: string;
  overdue: boolean;
  status: InterventionStatus;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CountRow {
  key: string;
  count: number;
  unread?: number;
}

export interface InterventionList {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  counts: { bySeverity: CountRow[]; byStatus: CountRow[]; byCategory: CountRow[]; byDepartment: CountRow[]; overdue: number; mine: number };
  items: InterventionItem[];
}

export interface AlertItem {
  id: string;
  severity: Severity;
  category: string;
  code: string;
  project: { id: string; name: string };
  projectId: string;
  state: string;
  district: string;
  case: string | null;
  stage: StageName;
  title: string;
  reason: string;
  triggered_by: Trigger;
  responsibleAuthority: string;
  assignedRole: string;
  date: string;
  status: AlertStatus;
  link: string;
  interventionId: string | null;
  updatedAt: string | null;
}

export interface AlertList {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  counts: { unread: number; bySeverity: CountRow[]; byStatus: CountRow[]; byCategory: CountRow[] };
  items: AlertItem[];
}

/* ------------------------------------------------------------ documents */

export interface DocumentVersion {
  version: number;
  fileName: string;
  bytes: number;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface DocumentRecord {
  document_id: string;
  id: string;
  title: string;
  type: string;
  project_id: string;
  projectId: string;
  projectName: string;
  state: string;
  stage: StageName | null;
  caseId: string | null;
  uploaded_by: { id: string; name: string; role: string };
  uploaded_at: string;
  version: number;
  status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  versions: DocumentVersion[];
  review: { by: { id: string; name: string; role: string }; at: string; note: string | null; version: number } | null;
}

export interface DocumentList {
  total: number;
  allowedTypes: string[];
  types: string[];
  documents: DocumentRecord[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: { id: string; name: string; role: string; department?: string };
  action: string;
  entity: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  note: string | null;
}

export interface AuditList {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  entries: AuditEntry[];
}

/* ----------------------------------------------------------------- users */

export type RoleId =
  | 'NATIONAL_ADMIN'
  | 'SECTOR_NODAL_OFFICER'
  | 'STATE_ADMIN'
  | 'DISTRICT_ADMIN'
  | 'LAND_ACQUISITION_OFFICER'
  | 'PROJECT_AUTHORITY'
  | 'LEGAL_OFFICER'
  | 'REVENUE_OFFICER'
  | 'FIELD_OFFICER'
  | 'POLICY_VIEWER';

export interface User {
  id: string;
  name: string;
  designation: string;
  department: string;
  role: RoleId;
  roleLabel: string;
  state: string | null;
  district: string | null;
  scope: AuthorityTier;
  scopeLabel: string;
  position: Position;
  permissions: string[];
  focus: string[];
  roleSummary: string;
  configured: boolean;
  demo: boolean;
}

export interface Notifications {
  unreadAlerts: number;
  openAssigned: number;
  total: number;
}

export interface Profile {
  user: User;
  notifications: Notifications;
  assignedProjects: Array<{ id: string; name: string; state: string; district: string; riskScore: number; riskBand: RiskLevel; stage: StageName; stageStatus: StageStatus }>;
  jurisdiction: { projects: number; highOrCritical: number; delayed: number };
  assignedInterventions: number;
  assignedCases: string[];
  recentActivity: AuditEntry[];
  portfolio: PositionPortfolio;
  official: { directory: string; identity: string };
}

/* -------------------------------------------------------------- projects */

/** The Step-2 project schema, as every list returns it. */
export interface ProjectSummary {
  id: string;
  project_id: string;
  name: string;
  type: ProjectType;
  subtype: string;
  framework: string | null;
  state: string;
  district: string;
  districts: string[];
  subDistrict: string | null;
  subDistrictLabel: string;
  landRequirementHa: number;
  totalParcels: number;
  affectedFamilies: number;
  currentStage: StageName;
  currentStageIndex: number;
  stageStatus: StageStatus;
  startDate: string;
  targetCompletionDate: string;
  currentMilestone: string;
  milestoneDeadline: string;
  daysRemaining: number;
  delayDays: number;
  compensationStatus: CompensationStatus;
  compensationCompletionPct: number;
  possessionStatus: PossessionStatus;
  possessionCompletionPct: number | null;
  rrStatus: RRStatus;
  rrProgressPct: number | null;
  notificationStatus: string;
  documentationCompleteness: number;
  legalDispute: boolean;
  legalCases: number;
  ownershipComplexity: OwnershipComplexity;
  stakeholderResponsiveness: 'Low' | 'Moderate' | 'High';
  approvalDelayDays: number;
  coordinationScore: number;
  districtDelayRate: number;
  riskScore: number;
  delayProbability: number;
  riskBand: RiskLevel;
  riskBasis: RiskBasis;
  predictedDelayDays: number | null;
  lat: number;
  lon: number;
  authority: string;
  primaryAuthority: string;
  responsibleDepartment: string | null;
  supportingDepartments: string[];
  dependencyCount: number;
  priority: 'Routine' | 'Important' | 'Critical';
  progressPct: number;
  openCases: number;
  highRiskCases: number;
  criticalCases: number;
  residualBacklog: number;
  isDelayed: boolean;
  isBlocked: boolean;
  timelineOverrunDays: number;
  topContributor: string | null;
  actionCount: number;
  dataQuality: number | null;
  budgetCr: number | null;
  source: 'corpus' | 'user' | 'upload';
  dataSource: string;
}

/** Full effective project as the detail endpoint returns it. */
export interface ProjectFull {
  id: string;
  name: string;
  type: ProjectType;
  subtype: string;
  framework: Framework;
  state: string;
  stateCode: string;
  zone: string | null;
  district: string;
  districts: string[];
  subDistrict: string | null;
  subDistricts: string[];
  subDistrictLabel: string;
  authority: string;
  flags: { forestLand: boolean; crossesRailway: boolean; crossesHighway: boolean; consolidationOpen: boolean };
  network: DependencyNetwork;
  coordinationScore: number;
  priority: 'Routine' | 'Important' | 'Critical';
  startDate: string;
  targetCompletionDate: string;
  totalParcels: number;
  openCases: number;
  observedCases: number;
  observedDelayRate: number;
  landRequirementHa: number;
  parcelAreaHa: number | null;
  openAreaHa: number | null;
  affectedFamilies: number;
  legalCases: number;
  legalDisputeParcels: number;
  compensationCompletionPct: number;
  compensationStatus: CompensationStatus;
  compensationBasis?: string;
  possessionCompletionPct: number;
  possessionStatus: PossessionStatus;
  rrRequiredParcels: number;
  rrCases: number;
  rrProgressPct: number | null;
  rrStatus: RRStatus;
  dominantOwnership: OwnershipComplexity;
  stakeholderResponsiveness: 'Low' | 'Moderate' | 'High';
  avgInactivityDays: number | null;
  avgDocumentCompleteness: number;
  approvalDelayDays: number;
  districtDelayRate: number;
  authorityDelayRate: number;
  budgetCr: number | null;
  currentStage: StageName;
  currentStageIndex: number;
  currentMilestone: string;
  milestoneDeadline: string;
  stages: ProjectStage[];
  stageRisk: StageRisk[];
  stageDependency: Array<{ pending: Record<string, number>; approvalDelayMean: number }> | null;
  lifecycle: LifecycleSummary;
  progressPct: number;
  lat: number;
  lon: number;
  riskScore: number;
  riskBand: RiskLevel;
  delayProbability: number;
  riskBasis: RiskBasis;
  predictedDelayDays: number | null;
  previousEnsembleRisk?: number;
  adjustment?: { surrogateBefore: number; surrogateAfter: number; logOddsDelta: number; changedFields: string[]; stageAdvances: number };
  highRiskCases: number;
  criticalCases: number;
  riskMix: Record<RiskLevel, number>;
  dataQuality: number | null;
  contributors: Contributor[];
  contributorBasis?: 'surrogate';
  topContributor: string | null;
  riskTrend: Array<{ month: string; riskScore: number; cases: number; observedDelayRate: number | null }>;
  source: 'corpus' | 'user' | 'upload';
  createdAt?: string;
}

export interface ScenarioSeed {
  context: ScenarioContext;
  pending: string[];
  signals: Record<string, string | number>;
}

export interface ProjectDetailResponse {
  project: ProjectFull;
  summary: ProjectSummary;
  topCases: AcquisitionCase[];
  recommendations: Recommendation[];
  riskSnapshots: Array<{ at: string; riskScore: number; band: RiskLevel; basis: RiskBasis; modelVersion: string | null }>;
  interventions: InterventionItem[];
  alerts: AlertItem[];
  documents: DocumentList;
  activity: AuditEntry[];
  scenarioSeed: ScenarioSeed;
  issues: IssueProfile;
  provenance: { record: DataMode; risk: DataMode; riskBasis: RiskBasis; note: string };
  permissions: {
    edit: boolean;
    delete: boolean;
    advanceStage: boolean;
    uploadDocument: boolean;
    reviewDocument: boolean;
    updateIntervention: boolean;
    assignIntervention: boolean;
    updateAlert: boolean;
  };
}

/* ----------------------------------------------------------------- cases */

export type CaseStatus = 'OPEN' | 'CLOSED' | 'UNDER_REVIEW' | 'ESCALATED' | 'ON_HOLD' | 'RESOLVED_PENDING_RESCORE';

/** Compact case row for tables and the map. */
export interface CaseRow {
  caseId: string;
  row: number;
  projectId: string;
  projectName: string;
  state: string;
  district: string;
  village: string;
  stage: StageName;
  areaHa: number;
  ownership: OwnershipComplexity;
  compensationStatus: CompensationStatus;
  compensationCompletionPct: number;
  legalDispute: boolean;
  legalCases: number;
  inactivityDays: number;
  milestoneDueDate: string;
  daysToMilestone: number;
  riskScore: number;
  riskBand: RiskLevel;
  dataQuality: number;
  predictedDelayDays: number | null;
  pendingDependencyCount: number | null;
  labelObserved: boolean;
  outcome: 'Delayed' | 'On time' | 'Pending';
  caseStatus?: CaseStatus;
  caseStatusNote?: string | null;
}

/** Full case record. */
export interface AcquisitionCase extends CaseRow {
  parcelId: string;
  projectType: ProjectType;
  projectSubtype: string | null;
  framework: string | null;
  authority: string;
  priority: string;
  tehsil: string;
  subDistrictLabel: string;
  surveyNumber: string;
  lat: number;
  lon: number;
  stageIndex: number;
  landType: string;
  owners: number | null;
  affectedFamilies: number | null;
  compensationBand: string | null;
  compensationPendingDays: number;
  disputeComplexity: string;
  rrRequired: boolean;
  rrProgressPct: number | null;
  rehabilitationCases: number;
  rrStatus: RRStatus;
  stakeholderResponsiveness: string | null;
  departmentResponseDays: number | null;
  documentCompleteness: number | null;
  verificationStatus: string;
  approvalStatus: string;
  possessionStatus: PossessionStatus;
  historicalStageDelayRate: number;
  districtDelayRate: number | null;
  districtObservedDelayRate: number | null;
  authorityDelayRate: number;
  dependencyCount: number | null;
  pendingDependencies: string[];
  approvalDelayDays: number | null;
  coordinationScore: number | null;
  stageStartDate: string;
  expectedStageDays: number;
  elapsedStageDays: number;
  milestone: string | null;
  assessmentDate: string;
  actualDelayDays: number | null;
  truthBand: RiskLevel | null;
  delayProbability: number;
  contributors: Contributor[];
  featureContributions?: Contributor[];
  caseStatusUpdatedAt?: string | null;
  caseStatusUpdatedBy?: string | null;
}

export interface CaseQueryResult {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  rows: CaseRow[];
  aggregate: {
    avgRiskScore: number;
    totalAreaHa: number;
    affectedFamilies: number;
    overdueMilestones: number;
    riskMix: Record<RiskLevel, number>;
    stageMix: Array<{ stage: StageName; cases: number }>;
  } | null;
  queryMs: number;
  note?: string;
}

export interface CaseRecommendation {
  code: string;
  category: string;
  severity: Severity;
  priority: string;
  title: string;
  reason: string;
  responsibleAuthority: { code: string; name: string; role: string } | null;
  assignedRole: string;
  recommendedAction: string;
}

export interface CaseDetailResponse {
  case: AcquisitionCase;
  project: ProjectSummary;
  network: DependencyNetwork;
  stage: ProjectStage;
  recommendations: CaseRecommendation[];
  documents: DocumentRecord[];
  activity: AuditEntry[];
  permissions: { updateCase: boolean };
  explanation: { basis: string; unit: string; baseValue: number | null; caveat: string };
}

export interface ProjectQueryResult {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  projects: ProjectSummary[];
  aggregate: {
    openCases: number;
    totalParcels: number;
    highRiskCases: number;
    landRequirementHa: number;
    affectedFamilies: number;
    avgRisk: number;
    delayedProjects: number;
    blockedProjects: number;
    delayedMilestones: number;
    residualBacklog: number;
    riskMix: Record<RiskLevel, number>;
  };
}

export interface MapProject {
  id: string;
  name: string;
  state: string;
  district: string;
  districts: string[];
  type: ProjectType;
  stage: StageName;
  stageStatus: StageStatus;
  riskScore: number;
  delayProbability: number;
  riskBand: RiskLevel;
  predictedDelayDays: number | null;
  primaryAuthority: string;
  lat: number;
  lon: number;
  openCases: number;
  source: string;
}

/** One row of the SHAP cell queue (project × stage). */
export interface QueueItem {
  id: string;
  priorityRank: number;
  projectId: string;
  projectName: string;
  state: string;
  districts: string[];
  authority: string;
  priority: string;
  stage: StageName;
  stageIndex: number;
  milestone: string | null;
  milestoneDeadline: string | null;
  stageStatus: StageStatus | null;
  daysRemaining: number | null;
  openCases: number;
  overdueCases: number;
  riskScore: number;
  rawRiskScore: number;
  riskBand: RiskLevel;
  stageBand: RiskLevel | null;
  riskMix: Record<RiskLevel, number>;
  contributors: Array<{ group: string; share: number }>;
  topContributor: string;
  intervention: Intervention;
  sampleCases: CaseRow[];
  urgency: number;
}

export interface QueueResult {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  items: QueueItem[];
  aggregate: { openCases: number; criticalCells: number; highCells: number; overdueCases: number };
  queryMs: number;
}

/* ------------------------------------------------------------- dashboard */

export interface GroupRisk {
  key: string;
  projects: number;
  avgRisk: number;
  avgDelayProbability: number;
  highRisk: number;
  critical: number;
  delayed: number;
  blocked: number;
  openCases: number;
}

export interface DashboardSummary {
  today: string;
  dataMode: string;
  scope: { filters: Record<string, string>; projects: number };
  kpis: {
    totalProjects: number;
    highRiskProjects: number;
    criticalRiskProjects: number;
    delayedProjects: number;
    blockedProjects: number;
    immediateActionRequired: number;
    averageDelayProbability: number;
    openInterventions: number;
    openCases: number;
    residualBacklogCases: number;
    affectedFamilies: number;
    landRequirementHa: number;
    averagePredictedDelayDays: number;
  };
  riskDistribution: Array<{ key: RiskLevel; projects: number }>;
  caseRiskDistribution: Array<{ key: RiskLevel; cases: number }>;
  stateRisk: GroupRisk[];
  districtRisk: GroupRisk[];
  projectTypeRisk: GroupRisk[];
  stageDistribution: Array<{ key: StageName; projects: number; inProgress: number; delayed: number; blocked: number; avgRisk: number }>;
  delayDrivers: Array<{ key: string; share: number }>;
  compensation: { projectsAtOrPastCompensation: number; averageCompletionPct: number; buckets: CountRow[]; backlogProjects: number };
  legal: { legalCases: number; disputedParcels: number; projectsWithEscalation: number; byType: Array<{ key: string; legalCases: number }> };
  rr: { projectsWithRR: number; averageProgressPct: number; buckets: CountRow[]; affectedFamilies: number };
  timeline: { onTrack: number; delayed: number; blocked: number; overrunBuckets: CountRow[] };
  departmentBottlenecks: {
    byRole: Array<{ key: string; code: string; openCasesPending: number; currentStagePending: number; projects: number }>;
    byOffice: Array<{ key: string; role: string; openCasesPending: number; projects: number }>;
  };
  trend: Array<{ month: string; predicted: number; observed: number | null; cases: number }>;
  topProjects: Array<{ id: string; name: string; state: string; district: string; type: ProjectType; stage: StageName; stageStatus: StageStatus; riskScore: number; riskBand: RiskLevel; predictedDelayDays: number | null; topAction: string | null }>;
}

/* -------------------------------------------------------------- scenario */

export interface ScenarioContext {
  state: string;
  district: string;
  subDistrict?: string | null;
  projectType: ProjectType;
  subtype?: string;
  primaryAuthority?: string;
  stage: StageName;
  affectedFamilies?: number;
  flags?: { forestLand?: boolean; crossesRailway?: boolean; crossesHighway?: boolean; consolidationOpen?: boolean };
}

export interface ScenarioOptions {
  states: string[];
  projectTypes: Array<{ name: ProjectType; subtypes: string[]; linear: boolean }>;
  stages: StageName[];
  corpusStates: string[];
  districts?: Array<{ district: string; subDistricts: string[]; inCorpus: boolean }>;
  authorityOptions?: string[];
}

export interface ScenarioNode extends DependencyNode {
  relevantToStage: boolean;
  pending: boolean;
  influence: { presenceLogOdds: number; pendingLogOdds: number; pointsIfPending: number; currentPoints: number };
  explanation: string;
}

export interface ScenarioResponse {
  context: ScenarioContext & { districtRate: number; districtRateBasis: string; authorityRate: number; authorityRateBasis: string; centroid: [number, number] };
  framework: Framework;
  stateProfile: DependencyNetwork['stateProfile'];
  authorityOptions: string[];
  dependencies: { count: number; pendingCount: number; relevantCount: number; coordinationScore: number; nodes: ScenarioNode[]; ignoredPending: string[]; note: string };
  milestone: string;
  record: Record<string, string | number>;
  result: PredictionResult;
  baseline: PredictionResult | null;
  delta: { probability: number; riskScore: number; predictedDelayDays: number; dependencyCount: number; addedDependencies: string[]; removedDependencies: string[] } | null;
  recommendations: Recommendation[];
  issues: IssueProfile;
  seedProject: { id: string; name: string; riskScore: number; riskBasis: RiskBasis } | null;
}

/* ------------------------------------------------------ portfolio & model */

export interface StageSummary {
  stage: StageName;
  milestone: string;
  cases: number;
  openCases: number;
  riskScore: number;
  riskBand: RiskLevel;
  mix: Record<RiskLevel, number>;
  observedCases: number;
  observedDelayRate: number;
  medianStageDays: number;
  avgObservedDelayDays: number;
}

export interface StateSummary {
  state: string;
  projects: number;
  cases: number;
  openCases: number;
  riskScore: number;
  riskBand: RiskLevel;
  mix: Record<RiskLevel, number>;
  highRiskCases: number;
  areaHa: number;
  observedDelayRate: number;
}

export interface DistrictSummary {
  key: string;
  state: string;
  district: string;
  cases: number;
  openCases: number;
  riskScore: number;
  band: [number, number, number, number];
  observedDelayRate: number;
  historicalDelayRate?: number;
  areaHa: number;
  legalDisputes: number;
  lat: number;
  lon: number;
}

export interface ModelSnapshot {
  deployed: string;
  operatingThreshold: number;
  riskBands: { medium: number; high: number; critical: number };
  test: ModelScore;
  validation: ModelScore;
  baseline: ModelScore;
  comparison: ModelScore | null;
  split: {
    strategy: string;
    observedRows: number;
    openRows: number;
    train: SplitWindow;
    validation: SplitWindow;
    test: SplitWindow;
  };
  shap: { available: boolean; rows?: number; topK?: number; baseValue?: number; unit?: string };
  slipModel?: {
    label: string;
    trainRows: number;
    testRows: number;
    conditionalTestMae: number;
    conditionalBaselineMae: number;
    meanExpectedSlipOpen: number | null;
    caveat: string;
    surrogateConditionalTestMae?: number;
  } | null;
  surrogateFidelity: {
    logOddsR2: number;
    spearman: number;
    meanAbsProbDiff: number;
    bandAgreement: number;
    rocAuc: number;
  };
  leakageControls: string[];
  features: number;
}

export interface SplitWindow {
  rows: number;
  from: string;
  to: string;
}

export interface ModelScore {
  model?: string;
  rocAuc: number;
  prAuc: number;
  brier: number;
  positiveRate: number;
  at_threshold: ThresholdScore;
  at_half: ThresholdScore;
}

export interface ThresholdScore {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  confusion: { tn: number; fp: number; fn: number; tp: number };
}

export interface PortfolioSummary {
  today: string;
  dataMode: string;
  totals: {
    projects: number;
    cases: number;
    openCases: number;
    observedCases: number;
    parcelAreaHa: number;
    landRequirementHa: number;
    affectedFamilies: number;
    completedProjects: number;
    activeProjects: number;
    highRiskCases: number;
    criticalCases: number;
    states: number;
    districts: number;
    legalDisputeCases: number;
    delayedMilestones: number;
    upcomingMilestones: number;
    budgetCr: number;
    blockedProjects?: number;
    residualBacklogCases?: number;
  };
  riskDistribution: Record<RiskLevel, number>;
  projectRiskDistribution: Record<RiskLevel, number>;
  contributors: Array<{ group: string; value: number; share: number }>;
  stages: StageSummary[];
  states: StateSummary[];
  scoreHistogram: number[];
  qualityHistogram: number[];
  months: Array<{
    month: string;
    cases: number;
    observed: number;
    observedDelayRate: number | null;
    meanPredicted: number;
    avgDelayDays: number | null;
  }>;
  model: ModelSnapshot;
  dataQuality: {
    meanScore: number;
    missingByField: Record<string, number>;
    missingRates: Record<string, number>;
    totalMissingCells: number;
    auditedFields: number;
    columns: number;
  };
  dependencyBottlenecks?: Array<{ code: string; openCasesPending: number }>;
  store?: { rows: number; bytes: number; loadMs: number };
}

export interface Facets {
  states: string[];
  projectTypes: ProjectType[];
  sectors: Array<{ id: string; label: string; projectTypes: ProjectType[] }>;
  subtypes: Record<string, string[]>;
  authorities: string[];
  priorities: string[];
  stages: StageName[];
  riskBands: RiskLevel[];
  ownership: OwnershipComplexity[];
  compensationStatuses: CompensationStatus[];
  landTypes: string[];
  districts: Array<{ state: string; district: string; key: string }>;
  stageStatuses: StageStatus[];
  milestoneStatuses: StageStatus[];
  interventionStatuses: InterventionStatus[];
  alertStatuses: AlertStatus[];
  categories: string[];
  documentTypes: string[];
  roles: Array<{ id: RoleId; label: string }>;
  today: string;
}

export interface MapPoint {
  r: number;
  id: string;
  lat: number;
  lon: number;
  b: number;
  s: number;
  st: number;
  p: string;
}

export interface BreakdownRow {
  key: string;
  cases: number;
  riskScore: number;
  riskMix: Record<RiskLevel, number>;
  highRisk: number;
  areaHa: number;
  observedDelayRate: number | null;
  avgDelayDays: number | null;
}

export interface PredictionSpec {
  numeric: Array<{
    field: string;
    label: string;
    group: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    default: number;
  }>;
  categorical: Array<{ field: string; label: string; options: string[]; default: string }>;
  binary: Array<{ field: string; label: string; default: number }>;
  riskBands: { medium: number; high: number; critical: number };
  fidelity: ModelSnapshot['surrogateFidelity'];
  note: string;
  defaults: Record<string, string | number>;
}

export interface PredictionResult {
  probability: number;
  riskScore: number;
  riskBand: RiskLevel;
  logOdds: number;
  predictedDelayDays: number | null;
  conditionalDelayDays: number | null;
  increasing: Array<{ group: string; value: number; share: number }>;
  reducing: Array<{ group: string; value: number }>;
  features: Array<{
    feature: string;
    label: string;
    group: string;
    value: number;
    contribution: number;
    imputed: boolean;
  }>;
  imputedFields: number;
  scorer: string;
  fidelity: ModelSnapshot['surrogateFidelity'];
}

export interface PredictResponse {
  record: Record<string, string | number>;
  result: PredictionResult;
  baseline: PredictionResult | null;
  delta: { probability: number; riskScore: number } | null;
}

export interface ExportManifest {
  files: Array<{
    name: string;
    label: string;
    href: string;
    available: boolean;
    bytes: number;
    generatedAt: string | null;
  }>;
}

export interface GeoFeature {
  type: 'Feature';
  properties: { state: string; district?: string; key?: string; lgd?: number | null; name?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

export interface GeoCollection {
  type: 'FeatureCollection';
  attribution: { source: string; depiction: string; processing: string; note: string };
  features: GeoFeature[];
}

export interface ValidationReport {
  ranAt: string;
  passed: number;
  failed: number;
  checks: Array<{ id: string; label: string; passed: boolean; failures: number; examples: string[]; detail: string }>;
}

export interface UploadResult {
  ok: boolean;
  committed: boolean;
  fileErrors: string[];
  warnings: string[];
  columns: string[];
  required: string[];
  summary?: { rows: number; valid: number; invalid: number };
  rows: Array<{ row: number; name: string; valid: boolean; errors: Array<{ column: string | null; message: string }> }>;
  created: Array<{ id: string; name: string; riskScore: number; riskBand: RiskLevel }>;
  fieldGuide?: Array<{ column: string; label: string; required: boolean; type: string; options: string[] | null }>;
}

export interface RetrainStatus {
  job: {
    id: string | null;
    status: 'idle' | 'running' | 'succeeded' | 'failed';
    steps: Array<{ name: string; status: string }>;
    log: string[];
    startedAt: string | null;
    finishedAt: string | null;
    startedBy: { id: string; name: string } | null;
    error: string | null;
  };
  environment: { ok: boolean; detail: string };
  model: string | null;
}

export interface RegistryOverview {
  note: string;
  frameworks: Array<Framework & { disputeForum: string; milestones: Record<StageName, string> }>;
  projectTypes: Array<{ name: ProjectType; subtypes: string[]; linear: boolean; central: string | null }>;
  dependencies: Record<string, { label: string; category: string; stages: StageName[]; gate: boolean; pendingAction: string }>;
  profiledStates: string[];
  statesAndUts: Array<{ name: string; code: string; type: string; profiled: boolean }>;
  dependencyMatrix: Array<{ projectType: ProjectType; sector: string; dependencies: Array<{ code: string; label: string; applicability: 'always' | 'conditional' | 'never'; when: string[] }> }>;
  issueMatrix: Array<{ projectType: ProjectType; sector: string; typicalDependencies: string | null; issues: Array<{ id: string; label: string; exposure: 'core' | 'possible' | 'never' }> }>;
  issues: Array<{ id: string; label: string; group: string; description: string; owners: string[]; conditional: boolean }>;
  sectors: Sector[];
  lifecycleRules: Record<string, number>;
  ruleThresholds: Record<string, number>;
}


/* ------------------------------------------------ administrative hierarchy */

export type AuthorityTier = 'national' | 'region' | 'state' | 'division' | 'district';

export type AdminLevelId = 'country' | 'ministry' | 'organisation' | 'region' | 'state' | 'department' | 'division' | 'district' | 'project';

export type OrganisationKind = 'government' | 'coordinating_authority' | 'ministry' | 'central_organisation' | 'state_government' | 'state_department' | 'state_agency';

export interface Sector {
  id: string;
  label: string;
  ministryId: string;
  ministry?: string | null;
  projectTypes: ProjectType[];
}

export interface OrganisationSummary {
  id: string;
  name: string;
  short: string;
  kind: OrganisationKind;
  kindLabel: string;
  parentId: string | null;
  template: string;
  state: string | null;
  sector: string | null;
  lens: 'sector' | 'oversight';
  regions: { provider: string; label: string; basis: string } | null;
  portfolio: string;
  illustrative: boolean;
  description: string | null;
}

export interface HierarchyConfig {
  levels: Array<{ id: AdminLevelId; label: string; geographic: boolean; optional?: boolean }>;
  templates: Array<{ id: string; label: string; levels: AdminLevelId[] }>;
  tiers: Array<{ id: AuthorityTier; label: string; description: string }>;
  sectors: Sector[];
  states: Array<{ id: string; label: string; code: string; type: string; zonalCouncil: string; officialName: string; government: string; profile: 'configured' | 'generic'; divisions: number; lgdCode: string | null }>;
  organisations: OrganisationSummary[];
  note: string;
}

export interface PositionChainRow {
  level: AdminLevelId;
  label: string;
  value: string;
  orgId?: string;
  all?: boolean;
  fixed?: boolean;
  code?: string | null;
}

export interface Position {
  organisation: { id: string; name: string; short: string; kind: OrganisationKind; kindLabel: string; illustrative: boolean; description: string | null; lens: 'sector' | 'oversight' };
  lineage: Array<{ id: string; name: string; short: string; kind: OrganisationKind }>;
  template: { id: string; label: string; levels: AdminLevelId[] };
  governmentLevel: 'central' | 'state';
  tier: AuthorityTier;
  tierLabel: string;
  units: { region: string | null; state: string | null; division: string | null; district: string | null };
  chain: PositionChainRow[];
  scope: { states: string[] | null; districtKeys: string[] | null };
  portfolio: { restricted: boolean; label: string };
  place: string;
  label: string;
}

export interface HierarchyOption {
  id: string;
  label: string;
  detail?: string;
  code?: string;
  type?: string;
  projects: number;
}

export interface HierarchyOptionsResponse {
  organisation: Position['organisation'];
  levels: AdminLevelId[];
  options: Partial<Record<'region' | 'state' | 'division' | 'district', HierarchyOption[]>>;
  projectsInPosition: number;
  position: Position;
  roles: Array<{ id: RoleId; label: string; summary: string; permissions: number }>;
}

export interface PortfolioStats {
  projects: number;
  active: number;
  delayed: number;
  blocked: number;
  highRisk: number;
  critical: number;
  avgRisk: number | null;
  openCases: number;
  affectedFamilies: number;
  landRequirementHa: number;
  topDriver: { group: string; projects: number } | null;
}

export interface PositionPortfolio {
  totals: PortfolioStats;
  bySector: Array<PortfolioStats & { key: string; label: string }>;
  byState: Array<PortfolioStats & { key: string; label: string }>;
  byStage: Array<PortfolioStats & { key: string; label: string }>;
}

export interface PortfolioNode {
  id: string;
  label: string;
  detail: string | null;
  stats: PortfolioStats;
  query?: Record<string, string>;
  onboarded?: boolean;
  projectTypes?: ProjectType[];
  projectId?: string;
  riskScore?: number;
  riskBand?: RiskLevel;
  stage?: StageName;
  stageStatus?: StageStatus;
  predictedDelayDays?: number | null;
  topDriver?: string | null;
  source?: string;
  description?: string | null;
}

export interface PortfolioDrilldown {
  level: 'sector' | 'state' | 'district' | 'project';
  path: Array<{ level: string; label: string; query: Record<string, string> }>;
  totals: PortfolioStats;
  riskMix: Array<{ band: RiskLevel; projects: number }>;
  children: PortfolioNode[];
  oversight: PortfolioNode[];
  note: string | null;
  scope: { projectsInScope: number };
  engine: string;
  dataMode: string;
}

/* ----------------------------------------------------------------- issues */

export type IssueStatus = 'active' | 'watch' | 'clear' | 'not_captured';

export interface IssueItem {
  id: string;
  label: string;
  group: string;
  description: string;
  core: boolean;
  status: IssueStatus;
  statusLabel: string;
  evidence: string[];
  owners: Array<{ code: string; name: string; pending: boolean }>;
}

export interface IssueProfile {
  projectType: ProjectType;
  typicalDependencies: string | null;
  summary: { active: number; watch: number; clear: number; notCaptured: number; excluded: number };
  issues: IssueItem[];
  excluded: Array<{ id: string; label: string; reason: string }>;
  basis: string;
}

/* ------------------------------------------------------------ integration */

export type DataMode = 'synthetic' | 'user' | 'model' | 'integration' | 'official';

export interface Provenance {
  kind: string;
  adapter: string;
  mode: DataMode;
  label: string;
  source: string;
  retrievedAt: string;
}

export interface Envelope<T> {
  data: T | null;
  provenance: Provenance | null;
  error?: string;
}

export interface IntegrationStatus {
  architecture: string[];
  connectedOfficialSources: number;
  providers: Array<{
    kind: string;
    label: string;
    description: string;
    methods: Array<{ name: string; input: string; returns: string }>;
    adapter: { id: string; label: string; mode: DataMode; modeLabel: string };
    registeredAdapters: string[];
    envVariable: string;
    connected: boolean;
    futureSources: string[];
  }>;
  dataModes: Array<{ id: DataMode; label: string; description: string }>;
  statement: string;
}

export interface ParcelDataView {
  caseId: string;
  sections: {
    landRecords: Envelope<Record<string, string | number | null>>;
    registration: Envelope<Record<string, unknown>>;
    courtCases: Envelope<Record<string, string | number | boolean | null>>;
    compensation: Envelope<Record<string, string | number | null>>;
    gis: Envelope<{ point: [number, number]; boundaryKey: string; geometry: string }>;
  };
}
