const {contextBridge,ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('numberExtractionDesktop', Object.freeze({
  isDesktop:true,
  exportSave:text => ipcRenderer.invoke('save:export',text),
  exportPlaytest:text => ipcRenderer.invoke('playtest:export',text),
  importPlaytests:() => ipcRenderer.invoke('playtest:review-import'),
  importSave:() => ipcRenderer.invoke('save:import'),
  setRaidActive:active => ipcRenderer.send('raid:active',active === true),
}));
