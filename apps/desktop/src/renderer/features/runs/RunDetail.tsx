import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

interface RunScore {
  id: string;
  source: "user" | "agent";
  value: number;
  note?: string;
  reasoning?: string;
  judge?: { agentId: string; model?: string };
  createdAt: string;
}

interface RunDetailRecord {
  id: string;
  sessionId: string;
  kind: string;
  request?: string | null;
  agent: { id: string; name: string; version?: string };
  model?: string;
  mode?: string;
  permissionMode: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  actions: unknown[];
  approvals: unknown[];
  commands: unknown[];
  usage?: unknown;
  scores: RunScore[];
}

interface AgentOption {
  id: string;
  name: string;
  readiness?: string;
}

export interface RunDetailProps {
  runId: string;
  onBack: () => void;
}

/**
 * Single run: rating, judging, and score history (US12).
 */
export function RunDetail({ runId, onBack }: RunDetailProps): JSX.Element {
  const { t } = useTranslation();
  const [run, setRun] = useState<RunDetailRecord | null>(null);
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [judgeAgentId, setJudgeAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = (): void => {
    void window.ster.runs.get({ runId }).then((result) => {
      const record = result as RunDetailRecord;
      setRun(record);
      const user = [...record.scores].reverse().find((score) => score.source === "user");
      if (user) {
        setRating(user.value);
        setNote(user.note ?? "");
      }
    });
  };

  useEffect(() => {
    reload();
    void window.ster.agents.list().then((list) => {
      const options = (list as AgentOption[]).filter(
        (agent) => agent.readiness === "ready" || agent.readiness === undefined,
      );
      setAgents(options);
      if (options[0]) {
        setJudgeAgentId(options[0].id);
      }
    });
  }, [runId]);

  if (!run) {
    return (
      <section className="conv col px-6 py-4">
        <p className="muted">{t("runs.loading")}</p>
      </section>
    );
  }

  return (
    <section className="conv col px-6 py-4" data-testid="run-detail">
      <button type="button" className="btn mb-4 self-start" onClick={onBack}>
        {t("runs.back")}
      </button>
      <h1 className="title mb-2">{t("runs.detailTitle")}</h1>
      <p className="muted mb-4 text-sm">
        {run.agent.name} · {run.outcome ?? "…"} · {run.cwd}
      </p>

      <div className="mb-6 space-y-2 text-sm">
        <p>
          <span className="muted">{t("runs.request")}: </span>
          {run.request === null || run.request === undefined
            ? t("runs.requestRedacted")
            : run.request}
        </p>
        <p>
          <span className="muted">{t("runs.started")}: </span>
          {new Date(run.startedAt).toLocaleString()}
        </p>
        <p>
          <span className="muted">{t("runs.actions")}: </span>
          {run.actions.length} · {t("runs.approvals")}: {run.approvals.length} ·{" "}
          {t("runs.commands")}: {run.commands.length}
        </p>
      </div>

      <div className="mb-6 rounded border border-[var(--border)] p-4" data-testid="run-rate">
        <h2 className="mb-2 font-medium">{t("runs.rateTitle")}</h2>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <span>{t("runs.rating")}</span>
          <input
            type="number"
            min={1}
            max={5}
            value={rating}
            onChange={(event) => {
              setRating(Number(event.target.value));
            }}
            className="input w-20"
            data-testid="run-rating-input"
          />
        </label>
        <label className="mb-3 flex flex-col gap-1 text-sm">
          <span>{t("runs.note")}</span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className="input min-h-16"
            data-testid="run-note-input"
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy}
          data-testid="run-rate-save"
          onClick={() => {
            setBusy(true);
            setError(null);
            void window.ster.runs
              .rate({
                runId,
                value: rating,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
              .then(() => {
                reload();
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {t("runs.saveRating")}
        </button>
      </div>

      <div className="mb-6 rounded border border-[var(--border)] p-4" data-testid="run-judge">
        <h2 className="mb-2 font-medium">{t("runs.judgeTitle")}</h2>
        <label className="mb-3 flex flex-col gap-1 text-sm">
          <span>{t("runs.judgeAgent")}</span>
          <select
            value={judgeAgentId}
            onChange={(event) => {
              setJudgeAgentId(event.target.value);
            }}
            className="input"
            data-testid="run-judge-agent"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy || !judgeAgentId}
          data-testid="run-judge-start"
          onClick={() => {
            setBusy(true);
            setError(null);
            void window.ster.runs
              .judge({ runId, agentId: judgeAgentId })
              .then(() => {
                reload();
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {t("runs.judge")}
        </button>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-red-600" data-testid="run-error">
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="mb-2 font-medium">{t("runs.scoresTitle")}</h2>
        {run.scores.length === 0 ? (
          <p className="muted text-sm">{t("runs.noScores")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {run.scores.map((score) => (
              <li
                key={score.id}
                className="rounded border border-[var(--border)] px-3 py-2"
                data-testid={`run-score-${score.source}`}
              >
                <div className="flex justify-between">
                  <span>
                    {score.source === "user" ? t("runs.userScore") : t("runs.agentScore")}:{" "}
                    {score.value}
                  </span>
                  <span className="muted text-xs">
                    {new Date(score.createdAt).toLocaleString()}
                  </span>
                </div>
                {score.note ? <p className="mt-1">{score.note}</p> : null}
                {score.reasoning ? <p className="mt-1">{score.reasoning}</p> : null}
                {score.judge ? (
                  <p className="muted mt-1 text-xs">
                    {score.judge.agentId}
                    {score.judge.model ? ` · ${score.judge.model}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        className="btn mt-6 self-start"
        data-testid="run-delete"
        onClick={() => {
          void window.ster.runs.delete({ ids: [runId] }).then(() => {
            onBack();
          });
        }}
      >
        {t("runs.delete")}
      </button>
    </section>
  );
}
