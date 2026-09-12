const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
const http = require('http')
const { spawn } = require('child_process')

const IS_WIN = process.platform === 'win32'
const EXE = IS_WIN ? '.exe' : ''

function getBin(name) {
  const rp = process.resourcesPath || __dirname
  const packed = path.join(rp, 'bin', name + EXE)
  if (fs.existsSync(packed)) return packed
  return name + EXE
}

let FFMPEG = getBin('ffmpeg')
try { const fs_ = require('ffmpeg-static'); if (fs_ && fs.existsSync(fs_)) FFMPEG = fs_ } catch(e) {}

const NCMDUMP    = getBin('ncmdump')
const TESSERACT   = getBin('tesseract')
const PDFTOPPM    = getBin('pdftoppm')
const PDFTOTEXT   = getBin('pdftotext')
const PANDOC      = getBin('pandoc')

const LIBREOFFICE_MAC = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
const LIBREOFFICE_WIN1 = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
const LIBREOFFICE_WIN2 = 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'

function findLibreOffice(customDir) {
  const candidates = []
  if (IS_WIN) {
    candidates.push(LIBREOFFICE_WIN1, LIBREOFFICE_WIN2)
    if (customDir) candidates.push(path.join(customDir, 'LibreOffice', 'program', 'soffice.exe'))
  } else {
    candidates.push(LIBREOFFICE_MAC)
    if (customDir) candidates.push(path.join(customDir, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'))
    candidates.push(path.join(os.homedir(), 'Downloads', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'))
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function getLibreOffice(customDir) {
  const found = findLibreOffice(customDir)
  if (found) return found
  return IS_WIN ? 'soffice.exe' : 'libreoffice'
}

function hasOffice(customDir) {
  return findLibreOffice(customDir) !== null
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const doDownload = (u, redirects) => {
      if (redirects > 8) return reject(new Error('重定向次数过多'))
      const client = u.startsWith('https') ? https : http
      client.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          let next = res.headers.location
          if (next.startsWith('/')) {
            try { const pu = new URL(u); next = pu.origin + next } catch(e) {}
          }
          return doDownload(next, redirects + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error('下载失败：HTTP ' + res.statusCode))
        }
        const total = parseInt(res.headers['content-length']) || 0
        let downloaded = 0
        const file = fs.createWriteStream(dest)
        res.on('data', (chunk) => {
          downloaded += chunk.length
          file.write(chunk)
          if (total && onProgress) onProgress(Math.min(100, Math.round(downloaded / total * 100)))
        })
        res.on('end', () => { file.end(); resolve() })
        res.on('error', (err) => { file.end(); reject(err) })
      }).on('error', reject)
    }
    doDownload(url, 0)
  })
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150, height: 750, minWidth: 960, minHeight: 620,
    title: 'Kinson Studio',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('index.html')

  const template = [
    { label: '文件', submenu: [
      { label: '打开文件', accelerator: 'CmdOrCtrl+O', click: () => { if(mainWindow) mainWindow.webContents.send('menu-open-file') } },
      { type: 'separator' },
      { role: 'close', label: '关闭窗口' }
    ]},
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ]},
    { label: '显示', submenu: [
      { role: 'reload', label: '重新加载' }, { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' }, { type: 'separator' },
      { role: 'togglefullscreen', label: '进入全屏' }
    ]},
    { label: '窗口', submenu: [
      { role: 'minimize', label: '最小化' }, { role: 'zoom', label: '缩放' },
      { type: 'separator' }, { role: 'front', label: '全部置于顶层' }
    ]},
    { label: '帮助', submenu: [
      { label: '反馈邮箱', click: () => shell.openExternal('mailto:kinsonstudio@icloud.com') },
      { type: 'separator' }, { role: 'about', label: '关于 Kinson Studio' }
    ]}
  ]
  if (process.platform === 'darwin') {
    template.unshift({ label: 'Kinson Studio', submenu: [
      { role: 'about', label: '关于 Kinson Studio' }, { type: 'separator' },
      { role: 'services', label: '服务' }, { type: 'separator' },
      { role: 'hide', label: '隐藏 Kinson Studio' }, { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '显示全部' }, { type: 'separator' },
      { role: 'quit', label: '退出 Kinson Studio' }
    ]})
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => { createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

function log(msg) { if (mainWindow) mainWindow.webContents.send('log', msg) }

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts)
    let stderr = ''
    p.stderr.on('data', d => { stderr += d; if (stderr.length > 2000) stderr = stderr.slice(-2000) })
    p.on('close', code => code === 0 ? resolve() : reject(new Error('命令失败：' + cmd + ' ' + args.join(' ') + '\n' + stderr.slice(-400))))
    p.on('error', err => reject(new Error('无法启动 ' + path.basename(cmd) + '：' + err.message + '。请先安装对应工具')))
  })
}

