import { SterError } from "../errors.js";
import type { EventStream, CoreEvent } from "../events/stream.js";
import type { Score } from "../model/events.js";
import type { AgentService } from "../agents/service.js";
import type { FactoryService } from "../factory/service.js";
import type { Logger } from "../log.js";
import type { PolicyService } from "../policy/service.js";
import type { ResolvedEnv } from "../platform/shell-env.js";
import type { Store } from "../store/store.js";
import { exportRunRecords } from "./export.js";
import { judgeRun } from "./judge.js";
import { finalizeRun, toRunSummary, type RunRecord, type RunScore } from "./lifecycle.js";
import { loadAllRuns, loadRun, persistRun, persistScore } from "./persist.js";
import { averageScores, createUserRating } from "./scores.js";

export interface RunFilter {
  sessionId?: string;
  agentId?: string;
  model?: string;
  cwd?: string;
  outcome?: string;
  kind?: string;
  from?: string;
  to?: string;
  /** Inclusive user rating filter (source=user only). */
  userRatingMin?: number;
  userRatingMax?: number;
  /** Inclusive agent score filter (source=agent only). */
  agentScoreMin?: number;
  agentScoreMax?: number;
  ids?: string[];
}

export interface Page {
  offset?: number;
  limit: number;
}

export interface RunTotals {
  count: number;
  /** Average of user ratings in the filtered set; null when none. */
  averageUserRating: number | null;
  /** Average of agent scores in the filtered set; null when none. */
  averageAgentScore: number | null;
  /** Sum of known durations in the filtered set (ms). */
  totalDurationMs: number;
  /** Sum of reported costs in the filtered set; null when no run reports cost. */
  totalCost: { amount: number; currency: string } | null;
}

export type WritableTarget = { kind: "path"; path: string };

export interface RunService {
  list(
    filter: RunFilter,
    page: Page,
  ): Promise<{ runs: ReturnType<typeof toRunSummary>[]; totals: RunTotals }>;
  get(runId: string): Promise<RunRecord>;
  rate(runId: string, rating: { value: number; note?: string }): Promise<Score>;
  judge(runId: string, opts: { agentId: string }): Promise<Score>;
  export(filter: RunFilter, destination: WritableTarget): Promise<{ count: number }>;
  delete(filter: RunFilter | { ids: string[] }): Promise<{ count: number }>;
  /** Redact request text for a session's runs (session keep-without-text). */
  keepWithoutText(sessionId: string): Promise<{ count: number }>;
  /** Delete every run for a session (session delete with runs). */
  deleteForSession(sessionId: string): Promise<{ count: number }>;
  /** Mark open runs interrupted at startup recovery. */
  markInterrupted(runIds: string[]): void;
  /** Persist a live run snapshot. */
  save(run: RunRecord): void;
}

export interface CreateRunServiceOptions {
  store: Store;
  events: EventStream<CoreEvent>;
  agents: AgentService;
  policy: PolicyService;
  factory: FactoryService;
  environment: ResolvedEnv;
  log: Logger;
}

