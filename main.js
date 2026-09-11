const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

function getBin(name) {
  const rp = process.resourcesPath || __dirname
  const packed = path.join(rp, 'bin', name)
  if (fs.existsSync(packed)) return packed
  return name
}

let FFMPEG = getBin('ffmpeg')
try { const fs_ = require('ffmpeg-static'); if (fs_ && fs.existsSync(fs_)) FFMPEG = fs_ } catch(e) {}

const NCMDUMP    = getBin('ncmdump')
const TESSERACT   = getBin('tesseract')
const PDFTOPPM    = getBin('pdftoppm')
const PDFTOTEXT   = getBin('pdftotext')
const PANDOC      = getBin('pandoc')
const LIBREOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice'

function hasOffice() { return fs.existsSync(LIBREOFFICE) }

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150, height: 750, minWidth: 960, minHeight: 620,
    title: 'Kinson Studio',
    backgroundColor: '#fefaf6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('context-menu', async (e, params) => {
    const selectedText = await mainWindow.webContents.executeJavaScript('window.getSelection().toString()')
    const menu = Menu.buildFromTemplate([
      { label: '复制', enabled: selectedText.length > 0, click: () => clipboard.writeText(selectedText) },
      { type: 'separator' },
      { label: '全选', click: () => mainWindow.webContents.selectAll() }
    ])
    menu.popup({ window: mainWindow })
  })
}

app.whenReady().then(() => {
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
      { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
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
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

function log(msg) { if (mainWindow) mainWindow.webContents.send('log', msg) }

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts)
    let stderr = ''
    p.stderr.on('data', d => { stderr += d; if (stderr.length > 2000) stderr = stderr.slice(-2000) })
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`命令失败：${cmd} ${args.join(' ')}\n${stderr.slice(-400)}`)))
    p.on('error', err => reject(new Error(`无法启动 ${cmd}：${err.message}`)))
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
  if(['zip','rar','7z','tar','gz'].includes(e)) return 'archive'
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

ipcMain.handle('check-office', () => hasOffice())

ipcMain.handle('download-office', async () => {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  const version = '25.8.7'
  const dmgPath = path.join(os.tmpdir(), 'LibreOffice.dmg')

  const mirrors = [
	  `https://mirrors.cloud.tencent.com/libreoffice/libreoffice/stable/${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`,
    `https://mirrors.tuna.tsinghua.edu.cn/libreoffice/libreoffice/stable/${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`,
    `https://mirrors.ustc.edu.cn/libreoffice/libreoffice/stable/${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`,
    `https://mirrors.huaweicloud.com/libreoffice/libreoffice/stable/${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`,
    `https://download.documentfoundation.org/libreoffice/stable/${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`
  ]

  function downloadWithProgress(url, dest) {
    return new Promise((resolve, reject) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      const p = spawn('curl', ['-L', '-#', '-o', dest, url])
      let buf = ''
      p.stderr.on('data', d => {
        buf += d.toString()
        const lines = buf.split('\r')
        const last = lines[lines.length - 1].trim()
        const parts = last.split(/\s+/)
        if (parts.length >= 12 && !isNaN(parseInt(parts[2]))) {
          const percent = Math.min(100, parseInt(parts[2]))
          if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
              percent,
              downloaded: parts[3],
              total: parts[1],
              speed: parts[11],
              timeLeft: parts[10]
            })
          }
        }
      })
      p.on('close', code => {
        if (code !== 0) return reject(new Error('curl 退出码 ' + code))
        const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0
        if (size < 50 * 1024 * 1024) return reject(new Error('下载文件过小（' + Math.round(size/1024/1024) + 'MB），可能镜像失效'))
        resolve()
      })
      p.on('error', reject)
    })
  }


  let lastErr = null
  for (let i = 0; i < mirrors.length; i++) {
    try {
      log('正在从镜像 ' + (i+1) + '/' + mirrors.length + ' 下载 LibreOffice...')
      await downloadWithProgress(mirrors[i], dmgPath)
      log('下载完成，正在安装...')
      await runCmd('hdiutil', ['attach', '-nobrowse', dmgPath])
      const volName = fs.readdirSync('/Volumes').find(d => d.toLowerCase().includes('libreoffice'))
      if (!volName) throw new Error('未找到挂载卷')
      await runCmd('cp', ['-R', '/Volumes/' + volName + '/LibreOffice.app', '/Applications/'])
      await runCmd('hdiutil', ['detach', '/Volumes/' + volName])
      fs.unlinkSync(dmgPath)
      log('Office 转换已准备就绪！')
      return true
    } catch (err) {
      lastErr = err
      log('镜像 ' + (i+1) + ' 失败：' + err.message)
      if (fs.existsSync(dmgPath)) { try { fs.unlinkSync(dmgPath) } catch(e){} }
    }
  }
  throw new Error('所有镜像均下载失败：' + (lastErr ? lastErr.message : '未知错误'))
})

