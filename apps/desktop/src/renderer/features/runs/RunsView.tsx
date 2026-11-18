import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { RunDetail } from "./RunDetail.js";

interface RunListItem {
  id: string;
  sessionId: string;
  kind: string;
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  agentId?: string;
  agentName?: string;
  cwd?: string;
  model?: string;
  userRating?: number;
  agentScore?: number;
}

interface RunTotals {
  count: number;
  averageUserRating: number | null;
  averageAgentScore: number | null;
  totalDurationMs: number;
  totalCost: { amount: number; currency: string } | null;
}

/**
 * Browse and filter run records (US12 / FR-071).
 */
export function RunsView(): JSX.Element {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [totals, setTotals] = useState<RunTotals>({
    count: 0,
    averageUserRating: null,
    averageAgentScore: null,
    totalDurationMs: 0,
    totalCost: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState("");
  const [outcome, setOutcome] = useState("");
  const [cwd, setCwd] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userRatingMin, setUserRatingMin] = useState("");
  const [agentScoreMin, setAgentScoreMin] = useState("");

  const reload = (): void => {
    const filter: Record<string, string | number> = {};
    if (agentId.trim()) {
      filter.agentId = agentId.trim();
    }
    if (model.trim()) {
      filter.model = model.trim();
    }
    if (outcome.trim()) {
      filter.outcome = outcome.trim();
    }
    if (cwd.trim()) {
      filter.cwd = cwd.trim();
    }
    if (from.trim()) {
      filter.from = from.trim();
    }
    if (to.trim()) {
      filter.to = to.trim();
    }
    if (userRatingMin.trim()) {
      filter.userRatingMin = Number(userRatingMin);
    }
    if (agentScoreMin.trim()) {
      filter.agentScoreMin = Number(agentScoreMin);
    }
    void window.ster.runs
      .list({
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        limit: 100,
      })
      .then((result) => {
        const payload = result as { runs: RunListItem[]; totals: RunTotals };
        setRuns(payload.runs);
        setTotals(payload.totals);
      });
  };

  useEffect(() => {
    reload();
  }, []);

  if (selectedId) {
    return (
      <RunDetail
        runId={selectedId}
        onBack={() => {
          setSelectedId(null);
          reload();
        }}
      />
    );
  }

  const durationLabel =
    totals.totalDurationMs > 0 ? `${(totals.totalDurationMs / 1000).toFixed(1)}s` : "—";
  const costLabel =
    totals.totalCost === null
      ? "—"
      : `${totals.totalCost.amount.toFixed(4)} ${totals.totalCost.currency}`;

  return (
    <section className="conv col px-6 py-4" aria-label={t("runs.title")} data-testid="runs-view">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h1 className="title">{t("runs.title")}</h1>
        <button
          type="button"
          className="btn"
          data-testid="runs-export"
          onClick={() => {
            void window.ster.runs.export({});
          }}
        >
          {t("runs.export")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterAgent")}</span>
          <input
            value={agentId}
            onChange={(event) => {
              setAgentId(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-agent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterModel")}</span>
          <input
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-model"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterOutcome")}</span>
          <select
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-outcome"
          >
            <option value="">{t("runs.any")}</option>
            <option value="completed">{t("runs.outcomeCompleted")}</option>
            <option value="cancelled">{t("runs.outcomeCancelled")}</option>
            <option value="failed">{t("runs.outcomeFailed")}</option>
            <option value="interrupted">{t("runs.outcomeInterrupted")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterFolder")}</span>
          <input
            value={cwd}
            onChange={(event) => {
              setCwd(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-cwd"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterFrom")}</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-from"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterTo")}</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-to"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterUserRating")}</span>
          <input
            type="number"
            min={1}
            max={5}
            value={userRatingMin}
            onChange={(event) => {
              setUserRatingMin(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-user-rating"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted">{t("runs.filterAgentScore")}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={agentScoreMin}
            onChange={(event) => {
              setAgentScoreMin(event.target.value);
            }}
            className="input"
            data-testid="runs-filter-agent-score"
          />
        </label>
        <button
          type="button"
          className="btn self-end"
          data-testid="runs-apply-filters"
          onClick={() => {
            reload();
          }}
        >
          {t("runs.applyFilters")}
        </button>
      </div>

      <p className="muted mb-3 text-sm" data-testid="runs-totals">
        {t("runs.totals", {
          count: totals.count,
          userAvg: totals.averageUserRating === null ? "—" : totals.averageUserRating.toFixed(1),
          agentAvg: totals.averageAgentScore === null ? "—" : totals.averageAgentScore.toFixed(1),
          duration: durationLabel,
          cost: costLabel,
        })}
      </p>

      {runs.length === 0 ? (
        <p className="muted">{t("runs.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className="w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left"
                data-testid={`run-row-${run.id}`}
                onClick={() => {
                  setSelectedId(run.id);
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{run.agentName ?? run.agentId ?? run.id}</span>
                  <span className="muted text-xs">{run.outcome ?? "—"}</span>
                </div>
                <p className="muted mt-1 text-xs">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.model ? ` · ${run.model}` : ""}
                  {run.cwd ? ` · ${run.cwd}` : ""}
                  {run.userRating !== undefined ? ` · ★ ${String(run.userRating)}` : ""}
                  {run.agentScore !== undefined ? ` · score ${String(run.agentScore)}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
