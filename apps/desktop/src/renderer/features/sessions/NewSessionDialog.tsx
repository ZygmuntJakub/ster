import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

export interface AgentOption {
  id: string;
  name: string;
  origin: string;
  readiness: string;
  confirmedAt?: string;
  launch?: { command: string; args: string[] };
}

export interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

/**
 * New session: pick agent + folder, first-start confirmation, confinement notice (FR-015).
 */
export function NewSessionDialog({
  open,
  onClose,
  onCreated,
}: NewSessionDialogProps): JSX.Element | null {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [folderToken, setFolderToken] = useState<string | null>(null);
  const [displayPath, setDisplayPath] = useState<string | null>(null);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    void window.ster.agents.list().then((list) => {
      const agentsList = list as AgentOption[];
      setAgents(agentsList);
      const first = agentsList[0];
      if (first) {
        setAgentId(first.id);
      }
    });
  }, [open]);

  if (!open) {
    return null;
  }

  const selected = agents.find((a) => a.id === agentId);
  const needsConfirm = Boolean(selected && !selected.confirmedAt);

  const create = async (): Promise<void> => {
    if (!agentId || !folderToken) {
      setError(t("session.needAgentFolder"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (needsConfirm) {
        if (!confirmLaunch) {
          setError(t("session.confirmRequired"));
          setBusy(false);
          return;
        }
        await window.ster.agents.confirmFirstStart({ agentId });
      }
      const session = (await window.ster.sessions.create({
        agentId,
        folderToken,
      })) as { id: string };
      onCreated(session.id);
      onClose();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err ? String(err.code) : "invalid-argument";
      setError(t(`errors.${code}`, { defaultValue: t("errors.invalid-argument") }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-title"
        className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg"
      >
        <h2 id="new-session-title" className="title text-base">
          {t("session.newTitle")}
        </h2>
        <p className="muted mt-1 text-sm">{t("session.newHint")}</p>

        <label className="mt-4 block text-sm">
          <span className="lbl">{t("session.agent")}</span>
          <select
            className="input mt-1 w-full"
            value={agentId}
            onChange={(event) => {
              setAgentId(event.target.value);
              setConfirmLaunch(false);
            }}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.origin})
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3">
          <p className="lbl">{t("session.folder")}</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                void window.ster.dialogs.pickFolder().then((result) => {
                  const value = result as {
                    cancelled?: boolean;
                    folderToken?: string;
                    displayPath?: string;
                  };
                  if (!value.cancelled && value.folderToken) {
                    setFolderToken(value.folderToken);
                    setDisplayPath(value.displayPath ?? value.folderToken);
                  }
                });
              }}
            >
              {t("session.pickFolder")}
            </button>
            <span className="truncate text-sm text-[var(--ink2)]">
              {displayPath ?? t("session.noFolder")}
            </span>
          </div>
        </div>

        {needsConfirm && selected?.launch ? (
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmLaunch}
              onChange={(event) => {
                setConfirmLaunch(event.target.checked);
              }}
            />
            <span>
              {t("session.confirmLaunch", {
                command: [selected.launch.command, ...selected.launch.args].join(" "),
                origin: selected.origin,
              })}
            </span>
          </label>
        ) : null}

        <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--ink2)]">
          <p className="lbl text-[var(--ink)]">{t("session.confinementTitle")}</p>
          <p className="mt-1">{t("session.confinementBody")}</p>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            {t("session.cancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void create()}
          >
            {t("session.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
