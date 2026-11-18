import { useState, type JSX, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

export interface ComposerProps {
  sessionId: string;
  disabled?: boolean;
  working?: boolean;
  onSent?: () => void;
}

/**
 * Composer with send/stop. Attachments are picked via native dialog tokens.
 */
export function Composer({ sessionId, disabled, working, onSent }: ComposerProps): JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Array<{ token: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || disabled || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.ster.sessions.prompt({
        sessionId,
        text: trimmed,
        attachmentTokens: attachments.map((a) => a.token),
      });
      setText("");
      setAttachments([]);
      onSent?.();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err ? String(err.code) : "invalid-argument";
      setError(t(`errors.${code}`, { defaultValue: t("errors.invalid-argument") }));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send();
  };

  return (
    <form
      className="composer border-t border-[var(--line)] bg-[var(--panel)] p-3"
      onSubmit={onSubmit}
    >
      {error ? <p className="mb-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {attachments.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2 text-xs text-[var(--ink2)]">
          {attachments.map((file) => (
            <li key={file.token} className="rounded-full border border-[var(--line)] px-2 py-0.5">
              {file.name}
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        className="input min-h-20 w-full resize-y"
        value={text}
        disabled={disabled || busy}
        placeholder={t("composer.placeholder")}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn ghost"
          disabled={disabled || busy}
          onClick={() => {
            void (async () => {
              const result = (await window.ster.dialogs.pickAttachments({ sessionId })) as {
                cancelled?: boolean;
                attachments?: Array<{ token: string; name: string }>;
              };
              if (!result.cancelled && result.attachments) {
                const next = result.attachments;
                setAttachments((prev) => [...prev, ...next]);
              }
            })();
          }}
        >
          {t("composer.attach")}
        </button>
        <div className="grow" />
        {working ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              void window.ster.sessions.cancel({ sessionId });
            }}
          >
            {t("composer.stop")}
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={disabled || busy || !text.trim()}>
            {t("composer.send")}
          </button>
        )}
      </div>
    </form>
  );
}
