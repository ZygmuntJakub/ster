/**
 * Index action locations so the renderer can open files by
 * (sessionId, itemSeq, locationIndex) without sending raw paths.
 */
export function createLocationIndex() {
  const byKey = new Map<string, string[]>();

  const keyOf = (sessionId: string, seq: number): string => `${sessionId}:${String(seq)}`;

  const pathsFromPayload = (payload: unknown): string[] => {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const locations = (payload as { locations?: unknown }).locations;
    if (!Array.isArray(locations)) {
      return [];
    }
    const paths: string[] = [];
    for (const entry of locations) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { path?: unknown }).path === "string"
      ) {
        paths.push((entry as { path: string }).path);
      }
    }
    return paths;
  };

  return {
    indexItem(sessionId: string, seq: number, payload: unknown): void {
      byKey.set(keyOf(sessionId, seq), pathsFromPayload(payload));
    },

    resolve(sessionId: string, seq: number, locationIndex: number): string {
      const paths = byKey.get(keyOf(sessionId, seq)) ?? [];
      const path = paths[locationIndex];
      if (!path) {
        throw new Error("Unknown location");
      }
      return path;
    },

    clearSession(sessionId: string): void {
      for (const key of [...byKey.keys()]) {
        if (key.startsWith(`${sessionId}:`)) {
          byKey.delete(key);
        }
      }
    },
  };
}

export type LocationIndex = ReturnType<typeof createLocationIndex>;
