import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./styles/globals.css";

// Vite exposes the configured `base` as BASE_URL; strip the trailing slash so
// BrowserRouter's basename gets e.g. "/dollhouse" not "/dollhouse/".
const base = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={base}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
