import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export type ShellSection = "conversation" | "agents" | "runs" | "settings";

export interface IconRailProps {
  current: ShellSection;
  onSelect: (section: ShellSection) => void;
}

function RailIcon({ name }: { name: ShellSection }): JSX.Element {
  switch (name) {
    case "conversation":
      return (
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16v9H8l-4 3V6z" />
        </svg>
      );
    case "agents":
      return (
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
        </svg>
      );
    case "runs":
      return (
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 19V5M10 19V9M16 19v-6M22 19V7" />
        </svg>
      );
    case "settings":
      return (
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
  }
}

/**
 * Slim icon rail for primary sections (research.md R20 / mockup).
 */
export function IconRail({ current, onSelect }: IconRailProps): JSX.Element {
  const { t } = useTranslation();
  const items: ShellSection[] = ["conversation", "agents", "runs", "settings"];

  return (
    <nav className="rail" aria-label={t("app.name")}>
      <div className="logo-sq mb-2" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 7h7a4 4 0 0 1 0 8H7V7z" />
          <path d="M7 15h5" />
        </svg>
      </div>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          aria-current={current === item ? "page" : undefined}
          onClick={() => {
            onSelect(item);
          }}
        >
          <RailIcon name={item} />
          <span>{t(`nav.${item}`)}</span>
        </button>
      ))}
    </nav>
  );
}
