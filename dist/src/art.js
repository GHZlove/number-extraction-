import { facilityLevel, shelterLevel } from './shelter.js';

const paths = {
  data: '<path d="m12 3 8 9-8 9-8-9 8-9Z"/><path d="m8 12 4-5 4 5-4 5-4-5Z"/>',
  alloy: '<path d="m3 8 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 18l9 4 9-4"/>',
  core: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m12 7 4 2v6l-4 2-4-2V9l4-2Z"/>',
  storage: '<path d="M3 8h18v13H3V8Zm-1 0 4-5h12l4 5M8 12h8M8 16h8"/>',
  medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
  weapon: '<path d="M3 8h17v5H9l-2 7H3l2-7H3V8Zm13 0V5h5v3M10 13v3h5v-3"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  bag: '<path d="M5 8h14l2 13H3L5 8Zm4 0V5a3 3 0 0 1 6 0v3M8 13h8M8 17h8"/>',
  sound: '<path d="M3 9h5l5-5v16l-5-5H3V9Zm14-2c3 3 3 7 0 10M17 10c1 1 1 3 0 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2M12 17h.01"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  exit: '<path d="M9 4H3v16h6M8 12h13m-5-5 5 5-5 5"/>',
};
export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.core}</svg>`;
}

export function shelterArt(save) {
  const level = shelterLevel(save), colors = ['#83dec6','#87bff2','#eac37d','#bb9ee8'];
  const modules = [
    { key:'storage',x:150,y:226,w:116,h:69,label:'储备仓' },
    { key:'supply',x:490,y:238,w:118,h:70,label:'补给站' },
    { key:'workshop',x:185,y:119,w:142,h:76,label:'武器工坊' },
    { key:'recycler',x:505,y:117,w:105,h:67,label:'回收中心' },
  ];
  const module = (item,index) => {
    const active = facilityLevel(save,item.key)>0, color=active?colors[index]:'#5b7784';
    const {x,y,w,h}=item;
    return `<g><path d="M${x},${y}l${w},-26 42,25v${h}l-${w},26-42-25Z" fill="#101e29" stroke="#3b5362"/>
      <path d="M${x},${y}l${w},-26 42,25-${w},26Z" fill="${active?'#213746':'#172936'}" stroke="#45616e"/>
      <path d="M${x+10},${y+7}l${w-10},-23" stroke="${color}" stroke-width="3" opacity=".8"/>
      <path d="M${x+16},${y+20}v${h-25}m13-${h-18}v${h-25}m13-${h-18}v${h-25}" stroke="#304956"/>
      <rect x="${x+w-6}" y="${y+17}" width="28" height="24" rx="3" fill="#0a141e" stroke="${color}"/>
      <circle cx="${x+w+8}" cy="${y+29}" r="4" fill="${color}"/>
      <text x="${x+w/2+17}" y="${y+h+42}" fill="#91a8b3" text-anchor="middle" font-size="11">${item.label} · ${facilityLevel(save,item.key)}</text></g>`;
  };
  return `<svg class="shelter-art" viewBox="0 0 800 420" role="img" aria-label="庇护所示意图，当前等级${level}">
    <defs><radialGradient id="station-light"><stop stop-color="#53bda7" stop-opacity=".17"/><stop offset="1" stop-color="#0a141d" stop-opacity="0"/></radialGradient>
    <pattern id="station-grid" width="38" height="22" patternUnits="userSpaceOnUse"><path d="m0 11 19-11 19 11-19 11Z" fill="none" stroke="#557380" stroke-opacity=".13" stroke-width=".6"/></pattern></defs>
    <ellipse cx="400" cy="230" rx="350" ry="185" fill="url(#station-light)"/>
    <path d="m65 250 365-170 315 170-365 160Z" fill="url(#station-grid)"/>
    <path d="m100 265 322-151 277 150-322 139Z" fill="#0e1b25" fill-opacity=".65" stroke="#2a424e"/>
    <path d="m140 265 276-125 239 128-277 119Z" fill="none" stroke="#5b7e8c" stroke-opacity=".25" stroke-dasharray="5 9"/>
    <path d="M270 285 365 244 520 285M306 160l81 47 154-52" fill="none" stroke="#66b9b0" stroke-opacity=".32" stroke-width="4"/>
    ${modules.slice(2).map((item,index)=>module(item,index+2)).join('')}
    <g><path d="m303 236 83-42 94 43v84l-89 43-88-43Z" fill="#102631" stroke="#547785"/>
    <path d="m303 236 83-42 94 43-88 43Z" fill="#284753" stroke="#658d96"/>
    <path d="m319 234 67-31 76 34-70 33Z" fill="#153b42" stroke="#91dcc9"/>
    <path d="m349 236 37-17 42 19-38 18Z" fill="#8ddac5" fill-opacity=".65"/>
    <path d="M390 281v80M315 252v58M469 251v60" stroke="#88ccbd" stroke-opacity=".55"/>
    <path d="m346 316 28 14v24l-28-14Z" fill="#07141e" stroke="#5b9496"/>
    <path d="m410 312 43-20v12l-43 20Z" fill="#82d9c4" fill-opacity=".5"/>
    <path d="M385 194v-63m-18 12 18-12 19 12" fill="none" stroke="#7798a2" stroke-width="3"/>
    <circle cx="385" cy="126" r="4" fill="#eac27a"/><circle cx="385" cy="126" r="13" fill="none" stroke="#eac27a" stroke-opacity=".25"/>
    <text x="390" y="295" fill="#d5eee7" font-size="13" text-anchor="middle" font-family="monospace">N / 0${level}</text></g>
    ${modules.slice(0,2).map(module).join('')}
    <path d="M82 70h80m-80 0v42m636 240h-80m80 0v-42" stroke="#63828e" stroke-opacity=".5"/>
    <text x="87" y="60" fill="#637e8b" font-size="9" letter-spacing="3">SHELTER NETWORK</text>
    <text x="640" y="373" fill="#637e8b" font-size="9" letter-spacing="2">SYSTEM READY</text>
  </svg>`;
}
