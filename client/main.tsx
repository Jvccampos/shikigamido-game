import { render } from "preact";
import { App } from "./index.js";
import "./style.css";
import "./arena.css";
import "./duel-hud.css";
import "./tactical-hud.css";
render(<App />, document.getElementById("app")!);
