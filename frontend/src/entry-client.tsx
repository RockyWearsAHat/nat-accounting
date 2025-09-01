import React from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { AppWithRouter } from "./pages/App";

const container = document.getElementById("root")!;
if (container.hasChildNodes()) {
  hydrateRoot(container, <AppWithRouter />);
} else {
  createRoot(container).render(<AppWithRouter />);
}
