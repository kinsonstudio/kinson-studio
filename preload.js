const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('openFile'),
  openFiles: () => ipcRenderer.invoke('openFiles'),
  chooseOutputDir: () => ipcRenderer.invoke('chooseOutputDir'),
  getDefaultOutputDir: () => ipcRenderer.invoke('getDefaultOutputDir'),
  convert: (input, target, outDir) => ipcRenderer.invoke('convert', input, target, outDir),
  imagesToPdf: (images, output) => ipcRenderer.invoke('images-to-pdf', images, output),
  ocr: (input, outDir) => ipcRenderer.invoke('ocr', input, outDir),
  zipPack: (files, output) => ipcRenderer.invoke('zip-pack', files, output),
  unzip: (zip, outDir) => ipcRenderer.invoke('unzip', zip, outDir),
  checkOffice: (outDir) => ipcRenderer.invoke('check-office', outDir),
  downloadOffice: (outDir) => ipcRenderer.invoke('download-office', outDir),
  onLog: (cb) => ipcRenderer.on('log', (e, msg) => cb(msg)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (e, data) => cb(data))
})
