// Fixed native-app checks used by Windows CI; never accepts renderer-provided code.
const fs = require('node:fs/promises');
const path = require('node:path');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
const file = () => process.env.NUMBER_EXTRACTION_SMOKE_REPORT || path.join(require('node:os').tmpdir(),'NumberExtraction-smoke.json');
async function report(value) { await fs.writeFile(file(),JSON.stringify(value,null,2),'utf8'); }
async function checkPreviewLayouts(window) {
  const bounds=window.getBounds(),minimum=window.getMinimumSize(),zoom=window.webContents.getZoomFactor(),layouts=[];
  window.setMinimumSize(320,300);
  try {
    for (const [width,height,scale] of [[1920,1080,1],[1920,1080,1.25],[1440,900,1],[1440,900,1.5],[1008,680,1],[600,800,1],[390,844,1]]) {
      window.setContentSize(width,height);window.webContents.setZoomFactor(scale);
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
      for (const tile of result.tiles) {
        if (!(tile.width>0&&tile.height>0&&tile.left>=tile.width*.09&&tile.right>=tile.width*.09&&tile.top>=0&&tile.bottom>=0)) {
          throw Error('Number overflows its tile: '+JSON.stringify({width,height,scale,...result,tile}));
        }
      }
      if (result.tiles.length!==12) throw Error('Missing preview tiles after resizing');
      layouts.push({requested:[width,height],zoom:scale,...result});
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
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="start"]').click();`);
  await delay(250);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));`);
  await delay(700);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));`);
  const raid = await window.webContents.executeJavaScript(`({screen:document.body.dataset.screen,hp:document.getElementById('health-value').textContent,number:document.getElementById('player-value').textContent,painted:document.getElementById('game-canvas').getContext('2d').getImageData(20,20,1,1).data[3]})`);
  if (raid.screen !== 'raid' || !Number(raid.hp) || Number(raid.number) < 2 || raid.painted !== 255) throw Error('Raid did not run: '+JSON.stringify(raid));
  await fs.writeFile(file().replace(/\.json$/, '-raid.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));`);
  const paused = await window.webContents.executeJavaScript(`!document.getElementById('overlay').hidden && document.getElementById('dialog').textContent.includes('行动暂停')`);
  if (!paused) throw Error('Pause control failed');
  if (process.env.NUMBER_EXTRACTION_SMOKE_MODE !== 'verify') await window.webContents.executeJavaScript(`localStorage.setItem(document.documentElement.dataset.saveKey,JSON.stringify({version:3,credits:37,materials:{alloy:0,core:0},shelter:{},lastRuns:[]}));`);
  await window.webContents.session.flushStorageData();
  await delay(300);
  if (errors.length) throw Error(errors.join('\n'));
  await report({ok:true,shelter,previewLayouts,raid,paused,persistence:process.env.NUMBER_EXTRACTION_SMOKE_MODE||'write',electron:process.versions.electron,chrome:process.versions.chrome});
  app.quit();
}
module.exports = {run,report};
