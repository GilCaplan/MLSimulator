import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/tokens.css";
import "./design/controls.css";
import "./design/templates.css";
import "./design/backgrounds.css";
import "./design/modifiers.css";
import { App } from "./App";

// An embedding host can pass `?dev=1` on first load to keep server controls visible (see
// SettingsPage). Captured here because in-app navigation drops the query string.
try {
  if (new URLSearchParams(window.location.search).get("dev") === "1") sessionStorage.setItem("mlp:embed-dev", "1");
} catch {
  /* storage blocked: server controls stay hidden when embedded */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
