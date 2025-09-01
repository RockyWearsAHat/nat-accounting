import React from "react";
import { AppWithRouter } from "./pages/App";
import { renderToString } from "react-dom/server";

export async function render(_url: string) {
  const html = renderToString(<AppWithRouter />);
  // Add more dynamic head elements later (SEO, meta) if needed
  const head = "";
  return { html, head };
}
