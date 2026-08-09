import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI } from "./index.d";

const electronAPI: ElectronAPI = {
  versions: process.versions,
  ping: () => ipcRenderer.invoke("app:ping"),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
