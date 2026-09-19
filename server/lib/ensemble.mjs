/**
 * Deployed ensemble, evaluated in Node.
 *
 * ml/train.py exports the promoted HistGradientBoosting classifier and slip
 * regressor as plain trees (data/model/ensemble.json) and checks the export
 * against scikit-learn to 1e-6 before publishing. Scoring here therefore gives
 * the same probability the corpus scores were produced with, for any record —
 * a scenario, an edited project, a project added by form or CSV, or data
 * arriving through the integration API — without Python at serve time.
 *
 * Explanations use exact TreeSHAP (Lundberg et al., path-dependent algorithm,
 * node covers from training), so a new record gets the same kind of
 * explanation as a stored corpus case: per-feature log-odds contributions that
 * sum, with the base value, to the model's log-odds.
 */

import { riskScoreOf } from '../domain/risk.mjs';

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const isMissing = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/* ----------------------------------------------------------- preparation */

function prepareTree(t) {
  const n = t.f.length;
  const tree = {
    feature: Int32Array.from(t.f),
    threshold: Float64Array.from(t.t),
    missingLeft: Uint8Array.from(t.m),
    left: Int32Array.from(t.l),
    right: Int32Array.from(t.r),
    leaf: Uint8Array.from(t.leaf),
    value: Float64Array.from(t.v),
    cover: Float64Array.from(t.c),
    depth: 0,
    expected: 0,
  };
  // Depth and cover-weighted expected value (the tree's contribution to the SHAP base value).
  const stack = [[0, 0]];
  while (stack.length) {
    const [i, d] = stack.pop();
    if (d > tree.depth) tree.depth = d;
    if (tree.leaf[i]) {
      tree.expected += (tree.value[i] * tree.cover[i]) / (tree.cover[0] || 1);
    } else {
      stack.push([tree.left[i], d + 1], [tree.right[i], d + 1]);
    }
  }
  void n;
  return tree;
}

export function prepareEnsemble(raw) {
  if (!raw?.classifier?.trees) return null;
  const prep = (m) => {
    const trees = m.trees.map(prepareTree);
    return {
      baseline: m.baseline,
      trees,
      maxDepth: trees.reduce((a, t) => Math.max(a, t.depth), 0),
      expectedRaw: m.baseline + trees.reduce((a, t) => a + t.expected, 0),
      floor: m.floor,
      cap: m.cap,
    };
  };
  const features = raw.features;
  return {
    version: raw.version,
    features,
    categories: raw.categories,
    operatingThreshold: raw.operatingThreshold,
    riskBands: raw.riskBands,
    projectRiskBands: raw.projectRiskBands,
    delayThresholdDays: raw.delayThresholdDays ?? 30,
    classifier: prep(raw.classifier),
    slip: raw.slip ? prep(raw.slip) : null,
    exportParity: raw.exportParity ?? null,
    shapBaseValue: raw.shapBaseValue ?? null,
  };
}

/* --------------------------------------------------------- feature vector */

/** Mirrors matrix_from_spec in ml/train.py; the two must change together. */
export function featureVector(ensemble, record) {
  const spec = ensemble.features;
  const x = new Float64Array(spec.length);
  const numOf = (key) => (isMissing(record[key]) ? NaN : Number(record[key]));
  for (let j = 0; j < spec.length; j++) {
    const s = spec[j];
    let v;
    switch (s.op) {
      case 'identity':
        v = numOf(s.source);
        break;
      case 'log1p': {
        const n = numOf(s.source);
        v = Number.isNaN(n) ? NaN : Math.log1p(Math.max(0, n));
        break;
      }
      case 'ratio': {
        const a = numOf(s.source);
        const b = numOf(s.source2);
        v = Number.isNaN(a) || Number.isNaN(b) ? NaN : a / Math.max(1, b);
        break;
      }
      case 'pct_gap': {
        let n = numOf(s.source);
        if (Number.isNaN(n) && s.fill !== undefined) n = s.fill;
        v = Number.isNaN(n) ? NaN : (100 - n) / 100;
        break;
      }
      case 'rr_pending': {
        const req = numOf(s.source2);
        if (!(req > 0)) v = 0;
        else {
          let n = numOf(s.source);
          if (Number.isNaN(n)) n = 50;
          v = (100 - n) / 100;
        }
        break;
      }
      case 'binary': {
        const n = numOf(s.source);
        v = Number.isNaN(n) ? 0 : n;
        break;
      }
      case 'onehot':
        v = String(isMissing(record[s.source]) ? '(missing)' : record[s.source]) === s.category ? 1 : 0;
        break;
      default:
        v = NaN;
    }
    x[j] = v;
  }
  return x;
}

