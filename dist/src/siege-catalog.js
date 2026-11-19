export const BUILDINGS={
  turret:{name:'哨戒塔',glyph:'⊡',value:2,hp:105,range:320,interval:.72,power:.34,cost:24,alloy:22},
  tesla:{name:'电磁塔',glyph:'ϟ',value:2,hp:105,range:280,interval:1.5,power:.31,cost:34,alloy:29},
  mortar:{name:'迫击塔',glyph:'▥',value:4,hp:125,range:525,interval:2.7,power:.58,cost:51,alloy:42},
  prism:{name:'棱镜塔',glyph:'◇',value:4,hp:110,range:450,interval:1.65,power:.46,cost:48,alloy:35},
  harvester:{name:'采集器',glyph:'⌘',value:2,hp:90,cost:18,alloy:13},
  beacon:{name:'增幅信标',glyph:'✦',value:2,hp:85},
  barricade:{name:'数字路障',glyph:'▦',value:2,hp:175,cost:10,alloy:18},
  conduit:{name:'数字导轨',glyph:'⇢',cost:16,alloy:13},
};
export const BLUEPRINTS={
  turret:BUILDINGS.turret, tesla:BUILDINGS.tesla,mortar:BUILDINGS.mortar,prism:BUILDINGS.prism,
  harvester:BUILDINGS.harvester,barricade:BUILDINGS.barricade,conduit:BUILDINGS.conduit,
  beaconBurn:{...BUILDINGS.beacon,kind:'beacon',enchant:'burn',name:'信标 · 烈焰',cost:30,alloy:24},
  beaconFrost:{...BUILDINGS.beacon,kind:'beacon',enchant:'frost',name:'信标 · 寒霜',cost:30,alloy:24},
  beaconSunder:{...BUILDINGS.beacon,kind:'beacon',enchant:'sunder',name:'信标 · 破甲',cost:32,alloy:25},
};
export const MINES={
  number_well:{name:'数字井',glyph:'2ⁿ',color:'#a6edb1'},
  alloy_vein:{name:'合金矿床',glyph:'▤',color:'#aee2fa'},
  data_vein:{name:'数据矿脉',glyph:'◇',color:'#f9db96'},
  crystal_node:{name:'晶簇节点',glyph:'✧',color:'#dfbaff'},
};
export const SIEGE_GEAR={
  rifle:{name:'绿品破甲步枪',enchant:'sunder',cost:58},
  shotgun:{name:'绿品烈焰霰弹',enchant:'burn',cost:51},
  greatsword:{name:'绿品寒霜大剑',enchant:'frost',cost:51},
};
