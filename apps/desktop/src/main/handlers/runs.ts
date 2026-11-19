import { dialog, BrowserWindow } from "electron";
import type { Core, RunFilter } from "@ster/core";
import { t } from "../i18n.js";

export async function runsList(
  core: Core,
  filter: RunFilter | undefined,
  page: { offset?: number; limit: number },
): Promise<unknown> {
  return core.runs.list(filter ?? {}, page);
}

export async function runsGet(core: Core, runId: string): Promise<unknown> {
  return core.runs.get(runId);
}

export async function runsRate(
  core: Core,
  runId: string,
  rating: { value: number; note?: string },
): Promise<unknown> {
  return core.runs.rate(runId, rating);
}

export async function runsJudge(core: Core, runId: string, agentId: string): Promise<unknown> {
  return core.runs.judge(runId, { agentId });
}

export async function runsExport(
  core: Core,
  filter: RunFilter | undefined,
): Promise<{ count: number; path?: string; cancelled?: boolean }> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const dialogOptions = {
    title: t("dialogs.exportRunsTitle"),
    defaultPath: "ster-runs.jsonl",
    filters: [{ name: t("dialogs.exportRunsFilter"), extensions: ["jsonl", "json"] }],
  };
  const result = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) {
    return { count: 0, cancelled: true };
  }
  const exported = await core.runs.export(filter ?? {}, {
    kind: "path",
    path: result.filePath,
  });
  return { count: exported.count, path: result.filePath };
}

export async function runsDelete(
  core: Core,
  input: { ids?: string[] } & RunFilter,
): Promise<{ count: number }> {
  if (Array.isArray(input.ids)) {
    return core.runs.delete({ ids: input.ids });
  }
  return core.runs.delete(input);
}
