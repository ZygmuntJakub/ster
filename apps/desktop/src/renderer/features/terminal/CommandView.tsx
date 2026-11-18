import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { markCommandExited, type CommandRunView } from "../../app/stores/commands.js";

export interface CommandViewProps {
  run: CommandRunView;
}

/**
 * Live command output card: command line, stream, truncation, exit, stop.
 */
export function CommandView({ run }: CommandViewProps): JSX.Element {
  const { t } = useTranslation();
  const commandLine = [run.command, ...run.args].filter((part) => part.length > 0).join(" ");
  const running = run.state === "running";

  return (
    <div
      className="command-view rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--canvas)] p-2"
      data-testid={`command-${run.commandRunId}`}
      data-state={run.state}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="lbl">{t("command.label")}</p>
        {running ? (
          <button
            type="button"
            className="btn danger"
            data-testid={`command-stop-${run.commandRunId}`}
            onClick={() => {
              markCommandExited(run.commandRunId, undefined, "killed");
              void window.ster.sessions.killCommand({ commandRunId: run.commandRunId });
            }}
          >
            {t("command.stop")}
          </button>
        ) : null}
      </div>
      <pre className="mt-1 overflow-x-auto text-xs text-[var(--ink)]">{commandLine || "—"}</pre>
      {run.cwd ? <p className="mt-1 text-xs text-[var(--ink2)]">{run.cwd}</p> : null}
      <pre
        className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-sm)] bg-[var(--surface)] p-2 text-xs text-[var(--ink)]"
        data-testid={`command-output-${run.commandRunId}`}
      >
        {run.output.length > 0 ? run.output : t("command.waiting")}
      </pre>
      {run.truncated ? (
        <p className="mt-1 text-xs text-[var(--ink2)]" data-testid="command-truncated">
          {t("command.truncated")}
        </p>
      ) : null}
      {run.state !== "running" ? (
        <p className="mt-1 text-xs text-[var(--ink2)]" data-testid="command-exit">
          {t("command.exit", {
            code: run.exit?.code == null ? "—" : String(run.exit.code),
            signal: run.exit?.signal ?? "—",
          })}
        </p>
      ) : null}
    </div>
  );
}
