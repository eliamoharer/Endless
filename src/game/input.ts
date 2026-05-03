import type { InputSnapshot } from "./types";

const movementKeys = new Map<string, { x: number; y: number }>([
  ["KeyW", { x: 0, y: -1 }],
  ["ArrowUp", { x: 0, y: -1 }],
  ["KeyS", { x: 0, y: 1 }],
  ["ArrowDown", { x: 0, y: 1 }],
  ["KeyA", { x: -1, y: 0 }],
  ["ArrowLeft", { x: -1, y: 0 }],
  ["KeyD", { x: 1, y: 0 }],
  ["ArrowRight", { x: 1, y: 0 }],
]);

export class InputController {
  private readonly pressed = new Set<string>();
  private mergeQueued = false;

  constructor() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clear);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.clear);
  }

  snapshot(): InputSnapshot {
    let moveX = 0;
    let moveY = 0;

    for (const code of this.pressed) {
      const direction = movementKeys.get(code);

      if (direction) {
        moveX += direction.x;
        moveY += direction.y;
      }
    }

    const length = Math.hypot(moveX, moveY);

    if (length > 0) {
      moveX /= length;
      moveY /= length;
    }

    return { moveX, moveY };
  }

  consumeMerge(): boolean {
    const wasQueued = this.mergeQueued;
    this.mergeQueued = false;
    return wasQueued;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (movementKeys.has(event.code)) {
      event.preventDefault();
      this.pressed.add(event.code);
      return;
    }

    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();

      if (!event.repeat) {
        this.mergeQueued = true;
      }
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (movementKeys.has(event.code)) {
      event.preventDefault();
      this.pressed.delete(event.code);
    }
  };

  private readonly clear = (): void => {
    this.pressed.clear();
    this.mergeQueued = false;
  };
}
