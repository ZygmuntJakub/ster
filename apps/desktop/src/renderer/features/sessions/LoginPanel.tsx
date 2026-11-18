import { useEffect, useRef, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface AuthMethodView {
  id: string;
  name: string;
  type: "agent" | "terminal";
  description?: string;
}

export interface LoginPanelProps {
  sessionId: string;
  methods: AuthMethodView[];
  onAuthenticated?: () => void;
}

/**
 * Login-required panel: agent-type authenticate button + embedded xterm for terminal methods.
 */
export function LoginPanel({ sessionId, methods, onAuthenticated }: LoginPanelProps): JSX.Element {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [terminalToken, setTerminalToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hostRef.current || !terminalToken) {
      return;
    }
    const term = new Terminal({
      convertEol: true,
      fontSize: 12,
      theme: { background: "#111111", foreground: "#f5f5f5" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;

    term.onData((data) => {
      void window.ster.login.terminal.input({ terminalToken, data });
    });

    const onResize = (): void => {
      fit.fit();
      void window.ster.login.terminal.resize({
        terminalToken,
        cols: term.cols,
        rows: term.rows,
      });
    };
    window.addEventListener("resize", onResize);

    const unsubscribe = window.ster.events.subscribe((event) => {
      if (!event || typeof event !== "object" || !("type" in event)) {
        return;
      }
      const typed = event as {
        type: string;
        terminalToken?: string;
        data?: string;
        exitCode?: number;
      };
      if (
        typed.type === "login.terminal.data" &&
        typed.terminalToken === terminalToken &&
        typed.data
      ) {
        term.write(typed.data);
      }
      if (typed.type === "login.terminal.exit" && typed.terminalToken === terminalToken) {
        if (typed.exitCode === 0) {
          onAuthenticated?.();
        } else {
          setError(t("login.terminalFailed"));
        }
        setTerminalToken(null);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
    };
  }, [terminalToken, onAuthenticated, t]);

  const agentMethods = methods.filter((m) => m.type === "agent");
  const terminalMethods = methods.filter((m) => m.type === "terminal");

  return (
    <div className="login-panel m-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="title text-base">{t("login.title")}</h2>
      <p className="muted mt-1 text-sm">{t("login.hint")}</p>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-3 flex flex-col gap-2">
        {agentMethods.map((method) => (
          <button
            key={method.id}
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.ster.sessions
                .authenticate({ sessionId, methodId: method.id })
                .then(() => {
                  onAuthenticated?.();
                })
                .catch((err: unknown) => {
                  const code =
                    err && typeof err === "object" && "code" in err
                      ? String(err.code)
                      : "login-required";
                  setError(t(`errors.${code}`, { defaultValue: t("errors.login-required") }));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {method.name}
          </button>
        ))}

        {terminalMethods.map((method) => (
          <button
            key={method.id}
            type="button"
            className="btn"
            disabled={busy || terminalToken !== null}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.ster.login.terminal
                .start({ sessionId, methodId: method.id })
                .then((result) => {
                  const value = result as { terminalToken: string; commandPreview: string };
                  setPreview(value.commandPreview);
                  setTerminalToken(value.terminalToken);
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : t("login.terminalUnavailable"));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {method.name}
          </button>
        ))}
      </div>

      {preview ? (
        <p className="mt-3 font-mono text-xs text-[var(--ink2)]">
          {t("login.command")}: {preview}
        </p>
      ) : null}
      {terminalToken ? (
        <div ref={hostRef} className="mt-3 h-56 w-full overflow-hidden rounded bg-black" />
      ) : null}
      <p className="mt-3 text-xs text-[var(--ink2)]">{t("login.fallback")}</p>
    </div>
  );
}
