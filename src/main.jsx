import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./release-final.css";
import "./launch-fixes.css";
import "./profile-simple.css";
import "./profile-customization.js";
import "./homepage-author.css";
import "./profile-tools.css";
import "./admin-online-status.js";
import "./mobile-parity.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
