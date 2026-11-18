import type { JSX } from "react";
import { SessionList } from "../../features/sessions/SessionList.js";

/**
 * Session board shell — delegates to SessionList (US6).
 */
export function SessionBoard(): JSX.Element {
  return <SessionList />;
}
