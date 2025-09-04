import React from "react";
import { createRoot } from "react-dom/client";
import { AppWithRouter } from "./pages/App";

const container = document.getElementById("root")!;
createRoot(container).render(<AppWithRouter />);
