import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import { join } from "path";
import { registerIpcHandlers } from "./ipc";
import { isSmokeTest } from "./utils";
import { loadWindowState, manageWindowState } from "./window-state";
import type { WindowState } from "./window-state";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  function createMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "Quit",
            accelerator: "CmdOrCtrl+Q",
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  function createWindow(): void {
    const defaults: WindowState = {
      width: 1280,
      height: 800,
      isMaximized: false,
    };
    const stateFilePath = join(app.getPath("userData"), "window-state.json");
    const state = loadWindowState(stateFilePath, defaults);

    mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      ...(state.x !== undefined ? { x: state.x } : {}),
      ...(state.y !== undefined ? { y: state.y } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    manageWindowState(mainWindow, stateFilePath, defaults);

    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  void app.whenReady().then(() => {
    if (isSmokeTest(process.argv)) {
      console.log("SMOKE_OK");
      app.exit(0);
      return;
    }

    registerIpcHandlers();
    createMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
