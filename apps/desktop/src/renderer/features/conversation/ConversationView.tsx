import { useRef, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ConversationItemView } from "../../app/stores/sessions.js";
import { ActionCard, type ActionPayload } from "../actions/ActionCard.js";
import { PlanView, type PlanEntryView } from "../plan/PlanView.js";
import { Markdown } from "./Markdown.js";

export interface ConversationViewProps {
  sessionId: string;
  items: ConversationItemView[];
}

const VIRTUALIZE_AFTER = 40;

function payloadText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record["text"] === "string") {
    return record["text"];
  }
  if (typeof record["notice"] === "string") {
    return record["notice"];
  }
  return JSON.stringify(payload);
}

function noticeLabel(payload: unknown, t: (key: string) => string): string {
  if (!payload || typeof payload !== "object") {
    return payloadText(payload);
  }
  const notice = (payload as { notice?: string }).notice;
  if (notice === "approval-by-rule") {
    return t("permission.noticeByRule");
  }
  if (notice === "approval-by-mode") {
    return t("permission.noticeByMode");
  }
  if (notice === "rule-created") {
    return t("permission.noticeRuleCreated");
  }
  return payloadText(payload);
}

function asAction(payload: unknown): ActionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record["toolCallId"] !== "string" || typeof record["title"] !== "string") {
    return null;
  }
  return {
    toolCallId: record["toolCallId"],
    title: record["title"],
    kind: typeof record["kind"] === "string" ? record["kind"] : "other",
    status: typeof record["status"] === "string" ? record["status"] : "pending",
    locations: Array.isArray(record["locations"])
      ? (record["locations"] as ActionPayload["locations"])
      : [],
    content: Array.isArray(record["content"])
      ? (record["content"] as ActionPayload["content"])
      : [],
    ...(typeof record["toolName"] === "string" ? { toolName: record["toolName"] } : {}),
  };
}

function asPlanEntries(payload: unknown): PlanEntryView[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const entries = (payload as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(
    (entry): entry is PlanEntryView =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as PlanEntryView).content === "string",
  );
}

function ItemBody({
  sessionId,
  item,
}: {
  sessionId: string;
  item: ConversationItemView;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (item.kind === "user-message") {
    return (
      <article className="msg user ml-8 rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2">
        <p className="lbl">{t("conversation.you")}</p>
        <Markdown text={payloadText(item.payload)} sessionId={sessionId} itemSeq={item.seq} />
      </article>
    );
  }
  if (item.kind === "agent-message") {
    return (
      <article className="msg agent mr-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
        <p className="lbl">{t("conversation.agent")}</p>
        <Markdown text={payloadText(item.payload)} sessionId={sessionId} itemSeq={item.seq} />
      </article>
    );
  }
  if (item.kind === "agent-thought") {
    return (
      <article className="msg thought mr-8 border-l-2 border-[var(--line-strong)] pl-3 text-sm italic text-[var(--ink2)]">
        <p className="lbl not-italic">{t("conversation.thought")}</p>
        <p>{payloadText(item.payload)}</p>
      </article>
    );
  }
  if (item.kind === "action") {
    const action = asAction(item.payload);
    if (!action) {
      return null;
    }
    return <ActionCard sessionId={sessionId} itemSeq={item.seq} action={action} />;
  }
  if (item.kind === "plan") {
    return <PlanView entries={asPlanEntries(item.payload)} />;
  }
  if (item.kind === "notice") {
    return (
      <article
        className="msg notice rounded-[var(--r-md)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink2)]"
        data-testid="permission-notice"
      >
        <p className="lbl">{t("conversation.notice")}</p>
        <p>{noticeLabel(item.payload, t)}</p>
      </article>
    );
  }
  if (item.kind === "approval") {
    return (
      <article className="msg notice rounded-[var(--r-md)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink2)]">
        <p className="lbl">{t("conversation.notice")}</p>
        <p>{payloadText(item.payload)}</p>
      </article>
    );
  }
  return (
    <article className="msg unknown rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-2 text-sm text-[var(--ink2)]">
      <p className="lbl">{t("conversation.unknown")}</p>
      <p>{t("conversation.unknownHint", { kind: item.kind })}</p>
    </article>
  );
}

/**
 * Conversation transcript with TanStack Virtual for long histories (SC-008).
 * Short conversations render without a virtual window so layout height stays natural.
 */
export function ConversationView({ sessionId, items }: ConversationViewProps): JSX.Element {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualize = items.length >= VIRTUALIZE_AFTER;
  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--ink2)]">
        <p>{t("conversation.emptySession")}</p>
      </div>
    );
  }

  if (!virtualize) {
    return (
      <div
        className="flex flex-col gap-3"
        data-testid="conversation-scroll"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t("conversation.title")}
      >
        {items.map((item) => (
          <div key={item.seq} data-index={item.seq}>
            <ItemBody sessionId={sessionId} item={item} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full min-h-[320px] flex-1 overflow-y-auto"
      data-testid="conversation-scroll"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={t("conversation.title")}
    >
      <div
        className="relative w-full"
        style={{ height: `${String(virtualizer.getTotalSize())}px` }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={item.seq}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${String(row.start)}px)` }}
            >
              <ItemBody sessionId={sessionId} item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
