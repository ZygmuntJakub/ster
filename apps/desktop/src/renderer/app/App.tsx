import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { AgentsPane } from "../features/agents/AgentsPane.js";
import { ConversationPane } from "./layout/ConversationPane.js";
import { IconRail, type ShellSection } from "./layout/IconRail.js";
import { SessionBoard } from "./layout/SessionBoard.js";
import { SettingsPane } from "./layout/SettingsPane.js";
import { applyTheme, getSettings, setSettings, subscribeSettings } from "./stores/settings.js";

/**
 * Application shell: icon rail, session board, conversation, settings (R20).
 */
export function App(): JSX.Element {
  const { i18n } = useTranslation();
  const [section, setSection] = useState<ShellSection>("conversation");
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeSettings(() => {
        setTick((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    const state = { active: true };
    void (async () => {
      try {
        const remote = await window.ster.settings.get();
        if (!state.active) {
          return;
        }
        setSettings({
          language: remote.language,
          theme: remote.theme,
          defaultPermissionMode: remote.defaultPermissionMode,
          ...(remote.defaultAgentId !== undefined ? { defaultAgentId: remote.defaultAgentId } : {}),
        });
        applyTheme(remote.theme);
        if (remote.language === "en" || remote.language === "pl") {
          await i18n.changeLanguage(remote.language);
        }
      } catch {
        if (state.active) {
          applyTheme(getSettings().theme);
        }
      }
    })();
    return () => {
      state.active = false;
    };
  }, [i18n]);

  return (
    <div id="app" className="flex h-full min-h-screen">
      <div className="frame">
        <IconRail current={section} onSelect={setSection} />
        {section === "settings" ? (
          <SettingsPane
            onLanguageChange={(language) => {
              if (language === "en" || language === "pl") {
                void i18n.changeLanguage(language);
              }
            }}
          />
        ) : section === "agents" ? (
          <AgentsPane />
        ) : section === "conversation" ? (
          <div className="mainc flex min-w-0 flex-1">
            <SessionBoard />
            <ConversationPane />
          </div>
        ) : (
          <section className="conv col px-6 py-4">
            <h1 className="title">{i18n.t(`nav.${section}`)}</h1>
            <p className="muted mt-2 text-sm">{i18n.t("board.emptyHint")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
