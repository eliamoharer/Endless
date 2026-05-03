import "./styles.css";
import { Game } from "./game/Game";
import { CanvasRenderer } from "./render/renderer";
import { GameOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const uiRoot = document.querySelector<HTMLElement>("#game-ui");

if (!canvas || !uiRoot) {
  throw new Error("Math Void could not find its canvas or UI root.");
}

const renderer = new CanvasRenderer(canvas);
const overlay = new GameOverlay(uiRoot);
const game = new Game(renderer, overlay);

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
