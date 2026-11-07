// Fixed native-app checks used by Windows CI; never accepts renderer-provided code.
const fs = require('node:fs/promises');
const path = require('node:path');
const {validPlaytestText} = require('./policy.cjs');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
const file = () => process.env.NUMBER_EXTRACTION_SMOKE_REPORT || path.join(require('node:os').tmpdir(),'NumberExtraction-smoke.json');
const playtestExportPath = () => file().replace(/\.json$/, '')+'-playtest-export.json';
async function report(value) { await fs.writeFile(file(),JSON.stringify(value,null,2),'utf8'); }
async function checkPreviewLayouts(window) {
  const bounds=window.getBounds(),minimum=window.getMinimumSize(),zoom=window.webContents.getZoomFactor(),layouts=[];
  window.setMinimumSize(320,300);
  try {
    for (const [width,height,scale] of [[1920,1080,1],[1920,1080,1.25],[1440,900,1],[1440,900,1.5],[1008,680,1],[600,800,1],[390,844,1]]) {
      window.setContentSize(width,height);
      await delay(150);
      window.webContents.setZoomFactor(scale);
      await delay(150);
      const result=await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const tiles=[...document.querySelectorAll('.preview-number')].map(tile=>{
          const label=tile.querySelector('strong'),box=tile.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);
          const text=range.getBoundingClientRect();
          return {value:label.textContent,width:box.width,height:box.height,textWidth:text.width,textHeight:text.height,left:text.left-box.left,right:box.right-text.right,top:text.top-box.top,bottom:box.bottom-text.bottom};
        });
        return {viewport:[innerWidth,innerHeight],tiles};
      })()`);
      const contentSize=window.getContentSize(),actualZoom=window.webContents.getZoomFactor();
      if (Math.abs(actualZoom-scale)>.001||result.viewport.some((size,i)=>Math.abs(size-contentSize[i]/scale)>2)) {
        throw Error('Window or zoom has not settled: '+JSON.stringify({requested:[width,height],scale,actualZoom,contentSize,viewport:result.viewport}));
      }
      for (const tile of result.tiles) {
        if (!(tile.width>0&&tile.height>0&&tile.left>=tile.width*.09&&tile.right>=tile.width*.09&&tile.top>=0&&tile.bottom>=0)) {
          throw Error('Number overflows its tile: '+JSON.stringify({width,height,scale,...result,tile}));
        }
      }
      if (result.tiles.length!==12) throw Error('Missing preview tiles after resizing');
      layouts.push({requested:[width,height],contentSize,zoom:actualZoom,...result});
      if (width===1920&&scale===1) await fs.writeFile(file().replace(/\.json$/, '-shelter-wide.png'),(await window.webContents.capturePage()).toPNG());
    }
  } finally {
    window.webContents.setZoomFactor(zoom);window.setMinimumSize(...minimum);window.setBounds(bounds);
    await delay(150);
  }
  return layouts;
}
async function run(window,app) {
  const errors=[];window.webContents.on('console-message',details => { if (details.level === 'error') errors.push(String(details.message)); });
  await delay(600);
  const fixture=await window.webContents.executeJavaScript(`(async () => {
    const log=await import('./src/playtest.js'),state=log.readJournal(localStorage);
    const empty=state.journal.runs.length===0;
    if(${process.env.NUMBER_EXTRACTION_SMOKE_MODE === 'verify'})return{initiallyEmpty:empty,seeded:false};
    if(!empty)throw Error('Fresh smoke profile unexpectedly contains playtest records');
    const snapshot={id:'native-playtest-fixture',buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:1001,difficulty:'scout',map:'blocks',mutators:['fog'],loadout:{weapons:[{weapon:'pistol',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},duration:240,seconds:0,number:1,heat:0,hpPercent:100,rawValue:0,gearCount:0,bagCapacity:8,chests:0,huntersSpawned:0,firstHunterAt:null,hunterWaves:0};
    if(!log.recordStart(state.journal,snapshot))throw Error('Native journal fixture could not start');
    const final={...snapshot,seconds:62,number:16,heat:30,hpPercent:80,rawValue:80,gearCount:2,chests:2,huntersSpawned:2,firstHunterAt:49,hunterWaves:1};
    if(!log.recordFinish(state.journal,{id:snapshot.id,success:true,reason:'成功撤离',extractedVia:'key',seconds:62,heat:30,number:16,seed:1001,mutators:['fog'],rawValue:80,value:88,kills:4,playtest:final})||!log.writeJournal(localStorage,state.journal))throw Error('Native journal fixture could not persist');
    return{initiallyEmpty:empty,seeded:true};
  })()`);
  if(fixture.seeded){
    await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});await delay(300);
  }
  const shelter = await window.webContents.executeJavaScript(`(() => {
    const button=document.querySelector('[data-action="start"]'),box=button?.getBoundingClientRect();
    const rgb=element=>getComputedStyle(element).color.match(/[0-9.]+/g).slice(0,3).map(Number);
    const luminance=parts=>parts.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const fg=luminance(rgb(document.querySelector('.brand strong'))),bg=luminance(getComputedStyle(document.body).backgroundColor.match(/[0-9.]+/g).slice(0,3).map(Number));
    return {screen:document.body.dataset.screen,start:!!button,startVisible:!!box&&box.top>=0&&box.bottom<=innerHeight,brandContrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),backgroundLuminance:bg,previewTiles:document.querySelectorAll('.preview-number').length,bridge:window.numberExtractionDesktop?.isDesktop===true,node:typeof window.require,credits:JSON.parse(localStorage.getItem(document.documentElement.dataset.saveKey)||'null')?.credits};
  })()`);
  if (shelter.screen !== 'shelter' || !shelter.start || !shelter.bridge || shelter.node !== 'undefined') throw Error('Invalid shelter startup: '+JSON.stringify(shelter));
  if (!shelter.startVisible || shelter.brandContrast < 4.5) throw Error('Shelter controls are not readable/visible: '+JSON.stringify(shelter));
  if (shelter.backgroundLuminance < .8 || shelter.previewTiles !== 12) throw Error('White shelter / numbered tile preview is missing');
  if (process.env.NUMBER_EXTRACTION_SMOKE_MODE === 'verify' && shelter.credits !== 37) throw Error('Saved progress did not survive restart');
  const previewLayouts=await checkPreviewLayouts(window);
  await fs.writeFile(file().replace(/\.json$/, '-shelter.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="shelterTab"][data-key="vault"]').click();`);
  await delay(100);
  const warehouse=await window.webContents.executeJavaScript(`({tab:document.getElementById('shelter-screen').dataset.tab,capacity:document.querySelector('.warehouse-count').textContent,visible:getComputedStyle(document.querySelector('.warehouse-panel')).display!=='none',stored:JSON.parse(localStorage.getItem(document.documentElement.dataset.saveKey)||'null')?.warehouse?.items?.length})`);
  if(warehouse.tab!=='vault'||!warehouse.visible||!warehouse.capacity.includes('/ 24'))throw Error('Warehouse tab failed: '+JSON.stringify(warehouse));
  if(process.env.NUMBER_EXTRACTION_SMOKE_MODE==='verify'&&warehouse.stored!==1)throw Error('Warehouse equipment did not survive restart');
  await fs.writeFile(file().replace(/\.json$/, '-warehouse.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="shelterTab"][data-key="bosses"]').click();`);
  await delay(100);
  const codex=await window.webContents.executeJavaScript(`({count:document.querySelectorAll('.boss-card').length,visible:getComputedStyle(document.querySelector('.boss-codex')).display!=='none'})`);
  if(codex.count!==9||!codex.visible)throw Error('Boss codex failed: '+JSON.stringify(codex));
  await fs.writeFile(file().replace(/\.json$/, '-bosses.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="shelterTab"][data-key="rules"]').click();`);
  await delay(100);
  const rules=await window.webContents.executeJavaScript(`(() => {
    const panel=document.querySelector('.rules-panel'),cards=[...document.querySelectorAll('.mutator-card')],rich=cards.find(card=>card.dataset.key==='rich');
    const persisted=JSON.parse(localStorage.getItem(document.documentElement.dataset.saveKey)||'null')?.selectedMutators||[];
    if(rich.getAttribute('aria-pressed')!=='true')rich.click();
    return {visible:getComputedStyle(panel).display!=='none',count:cards.length,persisted,selected:document.querySelector('.mutator-card[data-key="rich"]').getAttribute('aria-pressed'),saved:JSON.parse(localStorage.getItem(document.documentElement.dataset.saveKey)||'null')?.selectedMutators};
  })()`);
  if(!rules.visible||rules.count!==10||rules.selected!=='true'||!rules.saved.includes('rich'))throw Error('Run modifier controls failed: '+JSON.stringify(rules));
  if(process.env.NUMBER_EXTRACTION_SMOKE_MODE==='verify'&&!rules.persisted.includes('rich'))throw Error('Run settings did not survive restart');
  await fs.writeFile(file().replace(/\.json$/, '-rules.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="shelterTab"][data-key="journal"]').click();`);
  await delay(100);
  const playtest=await window.webContents.executeJavaScript(`(async () => {
    const log=await import('./src/playtest.js'),panel=document.querySelector('.playtest-panel'),row=document.querySelector('.playtest-run[data-session="1"]');
    const original=log.readJournal(localStorage).journal,fixture=original.runs.find(run=>run.session===1);
    const pressure=row?.querySelector('select[data-field="pressure"]');if(!pressure)throw Error('Playtest feedback control is missing');
    const persisted=pressure.value;pressure.value='3';pressure.dispatchEvent(new Event('change',{bubbles:true}));
    const state=log.readJournal(localStorage).journal,summary=log.summarizeJournal(state),saved=state.runs.find(run=>run.session===1),currentPanel=document.querySelector('.playtest-panel');
    return{visible:getComputedStyle(currentPanel).display!=='none',localOnly:currentPanel.textContent.includes('本机')&&currentPanel.textContent.includes('不自动上传'),rows:document.querySelectorAll('.playtest-run[data-session]').length,fixtureOutcome:fixture?.outcome,persisted,savedPressure:saved?.feedback.pressure,started:summary.started,finished:summary.finished,defeated:summary.defeated,interrupted:summary.interrupted,bridge:typeof window.numberExtractionDesktop.exportPlaytest};
  })()`);
  if(!playtest.visible||!playtest.localOnly||playtest.rows<1||playtest.fixtureOutcome!=='extracted'||playtest.savedPressure!==3||playtest.finished!==1||playtest.defeated!==0||playtest.bridge!=='function')throw Error('Playtest journal navigation or feedback failed: '+JSON.stringify(playtest));
  if(process.env.NUMBER_EXTRACTION_SMOKE_MODE==='verify'&&(playtest.persisted!=='3'||playtest.interrupted<1))throw Error('Playtest persistence/interrupted accounting failed: '+JSON.stringify(playtest));
  await fs.writeFile(file().replace(/\.json$/, '-playtest.png'),(await window.webContents.capturePage()).toPNG());
  await fs.rm(playtestExportPath(),{force:true});
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="exportPlaytest"]').click();`);
  let exported;
  for(let attempt=0;attempt<25;attempt++){try{exported=await fs.readFile(playtestExportPath(),'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;await delay(100);}}
  if(!exported||!validPlaytestText(exported))throw Error('Anonymous native journal export failed validation');
  const exportedData=JSON.parse(exported),exportedFixture=exportedData.runs.find(run=>run.session===1);
  if(exported.includes('native-playtest-fixture')||exportedData.runs.some(run=>Object.hasOwn(run,'id'))||exportedFixture?.feedback.pressure!==3)throw Error('Native export contains private ids or lost feedback');
  playtest.export={ok:true,records:exportedData.runs.length,privateIds:false};
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="shelterTab"][data-key="deploy"]').click();`);

  await window.webContents.executeJavaScript(`document.querySelector('[data-action="start"]').click();`);
  await delay(250);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));`);
  await delay(700);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));`);
  const raid = await window.webContents.executeJavaScript(`({screen:document.body.dataset.screen,hp:document.getElementById('health-value').textContent,number:document.getElementById('player-value').textContent,heat:document.getElementById('heat-value').textContent,form:document.getElementById('form-label').textContent,painted:document.getElementById('game-canvas').getContext('2d').getImageData(20,20,1,1).data[3]})`);
  if (raid.screen !== 'raid' || !Number(raid.hp) || Number(raid.number) < 2 || raid.painted !== 255) throw Error('Raid did not run: '+JSON.stringify(raid));
  if(!raid.heat.includes('热度')||!raid.form.includes('轻巧'))throw Error('Heat / number form HUD failed: '+JSON.stringify(raid));
  const formContrast=await window.webContents.executeJavaScript(`(() => {
    const form=document.getElementById('form-label'),rgb=color=>color.match(/[0-9.]+/g).slice(0,3).map(Number);
    const luminance=parts=>parts.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const fg=luminance(rgb(getComputedStyle(form).color)),bg=luminance(rgb(getComputedStyle(form.closest('.player-readout')).backgroundColor));
    return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
  })()`);
  if(formContrast<4.5)throw Error('Number form text has insufficient contrast: '+formContrast);

  await fs.writeFile(file().replace(/\.json$/, '-raid.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.getElementById('extract-brief-button').click();`);
  await delay(100);
  const exitBrief=await window.webContents.executeJavaScript(`({open:!document.getElementById('overlay').hidden,count:document.querySelectorAll('.exit-brief-item').length,text:document.getElementById('dialog').textContent,routes:[...document.querySelectorAll('.exit-brief-item')].map(item=>({kind:item.dataset.exitKind,bonus:item.querySelector('.exit-bonus')?.textContent,details:item.textContent})),time:document.getElementById('time-value').textContent})`);
  for(const route of exitBrief.routes){
    const bonus={fallback:0,window:8,key:10,number:10,boss:15}[route.kind];
    if(bonus===undefined||!route.details.includes('距离')||!(bonus?route.bonus.includes('+'+bonus+'%'):route.bonus.includes('标准收益')))throw Error('Extraction risk/reward briefing is incomplete: '+JSON.stringify(route));
    if(route.kind==='window'&&!route.details.includes('每70秒开放40秒'))throw Error('Outdated extraction window briefing');
    if(route.kind==='key'&&!route.details.includes('前沿钥卡箱：'))throw Error('Key cache location is missing');
    if(route.kind==='boss'&&!/守门首领：.{2,}/.test(route.details))throw Error('Guardian identity is missing');
  }
  await delay(200);
  const briefTime=await window.webContents.executeJavaScript(`document.getElementById('time-value').textContent`);
  if(!exitBrief.open||exitBrief.count!==4||!exitBrief.text.includes('西侧保底')||briefTime!==exitBrief.time)throw Error('Paused extraction intelligence failed: '+JSON.stringify(exitBrief));
  await fs.writeFile(file().replace(/\.json$/, '-exits.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('#dialog [data-action="close"]').click();`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyB',bubbles:true}));`);
  await delay(100);
  const inventory=await window.webContents.executeJavaScript(`({open:!document.getElementById('overlay').hidden,unlimited:document.getElementById('dialog').textContent.includes('资源袋 · 不限量'),equipment:document.getElementById('dialog').textContent.includes('装备背包 0 / 8'),counter:document.getElementById('bag-count').textContent})`);
  if(!inventory.open||!inventory.unlimited||!inventory.equipment||inventory.counter!=='0 / 8')throw Error('Resource pouch / equipment slots are missing: '+JSON.stringify(inventory));
  await fs.writeFile(file().replace(/\.json$/, '-inventory.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('#dialog [data-action="close"]').click();`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));`);
  const paused = await window.webContents.executeJavaScript(`!document.getElementById('overlay').hidden && document.getElementById('dialog').textContent.includes('行动暂停')`);
  if (!paused) throw Error('Pause control failed');
  if (process.env.NUMBER_EXTRACTION_SMOKE_MODE !== 'verify') await window.webContents.executeJavaScript(`localStorage.setItem(document.documentElement.dataset.saveKey,JSON.stringify({version:5,selectedMutators:['rich'],credits:37,materials:{alloy:0,core:0},shelter:{},warehouse:{nextId:2,items:[{id:'vault-1',kind:'weapon',weapon:'plasma',rarity:'purple',level:3,enchant:'frost'}],pending:[]},deployment:{},lastRuns:[]}));`);
  await window.webContents.session.flushStorageData();
  await delay(300);
  if (errors.length) throw Error(errors.join('\n'));
  await report({ok:true,shelter,previewLayouts,warehouse,codex,rules,playtest,fixture,raid,formContrast,exitBrief,inventory,paused,persistence:process.env.NUMBER_EXTRACTION_SMOKE_MODE||'write',electron:process.versions.electron,chrome:process.versions.chrome});
  app.quit();
}
module.exports = {run,report,playtestExportPath};
