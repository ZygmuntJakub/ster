import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { AgentList } from "./AgentList.js";
import { CustomAgentForm } from "./CustomAgentForm.js";
import { InstallDialog, type InstallPlanView } from "./InstallDialog.js";

/**
 * Agents section: list, install, custom form.
 */
export function AgentsPane(): JSX.Element {
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [plan, setPlan] = useState<InstallPlanView | null>(null);

  return (
    <section className="conv col px-6 py-4" aria-label={t("agents.title")}>
      <h1 className="title mb-4">{t("agents.title")}</h1>
      <AgentList
        refreshKey={refreshKey}
        onInstall={(agentId) => {
          void window.ster.agents.planInstall({ agentId }).then((next) => {
            setPlan(next as InstallPlanView);
          });
        }}
        onRemove={(agentId) => {
          void window.ster.agents.remove({ agentId }).then(() => {
            setRefreshKey((n) => n + 1);
          });
        }}
      />
      <div className="mt-8">
        <CustomAgentForm
          onSaved={() => {
            setRefreshKey((n) => n + 1);
          }}
        />
      </div>
      {plan ? (
        <InstallDialog
          plan={plan}
          onClose={() => {
            setPlan(null);
          }}
          onInstalled={() => {
            setPlan(null);
            setRefreshKey((n) => n + 1);
          }}
        />
      ) : null}
    </section>
  );
}
