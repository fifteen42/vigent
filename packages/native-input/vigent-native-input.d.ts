export interface MousePos {
  x: number;
  y: number;
}

export declare function moveMouse(x: number, y: number): void;
export declare function mouseClick(button: string, count: number): void;
export declare function mouseDown(button: string): void;
export declare function mouseUp(button: string): void;
export declare function mouseScroll(dx: number, dy: number): void;
export declare function mouseLocation(): MousePos;
export declare function typeText(text: string): void;
export declare function pressKey(key: string): void;
export declare function pressKeys(keys: string[]): void;
