import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface ManagedBadgeProps {
  /** When false, render nothing. */
  managed?: boolean;
}

/**
 * Marks a setting or control locked by organization policy (US10).
 */
export function ManagedBadge({ managed = true }: ManagedBadgeProps): JSX.Element | null {
  const { t } = useTranslation();
  if (!managed) {
    return null;
  }
  return (
    <span
      className="ml-2 align-middle text-xs font-medium text-[var(--ink2)]"
      data-testid="managed-badge"
    >
      {t("policy.managed")}
    </span>
  );
}
