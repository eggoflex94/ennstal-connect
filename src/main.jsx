import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./release-final.css";
import "./profile-admin-tools.js";
import "./legal-overlay.js";
import "./profile-customization.js";
import "./profile-tools.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
