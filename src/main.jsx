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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
