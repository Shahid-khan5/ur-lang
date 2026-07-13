import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "./App.urx";

createRoot(document.getElementById("root")).render(createElement(App, { naam: "duniya" }));
