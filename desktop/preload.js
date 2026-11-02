// Exposes exactly one function to the page. Every call is checked in main.js to come from the
// app's own app://fame origin. No Node or Electron API reaches the page.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FAMEDesktop', {
  platform: 'windows',
  call: (op, args) => ipcRenderer.invoke('fame:native', op, args || {})
});
