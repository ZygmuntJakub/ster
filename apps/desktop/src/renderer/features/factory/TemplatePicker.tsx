import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

export interface FactoryTemplateView {
  id: string;
  title: string;
  description?: string;
  inputs?: Array<{ name: string; label: string; default?: string }>;
}

export interface TemplatePickerProps {
  sessionId: string;
  onRendered: (text: string) => void;
}

/**
 * Pick a factory task template, fill blanks, and insert the rendered prompt (FR-067).
 */
export function TemplatePicker({ sessionId, onRendered }: TemplatePickerProps): JSX.Element | null {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<FactoryTemplateView[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.ster.factory.applied({ sessionId }).then((result) => {
      const applied = result as { templates?: FactoryTemplateView[] } | null;
      setTemplates(applied?.templates ?? []);
    });
  }, [sessionId]);

  if (templates.length === 0) {
    return null;
  }

  const selected = templates.find((template) => template.id === templateId);

  const apply = async (): Promise<void> => {
    if (!templateId) {
      return;
    }
    setError(null);
    try {
      const result = (await window.ster.factory.renderTemplate({
        sessionId,
        templateId,
        inputs: values,
      })) as { text: string };
      onRendered(result.text);
      setOpen(false);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err ? String(err.code) : "invalid-argument";
      setError(t(`errors.${code}`, { defaultValue: t("errors.invalid-argument") }));
    }
  };

  return (
    <div className="relative" data-testid="factory-template-picker">
      <button
        type="button"
        className="btn ghost text-xs"
        onClick={() => {
          setOpen((value) => !value);
          if (!templateId && templates[0]) {
            setTemplateId(templates[0].id);
            const defaults: Record<string, string> = {};
            for (const input of templates[0].inputs ?? []) {
              if (input.default !== undefined) {
                defaults[input.name] = input.default;
              }
            }
            setValues(defaults);
          }
        }}
      >
        {t("factory.templates")}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-lg">
          <label className="block text-sm">
            <span className="lbl">{t("factory.templateLabel")}</span>
            <select
              className="input mt-1 w-full"
              value={templateId}
              onChange={(event) => {
                const nextId = event.target.value;
                setTemplateId(nextId);
                const next = templates.find((template) => template.id === nextId);
                const defaults: Record<string, string> = {};
                for (const input of next?.inputs ?? []) {
                  if (input.default !== undefined) {
                    defaults[input.name] = input.default;
                  }
                }
                setValues(defaults);
              }}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          {selected?.description ? (
            <p className="mt-2 text-xs text-[var(--ink2)]">{selected.description}</p>
          ) : null}
          {(selected?.inputs ?? []).map((input) => (
            <label key={input.name} className="mt-2 block text-sm">
              <span className="lbl">{input.label}</span>
              <input
                className="input mt-1 w-full"
                value={values[input.name] ?? ""}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [input.name]: event.target.value }));
                }}
              />
            </label>
          ))}
          {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("session.cancel")}
            </button>
            <button type="button" className="btn primary" onClick={() => void apply()}>
              {t("factory.insertTemplate")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