function runFfmpeg(input, output, extra = []) {
  return runCmd(FFMPEG, ['-y','-i',input,...extra,output])
}

function detectType(fp) {
  const e = fp.split('.').pop().toLowerCase()
  if(['ncm','qmc0','qmc3','qmcflac','qmcogg','kgm','kgma','kgg'].includes(e)) return 'encrypted'
  if(['jpg','jpeg','png','webp','avif','tiff','gif','bmp','heic','cr2','cr3','dng','arw','nef','raf','rw2','orf'].includes(e)) return 'image'
  if(['mp3','wav','flac','m4a','aac','ogg','opus','wma'].includes(e)) return 'audio'
  if(['mp4','mov','mkv','webm','avi','m4v','wmv','flv'].includes(e)) return 'video'
  if(['doc','docx','odt','rtf','wps','wpd'].includes(e)) return 'word'
  if(['xls','xlsx','xlsm','ods','csv','tsv','et'].includes(e)) return 'excel'
  if(['ppt','pptx','odp','dps'].includes(e)) return 'ppt'
  if(e==='pdf') return 'pdf'
  if(['txt','md','html','json','log','xml','yaml','epub','mobi'].includes(e)) return 'text'
  return null
}

ipcMain.handle('openFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties:['openFile'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('openFiles', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties:['openFile','multiSelections'] })
  return r.canceled ? [] : r.filePaths
})
ipcMain.handle('chooseOutputDir', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties:['openDirectory','createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('getDefaultOutputDir', () => path.join(os.homedir(),'Downloads'))
ipcMain.handle('check-office', (event, customDir) => hasOffice(customDir))

ipcMain.handle('download-office', async (event, customDir) => {
  const installDir = customDir || '/Applications'
  const urls = IS_WIN ? [
    'https://mirrors.cloud.tencent.com/libreoffice/libreoffice/stable/25.8.7/win/x86_64/LibreOffice_25.8.7_Win_x86-64.msi'
  ] : [
    'https://mirrors.cloud.tencent.com/libreoffice/libreoffice/stable/25.8.7/mac/aarch64/LibreOffice_25.8.7_MacOS_aarch64.dmg'
  ]
  const tmp = path.join(os.tmpdir(), IS_WIN ? 'LibreOffice.msi' : 'LibreOffice.dmg')
  for (const url of urls) {
    try {
      log('正在下载 LibreOffice...')
      await downloadFile(url, tmp, (percent) => {
        if (mainWindow) mainWindow.webContents.send('download-progress', { percent, status: '下载中' })
      })
      if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 95, status: '安装中' })
      log('正在安装到：' + installDir)
      if (IS_WIN) {
        await runCmd('msiexec', ['/i', tmp, '/quiet', '/norestart'])
      } else {
        const mount = path.join(os.tmpdir(), 'lo_mount_' + Date.now())
        fs.mkdirSync(mount, { recursive: true })
        await runCmd('hdiutil', ['attach', '-nobrowse', '-mountpoint', mount, tmp])
        const appFile = fs.readdirSync(mount).find(f => f.endsWith('.app'))
        if (appFile) {
          const dest = path.join(installDir, appFile)
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
          fs.cpSync(path.join(mount, appFile), dest, { recursive: true })
        }
        await runCmd('hdiutil', ['detach', mount])
        fs.unlinkSync(tmp)
      }
      if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 100, status: '完成' })
      return { success: true }
    } catch (e) {
      log('镜像失败：' + e.message + '，尝试下一个...')
    }
  }
  throw new Error('所有镜像下载失败')
})

