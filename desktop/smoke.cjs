// Fixed native-app checks used by Windows CI; never accepts renderer-provided code.
const fs = require('node:fs/promises');
const path = require('node:path');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
const file = () => process.env.NUMBER_EXTRACTION_SMOKE_REPORT || path.join(require('node:os').tmpdir(),'NumberExtraction-smoke.json');
async function report(value) { await fs.writeFile(file(),JSON.stringify(value,null,2),'utf8'); }
async function run(window,app) {
  const errors=[];window.webContents.on('console-message',details => { if (details.level === 'error') errors.push(String(details.message)); });
  await delay(600);
  const shelter = await window.webContents.executeJavaScript(`({screen:document.body.dataset.screen,start:!!document.querySelector('[data-action="start"]'),bridge:window.numberExtractionDesktop?.isDesktop===true,node:typeof window.require,credits:JSON.parse(localStorage.getItem('number-extraction-v07')||'null')?.credits})`);
  if (shelter.screen !== 'shelter' || !shelter.start || !shelter.bridge || shelter.node !== 'undefined') throw Error('Invalid shelter startup: '+JSON.stringify(shelter));
  if (process.env.NUMBER_EXTRACTION_SMOKE_MODE === 'verify' && shelter.credits !== 37) throw Error('Saved progress did not survive restart');
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
  if (process.env.NUMBER_EXTRACTION_SMOKE_MODE !== 'verify') await window.webContents.executeJavaScript(`localStorage.setItem('number-extraction-v07',JSON.stringify({version:3,credits:37,materials:{alloy:0,core:0},shelter:{},lastRuns:[]}));`);
  await window.webContents.session.flushStorageData();
  if (errors.length) throw Error(errors.join('\n'));
  await report({ok:true,shelter,raid,paused,persistence:process.env.NUMBER_EXTRACTION_SMOKE_MODE||'write',electron:process.versions.electron,chrome:process.versions.chrome});
  app.exit(0);
}
module.exports = {run,report};