ipcMain.handle('convert', async (event, inputPath, targetExt, outputDir) => {
  const ext = inputPath.split('.').pop().toLowerCase()
  const type = detectType(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(outputDir, baseName + '.' + targetExt)
  log(`转换：${path.basename(inputPath)} → .${targetExt}`)
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
        const decExt = outs[0].split('.').pop()
        log(`解密完成（.${decExt}），正在转码...`)
        await runFfmpeg(decPath, outputPath, targetExt==='mp3'?['-b:a','320k']:[])
        fs.rmSync(tmpDir,{recursive:true,force:true})
      } else {
        const { decryptMusic } = require('./decrypter')
        const { data, ext: de } = decryptMusic(inputPath)
        const tmp = path.join(os.tmpdir(),`kstudio_${Date.now()}.${de}`)
        fs.writeFileSync(tmp, data)
        log(`解密完成（.${de}），正在转码...`)
        await runFfmpeg(tmp, outputPath, targetExt==='mp3'?['-b:a','320k']:[])
        fs.unlinkSync(tmp)
      }
      log(`完成：${outputPath}`)
      return { output: outputPath }
    }
    if (['image','audio','video'].includes(type)) {
      let extra = []
      if (targetExt === 'mp3') extra = ['-b:a','320k']
      if (targetExt === 'gif') extra = ['-vf','fps=10,scale=480:-1:flags=lanczos']
      if (type === 'image' && ['mp4','webm'].includes(targetExt)) extra = ['-loop','1','-t','3','-vf','scale=1280:-2']
      await runFfmpeg(inputPath, outputPath, extra)
      log(`完成：${outputPath}`)
      return { output: outputPath }
    }
    if (['word','excel','ppt'].includes(type)) {
      if (!hasOffice()) throw new Error('Office 转换未启用，请先在顶部点击下载 LibreOffice')
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'kstudio_lo_'))
      const loProfile = path.join(os.tmpdir(), 'kstudio_lo_profile')
      fs.mkdirSync(loProfile, { recursive: true })
      const loEnv = { ...process.env, SAL_USE_VCLPLUGIN: 'gen', HOME: os.homedir() }
      await runCmd(LIBREOFFICE, ['--headless','--norestore',`-env:UserInstallation=file://${loProfile}`,'--convert-to',targetExt,'--outdir',tmpDir,inputPath], { env: loEnv })

      const files = fs.readdirSync(tmpDir)
      const outFile = files.find(f => f.endsWith('.'+targetExt)) || files[0]
      if (!outFile) throw new Error('LibreOffice 未生成输出')
      fs.copyFileSync(path.join(tmpDir,outFile), outputPath)
      fs.rmSync(tmpDir,{recursive:true,force:true})
      log(`完成：${outputPath}`)
      return { output: outputPath }
    }
    if (type === 'pdf') {
      if (targetExt === 'txt') {
        await runCmd(PDFTOTEXT, ['-layout', inputPath, outputPath])
      } else if (targetExt === 'html') {
        await runCmd(PDFTOTEXT, ['-layout','-htmlmeta', inputPath, outputPath])
      } else {
        const tmpPrefix = path.join(os.tmpdir(), `kstudio_pdf_${Date.now()}`)
        const fmt = targetExt === 'jpg' ? 'jpeg' : 'png'
        await runCmd(PDFTOPPM, ['-'+fmt, '-r', '150', inputPath, tmpPrefix])
        const imgs = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(path.basename(tmpPrefix))).sort()
        if (imgs.length === 0) throw new Error('PDF 转图片失败')
        if (imgs.length === 1) {
          fs.copyFileSync(path.join(os.tmpdir(),imgs[0]), outputPath)
        } else {
          const zipPath = outputPath.replace(/\.[^.]+$/,'.zip')
          await runCmd('zip', ['-j', zipPath, ...imgs.map(f => path.join(os.tmpdir(),f))])
          imgs.forEach(f => { try{fs.unlinkSync(path.join(os.tmpdir(),f))}catch(e){} })
          log(`完成（${imgs.length}页打包为ZIP）：${zipPath}`)
          return { output: zipPath }
        }
      }
      log(`完成：${outputPath}`)
      return { output: outputPath }
    }
    if (type === 'text') {
      if (targetExt === 'html') {
        const content = fs.readFileSync(inputPath, 'utf-8')
        const escaped = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        const html = `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>${baseName}</title>\n<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8}pre{white-space:pre-wrap;word-wrap:break-word}</style>\n</head>\n<body>\n<pre>${escaped}</pre>\n</body>\n</html>`
        fs.writeFileSync(outputPath, html, 'utf-8')
        log(`完成：${outputPath}`)
        return { output: outputPath }
      }
      await runCmd(PANDOC, [inputPath, '-o', outputPath])
      log(`完成：${outputPath}`)
      return { output: outputPath }
    }
    throw new Error('不支持的转换：' + ext + ' → ' + targetExt)
  } catch (err) {
    log('错误：' + err.message)
    throw err
  }
})

