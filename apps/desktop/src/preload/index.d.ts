export interface ElectronAPI {
  versions: NodeJS.ProcessVersions;
  ping: () => string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
