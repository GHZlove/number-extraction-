const {app,BrowserWindow,Menu,protocol,session,ipcMain,dialog,screen} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {APP_URL,CSP,isGameURL,resolveAsset,validSaveText,validPlaytestText,PLAYTEST_EXPORT_LIMIT,PLAYTEST_REVIEW_MAX_FILES,PLAYTEST_REVIEW_TOTAL_LIMIT} = require('./policy.cjs');

const smoke = process.env.NUMBER_EXTRACTION_SMOKE === '1';
let window = null, raidActive = false;
app.setName('Number Extraction');
app.setAppUserModelId('io.github.ghzlove.numberextraction');
const userData = smoke && process.env.NUMBER_EXTRACTION_SMOKE_PROFILE ? path.resolve(process.env.NUMBER_EXTRACTION_SMOKE_PROFILE) : path.join(app.getPath('appData'),'NumberExtraction');
require('node:fs').mkdirSync(userData,{recursive:true});
app.setPath('userData',userData);
protocol.registerSchemesAsPrivileged([{scheme:'nextract',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,codeCache:true}}]);

async function handleAsset(request) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('',{status:405});
  const asset = resolveAsset(path.join(app.getAppPath(),'dist'),request.url);
  if (!asset) return new Response('',{status:404});
  try {
    const body = await fs.readFile(asset.file);
    return new Response(request.method === 'HEAD' ? null : body,{headers:{'Content-Type':asset.type,'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
  } catch { return new Response('',{status:404}); }
}
function trusted(event) { return window && event.sender === window.webContents && event.senderFrame?.url === APP_URL; }
function registerIPC() {
  ipcMain.on('raid:active',(event,active) => { if (trusted(event)) raidActive = active === true; });
  ipcMain.handle('save:export',async (event,text) => {
    if (!trusted(event) || !validSaveText(text)) return {ok:false,error:'存档格式无效。'};
    const result = await dialog.showSaveDialog(window,{title:'导出数字进化存档',defaultPath:'NumberExtraction-save.json',filters:[{name:'JSON save',extensions:['json']}]});
    if (result.canceled || !result.filePath) return {ok:false,canceled:true};
    try { await fs.writeFile(result.filePath,text,'utf8');return {ok:true}; }
    catch { return {ok:false,error:'无法写入所选文件，请选择其他位置。'}; }
  });
  ipcMain.handle('playtest:export',async (event,text) => {
    if (!trusted(event) || !validPlaytestText(text)) return {ok:false,error:'试玩记录格式无效。'};
    // Only the fixed native smoke runner chooses a path without a user dialog.
    // Renderer content never supplies a filesystem path or executable code.
    const result = smoke ? {canceled:false,filePath:require('./smoke.cjs').playtestExportPath()} :
      await dialog.showSaveDialog(window,{title:'导出匿名试玩记录',defaultPath:'NumberExtraction-playtest.json',filters:[{name:'Anonymous playtest JSON',extensions:['json']}]});
    if (result.canceled || !result.filePath) return {ok:false,canceled:true};
    try { await fs.writeFile(result.filePath,text,'utf8');return {ok:true}; }
    catch { return {ok:false,error:'无法写入所选文件，请选择其他位置。'}; }
  });
  ipcMain.handle('playtest:review-import',async event => {
    if (!trusted(event)) return {ok:false,error:'不支持的来源。'};
    // The renderer cannot supply paths. Only a user file selection (or fixed CI
    // fixtures in smoke mode) determines which reports this read-only IPC reads.
    const selection = smoke ? {canceled:false,filePaths:require('./smoke.cjs').playtestReviewPaths()} :
      await dialog.showOpenDialog(window,{title:'选择匿名试玩报告进行合并分析',properties:['openFile','multiSelections'],filters:[{name:'Anonymous playtest JSON',extensions:['json']}]});
    if (selection.canceled || !selection.filePaths?.length) return {ok:false,canceled:true};
    if (selection.filePaths.length > PLAYTEST_REVIEW_MAX_FILES) return {ok:false,error:'每批最多选择8份匿名报告。'};
    const reports=[];let total=0;
    try {
      for (const [index,file] of selection.filePaths.entries()) {
        const stat=await fs.stat(file);
        if (!Number.isFinite(stat.size) || stat.size < 0 || stat.size > PLAYTEST_EXPORT_LIMIT || typeof stat.isFile === 'function' && !stat.isFile()) return {ok:false,error:`第${index+1}份报告无效或超过256KB。`};
        const text=await fs.readFile(file,'utf8'),bytes=Buffer.byteLength(text,'utf8');
        // Check the actual read too: the selected file may grow after stat().
        if (bytes > PLAYTEST_EXPORT_LIMIT) return {ok:false,error:`第${index+1}份报告超过256KB。`};
        total+=bytes;
        if (total > PLAYTEST_REVIEW_TOTAL_LIMIT) return {ok:false,error:'这批报告超过2MB。'};
        if (!validPlaytestText(text)) return {ok:false,error:`第${index+1}份不是支持的匿名试玩报告。`};
        reports.push(text);
      }
    } catch { return {ok:false,error:'无法读取所选报告，请选择有效的匿名JSON文件。'}; }
    return {ok:true,reports};
  });
  ipcMain.handle('save:import',async event => {
    if (!trusted(event)) return {ok:false,error:'不支持的来源。'};
    const result = await dialog.showOpenDialog(window,{title:'导入数字进化存档',properties:['openFile'],filters:[{name:'JSON save',extensions:['json']}]});
    if (result.canceled || !result.filePaths[0]) return {ok:false,canceled:true};
    try {
      const file = result.filePaths[0];if ((await fs.stat(file)).size > 524288) return {ok:false,error:'文件超过512KB。'};
      const text = await fs.readFile(file,'utf8');return validSaveText(text) ? {ok:true,text} : {ok:false,error:'这不是有效的数字进化存档。'};
    } catch { return {ok:false,error:'无法读取所选存档。'}; }
  });
}
async function openWindow() {
  const {width,height} = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    width:Math.min(1440,width),height:Math.min(900,height),minWidth:Math.min(960,width),minHeight:Math.min(640,height),
    show:false,title:'数字进化 · Number Extraction',backgroundColor:'#0b111a',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,backgroundThrottling:!smoke},
  });
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate',(event,url) => { if (url !== APP_URL) event.preventDefault(); });
  window.webContents.on('will-attach-webview',event => event.preventDefault());
  window.webContents.on('before-input-event',(event,input) => {
    if (input.type === 'keyDown' && !input.isAutoRepeat && (input.key === 'F11' || input.key === 'Enter' && input.alt)) {
      event.preventDefault();window.setFullScreen(!window.isFullScreen());
    }
  });
  window.on('close',event => {
    if (raidActive && !smoke) {
      const answer = dialog.showMessageBoxSync(window,{type:'question',title:'退出本次行动？',message:'本局尚未结算。关闭将失去局内物资，庇护所和打造进度保留。',buttons:['继续游戏','退出游戏'],defaultId:0,cancelId:0});
      if (answer === 0) event.preventDefault();
    }
  });
  window.on('closed',() => { window = null; });
  window.once('ready-to-show',() => window.show());
  await window.loadURL(APP_URL);
  if (smoke) require('./smoke.cjs').run(window,app).catch(async error => {
    await require('./smoke.cjs').report({ok:false,error:String(error.stack||error)});app.exit(1);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',() => { if (window) { if (window.isMinimized()) window.restore();window.show();window.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    protocol.handle('nextract',handleAsset);
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details,callback) => callback({cancel:!isGameURL(details.url)}));
    registerIPC();await openWindow();
  }).catch(async error => {
    if (smoke) await require('./smoke.cjs').report({ok:false,error:String(error.stack||error)});
    else dialog.showErrorBox('游戏启动失败',String(error.message||error));
    app.exit(1);
  });
  app.on('activate',() => { if (!window) openWindow(); });
  app.on('window-all-closed',() => app.quit());
}
