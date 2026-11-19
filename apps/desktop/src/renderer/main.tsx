import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { setupI18n } from "./i18n/index.js";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

await setupI18n("en");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
