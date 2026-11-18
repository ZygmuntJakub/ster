import type { JSX } from "react";

/**
 * Application shell. Layout and stores land in T034.
 */
export function App(): JSX.Element {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
      <main className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] px-8 py-6 shadow-[var(--shadow)]">
        <h1 className="text-xl font-semibold tracking-tight">Ster</h1>
        <p className="mt-2 text-sm text-[var(--ink2)]">ACP desktop client scaffold</p>
      </main>
    </div>
  );
}
