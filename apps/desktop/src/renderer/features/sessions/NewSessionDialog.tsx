import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { TrustDialog, type FactoryLookupView } from "../factory/TrustDialog.js";

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
 * New session: pick agent + folder, factory trust, first-start confirmation (FR-015/FR-064).
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
  const [factoryLookup, setFactoryLookup] = useState<FactoryLookupView | null>(null);
  const [permissionMode, setPermissionMode] = useState<string | undefined>(undefined);
  const [factorySkipped, setFactorySkipped] = useState(false);

  const refreshAgents = async (): Promise<AgentOption[]> => {
    const list = (await window.ster.agents.list()) as AgentOption[];
    setAgents(list);
    return list;
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setFactoryLookup(null);
    setFactorySkipped(false);
    setPermissionMode(undefined);
    void refreshAgents().then((agentsList) => {
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
  const pendingTrust: FactoryLookupView | null =
    factoryLookup !== null &&
    !factoryLookup.trusted &&
    !factorySkipped &&
    (factoryLookup.trustState === "untrusted" || factoryLookup.trustState === "changed")
      ? factoryLookup
      : null;
  const needsTrust = pendingTrust !== null;

  const applyFactorySelection = (lookup: FactoryLookupView, agentsList: AgentOption[]): void => {
    const applied = lookup.applied;
    if (!applied) {
      return;
    }
    if (applied.permissionMode) {
      setPermissionMode(applied.permissionMode);
    }
    const preferred = applied.defaultAgent;
    if (!preferred) {
      return;
    }
    const byId = agentsList.find((agent) => agent.id === preferred);
    if (byId) {
      setAgentId(byId.id);
      return;
    }
    const byName = agentsList.find((agent) => agent.name === preferred);
    if (byName) {
      setAgentId(byName.id);
    }
  };

  const create = async (): Promise<void> => {
    if (!agentId || !folderToken) {
      setError(t("session.needAgentFolder"));
      return;
    }
    if (needsTrust) {
      setError(t("factory.trustRequired"));
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
      const createPayload: {
        agentId: string;
        folderToken: string;
        permissionMode?: string;
      } = { agentId, folderToken };
      if (permissionMode !== undefined) {
        createPayload.permissionMode = permissionMode;
      }
      const session = (await window.ster.sessions.create(createPayload)) as { id: string };
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
                void window.ster.dialogs.pickFolder().then(async (result) => {
                  const value = result as {
                    cancelled?: boolean;
                    folderToken?: string;
                    displayPath?: string;
                  };
                  if (value.cancelled || !value.folderToken) {
                    return;
                  }
                  setFolderToken(value.folderToken);
                  setDisplayPath(value.displayPath ?? value.folderToken);
                  setFactorySkipped(false);
                  try {
                    const lookup = (await window.ster.factory.find({
                      folderToken: value.folderToken,
                    })) as FactoryLookupView | null;
                    setFactoryLookup(lookup);
                    if (lookup?.trusted) {
                      const agentsList = await refreshAgents();
                      applyFactorySelection(lookup, agentsList);
                    }
                  } catch (err) {
                    setFactoryLookup(null);
                    const code =
                      err && typeof err === "object" && "code" in err
                        ? String(err.code)
                        : "definition-invalid";
                    setError(t(`errors.${code}`, { defaultValue: t("errors.definition-invalid") }));
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

        {pendingTrust ? (
          <TrustDialog
            lookup={pendingTrust}
            busy={busy}
            onSkip={() => {
              setFactorySkipped(true);
            }}
            onTrust={() => {
              const token = folderToken;
              if (token === null) {
                return;
              }
              setBusy(true);
              setError(null);
              void window.ster.factory
                .trust({ folderToken: token, contentHash: pendingTrust.contentHash })
                .then(async () => {
                  const lookup = (await window.ster.factory.find({
                    folderToken: token,
                  })) as FactoryLookupView | null;
                  setFactoryLookup(lookup);
                  const agentsList = await refreshAgents();
                  if (lookup !== null && lookup.trusted) {
                    applyFactorySelection(lookup, agentsList);
                  }
                })
                .catch((err: unknown) => {
                  const code =
                    err && typeof err === "object" && "code" in err
                      ? String(err.code)
                      : "invalid-argument";
                  setError(t(`errors.${code}`, { defaultValue: t("errors.invalid-argument") }));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          />
        ) : null}

        {factoryLookup !== null &&
        factoryLookup.trusted &&
        (factoryLookup.applied?.droppedParts.length ?? 0) > 0 ? (
          <p className="mt-3 text-xs text-[var(--ink2)]" data-testid="factory-dropped-parts">
            {t("factory.droppedByPolicy", {
              parts: (factoryLookup.applied?.droppedParts ?? []).join(", "),
            })}
          </p>
        ) : null}

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
            disabled={busy || needsTrust}
            onClick={() => void create()}
          >
            {t("session.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
