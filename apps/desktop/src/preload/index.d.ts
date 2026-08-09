export interface ElectronAPI {
  versions: NodeJS.ProcessVersions;
  ping: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
