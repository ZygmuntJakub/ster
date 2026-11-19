import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getCommand, subscribeCommands } from "../../app/stores/commands.js";
import { DiffView } from "../diff/DiffView.js";
import { CommandView } from "../terminal/CommandView.js";

export interface ActionLocationView {
  path: string;
  line?: number;
}

export interface ActionContentView {
  type: string;
  text?: string;
  path?: string;
  oldText?: string;
  newText?: string;
  commandRunId?: string;
}

export interface ActionPayload {
  toolCallId: string;
  title: string;
  toolName?: string;
  kind: string;
  status: string;
  locations: ActionLocationView[];
  content: ActionContentView[];
}

export interface ActionCardProps {
  sessionId: string;
  itemSeq: number;
  action: ActionPayload;
}

/**
 * Action card: title, kind, status, locations, and inline content/diffs.
 */
export function ActionCard({ sessionId, itemSeq, action }: ActionCardProps): JSX.Element {
  const { t } = useTranslation();
  useSyncExternalStore(subscribeCommands, () =>
    action.content
      .filter((block) => block.type === "terminal" && block.commandRunId)
      .map((block) => getCommand(block.commandRunId ?? ""))
      .map((run) =>
        run ? `${run.state}:${String(run.output.length)}:${run.truncated ? "1" : "0"}` : "",
      )
      .join("|"),
  );

  return (
    <article
      className="action-card rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      data-testid={`action-${action.toolCallId}`}
      data-status={action.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="lbl">{t("action.label")}</p>
        <span className={`chip ${action.status}`}>{action.status}</span>
        <span className="text-xs text-[var(--ink2)]">{action.kind}</span>
      </div>
      <h3 className="mt-1 text-sm font-medium text-[var(--ink)]">{action.title}</h3>
      {action.locations.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {action.locations.map((location, index) => (
            <li key={`${location.path}:${String(index)}`}>
              <button
                type="button"
                className="link-btn underline"
                onClick={() => {
                  void window.ster.files.openLocation({
                    sessionId,
                    itemSeq,
                    locationIndex: index,
                  });
                }}
              >
                {location.path}
                {location.line !== undefined ? `:${String(location.line)}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        {action.content.map((block, index) => {
          if (block.type === "diff" && block.path) {
            return (
              <DiffView
                key={`diff-${String(index)}`}
                path={block.path}
                oldText={block.oldText ?? ""}
                newText={block.newText ?? ""}
              />
            );
          }
          if (block.type === "text" && block.text) {
            return (
              <p key={`text-${String(index)}`} className="text-sm text-[var(--ink2)]">
                {block.text}
              </p>
            );
          }
          if (block.type === "terminal" && block.commandRunId) {
            const run = getCommand(block.commandRunId);
            if (!run) {
              return (
                <p key={`terminal-${String(index)}`} className="text-xs text-[var(--ink2)]">
                  {t("command.waiting")}
                </p>
              );
            }
            return <CommandView key={`terminal-${String(index)}`} run={run} />;
          }
          return null;
        })}
      </div>
    </article>
  );
}
