export interface MousePos {
  x: number;
  y: number;
}

export function moveMouse(x: number, y: number): void;
export function mouseClick(button: string, count: number): void;
export function mouseDown(button: string): void;
export function mouseUp(button: string): void;
export function mouseScroll(dx: number, dy: number): void;
export function mouseLocation(): MousePos;
export function typeText(text: string): void;
export function pressKey(key: string): void;
export function pressKeys(keys: string[]): void;
