import { randomUUID } from "node:crypto";
import { SterError } from "../errors.js";
import {
  USER_RATING_SCALE,
  type RunScore,
  type RunScoreCriterion,
  type RunScoreJudge,
} from "./lifecycle.js";

/**
 * Create or replace a user rating (1–5). At most one user score per run.
 */
export function createUserRating(input: {
  runId: string;
  value: number;
  note?: string;
  existing?: RunScore | null;
  now?: () => Date;
}): RunScore {
  if (
    !Number.isFinite(input.value) ||
    input.value < USER_RATING_SCALE.min ||
    input.value > USER_RATING_SCALE.max
  ) {
    throw new SterError("invalid-argument", "User rating must be between 1 and 5", {
      value: input.value,
    });
  }
  const now = (input.now ?? (() => new Date()))().toISOString();
  const score: RunScore = {
    id: input.existing?.id ?? randomUUID(),
    runId: input.runId,
    source: "user",
    value: input.value,
    scale: { min: USER_RATING_SCALE.min, max: USER_RATING_SCALE.max },
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (input.note !== undefined) {
    score.note = input.note;
  }
  return score;
}

/**
 * Create an agent-produced judging score with its own scale.
 */
export function createAgentScore(input: {
  runId: string;
  value: number;
  scale: { min: number; max: number };
  reasoning?: string;
  criteria?: RunScoreCriterion[];
  judge: RunScoreJudge;
  now?: () => Date;
}): RunScore {
  if (!Number.isFinite(input.value)) {
    throw new SterError("invalid-argument", "Agent score value must be a number");
  }
  if (!(input.scale.min < input.scale.max)) {
    throw new SterError("invalid-argument", "Score scale min must be less than max");
  }
  const now = (input.now ?? (() => new Date()))().toISOString();
  const score: RunScore = {
    id: randomUUID(),
    runId: input.runId,
    source: "agent",
    value: input.value,
    scale: input.scale,
    judge: input.judge,
    createdAt: now,
    updatedAt: now,
  };
  if (input.reasoning !== undefined) {
    score.reasoning = input.reasoning;
  }
  if (input.criteria !== undefined) {
    score.criteria = input.criteria;
  }
  return score;
}

export function averageScores(scores: readonly RunScore[]): number | null {
  if (scores.length === 0) {
    return null;
  }
  const sum = scores.reduce((acc, score) => acc + score.value, 0);
  return sum / scores.length;
}
