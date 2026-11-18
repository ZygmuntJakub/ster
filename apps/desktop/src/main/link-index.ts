/**
 * Index http(s) links found in conversation item payloads so the renderer can
 * open them by (sessionId, itemSeq, linkIndex) without sending raw URLs.
 */
const LINK_RE = /https?:\/\/[^\s)<>"']+/gi;

export function createLinkIndex() {
  const byKey = new Map<string, string[]>();

  const keyOf = (sessionId: string, seq: number): string => `${sessionId}:${String(seq)}`;

  const extract = (payload: unknown): string[] => {
    const texts: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") {
        texts.push(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }
        return;
      }
      if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          visit(nested);
        }
      }
    };
    visit(payload);
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const text of texts) {
      for (const match of text.matchAll(LINK_RE)) {
        const url = match[0];
        if (url && !seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    }
    return urls;
  };

  return {
    indexItem(sessionId: string, seq: number, payload: unknown): void {
      byKey.set(keyOf(sessionId, seq), extract(payload));
    },

    resolve(sessionId: string, seq: number, linkIndex: number): string {
      const urls = byKey.get(keyOf(sessionId, seq)) ?? [];
      const url = urls[linkIndex];
      if (!url) {
        throw new Error("Unknown link");
      }
      return url;
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

export type LinkIndex = ReturnType<typeof createLinkIndex>;
