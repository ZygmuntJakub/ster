import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { PanelExtension } from "../types.js";

/**
 * Example adopter panel — shows how to add a sidebar section without touching ACP code.
 */
function ExamplePanel({ sessionId }: { sessionId?: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      className="conv col px-6 py-4"
      aria-label={t("extensions.example.title")}
      data-testid="example-panel"
      data-session-id={sessionId ?? ""}
    >
      <h1 className="title mb-2">{t("extensions.example.title")}</h1>
      <p className="muted text-sm">{t("extensions.example.body")}</p>
    </section>
  );
}

export const examplePanel: PanelExtension = {
  id: "example-panel",
  titleKey: "extensions.example.nav",
  placement: "sidebar",
  component: ExamplePanel,
};
