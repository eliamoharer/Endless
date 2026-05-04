import "./styles.css";
import { Game } from "./game/Game";
import { CanvasRenderer } from "./render/renderer";
import { GameOverlay } from "./ui/overlay";

const app = document.querySelector<HTMLElement>("#app");
const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const uiRoot = document.querySelector<HTMLElement>("#game-ui");

if (!app || !canvas || !uiRoot) {
  throw new Error("Math Void could not find #app, canvas, or UI root.");
}

const renderer = new CanvasRenderer(canvas);
const overlay = new GameOverlay(uiRoot);
const game = new Game(renderer, overlay, app);

overlay.setMergeHandler(() => {
  game.requestMerge();
});
overlay.setUpgradeHandler((kind) => {
  game.requestUpgrade(kind);
});

game.start();

window.addEventListener("beforeunload", () => {
  game.destroy();
});