ipcMain.handle('convert', async (event, inputPath, targetExt, outputDir) => {
  const ext = inputPath.split('.').pop().toLowerCase()
  const type = detectType(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(outputDir, baseName + '.' + targetExt)
  log('转换：' + path.basename(inputPath) + ' → .' + targetExt)
  try {
    if (type === 'encrypted') {
      log('检测到加密音乐，正在解密...')
      if (ext === 'ncm') {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'kstudio_ncm_'))
        const tmpInput = path.join(tmpDir, path.basename(inputPath))
        fs.copyFileSync(inputPath, tmpInput)
        await runCmd(NCMDUMP, [tmpInput], { cwd: tmpDir })
        const outs = fs.readdirSync(tmpDir).filter(f => !f.endsWith('.ncm'))
        if (outs.length === 0) throw new Error('ncmdump 未生成输出文件')
        const decPath = path.join(tmpDir, outs[0])
        await runFfmpeg(decPath, outputPath, targetExt==='mp3'?['-b:a','320k']:[])
        fs.rmSync(tmpDir,{recursive:true,force:true})
      } else {
        const { decryptMusic } = require('./decrypter')
        const { data, ext: de } = decryptMusic(inputPath)
        const tmp = path.join(os.tmpdir(),'kstudio_' + Date.now() + '.' + de)
        fs.writeFileSync(tmp, data)
        await runFfmpeg(tmp, outputPath, targetExt==='mp3'?['-b:a','320k']:[])
        fs.unlinkSync(tmp)
      }
      log('完成：' + outputPath)
      return { output: outputPath }
    }
    if (['image','audio','video'].includes(type)) {
      let extra = []
      if (targetExt === 'mp3') extra = ['-b:a','320k']
      if (targetExt === 'gif') extra = ['-vf','fps=10,scale=480:-1:flags=lanczos']
      if (type === 'image' && ['mp4','webm'].includes(targetExt)) extra = ['-loop','1','-t','3','-vf','scale=1280:-2']
      await runFfmpeg(inputPath, outputPath, extra)
      log('完成：' + outputPath)
      return { output: outputPath }
    }
    if (['word','excel','ppt'].includes(type)) {
      if (!hasOffice(outputDir)) throw new Error('未安装 LibreOffice，Office 转换不可用')
      const lo = getLibreOffice(outputDir)
      log('使用 LibreOffice：' + lo)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'kstudio_lo_'))
      const loProfile = path.join(os.tmpdir(), 'kstudio_lo_profile')
      fs.mkdirSync(loProfile, { recursive: true })
      const loEnv = { ...process.env, SAL_USE_VCLPLUGIN: 'gen' }
      await runCmd(lo, ['--headless','--norestore','-env:UserInstallation=file://' + loProfile,'--convert-to',targetExt,'--outdir',tmpDir,inputPath], { env: loEnv })
      const files = fs.readdirSync(tmpDir)
      const outFile = files.find(f => f.endsWith('.' + targetExt)) || files[0]
      if (!outFile) throw new Error('LibreOffice 未生成输出')
      fs.copyFileSync(path.join(tmpDir,outFile), outputPath)
      fs.rmSync(tmpDir,{recursive:true,force:true})
      log('完成：' + outputPath)
      return { output: outputPath }
    }
    if (type === 'pdf') {
      if (targetExt === 'txt') {
        await runCmd(PDFTOTEXT, ['-layout', inputPath, outputPath])
      } else if (targetExt === 'html') {
        await runCmd(PDFTOTEXT, ['-layout','-htmlmeta', inputPath, outputPath])
      } else {
        const tmpPrefix = path.join(os.tmpdir(), 'kstudio_pdf_' + Date.now())
        const fmt = targetExt === 'jpg' ? 'jpeg' : 'png'
        await runCmd(PDFTOPPM, ['-' + fmt, '-r', '150', inputPath, tmpPrefix])
        const imgs = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(path.basename(tmpPrefix))).sort()
        if (imgs.length === 0) throw new Error('PDF 转图片失败')
        if (imgs.length === 1) {
          fs.copyFileSync(path.join(os.tmpdir(),imgs[0]), outputPath)
        } else {
          const zipPath = outputPath.replace(/\.[^.]+$/,'.zip')
          if (IS_WIN) {
            await runCmd('tar', ['-a','-c','-f',zipPath,...imgs.map(f=>path.join(os.tmpdir(),f))])
          } else {
            await runCmd('zip', ['-j', zipPath, ...imgs.map(f=>path.join(os.tmpdir(),f))])
          }
          imgs.forEach(f => { try{fs.unlinkSync(path.join(os.tmpdir(),f))}catch(e){} })
          log('完成（' + imgs.length + '页打包为ZIP）：' + zipPath)
          return { output: zipPath }
        }
      }
      log('完成：' + outputPath)
      return { output: outputPath }
    }
    if (type === 'text') {
      if (targetExt === 'html' && ext === 'txt') {
        let content = fs.readFileSync(inputPath, 'utf-8')
        const escaped = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>\n')
        const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>' + baseName + '</title>\n</head>\n<body>\n<p>' + escaped + '</p>\n</body>\n</html>'
        fs.writeFileSync(outputPath, html, 'utf-8')
      } else {
        await runCmd(PANDOC, [inputPath, '-o', outputPath])
      }
      log('完成：' + outputPath)
      return { output: outputPath }
    }
    throw new Error('不支持的转换：' + ext + ' → ' + targetExt)
  } catch (err) {
    log('错误：' + err.message)
    throw err
  }
})

