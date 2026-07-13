// Electron main process — written in UrLang, compiled to JS by ur-lang/vite.
lao { app, BrowserWindow, ipcMain } "electron" se;
lao { mainDirname, joinPath } "./paths.js" se;

bahar process;

kaam banaoWindow(): kuchnahi {
  pakka win = naya BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      preload: joinPath(mainDirname, "../preload/index.mjs")
    }
  });
  agar (process.env.ELECTRON_RENDERER_URL != khaali) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } warna {
    win.loadFile(joinPath(mainDirname, "../renderer/index.html"));
  }
}

ipcMain.handle("greet", kaam (event: koi, naam: lafz): lafz {
  wapas `Salam ${naam}, Electron main process se (UrLang mein likha hua)!`;
});

app.whenReady().then(banaoWindow);

app.on("window-all-closed", kaam (): kuchnahi {
  agar (process.platform != "darwin") {
    app.quit();
  }
});
