import type { JSX } from "react";
import { useTranslation } from "react-i18next";

/**
 * Main conversation area beside the session board.
 */
export function ConversationPane(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="conv col" aria-label={t("conversation.title")}>
      <header className="chead">
        <h1 className="title">{t("app.name")}</h1>
        <p className="muted text-sm">{t("app.tagline")}</p>
      </header>
      <div className="msgs grow scroll">
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--ink2)]">
          <p>{t("conversation.empty")}</p>
          <p className="mt-1 faint">{t("conversation.placeholder")}</p>
        </div>
      </div>
    </section>
  );
}