ipcMain.handle('images-to-pdf', async (event, imagePaths, outputPath) => {
  log('图片转PDF：' + imagePaths.length + ' 张图片')
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kstudio_img2pdf_'))
    const listFile = path.join(tmpDir, 'list.txt')
    const listContent = imagePaths.map(p => "file '" + p.replace(/'/g, "'\\''") + "'").join('\n')
    fs.writeFileSync(listFile, listContent, 'utf-8')
    await runCmd(FFMPEG, ['-y','-f','concat','-safe','0','-i',listFile,
      '-vf','scale=1240:1754:force_original_aspect_ratio=decrease,pad=1240:1754:(ow-iw)/2:(oh-ih)/2:color=white',
      outputPath])
    fs.rmSync(tmpDir, { recursive: true, force: true })
    log('完成：' + outputPath)
    return { output: outputPath }
  } catch (err) {
    log('错误：' + err.message)
    throw err
  }
})

ipcMain.handle('ocr', async (event, inputPath, outputDir) => {
  const ext = inputPath.split('.').pop().toLowerCase()
  const imgExts = ['jpg','jpeg','png','webp','gif','bmp','tiff','avif']
  if (!imgExts.includes(ext)) throw new Error('OCR 仅支持图片文件')
  log('OCR识别：' + path.basename(inputPath))
  try {
    const tmpBase = path.join(os.tmpdir(), 'kstudio_ocr_' + Date.now())
    const preImg = tmpBase + '_pre.png'
    await runFfmpeg(inputPath, preImg, ['-vf','scale=iw*2:ih*2,format=gray,eq=contrast=1.3','-frames:v','1'])
    const tessdata = path.join(process.resourcesPath || __dirname, 'bin', 'tessdata')
    const env = fs.existsSync(tessdata) ? { ...process.env, TESSDATA_PREFIX: tessdata } : process.env
    await runCmd(TESSERACT, [preImg, tmpBase, '-l', 'chi_sim+eng', '--psm', '6', '--oem', '3', 'tsv'], { env })
    const tsvFile = tmpBase + '.tsv'
    const words = []
    if (fs.existsSync(tsvFile)) {
      const lines = fs.readFileSync(tsvFile, 'utf-8').split('\n').slice(1)
      for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length >= 12 && parts[11].trim()) {
          words.push({
            text: parts[11],
            x: parseInt(parts[6]) / 2,
            y: parseInt(parts[7]) / 2,
            w: parseInt(parts[8]) / 2,
            h: parseInt(parts[9]) / 2
          })
        }
      }
      fs.unlinkSync(tsvFile)
    }
    fs.unlinkSync(preImg)
    log('识别完成，共 ' + words.length + ' 个词')
    return { words, image: inputPath }
  } catch (err) { log('错误：'+err.message); throw err }
})

ipcMain.handle('zip-pack', async (event, filePaths, outputPath) => {
  log('打包：' + filePaths.length + ' 个文件')
  if (IS_WIN) {
    await runCmd('tar', ['-a','-c','-f',outputPath,...filePaths])
  } else {
    await runCmd('zip', ['-j', outputPath, ...filePaths])
  }
  log('完成：' + outputPath)
  return { output: outputPath }
})

ipcMain.handle('unzip', async (event, zipPath, outputDir) => {
  log('解压：' + path.basename(zipPath))
  const outFolder = path.join(outputDir, path.basename(zipPath, path.extname(zipPath)))
  fs.mkdirSync(outFolder, { recursive: true })
  if (IS_WIN) {
    await runCmd('tar', ['-xf', zipPath, '-C', outFolder])
  } else {
    await runCmd('unzip', ['-o', zipPath, '-d', outFolder])
  }
  log('完成：' + outFolder)
  return { output: outFolder }
})
