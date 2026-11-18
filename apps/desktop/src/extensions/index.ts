/**
 * Single registration file for desktop extensions (research.md R16).
 * Add an import and push onto `panelExtensions` — no other wiring required.
 */
import { examplePanel } from "./example-panel/index.js";
import type { PanelExtension } from "./types.js";

export type { PanelExtension } from "./types.js";

export const panelExtensions: readonly PanelExtension[] = [examplePanel];

export function sidebarPanels(): readonly PanelExtension[] {
  return panelExtensions.filter((panel) => panel.placement === "sidebar");
}

export function settingsPanels(): readonly PanelExtension[] {
  return panelExtensions.filter((panel) => panel.placement === "settings");
}

export function sessionSidePanels(): readonly PanelExtension[] {
  return panelExtensions.filter((panel) => panel.placement === "session-side");
}
