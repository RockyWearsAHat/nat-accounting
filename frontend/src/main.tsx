// Legacy CSR only entry (kept if needed). SSR uses entry-client instead.
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./pages/App";

const container = document.getElementById("root")!;
if (container.hasChildNodes()) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
