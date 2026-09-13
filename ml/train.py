"""
Delay-risk model pipeline for LandPulse AI.

Reads the synthetic acquisition corpus, trains a baseline and a main model with a
time-aware split, evaluates both, computes explanations and writes every
artefact the application serves.

    python ml/train.py [--csv data/land_acquisition_synthetic_350k.csv]
                       [--sample 0]        # train on a row subsample (debugging)
                       [--no-rf]          # skip the random-forest comparison
                       [--shap-rows 0]    # 0 = all rows

Outputs (data/model/):
    metrics.json        split sizes, per-model metrics, curves, calibration
    importance.json     permutation + mean |SHAP| global importance
    surrogate.json      linear surrogate for interactive, in-browser scoring
    scores.f32          predicted probability per corpus row, in CSV row order
    shap_top.bin        top-K SHAP contributors per row (feature id + value)
    feature-spec.json   the feature contract shared with the front end

Nothing in here is trained on real acquisition records; see the prototype data
notice in README.md.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    mean_absolute_error,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    precision_recall_curve,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "model"

DELAY_THRESHOLD_DAYS = 30
TOP_K_SHAP = 6

# Calibrated-probability cut-offs for the four risk bands. Chosen from the score
# distribution so the Critical band stays a reviewable share of the portfolio
# (~10%) rather than an alarm that fires on everything.
RISK_BAND_THRESHOLDS = {"medium": 0.30, "high": 0.55, "critical": 0.78}

# ----------------------------------------------------------------- features

NUMERIC = [
    "land_area_ha",
    "expected_stage_days",
    "elapsed_stage_days",
    "affected_families",
    "number_of_owners",
    "compensation_pending_days",
    "compensation_completion_percentage",
    "legal_case_count",
    "rr_progress_percentage",
    "rehabilitation_cases",
    "department_response_days",
    "document_completeness",
    "inactivity_days",
    "historical_stage_delay_rate",
    "district_historical_delay_rate",
    "authority_historical_delay_rate",
    "authority_dependency_count",
    "pending_dependency_actions",
    "approval_delay_days",
    "department_coordination_score",
    "project_land_requirement_ha",
    "latitude",
    "longitude",
]

LOG_NUMERIC = ["inactivity_days", "affected_families", "number_of_owners", "compensation_pending_days", "land_area_ha", "approval_delay_days"]

CATEGORICAL = [
    "state",
    "project_type",
    "authority",
    "project_priority",
    "land_type",
    "current_stage",
    "ownership_complexity",
    "compensation_status",
    "dispute_complexity",
    "stakeholder_responsiveness",
    "verification_status",
    "approval_status",
    "possession_status",
    "rr_status",
]

BINARY = ["legal_dispute", "rr_required"]

# Display grouping used by the explanation panels in the UI.
GROUP = {
    "compensation_completion_percentage": "Compensation",
    "compensation_pending_days": "Compensation",
    "compensation_status": "Compensation",
    "comp_pending_frac": "Compensation",
    "legal_case_count": "Legal disputes",
    "legal_dispute": "Legal disputes",
    "dispute_complexity": "Legal disputes",
    "ownership_complexity": "Ownership complexity",
    "number_of_owners": "Ownership complexity",
    "document_completeness": "Documentation & verification",
    "doc_gap_frac": "Documentation & verification",
    "verification_status": "Documentation & verification",
    "approval_status": "Documentation & verification",
    "inactivity_days": "Inactivity",
    "elapsed_stage_days": "Stage schedule pressure",
    "expected_stage_days": "Stage schedule pressure",
    "schedule_consumed": "Stage schedule pressure",
    "current_stage": "Stage schedule pressure",
    "historical_stage_delay_rate": "Historical stage performance",
    "district_historical_delay_rate": "District performance history",
    "authority_historical_delay_rate": "Authority performance history",
    "stakeholder_responsiveness": "Stakeholder responsiveness",
    "department_response_days": "Administrative response time",
    "rr_progress_percentage": "Rehabilitation & resettlement",
    "rr_required": "Rehabilitation & resettlement",
    "rehabilitation_cases": "Rehabilitation & resettlement",
    "rr_status": "Rehabilitation & resettlement",
    "rr_pending_frac": "Rehabilitation & resettlement",
    "affected_families": "Affected families",
    "authority_dependency_count": "Authority dependencies",
    "pending_dependency_actions": "Pending department actions",
    "approval_delay_days": "Approval delay",
    "department_coordination_score": "Inter-department coordination",
    "possession_status": "Possession",
    "land_area_ha": "Parcel & project attributes",
    "land_type": "Parcel & project attributes",
    "project_land_requirement_ha": "Parcel & project attributes",
    "project_type": "Parcel & project attributes",
    "project_priority": "Parcel & project attributes",
    "latitude": "Geography",
    "longitude": "Geography",
    "state": "Geography",
}

LABELS = {
    "comp_pending_frac": "Share of compensation still unpaid",
    "doc_gap_frac": "Documentation still to be verified",
    "schedule_consumed": "Stage time consumed vs allowed",
    "rr_pending_frac": "R&R entitlement still pending",
    "compensation_completion_percentage": "Compensation completion %",
    "compensation_pending_days": "Days compensation pending",
    "legal_case_count": "Open legal cases",
    "document_completeness": "Document completeness %",
    "inactivity_days": "Days since last recorded action",
    "elapsed_stage_days": "Days elapsed in current stage",
    "expected_stage_days": "Allowed days for current stage",
    "department_response_days": "Departmental response time",
    "historical_stage_delay_rate": "Historical slip rate of this stage",
    "district_historical_delay_rate": "District historical delay rate",
    "authority_historical_delay_rate": "Authority historical delay rate",
    "affected_families": "Affected families",
    "authority_dependency_count": "Authorities the acquisition depends on",
    "pending_dependency_actions": "Department actions pending on the case",
    "approval_delay_days": "Days an approval / clearance has been pending",
    "department_coordination_score": "Inter-department coordination score",
    "number_of_owners": "Number of recorded owners",
    "rehabilitation_cases": "R&R cases attached",
    "rr_progress_percentage": "R&R progress %",
    "land_area_ha": "Parcel area (ha)",
    "project_land_requirement_ha": "Project land requirement (ha)",
    "latitude": "Latitude",
    "longitude": "Longitude",
}


def log(msg: str) -> None:
    print(f"[ml] {msg}", flush=True)


def load_corpus(csv_path: Path, sample: int) -> pd.DataFrame:
    t0 = time.time()
    usecols = (
        NUMERIC
        + CATEGORICAL
        + BINARY
        + [
            "case_id",
            "project_id",
            "assessment_date",
            "milestone_due_date",
            "label_observed",
            "next_milestone_delayed",
            "delay_risk_category",
            "actual_stage_delay_days",
        ]
    )
    usecols = list(dict.fromkeys(usecols))
    df = pd.read_csv(csv_path, usecols=usecols, low_memory=False)
    if sample:
        df = df.iloc[:sample].copy()
    log(f"loaded {len(df):,} rows x {len(df.columns)} cols in {time.time() - t0:.1f}s")
    return df


def build_matrix(df: pd.DataFrame, categories: dict[str, list[str]] | None):
    """Numeric + one-hot design matrix, plus the feature spec describing it."""
    feats: dict[str, np.ndarray] = {}
    spec: list[dict] = []

    for col in NUMERIC:
        v = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float64)
        feats[col] = v
        spec.append({"name": col, "op": "identity", "source": col, "group": GROUP.get(col, "Other"),
                     "label": LABELS.get(col, col)})

    for col in LOG_NUMERIC:
        name = f"log_{col}"
        v = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float64)
        feats[name] = np.log1p(np.clip(v, 0, None))
        spec.append({"name": name, "op": "log1p", "source": col, "group": GROUP.get(col, "Other"),
                     "label": LABELS.get(col, col)})

    exp = pd.to_numeric(df["expected_stage_days"], errors="coerce").to_numpy(dtype=np.float64)
    ela = pd.to_numeric(df["elapsed_stage_days"], errors="coerce").to_numpy(dtype=np.float64)
    feats["schedule_consumed"] = np.divide(ela, np.clip(exp, 1, None))
    spec.append({"name": "schedule_consumed", "op": "ratio", "source": "elapsed_stage_days",
                 "source2": "expected_stage_days", "group": GROUP["schedule_consumed"],
                 "label": LABELS["schedule_consumed"]})

    comp = pd.to_numeric(df["compensation_completion_percentage"], errors="coerce").to_numpy(dtype=np.float64)
    feats["comp_pending_frac"] = (100.0 - np.nan_to_num(comp, nan=0.0)) / 100.0
    spec.append({"name": "comp_pending_frac", "op": "pct_gap", "source": "compensation_completion_percentage",
                 "group": GROUP["comp_pending_frac"], "label": LABELS["comp_pending_frac"]})

    doc = pd.to_numeric(df["document_completeness"], errors="coerce").to_numpy(dtype=np.float64)
    feats["doc_gap_frac"] = (100.0 - doc) / 100.0
    spec.append({"name": "doc_gap_frac", "op": "pct_gap", "source": "document_completeness",
                 "group": GROUP["doc_gap_frac"], "label": LABELS["doc_gap_frac"]})

    rr = pd.to_numeric(df["rr_progress_percentage"], errors="coerce").to_numpy(dtype=np.float64)
    req = pd.to_numeric(df["rr_required"], errors="coerce").to_numpy(dtype=np.float64)
    feats["rr_pending_frac"] = np.where(req > 0, (100.0 - np.nan_to_num(rr, nan=50.0)) / 100.0, 0.0)
    spec.append({"name": "rr_pending_frac", "op": "rr_pending", "source": "rr_progress_percentage",
                 "source2": "rr_required", "group": GROUP["rr_pending_frac"], "label": LABELS["rr_pending_frac"]})

    for col in BINARY:
        v = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float64)
        feats[col] = np.nan_to_num(v, nan=0.0)
        spec.append({"name": col, "op": "identity", "source": col, "group": GROUP.get(col, "Other"),
                     "label": col.replace("_", " ").capitalize()})

    cats = {} if categories is None else categories
    for col in CATEGORICAL:
        series = df[col].astype("object").where(df[col].notna(), "(missing)")
        if categories is None:
            values = sorted(v for v in series.unique())
            cats[col] = values
        values = cats[col]
        arr = series.to_numpy()
        # Drop the first level as the reference category so the linear surrogate
        # stays identifiable.
        for value in values[1:]:
            name = f"{col}={value}"
            feats[name] = (arr == value).astype(np.float64)
            spec.append({"name": name, "op": "onehot", "source": col, "category": value,
                         "group": GROUP.get(col, "Other"),
                         "label": f"{col.replace('_', ' ').capitalize()}: {value}"})

    names = [s["name"] for s in spec]
    X = np.column_stack([feats[n] for n in names])
    return X, names, spec, cats


def metrics_at(y_true, prob, threshold: float) -> dict:
    pred = (prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    return {
        "threshold": round(float(threshold), 4),
        "precision": round(float(precision_score(y_true, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, pred, zero_division=0)), 4),
        "accuracy": round(float((tp + tn) / max(1, tp + tn + fp + fn)), 4),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def evaluate(name: str, y_true, prob, threshold: float) -> dict:
    return {
        "model": name,
        "rocAuc": round(float(roc_auc_score(y_true, prob)), 4),
        "prAuc": round(float(average_precision_score(y_true, prob)), 4),
        "brier": round(float(brier_score_loss(y_true, prob)), 4),
        "positiveRate": round(float(np.mean(y_true)), 4),
        "at_threshold": metrics_at(y_true, prob, threshold),
        "at_half": metrics_at(y_true, prob, 0.5),
    }


def best_f1_threshold(y_true, prob) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, prob)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros_like(precision), where=(precision + recall) > 0)
    idx = int(np.nanargmax(f1[:-1])) if len(thresholds) else 0
    return float(thresholds[idx]) if len(thresholds) else 0.5


def curve_points(y_true, prob, n=60) -> dict:
    fpr, tpr, _ = roc_curve(y_true, prob)
    pr_p, pr_r, _ = precision_recall_curve(y_true, prob)
    take = lambda a: [round(float(v), 4) for v in np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(a)), a)]
    return {
        "roc": {"fpr": take(fpr), "tpr": take(tpr)},
        "pr": {"recall": take(pr_r[::-1]), "precision": take(pr_p[::-1])},
    }


def calibration_bins(y_true, prob, bins=10) -> list[dict]:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(prob, edges) - 1, 0, bins - 1)
    out = []
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        out.append({
            "bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}",
            "predicted": round(float(prob[m].mean()), 4),
            "observed": round(float(y_true[m].mean()), 4),
            "count": int(m.sum()),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DATA / "land_acquisition_synthetic_350k.csv"))
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--no-rf", action="store_true")
    ap.add_argument("--shap-rows", type=int, default=0)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    t_start = time.time()

    df = load_corpus(Path(args.csv), args.sample)
    n_rows = len(df)

    X, names, spec, cats = build_matrix(df, None)
    log(f"design matrix {X.shape[0]:,} x {X.shape[1]}")

    observed = df["label_observed"].to_numpy() == 1
    y_all = pd.to_numeric(df["next_milestone_delayed"], errors="coerce").to_numpy()
    dates = pd.to_datetime(df["assessment_date"]).to_numpy()

    # -------------------------------------------------- time-aware split
    obs_idx = np.flatnonzero(observed)
    obs_dates = dates[obs_idx]
    order = np.argsort(obs_dates, kind="stable")
    obs_sorted = obs_idx[order]
    n_obs = len(obs_sorted)
    cut_train = int(n_obs * 0.70)
    cut_val = int(n_obs * 0.85)
    tr, va, te = obs_sorted[:cut_train], obs_sorted[cut_train:cut_val], obs_sorted[cut_val:]

    split_info = {
        "strategy": "time-aware split on assessment_date (no shuffling)",
        "observedRows": int(n_obs),
        "openRows": int(n_rows - n_obs),
        "train": {"rows": int(len(tr)), "from": str(pd.Timestamp(dates[tr].min()).date()), "to": str(pd.Timestamp(dates[tr].max()).date())},
        "validation": {"rows": int(len(va)), "from": str(pd.Timestamp(dates[va].min()).date()), "to": str(pd.Timestamp(dates[va].max()).date())},
        "test": {"rows": int(len(te)), "from": str(pd.Timestamp(dates[te].min()).date()), "to": str(pd.Timestamp(dates[te].max()).date())},
    }
    log(f"split train={len(tr):,} val={len(va):,} test={len(te):,}")

    y = np.nan_to_num(y_all, nan=0.0).astype(np.int8)
    Xtr, ytr = X[tr], y[tr]
    Xva, yva = X[va], y[va]
    Xte, yte = X[te], y[te]

    # ---------------------------------------------------------- baseline
    med = np.nanmedian(Xtr, axis=0)
    med = np.where(np.isnan(med), 0.0, med)

    def impute(M):
        out = M.copy()
        bad = np.isnan(out)
        if bad.any():
            out[bad] = np.take(med, np.where(bad)[1])
        return out

    Xtr_i, Xva_i, Xte_i = impute(Xtr), impute(Xva), impute(Xte)
    mu = Xtr_i.mean(axis=0)
    sd = Xtr_i.std(axis=0)
    sd[sd < 1e-9] = 1.0

    log("training logistic-regression baseline…")
    t0 = time.time()
    lr = LogisticRegression(max_iter=400, C=1.0, solver="lbfgs")
    lr.fit((Xtr_i - mu) / sd, ytr)
    lr_va = lr.predict_proba((Xva_i - mu) / sd)[:, 1]
    lr_te = lr.predict_proba((Xte_i - mu) / sd)[:, 1]
    log(f"  baseline done in {time.time() - t0:.1f}s  val ROC-AUC {roc_auc_score(yva, lr_va):.4f}")

    # ------------------------------------------------------- main model
    log("training gradient-boosted ensemble…")
    t0 = time.time()
    gbm = HistGradientBoostingClassifier(
        max_iter=400,
        learning_rate=0.07,
        max_leaf_nodes=31,
        min_samples_leaf=60,
        l2_regularization=1.0,
        early_stopping=True,
        validation_fraction=0.12,
        n_iter_no_change=25,
        random_state=17,
    )
    gbm.fit(Xtr, ytr)
    gbm_va = gbm.predict_proba(Xva)[:, 1]
    gbm_te = gbm.predict_proba(Xte)[:, 1]
    log(f"  ensemble done in {time.time() - t0:.1f}s ({gbm.n_iter_} iters)  val ROC-AUC {roc_auc_score(yva, gbm_va):.4f}")

    models = {}
    thr_lr = best_f1_threshold(yva, lr_va)
    thr_gbm = best_f1_threshold(yva, gbm_va)
    models["logistic_regression"] = {
        "label": "Logistic Regression (baseline)",
        "validation": evaluate("logistic_regression", yva, lr_va, thr_lr),
        "test": evaluate("logistic_regression", yte, lr_te, thr_lr),
    }
    models["gradient_boosting"] = {
        "label": "Histogram Gradient Boosting (deployed)",
        "iterations": int(gbm.n_iter_),
        "validation": evaluate("gradient_boosting", yva, gbm_va, thr_gbm),
        "test": evaluate("gradient_boosting", yte, gbm_te, thr_gbm),
    }

    if not args.no_rf:
        log("training random-forest comparison…")
        t0 = time.time()
        rf = RandomForestClassifier(
            n_estimators=140, max_depth=18, min_samples_leaf=12, n_jobs=-1, random_state=17
        )
        rf.fit(Xtr_i, ytr)
        rf_va = rf.predict_proba(Xva_i)[:, 1]
        rf_te = rf.predict_proba(Xte_i)[:, 1]
        thr_rf = best_f1_threshold(yva, rf_va)
        models["random_forest"] = {
            "label": "Random Forest (comparison)",
            "validation": evaluate("random_forest", yva, rf_va, thr_rf),
            "test": evaluate("random_forest", yte, rf_te, thr_rf),
        }
        log(f"  random forest done in {time.time() - t0:.1f}s  val ROC-AUC {roc_auc_score(yva, rf_va):.4f}")

    # --------------------------------------------- score the whole corpus
    log("scoring the full corpus…")
    t0 = time.time()
    scores = np.zeros(n_rows, dtype=np.float32)
    step = 50000
    for s in range(0, n_rows, step):
        scores[s : s + step] = gbm.predict_proba(X[s : s + step])[:, 1].astype(np.float32)
    (OUT / "scores.f32").write_bytes(scores.tobytes())
    log(f"  scored {n_rows:,} rows in {time.time() - t0:.1f}s  mean {scores.mean():.4f}")

    # ------------------------------------------------ expected slip (days)
    # Predicted delay days use a hurdle decomposition:
    #     expected slip = P(milestone delayed) x E[slip days | delayed]
    # The probability is the deployed classifier above. The conditional
    # magnitude is a regressor trained only on delayed milestones whose actual
    # slip is already recorded, on the same chronological training window.
    # Most milestones finish on time, so a single regressor over every row
    # collapses towards zero and is beaten by a constant.
    log("training conditional slip regressor…")
    t0 = time.time()
    slip_all = pd.to_numeric(df["actual_stage_delay_days"], errors="coerce").to_numpy(dtype=np.float64)
    delayed_known = (~np.isnan(slip_all)) & (slip_all > DELAY_THRESHOLD_DAYS)
    tr_r = tr[delayed_known[tr]]
    te_r = te[delayed_known[te]]
    reg = HistGradientBoostingRegressor(
        loss="absolute_error", max_iter=300, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=80,
        l2_regularization=1.0, early_stopping=True, validation_fraction=0.12,
        n_iter_no_change=20, random_state=17,
    )
    reg.fit(X[tr_r], slip_all[tr_r])
    cond_te = reg.predict(X[te_r])
    cond_baseline = float(np.median(slip_all[tr_r]))
    delay_days = np.zeros(n_rows, dtype=np.float32)
    for s in range(0, n_rows, step):
        cond = np.clip(reg.predict(X[s : s + step]), DELAY_THRESHOLD_DAYS + 1, 400)
        delay_days[s : s + step] = (scores[s : s + step] * cond).astype(np.float32)
    (OUT / "delay_days.f32").write_bytes(delay_days.tobytes())
    slip_model = {
        "label": "Expected slip = P(delayed) x conditional slip regressor (HistGradientBoosting, absolute error)",
        "trainRows": int(len(tr_r)),
        "testRows": int(len(te_r)),
        "conditionalTestMae": round(float(mean_absolute_error(slip_all[te_r], cond_te)), 2),
        "conditionalBaselineMae": round(float(mean_absolute_error(slip_all[te_r], np.full(len(te_r), cond_baseline))), 2),
        "meanExpectedSlipOpen": round(float(delay_days[~observed].mean()), 2) if (~observed).any() else None,
        "caveat": "Test milestones are right-censored: long slips in the latest window are not yet resolved, so test MAE understates real-world error.",
    }
    log(
        f"  slip regressor done in {time.time() - t0:.1f}s  conditional test MAE {slip_model['conditionalTestMae']}d "
        f"(median baseline {slip_model['conditionalBaselineMae']}d)"
    )

    # ------------------------------------------------------ permutation
    log("permutation importance on a validation sample…")
    rng = np.random.default_rng(7)
    pick = rng.choice(len(va), size=min(6000, len(va)), replace=False)
    Xp, yp = Xva[pick], yva[pick]
    base = roc_auc_score(yp, gbm.predict_proba(Xp)[:, 1])
    perm = []
    for j, name in enumerate(names):
        Xs = Xp.copy()
        Xs[:, j] = Xs[rng.permutation(len(Xs)), j]
        drop = base - roc_auc_score(yp, gbm.predict_proba(Xs)[:, 1])
        perm.append({"feature": name, "group": spec[j]["group"], "label": spec[j]["label"],
                     "aucDrop": round(float(drop), 5)})
    perm.sort(key=lambda r: -r["aucDrop"])

    # -------------------------------------------------------------- SHAP
    shap_rows = args.shap_rows if args.shap_rows > 0 else n_rows
    shap_summary, shap_meta = [], {}
    try:
        import shap  # noqa: PLC0415

        log(f"computing TreeSHAP for {shap_rows:,} rows…")
        t0 = time.time()
        explainer = shap.TreeExplainer(gbm)
        top_idx = np.zeros((n_rows, TOP_K_SHAP), dtype=np.int16)
        top_val = np.zeros((n_rows, TOP_K_SHAP), dtype=np.float32)
        abs_sum = np.zeros(len(names), dtype=np.float64)
        chunk = 20000
        done = 0
        for s in range(0, shap_rows, chunk):
            end = min(s + chunk, shap_rows)
            block = X[s:end]
            sv = explainer.shap_values(block, check_additivity=False)
            sv = np.asarray(sv)
            if sv.ndim == 3:  # (rows, features, classes)
                sv = sv[:, :, 1]
            abs_sum += np.abs(sv).sum(axis=0)
            order = np.argsort(-np.abs(sv), axis=1)[:, :TOP_K_SHAP]
            top_idx[s:end] = order.astype(np.int16)
            top_val[s:end] = np.take_along_axis(sv, order, axis=1).astype(np.float32)
            done += len(block)
            if (s // chunk) % 4 == 0:
                log(f"  shap {done:,}/{shap_rows:,}")
        mean_abs = abs_sum / max(1, done)
        shap_summary = sorted(
            (
                {"feature": names[j], "group": spec[j]["group"], "label": spec[j]["label"],
                 "meanAbsShap": round(float(mean_abs[j]), 6)}
                for j in range(len(names))
            ),
            key=lambda r: -r["meanAbsShap"],
        )
        with open(OUT / "shap_top.bin", "wb") as fh:
            fh.write(struct.pack("<III", n_rows, TOP_K_SHAP, 1))
            fh.write(top_idx.tobytes())
            fh.write(top_val.tobytes())
        base_value = float(np.ravel(explainer.expected_value)[-1])
        shap_meta = {
            "available": True,
            "rows": int(done),
            "topK": TOP_K_SHAP,
            "baseValue": round(base_value, 6),
            "unit": "log-odds",
            "seconds": round(time.time() - t0, 1),
        }
        log(f"  shap done in {time.time() - t0:.1f}s")
    except Exception as exc:  # pragma: no cover - optional dependency
        log(f"  shap unavailable ({exc}); explanations fall back to the linear surrogate")
        shap_meta = {"available": False, "reason": str(exc)[:200]}

    # --------------------------------------------------------- surrogate
    # A linear model distilled from the ensemble's log-odds. Its Shapley values
    # are exact and closed-form, which is what lets the browser score and
    # explain an ad-hoc scenario without shipping the ensemble.
    log("distilling the interactive surrogate…")
    z_tr = np.log(np.clip(gbm.predict_proba(Xtr)[:, 1], 1e-6, 1 - 1e-6))
    z_tr = z_tr - np.log(1 - np.clip(gbm.predict_proba(Xtr)[:, 1], 1e-6, 1 - 1e-6))
    ridge = Ridge(alpha=1.0)
    ridge.fit((Xtr_i - mu) / sd, z_tr)

    def surrogate_prob(M):
        Mi = impute(M)
        z = ridge.predict((Mi - mu) / sd)
        return 1.0 / (1.0 + np.exp(-z))

    sur_va = surrogate_prob(Xva)
    gbm_logit_va = np.log(np.clip(gbm_va, 1e-6, 1 - 1e-6) / (1 - np.clip(gbm_va, 1e-6, 1 - 1e-6)))
    sur_logit_va = np.log(np.clip(sur_va, 1e-6, 1 - 1e-6) / (1 - np.clip(sur_va, 1e-6, 1 - 1e-6)))
    ss_res = float(np.sum((gbm_logit_va - sur_logit_va) ** 2))
    ss_tot = float(np.sum((gbm_logit_va - gbm_logit_va.mean()) ** 2))
    fidelity = {
        "logOddsR2": round(1 - ss_res / ss_tot, 4),
        "spearman": round(float(pd.Series(sur_va).corr(pd.Series(gbm_va), method="spearman")), 4),
        "meanAbsProbDiff": round(float(np.mean(np.abs(sur_va - gbm_va))), 4),
        "bandAgreement": None,
        "rocAuc": round(float(roc_auc_score(yva, sur_va)), 4),
    }
    cuts = [RISK_BAND_THRESHOLDS["medium"], RISK_BAND_THRESHOLDS["high"], RISK_BAND_THRESHOLDS["critical"]]
    band = lambda p: np.digitize(p, cuts)
    fidelity["bandAgreement"] = round(float(np.mean(band(sur_va) == band(gbm_va))), 4)

    # Linear surrogate of the conditional slip regressor, for interactive scenarios.
    slip_ridge = Ridge(alpha=1.0)
    slip_ridge.fit((impute(X[tr_r]) - mu) / sd, np.clip(reg.predict(X[tr_r]), DELAY_THRESHOLD_DAYS + 1, 400))
    slip_sur_te = np.clip(slip_ridge.predict((impute(X[te_r]) - mu) / sd), DELAY_THRESHOLD_DAYS + 1, 400)
    slip_model["surrogateConditionalTestMae"] = round(float(mean_absolute_error(slip_all[te_r], slip_sur_te)), 2)

    surrogate = {
        "kind": "linear-logit surrogate distilled from the deployed ensemble",
        "delay": {
            "kind": "linear surrogate of the conditional slip regressor (days, given a delay); expected slip = probability x this",
            "intercept": float(slip_ridge.intercept_),
            "coef": [float(v) for v in slip_ridge.coef_],
            "floor": DELAY_THRESHOLD_DAYS + 1,
            "cap": 400,
            "conditionalTestMae": slip_model["surrogateConditionalTestMae"],
        },
        "intercept": float(ridge.intercept_),
        "fidelity": fidelity,
        "riskBands": RISK_BAND_THRESHOLDS,
        "features": [
            {
                **spec[j],
                "mean": float(mu[j]),
                "std": float(sd[j]),
                "median": float(med[j]),
                "coef": float(ridge.coef_[j]),
            }
            for j in range(len(names))
        ],
        "categories": cats,
    }
    (OUT / "surrogate.json").write_text(json.dumps(surrogate), encoding="utf-8")
    log(f"  surrogate fidelity R2(logit)={fidelity['logOddsR2']} band agreement={fidelity['bandAgreement']}")

    # Share of the whole corpus falling in each band under the deployed model.
    all_bands = np.digitize(scores, [RISK_BAND_THRESHOLDS["medium"], RISK_BAND_THRESHOLDS["high"], RISK_BAND_THRESHOLDS["critical"]])
    band_mix = {
        name: int((all_bands == i).sum()) for i, name in enumerate(["Low", "Medium", "High", "Critical"])
    }

    # ----------------------------------------------------------- outputs
    metrics = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "corpusRows": int(n_rows),
        "features": len(names),
        "target": {
            "name": "next_milestone_delayed",
            "definition": f"the current stage's next milestone slips by more than {DELAY_THRESHOLD_DAYS} days",
            "positiveRateObserved": round(float(np.mean(y[obs_sorted])), 4),
        },
        "split": split_info,
        "models": models,
        "deployed": "gradient_boosting",
        "operatingThreshold": round(float(thr_gbm), 4),
        "curves": {"validation": curve_points(yva, gbm_va), "test": curve_points(yte, gbm_te)},
        "calibration": calibration_bins(yte, gbm_te),
        "shap": shap_meta,
        "riskBands": RISK_BAND_THRESHOLDS,
        "riskBandMix": band_mix,
        "surrogateFidelity": fidelity,
        "slipModel": slip_model,
        "leakageControls": [
            "targets and actual_stage_delay_days are never features",
            "only rows whose milestone outcome is already knowable are used for training",
            "split is chronological on assessment_date, with no shuffling",
            "imputation, scaling and the surrogate are all fitted on the training window only",
        ],
        "trainingSeconds": round(time.time() - t_start, 1),
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    (OUT / "importance.json").write_text(
        json.dumps({"permutation": perm, "shap": shap_summary}, indent=1), encoding="utf-8"
    )
    (OUT / "feature-spec.json").write_text(
        json.dumps({"features": spec, "categories": cats, "names": names}, indent=1), encoding="utf-8"
    )

    log(
        f"done in {time.time() - t_start:.1f}s · deployed model test ROC-AUC "
        f"{models['gradient_boosting']['test']['rocAuc']} PR-AUC {models['gradient_boosting']['test']['prAuc']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
