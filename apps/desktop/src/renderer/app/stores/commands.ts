export interface CommandRunView {
  commandRunId: string;
  sessionId: string;
  command: string;
  args: string[];
  cwd?: string;
  output: string;
  truncated: boolean;
  state: "running" | "exited" | "killed" | "released";
  exit?: { code?: number | null; signal?: string | null };
}

type Listener = () => void;

const runs = new Map<string, CommandRunView>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommand(commandRunId: string): CommandRunView | undefined {
  return runs.get(commandRunId);
}

export function upsertCommandStarted(input: {
  commandRunId: string;
  sessionId: string;
  command?: string;
  args?: string[];
  cwd?: string;
}): void {
  const existing = runs.get(input.commandRunId);
  const cwd = input.cwd ?? existing?.cwd;
  const next: CommandRunView = {
    commandRunId: input.commandRunId,
    sessionId: input.sessionId,
    command: input.command ?? existing?.command ?? "",
    args: input.args ?? existing?.args ?? [],
    output: existing?.output ?? "",
    truncated: existing?.truncated ?? false,
    state: "running",
  };
  if (cwd !== undefined) {
    next.cwd = cwd;
  }
  runs.set(input.commandRunId, next);
  emit();
}

export function appendCommandOutput(commandRunId: string, data: string, truncated?: boolean): void {
  const existing = runs.get(commandRunId);
  if (!existing) {
    runs.set(commandRunId, {
      commandRunId,
      sessionId: "",
      command: "",
      args: [],
      output: data,
      truncated: truncated ?? false,
      state: "running",
    });
  } else {
    runs.set(commandRunId, {
      ...existing,
      output: existing.output + data,
      truncated: truncated ?? existing.truncated,
    });
  }
  emit();
}

export function markCommandExited(
  commandRunId: string,
  exit?: { code?: number | null; signal?: string | null },
): void {
  const existing = runs.get(commandRunId);
  if (!existing) {
    return;
  }
  const killed = exit?.signal != null && exit.signal.length > 0;
  const next: CommandRunView = {
    ...existing,
    state: killed ? "killed" : "exited",
  };
  if (exit !== undefined) {
    next.exit = exit;
  }
  runs.set(commandRunId, next);
  emit();
}

export function clearSessionCommands(sessionId: string): void {
  for (const [id, run] of [...runs.entries()]) {
    if (run.sessionId === sessionId) {
      runs.delete(id);
    }
  }
  emit();
}
