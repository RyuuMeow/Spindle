import { createRoot } from "react-dom/client";
import Home from "../app/page";
import PlayApp from "../app/play/PlayApp";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  window.yarnDesktop?.play.isWindow ? <PlayApp /> : <Home />,
);
