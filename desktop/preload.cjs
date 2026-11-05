const {contextBridge,ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('numberExtractionDesktop', Object.freeze({
  isDesktop:true,
  exportSave:text => ipcRenderer.invoke('save:export',text),
  importSave:() => ipcRenderer.invoke('save:import'),
  setRaidActive:active => ipcRenderer.send('raid:active',active === true),
}));
