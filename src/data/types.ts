/**
 * Domain model.
 *
 * These shapes mirror what the API serves (see server/index.mjs). The platform
 * has two levels: acquisition *cases* (one land parcel under acquisition) and the
 * *projects* they roll up into. Both carry a model-predicted delay risk for their
 * next statutory milestone.
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

export type StageStatus = 'Completed' | 'In Progress' | 'Delayed' | 'Pending';

export type ProjectType =
  | 'Expressway'
  | 'National Highway'
  | 'Railway Corridor'
  | 'Metro Rail'
  | 'Industrial Corridor'
  | 'Irrigation'
  | 'Power Transmission'
  | 'Airport';

export type OwnershipComplexity = 'Single' | 'Joint' | 'Fragmented' | 'Disputed';
export type CompensationStatus = 'Not Initiated' | 'Assessed' | 'Awarded' | 'Partially Paid' | 'Paid';
export type PossessionStatus = 'Not Initiated' | 'Notice Issued' | 'Partial' | 'Complete';
export type RRStatus = 'Not Applicable' | 'Not Started' | 'In Progress' | 'Complete';

/** One stage of a project's nine-stage acquisition lifecycle. */
export interface ProjectStage {
  name: StageName;
  index: number;
  status: StageStatus;
  plannedStart: string;
  /** Deadline under the original sanctioned schedule. */
  baselineCompletion: string;
  /** Deadline under the working schedule, carrying forward realised slip. */
  expectedCompletion: string;
  actualStart: string | null;
  actualCompletion: string | null;
  slipDays: number;
  plannedDays: number;
  daysElapsed: number;
  daysRemaining: number;
  openCases: number;
  totalCases: number;
  milestone: string;
}

/** Model risk attached to one stage of one project. */
export interface StageRisk {
  stage: StageName;
  index: number;
  openCases: number;
  riskScore: number | null;
  band: RiskLevel | null;
  mix: [number, number, number, number];
  basis: 'model' | 'observed' | 'no-open-cases';
}

export interface Contributor {
  group: string;
  value: number;
  share: number;
  features?: string[];
  direction?: 'increases' | 'reduces';
  label?: string;
}

export interface Intervention {
  action: string;
  owner: string;
  detail?: string;
}

/** Summary row used by the project registry. */
export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  state: string;
  districts: string[];
  authority: string;
  priority: 'Routine' | 'Important' | 'Critical';
  currentStage: StageName;
  currentStageIndex: number;
  currentMilestone: string;
  milestoneDeadline: string;
  milestoneStatus: StageStatus;
  daysRemaining: number;
  progressPct: number;
  totalParcels: number;
  openCases: number;
  highRiskCases: number;
  criticalCases: number;
  landRequirementHa: number;
  affectedFamilies: number;
  compensationStatus: CompensationStatus;
  compensationCompletionPct: number;
  possessionStatus: PossessionStatus;
  rrStatus: RRStatus;
  legalCases: number;
  dominantOwnership: OwnershipComplexity;
  stakeholderResponsiveness: 'Low' | 'Moderate' | 'High';
  riskScore: number;
  riskBand: RiskLevel;
  delayProbability: number;
  riskBasis: 'next-milestone' | 'open-book-mean';
  dataQuality: number;
  topContributor: string | null;
  budgetCr: number;
  startDate: string;
  targetCompletionDate: string;
}

/** Everything the project intelligence screen needs. */
export interface ProjectFull extends ProjectSummary {
  zone: string;
  stateCode: string;
  stages: ProjectStage[];
  stageRisk: StageRisk[];
  contributors: Contributor[];
  riskHistory: number[];
  riskMix: Record<RiskLevel, number>;
  observedCases: number;
  observedDelayRate: number;
  openAreaHa: number;
  parcelAreaHa: number;
  landAcquiredHa: number;
  rrRequiredParcels: number;
  rrCases: number;
  rrProgressPct: number;
  legalDisputeParcels: number;
  avgInactivityDays: number;
  avgDocumentCompleteness: number;
  districtDelayRate: number;
  authorityDelayRate: number;
  currentStageRisk: number | null;
  currentStageBand: RiskLevel | null;
  lat: number;
  lon: number;
  intervention: Intervention;
}

export interface ProjectDetailResponse {
  project: ProjectFull;
  topCases: AcquisitionCase[];
  intervention: Intervention;
  contributors: Contributor[];
  stageRisk: StageRisk[];
  riskHistory: Array<{ month: string; riskScore: number }>;
}

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
  labelObserved: boolean;
  outcome: 'Delayed' | 'On time' | 'Pending';
}

/** Full case record. */
export interface AcquisitionCase extends CaseRow {
  parcelId: string;
  projectType: ProjectType;
  authority: string;
  priority: string;
  tehsil: string;
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
  authorityDelayRate: number;
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
  };
  queryMs: number;
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
    delayedMilestones: number;
    riskMix: Record<RiskLevel, number>;
  };
}

/** One row of the intervention queue: a project-stage cell. */
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
  store?: { rows: number; bytes: number; loadMs: number };
}

export interface Facets {
  states: string[];
  projectTypes: ProjectType[];
  authorities: string[];
  priorities: string[];
  stages: StageName[];
  riskBands: RiskLevel[];
  ownership: OwnershipComplexity[];
  compensationStatuses: CompensationStatus[];
  landTypes: string[];
  districts: Array<{ state: string; district: string; key: string }>;
  milestoneStatuses: StageStatus[];
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
  intervention: Intervention;
}

export interface CaseDetailResponse {
  case: AcquisitionCase;
  project: ProjectFull;
  intervention: Intervention;
  explanation: { basis: string; unit: string; baseValue: number | null; caveat: string };
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
