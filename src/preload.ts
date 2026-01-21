import { contextBridge, ipcRenderer } from 'electron';

// Expose secure IPC API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Placeholder API - will be expanded in Week 2
  ping: () => ipcRenderer.invoke('ping'),
});

console.log('Preload script loaded');
