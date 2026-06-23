import { writeSync } from "node:fs";

export function writeStdoutSync(message: string): void {
  writeSync(1, `${message}\n`);
}

export function writeStderrSync(message: string): void {
  writeSync(2, `${message}\n`);
}
