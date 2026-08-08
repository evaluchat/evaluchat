import { contextBridge } from "electron";
import type { ElectronAPI } from "./index.d";

const electronAPI: ElectronAPI = {
  versions: process.versions,
  ping: () => "pong",
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