function latestScore(scores: readonly RunScore[], source: "user" | "agent"): RunScore | null {
  const filtered = scores.filter((score) => score.source === source);
  if (filtered.length === 0) {
    return null;
  }
  return filtered[filtered.length - 1] ?? null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date-only filter bounds are calendar-day inclusive (FR-071).
 * Full ISO timestamps are compared as-is.
 */
function normalizeFilterInstant(value: string, edge: "start" | "end"): string {
  if (!DATE_ONLY.test(value)) {
    return value;
  }
  return edge === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
}

function matchesFilter(run: RunRecord, filter: RunFilter): boolean {
  if (filter.ids !== undefined && !filter.ids.includes(run.id)) {
    return false;
  }
  if (filter.sessionId !== undefined && run.sessionId !== filter.sessionId) {
    return false;
  }
  if (filter.agentId !== undefined && run.agent.id !== filter.agentId) {
    return false;
  }
  if (filter.model !== undefined && run.model !== filter.model) {
    return false;
  }
  if (filter.cwd !== undefined && run.cwd !== filter.cwd) {
    return false;
  }
  if (filter.outcome !== undefined && run.outcome !== filter.outcome) {
    return false;
  }
  if (filter.kind !== undefined && run.kind !== filter.kind) {
    return false;
  }
  if (filter.from !== undefined) {
    const fromBound = normalizeFilterInstant(filter.from, "start");
    if (run.startedAt < fromBound) {
      return false;
    }
  }
  if (filter.to !== undefined) {
    const toBound = normalizeFilterInstant(filter.to, "end");
    if (run.startedAt > toBound) {
      return false;
    }
  }
  const user = latestScore(run.scores, "user");
  if (filter.userRatingMin !== undefined) {
    if (!user || user.value < filter.userRatingMin) {
      return false;
    }
  }
  if (filter.userRatingMax !== undefined) {
    if (!user || user.value > filter.userRatingMax) {
      return false;
    }
  }
  const agentScores = run.scores.filter((score) => score.source === "agent");
  const agentScoreMin = filter.agentScoreMin;
  if (agentScoreMin !== undefined) {
    if (!agentScores.some((score) => score.value >= agentScoreMin)) {
      return false;
    }
  }
  const agentScoreMax = filter.agentScoreMax;
  if (agentScoreMax !== undefined) {
    if (!agentScores.some((score) => score.value <= agentScoreMax)) {
      return false;
    }
  }
  return true;
}

function toPublicScore(score: RunScore): Score {
  const publicScore: Score = {
    id: score.id,
    runId: score.runId,
    source: score.source,
    value: score.value,
    createdAt: score.createdAt,
    scale: score.scale,
  };
  if (score.note !== undefined) {
    publicScore.note = score.note;
  }
  if (score.reasoning !== undefined) {
    publicScore.reasoning = score.reasoning;
  }
  if (score.criteria !== undefined) {
    publicScore.criteria = score.criteria;
  }
  if (score.judge !== undefined) {
    publicScore.judge = score.judge;
  }
  if (score.updatedAt !== undefined) {
    publicScore.updatedAt = score.updatedAt;
  }
  return publicScore;
}

function enrichSummary(run: RunRecord): ReturnType<typeof toRunSummary> & {
  agentId: string;
  agentName: string;
  cwd: string;
  model?: string;
  userRating?: number;
  agentScore?: number;
} {
  const summary = toRunSummary(run) as ReturnType<typeof toRunSummary> & {
    agentId: string;
    agentName: string;
    cwd: string;
    model?: string;
    userRating?: number;
    agentScore?: number;
  };
  summary.agentId = run.agent.id;
  summary.agentName = run.agent.name;
  summary.cwd = run.cwd;
  if (run.model !== undefined) {
    summary.model = run.model;
  }
  const user = latestScore(run.scores, "user");
  if (user) {
    summary.userRating = user.value;
  }
  const agent = latestScore(run.scores, "agent");
  if (agent) {
    summary.agentScore = agent.value;
  }
  return summary;
}

/**
 * Run records, rating, judging, and export (US12).
 */
export function createRunService(options: CreateRunServiceOptions): RunService {
  const filtered = (filter: RunFilter): RunRecord[] =>
    loadAllRuns(options.store).filter((run) => matchesFilter(run, filter));

  const totalsFor = (runs: readonly RunRecord[]): RunTotals => {
    const userScores = runs.flatMap((run) => run.scores.filter((score) => score.source === "user"));
    const agentScores = runs.flatMap((run) =>
      run.scores.filter((score) => score.source === "agent"),
    );
    let totalDurationMs = 0;
    let costAmount = 0;
    let costCurrency: string | null = null;
    let costCount = 0;
    for (const run of runs) {
      if (typeof run.durationMs === "number") {
        totalDurationMs += run.durationMs;
      }
      const cost = run.usage?.cost;
      if (cost) {
        costAmount += cost.amount;
        costCurrency = costCurrency ?? cost.currency;
        costCount += 1;
      }
    }
    return {
      count: runs.length,
      averageUserRating: averageScores(userScores),
      averageAgentScore: averageScores(agentScores),
      totalDurationMs,
      totalCost:
        costCount > 0 && costCurrency !== null
          ? { amount: costAmount, currency: costCurrency }
          : null,
    };
  };

  return {
    list: (filter, page) => {
      const all = filtered(filter);
      const offset = page.offset ?? 0;
      const slice = all.slice(offset, offset + page.limit);
      return Promise.resolve({
        runs: slice.map(enrichSummary),
        totals: totalsFor(all),
      });
    },

    get: (runId) => {
      const run = loadRun(options.store, runId);
      if (!run) {
        return Promise.reject(new SterError("not-found", `Run ${runId} not found`, { runId }));
      }
      return Promise.resolve(run);
    },

    rate: (runId, rating) => {
      const run = loadRun(options.store, runId);
      if (!run) {
        return Promise.reject(new SterError("not-found", `Run ${runId} not found`, { runId }));
      }
      const existing = latestScore(run.scores, "user");
      const score = createUserRating({
        runId,
        value: rating.value,
        ...(rating.note !== undefined ? { note: rating.note } : {}),
        ...(existing ? { existing } : {}),
      });
      persistScore(options.store, score);
      const nextScores =
        existing === null
          ? [...run.scores, score]
          : run.scores.map((item) => (item.id === existing.id ? score : item));
      persistRun(options.store, { ...run, scores: nextScores });
      options.events.publish({
        type: "score.recorded",
        runId,
        score: toPublicScore(score),
      });
      return Promise.resolve(toPublicScore(score));
    },

    async judge(runId, opts) {
      const run = loadRun(options.store, runId);
      if (!run) {
        throw new SterError("not-found", `Run ${runId} not found`, { runId });
      }
      const score = await judgeRun({
        run,
        agentId: opts.agentId,
        agents: options.agents,
        policy: options.policy,
        factory: options.factory,
        environment: options.environment,
        log: options.log,
        persistRun: (record) => {
          persistRun(options.store, record);
        },
        persistScore: (agentScore) => {
          persistScore(options.store, agentScore);
          const current = loadRun(options.store, runId);
          if (current) {
            persistRun(options.store, {
              ...current,
              scores: [...current.scores.filter((s) => s.id !== agentScore.id), agentScore],
            });
          }
          options.events.publish({
            type: "score.recorded",
            runId,
            score: toPublicScore(agentScore),
          });
        },
      });
      return toPublicScore(score);
    },

    async export(filter, destination) {
      const runs = filtered(filter);
      return exportRunRecords(runs, destination);
    },

    delete: (filter) => {
      const ids =
        "ids" in filter && Array.isArray(filter.ids)
          ? filter.ids
          : filtered(filter as RunFilter).map((run) => run.id);
      let count = 0;
      for (const id of ids) {
        if (options.store.getRun(id)) {
          options.store.deleteRun(id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },

    keepWithoutText: (sessionId) => {
      const count = options.store.redactRunRequestsForSession(sessionId);
      return Promise.resolve({ count });
    },

    deleteForSession: (sessionId) => {
      const count = options.store.deleteRunsForSession(sessionId);
      return Promise.resolve({ count });
    },

    markInterrupted(runIds) {
      for (const runId of runIds) {
        const run = loadRun(options.store, runId);
        if (!run || run.endedAt) {
          continue;
        }
        const finished = finalizeRun(run, {
          outcome: "interrupted",
          stopReason: "interrupted",
        });
        persistRun(options.store, finished);
      }
    },

    save(run) {
      persistRun(options.store, run);
    },
  };
}
