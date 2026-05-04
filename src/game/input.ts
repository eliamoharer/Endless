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
  private joystickPointerId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;
  private joystickVx = 0;
  private joystickVy = 0;
  private readonly deadZonePx = 16;
  private readonly maxThrowPx = 130;

  constructor(private readonly pointerRoot: HTMLElement) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clear);
    pointerRoot.addEventListener("pointerdown", this.handlePointerDown);
    pointerRoot.addEventListener("pointermove", this.handlePointerMove);
    pointerRoot.addEventListener("pointerup", this.handlePointerUp);
    pointerRoot.addEventListener("pointercancel", this.handlePointerUp);
    pointerRoot.addEventListener("lostpointercapture", this.handleLostCapture);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.clear);
    this.pointerRoot.removeEventListener("pointerdown", this.handlePointerDown);
    this.pointerRoot.removeEventListener("pointermove", this.handlePointerMove);
    this.pointerRoot.removeEventListener("pointerup", this.handlePointerUp);
    this.pointerRoot.removeEventListener("pointercancel", this.handlePointerUp);
    this.pointerRoot.removeEventListener("lostpointercapture", this.handleLostCapture);
  }

  snapshot(): InputSnapshot {
    let kx = 0;
    let ky = 0;

    for (const code of this.pressed) {
      const direction = movementKeys.get(code);

      if (direction) {
        kx += direction.x;
        ky += direction.y;
      }
    }

    const keyLen = Math.hypot(kx, ky);

    if (keyLen > 0) {
      kx /= keyLen;
      ky /= keyLen;
    }

    let moveX = this.joystickVx + kx;
    let moveY = this.joystickVy + ky;
    const len = Math.hypot(moveX, moveY);

    if (len > 0) {
      moveX /= len;
      moveY /= len;
    }

    return { moveX, moveY };
  }

  consumeMerge(): boolean {
    const wasQueued = this.mergeQueued;
    this.mergeQueued = false;
    return wasQueued;
  }

  private isVirtualPointer(event: PointerEvent): boolean {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }

  /** HUD panels use pointer events; do not steal those touches for movement. */
  private isOverHudPanel(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest(".panel"));
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isVirtualPointer(event) || event.button !== 0) {
      return;
    }

    if (this.isOverHudPanel(event.target)) {
      return;
    }

    this.joystickPointerId = event.pointerId;
    this.joystickOriginX = event.clientX;
    this.joystickOriginY = event.clientY;
    this.joystickVx = 0;
    this.joystickVy = 0;

    try {
      this.pointerRoot.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    const dx = event.clientX - this.joystickOriginX;
    const dy = event.clientY - this.joystickOriginY;
    const dist = Math.hypot(dx, dy);

    if (dist < this.deadZonePx) {
      this.joystickVx = 0;
      this.joystickVy = 0;
      event.preventDefault();
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const strength = Math.min(dist, this.maxThrowPx) / this.maxThrowPx;

    this.joystickVx = nx * strength;
    this.joystickVy = ny * strength;
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    this.releaseJoystickPointer(event.pointerId);
    event.preventDefault();
  };

  private readonly handleLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.joystickPointerId) {
      this.releaseJoystickPointer(event.pointerId);
    }
  };

  private releaseJoystickPointer(pointerId: number): void {
    if (this.joystickPointerId !== pointerId) {
      return;
    }

    this.joystickPointerId = null;
    this.joystickVx = 0;
    this.joystickVy = 0;

    try {
      if (this.pointerRoot.hasPointerCapture(pointerId)) {
        this.pointerRoot.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore */
    }
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

    if (this.joystickPointerId !== null) {
      const id = this.joystickPointerId;
      this.joystickPointerId = null;
      this.joystickVx = 0;
      this.joystickVy = 0;

      try {
        if (this.pointerRoot.hasPointerCapture(id)) {
          this.pointerRoot.releasePointerCapture(id);
        }
      } catch {
        /* ignore */
      }
    }
  };
}
