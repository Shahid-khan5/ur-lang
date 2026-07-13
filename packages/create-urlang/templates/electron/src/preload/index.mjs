import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bridge", {
  greet: (name) => ipcRenderer.invoke("greet", name),
});