ipcMain.handle('ocr', async (event, inputPath) => {
  log(`OCR识别：${path.basename(inputPath)}`)
  try {
    const tmpBase = path.join(os.tmpdir(), `kstudio_ocr_${Date.now()}`)
    const preprocessed = tmpBase + '_pre.png'
    await runCmd(FFMPEG, ['-y','-i',inputPath,'-vf','scale=iw*2:ih*2,format=gray,eq=contrast=1.3','-frames:v','1',preprocessed])
    const tessdata = path.join(process.resourcesPath || __dirname, 'bin', 'tessdata')
    const env = fs.existsSync(tessdata) ? { ...process.env, TESSDATA_PREFIX: tessdata } : process.env
    await runCmd(TESSERACT, [preprocessed, tmpBase, '-l', 'chi_sim+eng', '--psm', '6', '--oem', '3', 'tsv'], { env })
    const tsvFile = tmpBase + '.tsv'
    let words = []
    let fullText = ''
    if (fs.existsSync(tsvFile)) {
      const lines = fs.readFileSync(tsvFile, 'utf-8').split('\n')
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t')
        if (cols.length >= 12 && cols[0] === '5') {
          const text = cols[11]
          if (text && text.trim()) {
            words.push({
              text,
              left: Math.round(parseInt(cols[6]) / 2),
              top: Math.round(parseInt(cols[7]) / 2),
              width: Math.round(parseInt(cols[8]) / 2),
              height: Math.round(parseInt(cols[9]) / 2)
            })
            fullText += text + ' '
          }
        }
      }
      fs.unlinkSync(tsvFile)
    }
    if (fs.existsSync(preprocessed)) fs.unlinkSync(preprocessed)
    log('OCR完成，识别到 ' + words.length + ' 个词')
    return { words, text: fullText.trim() }
  } catch (err) { log('错误：'+err.message); throw err }
})

ipcMain.handle('zip-pack', async (event, filePaths, outputPath) => {
  log(`打包：${filePaths.length} 个文件`)
  try {
    await runCmd('zip', ['-j', outputPath, ...filePaths])
    log(`完成：${outputPath}`)
    return { output: outputPath }
  } catch (err) { log('错误：'+err.message); throw err }
})

ipcMain.handle('unzip', async (event, inputPath, outputDir) => {
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outDir = path.join(outputDir, baseName)
  fs.mkdirSync(outDir, { recursive: true })
  log(`解压：${path.basename(inputPath)} → ${baseName}/`)
  try {
    await runCmd('unzip', ['-o', inputPath, '-d', outDir])
    log(`完成：${outDir}`)
    return { output: outDir }
  } catch (err) { log('错误：'+err.message); throw err }
})
