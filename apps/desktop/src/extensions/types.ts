import type { ComponentType, JSX } from "react";

/**
 * Renderer panel extension (contracts/core-api.md `PanelExtension`).
 * Adopters register panels in `extensions/index.ts` (research.md R16).
 */
export interface PanelExtension {
  id: string;
  /** i18n key for the rail / settings label. */
  titleKey: string;
  placement: "sidebar" | "session-side" | "settings";
  /** Receives data only through the bridge — no direct Node/Electron APIs. */
  component: ComponentType<{ sessionId?: string }>;
}

export type PanelExtensionElement = JSX.Element;
