/**
 * Headless example (FR-061). Drives the core without a UI.
 * Full createCore wiring lands in T028; this scaffold proves the script entry exists.
 */
import { CORE_VERSION } from "@ster/core";

console.log(JSON.stringify({ ok: true, coreVersion: CORE_VERSION }));
