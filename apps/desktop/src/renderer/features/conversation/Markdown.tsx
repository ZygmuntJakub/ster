import { useState, type JSX, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";

export interface MarkdownProps {
  text: string;
  sessionId?: string;
  itemSeq?: number;
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
          }, 1200);
        });
      }}
    >
      {copied ? t("conversation.copied") : t("conversation.copy")}
    </button>
  );
}

/**
 * Safe Markdown: no raw HTML, no remote images; links open via confirm bridge.
 */
export function Markdown({ text, sessionId, itemSeq }: MarkdownProps): JSX.Element {
  const { t } = useTranslation();
  let linkCounter = 0;

  return (
    <div className="md prose-ster text-sm leading-relaxed">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => {
            const index = linkCounter;
            linkCounter += 1;
            if (!href || !sessionId || itemSeq === undefined) {
              return <span className="underline">{children}</span>;
            }
            return (
              <button
                type="button"
                className="link-btn underline"
                onClick={() => {
                  void window.ster.links.open({
                    sessionId,
                    itemSeq,
                    linkIndex: index,
                  });
                }}
              >
                {children}
              </button>
            );
          },
          img: () => <span className="faint text-xs">[{t("conversation.imageBlocked")}]</span>,
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            const raw = Array.isArray(children)
              ? children.filter((part): part is string => typeof part === "string").join("")
              : typeof children === "string"
                ? children
                : "";
            const value = raw.replace(/\n$/, "");
            if (!isBlock) {
              return <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">{children}</code>;
            }
            return (
              <div className="my-2 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
                <div className="flex justify-end border-b border-[var(--line)] bg-[var(--surface)] px-2 py-1">
                  <CopyButton value={value} />
                </div>
                <pre className="overflow-x-auto bg-[var(--surface-2)] p-3 text-xs">
                  <code>{value}</code>
                </pre>
              </div>
            );
          },
          p: ({ children }: { children?: ReactNode }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      <div className="mt-1">
        <CopyButton value={text} />
      </div>
    </div>
  );
}
