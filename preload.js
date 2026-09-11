const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('openFile'),
  openFiles: () => ipcRenderer.invoke('openFiles'),
  chooseOutputDir: () => ipcRenderer.invoke('chooseOutputDir'),
  getDefaultOutputDir: () => ipcRenderer.invoke('getDefaultOutputDir'),
  convert: (inputPath, targetExt, outputDir) => ipcRenderer.invoke('convert', inputPath, targetExt, outputDir),
  ocr: (inputPath) => ipcRenderer.invoke('ocr', inputPath),
  zipPack: (filePaths, outputPath) => ipcRenderer.invoke('zip-pack', filePaths, outputPath),
  unzip: (inputPath, outputDir) => ipcRenderer.invoke('unzip', inputPath, outputDir),
  checkOffice: () => ipcRenderer.invoke('check-office'),
  downloadOffice: () => ipcRenderer.invoke('download-office'),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, p) => callback(p)),
  onLog: (callback) => ipcRenderer.on('log', (event, msg) => callback(msg))
})