/* ---------------------------------------------------------------- scoring */

function treeLeaf(tree, x) {
  let i = 0;
  while (!tree.leaf[i]) {
    const v = x[tree.feature[i]];
    const goLeft = Number.isNaN(v) ? tree.missingLeft[i] === 1 : v <= tree.threshold[i];
    i = goLeft ? tree.left[i] : tree.right[i];
  }
  return i;
}

export function predictRaw(model, x) {
  let z = model.baseline;
  for (const t of model.trees) z += t.value[treeLeaf(t, x)];
  return z;
}

/* --------------------------------------------------------------- TreeSHAP */

/**
 * Exact path-dependent TreeSHAP for one tree, accumulated into phi.
 * A direct port of the reference implementation (shap/cext/tree_shap.h:
 * extend_path, unwind_path, unwound_path_sum, tree_shap_recursive).
 */
function makePathBuffer(maxDepth) {
  const size = ((maxDepth + 2) * (maxDepth + 3)) / 2 + 4;
  return { f: new Int32Array(size), z: new Float64Array(size), o: new Float64Array(size), w: new Float64Array(size) };
}

function extendPath(P, off, depth, zero, one, feature) {
  P.f[off + depth] = feature;
  P.z[off + depth] = zero;
  P.o[off + depth] = one;
  P.w[off + depth] = depth === 0 ? 1 : 0;
  for (let i = depth - 1; i >= 0; i--) {
    P.w[off + i + 1] += (one * P.w[off + i] * (i + 1)) / (depth + 1);
    P.w[off + i] = (zero * P.w[off + i] * (depth - i)) / (depth + 1);
  }
}

function unwindPath(P, off, depth, index) {
  const one = P.o[off + index];
  const zero = P.z[off + index];
  let next = P.w[off + depth];
  for (let i = depth - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = P.w[off + i];
      P.w[off + i] = (next * (depth + 1)) / ((i + 1) * one);
      next = tmp - (P.w[off + i] * zero * (depth - i)) / (depth + 1);
    } else {
      P.w[off + i] = (P.w[off + i] * (depth + 1)) / (zero * (depth - i));
    }
  }
  for (let i = index; i < depth; i++) {
    P.f[off + i] = P.f[off + i + 1];
    P.z[off + i] = P.z[off + i + 1];
    P.o[off + i] = P.o[off + i + 1];
  }
}

function unwoundPathSum(P, off, depth, index) {
  const one = P.o[off + index];
  const zero = P.z[off + index];
  let next = P.w[off + depth];
  let total = 0;
  for (let i = depth - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = (next * (depth + 1)) / ((i + 1) * one);
      total += tmp;
      next = P.w[off + i] - tmp * zero * ((depth - i) / (depth + 1));
    } else if (zero !== 0) {
      total += P.w[off + i] / zero / ((depth - i) / (depth + 1));
    }
  }
  return total;
}

function treeShapRecursive(tree, x, phi, P, node, depth, parentOff, parentZero, parentOne, parentFeature) {
  const off = parentOff + depth + 1;
  for (let k = 0; k <= depth; k++) {
    P.f[off + k] = P.f[parentOff + k];
    P.z[off + k] = P.z[parentOff + k];
    P.o[off + k] = P.o[parentOff + k];
    P.w[off + k] = P.w[parentOff + k];
  }
  extendPath(P, off, depth, parentZero, parentOne, parentFeature);

  if (tree.leaf[node]) {
    for (let i = 1; i <= depth; i++) {
      const w = unwoundPathSum(P, off, depth, i);
      phi[P.f[off + i]] += w * (P.o[off + i] - P.z[off + i]) * tree.value[node];
    }
    return;
  }

  const split = tree.feature[node];
  const v = x[split];
  const goLeft = Number.isNaN(v) ? tree.missingLeft[node] === 1 : v <= tree.threshold[node];
  const hot = goLeft ? tree.left[node] : tree.right[node];
  const cold = goLeft ? tree.right[node] : tree.left[node];
  const cover = tree.cover[node] || 1;
  const hotZero = tree.cover[hot] / cover;
  const coldZero = tree.cover[cold] / cover;
  let inZero = 1;
  let inOne = 1;

  let pathIndex = 0;
  for (; pathIndex <= depth; pathIndex++) if (P.f[off + pathIndex] === split) break;
  let d = depth;
  if (pathIndex !== depth + 1) {
    inZero = P.z[off + pathIndex];
    inOne = P.o[off + pathIndex];
    unwindPath(P, off, d, pathIndex);
    d -= 1;
  }
  treeShapRecursive(tree, x, phi, P, hot, d + 1, off, hotZero * inZero, inOne, split);
  treeShapRecursive(tree, x, phi, P, cold, d + 1, off, coldZero * inZero, 0, split);
}

