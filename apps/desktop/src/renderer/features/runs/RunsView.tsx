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
}

/**
 * Browse and filter run records (US12).
 */
export function RunsView(): JSX.Element {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [totals, setTotals] = useState<RunTotals>({
    count: 0,
    averageUserRating: null,
    averageAgentScore: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [cwd, setCwd] = useState("");

  const reload = (): void => {
    const filter: Record<string, string> = {};
    if (agentId.trim()) {
      filter.agentId = agentId.trim();
    }
    if (outcome.trim()) {
      filter.outcome = outcome.trim();
    }
    if (cwd.trim()) {
      filter.cwd = cwd.trim();
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
                className="w-full rounded border border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                data-testid={`run-row-${run.id}`}
                onClick={() => {
                  setSelectedId(run.id);
                }}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {run.agentName ?? run.agentId ?? run.id.slice(0, 8)}
                  </span>
                  <span className="muted text-xs">{run.outcome ?? "…"}</span>
                </div>
                <div className="muted mt-1 truncate text-xs">{run.cwd ?? run.sessionId}</div>
                <div className="muted mt-1 text-xs">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.userRating !== undefined ? ` · ★ ${String(run.userRating)}` : ""}
                  {run.agentScore !== undefined ? ` · score ${String(run.agentScore)}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
