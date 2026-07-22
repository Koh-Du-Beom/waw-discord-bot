import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

function App() {
  return <main><h1>WAW operations</h1><p role="status">Synthetic dashboard shell</p></main>;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
