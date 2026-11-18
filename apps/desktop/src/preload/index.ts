import { contextBridge } from "electron";

/**
 * Fixed bridge surface. Channel allow-list and schemas land in T031.
 */
contextBridge.exposeInMainWorld("ster", {
  version: "0.0.0",
});
