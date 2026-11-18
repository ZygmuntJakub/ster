import { useState, type JSX, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

export interface CustomAgentFormProps {
  onSaved: () => void;
}

/**
 * Add a custom agent by command (FR-021).
 */
export function CustomAgentForm({ onSaved }: CustomAgentFormProps): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const args = argsText
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    void window.ster.agents.saveCustom({ name, command, args, env: {} }).then(() => {
      setName("");
      setCommand("");
      setArgsText("");
      onSaved();
    });
  };

  return (
    <form
      className="flex max-w-lg flex-col gap-3"
      onSubmit={submit}
      data-testid="custom-agent-form"
    >
      <h2 className="lbl">{t("agents.customTitle")}</h2>
      <label className="f">
        {t("agents.customName")}
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
        />
      </label>
      <label className="f">
        {t("agents.customCommand")}
        <input
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
          }}
          required
        />
      </label>
      <label className="f">
        {t("agents.customArgs")}
        <input
          value={argsText}
          onChange={(e) => {
            setArgsText(e.target.value);
          }}
        />
      </label>
      <button type="submit" className="btn primary self-start">
        {t("agents.saveCustom")}
      </button>
    </form>
  );
}
