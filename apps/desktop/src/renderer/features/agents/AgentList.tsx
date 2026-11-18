import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

export interface AgentRow {
  id: string;
  name: string;
  origin: string;
  readiness: string;
  version?: string;
  distribution?: string;
}

export interface AgentListProps {
  onInstall: (agentId: string) => void;
  onRemove: (agentId: string) => void;
  refreshKey?: number;
}

/**
 * Agent list with readiness and registry refresh (US4).
 */
export function AgentList({ onInstall, onRemove, refreshKey = 0 }: AgentListProps): JSX.Element {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [registry, setRegistry] = useState<{ reachable: boolean; error?: string }>({
    reachable: false,
  });

  useEffect(() => {
    void window.ster.agents.list().then((list) => {
      setAgents(list as AgentRow[]);
    });
    void window.ster.agents.refreshRegistry({}).then((status) => {
      setRegistry(status as { reachable: boolean; error?: string });
    });
  }, [refreshKey]);

  return (
    <div className="flex flex-col gap-3" data-testid="agent-list">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink2)]" data-testid="registry-status">
          {registry.reachable
            ? t("agents.registryReachable")
            : t("agents.registryOffline", { error: registry.error ?? "" })}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.ster.agents
              .refreshRegistry({ force: true })
              .then((status) => {
                setRegistry(status as { reachable: boolean; error?: string });
                return window.ster.agents.list();
              })
              .then((list) => {
                setAgents(list as AgentRow[]);
              });
          }}
        >
          {t("agents.refresh")}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
            data-testid={`agent-${agent.id}`}
            data-readiness={agent.readiness}
          >
            <div className="min-w-0">
              <p className="font-medium text-[var(--ink)]">{agent.name}</p>
              <p className="faint mono text-xs">
                {agent.id} · {t(`agents.readiness.${agent.readiness}`, agent.readiness)} ·{" "}
                {agent.origin}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {agent.readiness === "not-installed" || agent.readiness === "update-available" ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onInstall(agent.id);
                  }}
                >
                  {agent.readiness === "update-available"
                    ? t("agents.update")
                    : t("agents.install")}
                </button>
              ) : null}
              {agent.origin === "registry" && agent.readiness === "ready" ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    onRemove(agent.id);
                  }}
                >
                  {t("agents.remove")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
