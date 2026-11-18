export type CommandLifecycleState = "running" | "exited" | "killed" | "released";

/**
 * Resolve the UI command state after an exit event.
 * Windows taskkill often reports a numeric code with a null signal, so callers
 * must prefer an explicit core `state` (or a prior `killed` UI state).
 */
export function resolveCommandExitState(input: {
  previous: CommandLifecycleState;
  exit?: { code?: number | null; signal?: string | null };
  state?: CommandLifecycleState;
}): Exclude<CommandLifecycleState, "running"> {
  // Once the UI marks a run killed (optimistic stop or core event), never regress to exited.
  if (input.previous === "killed" || input.state === "killed") {
    return "killed";
  }
  if (input.state === "exited" || input.state === "released") {
    return input.state;
  }
  if (input.exit?.signal != null && input.exit.signal.length > 0) {
    return "killed";
  }
  return "exited";
}
