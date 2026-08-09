import { ipcMain } from "electron";

export function registerIpcHandlers(): void {
  ipcMain.handle("app:ping", () => "pong");
}