export function treeShap(model, x) {
  const phi = new Float64Array(x.length);
  // Nested path copies: the path at recursion depth d starts at offset sum(1..d).
  const P = model.pathBuffer ?? (model.pathBuffer = makePathBuffer(model.maxDepth + 2));
  for (const t of model.trees) treeShapRecursive(t, x, phi, P, 0, 0, 0, 1, 1, -1);
  return { phi, base: model.expectedRaw };
}

/* ------------------------------------------------------------ public API */

export const bandOf = (p, bands) => (p >= bands.critical ? 'Critical' : p >= bands.high ? 'High' : p >= bands.medium ? 'Medium' : 'Low');

/**
 * Score one record with the deployed ensemble.
 * @param ensemble  prepared ensemble (prepareEnsemble)
 * @param record    keyed by corpus column name
 * @param opts.explain  compute TreeSHAP contributions (default true)
 */
export function scoreWithEnsemble(ensemble, record, { explain = true, bands } = {}) {
  const x = featureVector(ensemble, record);
  const z = predictRaw(ensemble.classifier, x);
  const probability = sigmoid(z);
  let conditional = null;
  if (ensemble.slip) {
    conditional = Math.min(ensemble.slip.cap ?? 400, Math.max(ensemble.slip.floor ?? 31, predictRaw(ensemble.slip, x)));
  }
  const cut = bands ?? ensemble.riskBands;
  const out = {
    probability: Number(probability.toFixed(4)),
    riskScore: riskScoreOf(probability),
    riskBand: bandOf(probability, cut),
    logOdds: Number(z.toFixed(4)),
    predictedDelayDays: conditional === null ? null : Math.round(probability * conditional),
    conditionalDelayDays: conditional === null ? null : Math.round(conditional),
    scorer: `deployed gradient-boosted ensemble ${ensemble.version}`,
    modelVersion: ensemble.version,
  };
  if (!explain) return out;

  const { phi, base } = treeShap(ensemble.classifier, x);
  const groups = new Map();
  const detail = [];
  let imputed = 0;
  for (let j = 0; j < phi.length; j++) {
    const s = ensemble.features[j];
    if (Number.isNaN(x[j])) imputed++;
    if (Math.abs(phi[j]) < 1e-9) continue;
    const group = s.group ?? 'Other';
    groups.set(group, (groups.get(group) ?? 0) + phi[j]);
    detail.push({
      feature: s.name,
      label: s.label ?? s.name,
      group,
      value: Number.isNaN(x[j]) ? null : Number(x[j].toFixed(4)),
      contribution: Number(phi[j].toFixed(4)),
      imputed: Number.isNaN(x[j]),
    });
  }
  const positive = Array.from(groups.entries()).filter(([, v]) => v > 0);
  const negative = Array.from(groups.entries()).filter(([, v]) => v < 0);
  const positiveMass = positive.reduce((s, [, v]) => s + v, 0) || 1;
  return {
    ...out,
    baseValue: Number(base.toFixed(4)),
    increasing: positive.sort((a, b) => b[1] - a[1]).map(([group, value]) => ({ group, value: Number(value.toFixed(4)), share: Number((value / positiveMass).toFixed(4)) })),
    reducing: negative.sort((a, b) => a[1] - b[1]).map(([group, value]) => ({ group, value: Number(value.toFixed(4)) })),
    features: detail.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 18),
    imputedFields: imputed,
    explanation: 'exact TreeSHAP on the deployed ensemble (log-odds)',
  };
}
