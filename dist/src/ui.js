import { MUTATORS, normalizeMutators, runRules, exitKindName } from './run-rules.js';
import { warehouseCapacity, plannedWarehouseGear, applyWarehouseGear, hydrateEquipment, warehouseRepairCost } from './warehouse.js';
import { BOSSES, BOSS_MOVES, bossPool } from './bosses.js';
import { RULES, FACILITIES, DIFFICULTIES, LEGACY_WORLD, difficultyOf, VERSION, ENEMY_TYPES, MAP_LAYOUTS } from './config.js';
import { tier, zoneAt } from './math.js';
import { activeWeapon, weaponOf, rarityOf, WEAPONS, ENCHANTS, RARITIES, isEquipment } from './equipment.js';
import { facilityLevel, facilityCost, facilityBenefit, canUpgradeFacility, workshopGrade, starterLoadout, rewardMultiplier, shelterLevel, forgeCost, canForge } from './shelter.js';
import { SHOP, tradeValue } from './commerce.js';
import { icon } from './art.js';
import { NUMBER_COLORS } from './number-tiles.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const RARITIES_INDEX=rarity=>RARITIES.findIndex(r=>r.id===rarity);
const number = value => Math.floor(value).toLocaleString('en-US');
export const formatTime = seconds => `${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
const costHTML = cost => `<span>${icon('data')}${number(cost.credits)}</span><span>${icon('alloy')}${cost.alloy}</span>${cost.core?`<span>${icon('core')}${cost.core}</span>`:''}`;

export class UI {
  constructor(actions) {
    this.actions = actions; this.toastUntil = 0;this.shelterTab='deploy';
    const dispatch = event => {
      const button = event.target.closest('[data-action]');
      if (button && !button.disabled) actions[button.dataset.action]?.(button.dataset.key);
    };
    $('dialog').addEventListener('click',dispatch);
    $('shelter-screen').addEventListener('click',dispatch);
    $('shelter-screen').addEventListener('change',event=>{
      if(['selectWeapon','selectMap','selectEnchant','selectBoss'].includes(event.target.dataset.action)) actions[event.target.dataset.action]?.(event.target.value);
    });
    $('dialog').addEventListener('keydown',event=>{
      if(event.key !== 'Tab') return;
      const focus = [...$('dialog').querySelectorAll('button:not(:disabled),a[href]')];
      if(!focus.length)return;
      if(event.shiftKey && document.activeElement === focus[0]) { event.preventDefault();focus.at(-1).focus(); }
      else if(!event.shiftKey && document.activeElement === focus.at(-1)) { event.preventDefault();focus[0].focus(); }
    });
    for(const [id,name,action] of [['loadout-button','bag','inventory'],['help-button','help','help'],['pause-button','pause','pause'],['extract-brief-button','exit','exits']]) {
      $(id).innerHTML = icon(name); $(id).onclick = actions[action];
    }
    $('sound-button').onclick = actions.sound;
    $('inventory-shortcut').onclick = actions.inventory;
    $('overload-button').onclick = actions.overload;
    for(const slot of [0,1]) $('quick-slot-'+slot).onclick = ()=>actions.slot(String(slot));
  }
  toast(text) { $('message').textContent=text;$('message').classList.add('visible');this.toastUntil=performance.now()+3800; }
  tick() { if(performance.now()>this.toastUntil)$('message').classList.remove('visible'); }
  warning(available) { return available?'':'<p class="save-warning">当前浏览器无法持久保存。进度仅在本次会话中有效。</p>'; }
  numberPreview(){return `<div class="number-preview" aria-label="彩色数字方块预览">${[2,4,8,16,32,64,128,256,512,1024,2048,4096].map(value=>`<div class="preview-number" data-digits="${String(value).length}" style="--number-face:${NUMBER_COLORS[value]}"><strong>${value}</strong></div>`).join('')}</div>`;}
  saveTransfer(save,pending){
    this.show(`<span class="eyebrow">SAVE / TRANSFER</span><h2 id="dialog-title">存档与迁移</h2><p>当前：${number(save.credits)} 数据币 · ${save.materials.alloy} 合金 · ${save.materials.core} 核心 · ${Object.keys(save.forged||{}).length} 件打造记录 · 仓库${save.warehouse.items.length}件 / 待收${save.warehouse.pending.length}件。</p><p>浏览器与桌面版各自保存进度。先在原版导出JSON，再在桌面版导入。未结束的战局不包含在存档中。</p><div class="dialog-actions"><button class="primary-button" data-action="exportSave">导出存档</button><button class="secondary-button" data-action="importSave">选择JSON导入</button></div>${pending?`<section class="save-preview"><b>待导入：${number(pending.credits)} 数据币 · ${pending.materials.alloy} 合金 · ${pending.materials.core} 核心</b><p>${Object.keys(pending.forged||{}).length} 件打造记录 · 仓库${pending.warehouse.items.length}件 / 待收${pending.warehouse.pending.length}件。确认后替换当前进度，原进度会先备份。</p><button class="primary-button" data-action="confirmImport">确认导入</button></section>`:''}<div class="dialog-actions"><button class="secondary-button" data-action="restoreBackup">查看导入前备份</button><button class="secondary-button" data-action="close">返回庇护所</button></div>`,true);
  }
  forgePanel(save){
    const cost=forgeCost(save),owned=save.forged?.[save.selectedWeapon],weapon=WEAPONS[save.selectedWeapon];
    return `<section class="forge-panel"><span class="eyebrow">FORGE / PERMANENT LOADOUT</span><h2>打造 · ${weapon.name}</h2><label for="forge-weapon-choice">选择打造武器</label><select id="forge-weapon-choice" data-action="selectWeapon">${Object.entries(WEAPONS).map(([key,w])=>`<option value="${key}" ${key===save.selectedWeapon?'selected':''} ${w.unlock>facilityLevel(save,'workshop')?'disabled':''}>${w.name}${w.unlock>facilityLevel(save,'workshop')?' · 工坊Lv.'+w.unlock+'解锁':''}</option>`).join('')}</select><p>打造当前出击武器，最高 Lv.5。每级伤害 +8%，击退增强。打造记录永久保存，每次出击重新发放；死亡保留打造进度。</p><p>${owned?`当前 Lv.${owned.level} · ${ENCHANTS[owned.enchant].name}`:'尚未打造 · 第一次打造获得 Lv.1'}</p><label for="enchant-choice">此次打造附魔</label><select id="enchant-choice" data-action="selectEnchant">${Object.entries(ENCHANTS).map(([key,e])=>`<option value="${key}" ${key===save.selectedEnchant?'selected':''}>${e.name}</option>`).join('')}</select><p>${ENCHANTS[save.selectedEnchant].description}</p><button class="upgrade-button" data-action="forge" ${canForge(save)?'':'disabled'}><b>${cost?(owned?.level===5?'重铸附魔':'打造 / 升至 Lv.'+((owned?.level||0)+1)):'已达 Lv.5'}</b>${cost?`<span class="cost-list">${costHTML(cost)}</span>`:''}</button><small>更换出击武器可打造其他类型。升级时可选择新的附魔，满级后可付费重铸附魔。战局拾取装备仍在撤离时兑换资源。</small></section>`;
  }
  shop(raid,id){
    const trader=raid.world.merchants.find(m=>m.id===id);if(!trader)return;
    const funds=tradeValue(raid);
    this.show(`<span class="eyebrow">FIELD TRADER</span><h2 id="dialog-title">${escapeHTML(trader.name)}</h2><p>可交易物资 <b>${funds} ◇</b>。消费背包里的物资价值，庇护所存款不受影响。装备商品放入背包，按 B 换装。</p><div class="shop-list">${Object.entries(SHOP).map(([key,offer])=>`<article class="shop-item"><div><b>${offer.name}</b><p>${key==='medkit'?`回复${raid.player.healAmount}生命，按R使用。`:offer.description}</p><small>本局剩余 ${trader.stock[key]} 件</small></div><button data-action="buy" data-key="${key}" ${trader.stock[key]<=0||funds<offer.cost||(!['medkit','divider'].includes(key)&&raid.equipmentCount()>=raid.capacity)?'disabled':''}>${offer.cost} ◇ · 购买</button></article>`).join('')}</div><button class="primary-button" data-action="close">返回战区</button>`,true);
  }
  shelter(save,{lastResult=null,saveAvailable=true}={}) {
    const selected=difficultyOf(save.selectedDifficulty),loadout=applyWarehouseGear(starterLoadout(save),plannedWarehouseGear(save)),level=shelterLevel(save);
    const report=lastResult||save.lastRuns[0];
    const rewards=report?.success?`+${number(report.value)} ◇ · +${report.materials?.alloy||0} 合金 · +${report.materials?.core||0} 核心 · 装备${(report.warehouse?.stored||0)+(report.warehouse?.pending||0)}件`:'本次未带出资源';
    const reportHTML=report?`<section class="run-report ${report.success?'':'failed'}">${icon(report.success?'exit':'shield')}<div><b>${report.success?'安全归来，资源已入库。':'行动结束，已返回庇护所。'}</b><p>${report.success?'准备下一次远征，或者先升级设施。':escapeHTML(report.reason||'未能完成撤离')+'。已保存的庇护所资源仍然保留。'}</p></div><span class="run-rewards">${rewards}</span></section>`:'';
    const resources=[['data','数据币',save.credits,''],['alloy','合金',save.materials.alloy,'alloy'],['core','核心',save.materials.core,'core']];
    const facilities=Object.entries(FACILITIES).map(([key,definition])=>{
      const current=facilityLevel(save,key),cost=facilityCost(key,current),next=Math.min(current+1,definition.max);
      return `<article class="facility-card"><div class="facility-title"><span class="facility-icon">${icon(definition.icon)}</span><div><h3>${definition.name}</h3><small>${definition.en}</small></div><span class="facility-level">Lv.${String(current).padStart(2,'0')}</span></div><p>${facilityBenefit(key,current)}</p><div class="facility-next">${cost?'下一级：'+facilityBenefit(key,next):'设施已达到当前上限'}</div><button class="upgrade-button" data-action="upgradeFacility" data-key="${key}" ${canUpgradeFacility(save,key)?'':'disabled'}><span>${cost?'升级设施':'已满级'}</span>${cost?`<span class="cost-list">${costHTML(cost)}</span>`:''}</button></article>`;
    }).join('');
    $('shelter-screen').dataset.tab=this.shelterTab;
    $('shelter-screen').innerHTML=`
      <header class="shelter-top"><div class="brand"><span class="brand-logo">n</span><div><strong>数字进化</strong><small>NUMBER EXTRACTION / SHELTER</small></div></div><div class="shelter-resources">${resources.map(([symbol,label,value,cls])=>`<div class="resource-chip ${cls}">${icon(symbol)}<div><small>${label}</small><b>${number(value)}</b></div></div>`).join('')}</div></header>
      ${reportHTML}${this.warning(saveAvailable)}
      <nav class="shelter-tabs" aria-label="庇护所功能">${[['deploy','出击终端','OPERATIONS'],['base','基地设施','SHELTER'],['forge','武器工坊','WORKSHOP'],['vault','战备仓库','WAREHOUSE'],['bosses','首领图鉴','BOSSES'],['rules','行动设置','RUN RULES']].map(([key,label,en])=>`<button data-action="shelterTab" data-key="${key}" aria-pressed="${this.shelterTab===key}"><span>${label}</span><small>${en}</small></button>`).join('')}</nav>
      <div class="shelter-layout"><div class="shelter-main">
        <section class="shelter-hero"><div class="hero-heading"><div><span class="eyebrow">HOME / SECTOR ZERO</span><h1>第零庇护所</h1><p>带资源回来。让下一次出发更有准备。</p></div><span class="safe-tag"><i class="signal-dot"></i>安全区 · Lv.${level}</span></div>${this.numberPreview()}<div class="hero-footer"><div><span>当前出击装备</span><b>${escapeHTML(loadout.weapons[0].name)} / ${escapeHTML(loadout.weapons[1].name)}</b></div><div><span>设施建设阶段</span><div class="hero-stage">${Array.from({length:10},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('')}</div></div></div></section>
        <div class="section-heading"><h2>庇护所设施</h2><span>资源投入，长期成长</span></div><section class="facilities-grid">${facilities}</section>
        ${this.forgePanel(save)}${this.warehousePanel(save)}${this.bossCodex(save)}${this.rulesPanel(save)}
        <div class="shelter-stats"><div class="stat-card"><small>成功撤离</small><b>${save.extractions}</b></div><div class="stat-card"><small>最高数字</small><b>${save.best}</b></div><div class="stat-card"><small>累计行动</small><b>${save.extractions+save.deaths}</b></div></div>
      </div><aside class="expedition-panel" aria-label="出击准备"><span class="eyebrow">NEXT EXPEDITION</span><h2>远征准备</h2><p class="muted">资源点有重兵驻守，野外只有少量巡游。选择不同地图，寻找商人、安全屋和首领。</p>
        <button class="deploy-button" data-action="start"><span>确认出击</span>${icon('arrow')}</button><div class="difficulty-list">${DIFFICULTIES.map(mission=>`<button class="difficulty-card ${mission.id===selected.id?'selected':''}" style="--difficulty:${mission.color}" data-action="selectDifficulty" data-key="${mission.id}" aria-pressed="${mission.id===selected.id}"><div class="difficulty-top"><b>${mission.name}</b><span>${'◆'.repeat(mission.rank)}${'◇'.repeat(5-mission.rank)}</span></div><div class="difficulty-meta"><span>地图 ×${mission.width*mission.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}</span><span>敌人 ${2**(mission.enemyShift+1)}–${128*2**mission.enemyShift}</span><span>收益 ×${mission.reward}</span></div></button>`).join('')}</div>
        <div class="weapon-choice"><label for="map-choice">地图布局</label><select id="map-choice" data-action="selectMap">${MAP_LAYOUTS.map(map=>`<option value="${map.id}" ${map.id===save.selectedMap?'selected':''}>${map.name}</option>`).join('')}</select></div><p class="deploy-note">${Object.keys(ENEMY_TYPES).length} 类敌人 + ${Object.keys(BOSSES).length}种首领 · ${Object.keys(WEAPONS).length} 类武器 · 4 个撤离点</p><div class="weapon-choice"><label for="starter-choice">工坊出击武器 · ${workshopGrade(save).name}品</label><select id="starter-choice" data-action="selectWeapon">${Object.entries(WEAPONS).map(([key,weapon])=>`<option value="${key}" ${key===save.selectedWeapon?'selected':''} ${weapon.unlock>facilityLevel(save,'workshop')?'disabled':''}>${weapon.name}${weapon.unlock>facilityLevel(save,'workshop')?' · 工坊Lv.'+weapon.unlock+'解锁':''}</option>`).join('')}</select><p>工坊 2 级配备基础护甲，4 级配备镭射。撤离装备存入战备仓库，可选择带入下一局；未选仓库装备的槽位领取工坊基础装备。</p></div>
        <div class="expedition-summary"><div><small>战区尺寸</small><b>${selected.width} × ${selected.height}</b></div><div><small>行动时限</small><b>${formatTime(selected.seconds*runRules(save.selectedMutators).duration)}</b></div><div><small>撤离开放</small><b>${formatTime(selected.extractAt)} 后</b></div><div><small>怪潮节奏</small><b>据点驻守 / 稀疏巡游</b></div><div><small>装备容量</small><b>${RULES.bagCapacity+facilityLevel(save,'storage')*2} 格</b></div><div><small>总收益倍率</small><b>×${(rewardMultiplier(save,selected.id)*runRules(save.selectedMutators).reward).toFixed(2)}</b></div></div>
        <div class="weapon-choice"><label for="boss-choice">优先追踪首领 · 高危据点</label><select id="boss-choice" data-action="selectBoss"><option value="random">随机首领</option>${bossPool(selected.rank).map(key=>`<option value="${key}" ${save.selectedBoss===key?'selected':''}>${BOSSES[key].name}</option>`).join('')}</select><p>首个首领据点优先出现追踪目标，位置见小地图。仓库选装请前往“战备仓库”。</p></div><div class="run-summary"><b>本局词条：${save.selectedMutators.length?save.selectedMutators.map(id=>MUTATORS[id].name).join(' · '):'无'}</b><p>热度随停留和行动上升；64 / 256 / 1024改变体型。特殊出口每局变化，西侧保底出口持续开放。</p><button data-action="shelterTab" data-key="rules">配置行动词条</button></div><p class="deploy-note">成功撤离保存装备 · 带入的仓库装备失败会丢失</p>
      </aside></div><footer class="shelter-footer"><span>${window.numberExtractionDesktop?'WINDOWS DESKTOP':'LOCAL SOLO'} / v${VERSION} · 进度保存在本机</span><div><button data-action="saves">存档 · 导入 / 导出</button><button data-action="help">操作与战斗规则 ↗</button></div></footer>`;
  }
  update(raid,save,started,paused) {
    const p=raid.player,zone=zoneAt(p,raid.world.zones),item=activeWeapon(p);
    $('player-value').textContent=p.value;
    $('player-value').style.fontSize=p.value>=1000?'22px':p.value>=100?'27px':'';
    $('health-value').textContent=Number(p.hp.toFixed(1));$('health-bar').style.width=`${100*p.hp/p.maxHp}%`;
    $('health-bar').style.background=p.hp<30?'var(--red)':'var(--mint)';
    const boss=raid.world.enemies.filter(e=>e.boss&&!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<Math.min(950,raid.run.vision)&&(e.hp<e.maxHp||e.state==='windup'||e.bossPhase===2)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    $('boss-hud').hidden=!boss;if(boss){$('boss-name').textContent=boss.bossName;$('boss-stage').textContent=`阶段 ${boss.bossPhase}`;$('boss-health-fill').style.width=`${100*boss.hp/boss.maxHp}%`;$('boss-health-text').textContent=`${Math.ceil(boss.hp)} / ${boss.maxHp}`;}
    $('armor-name').textContent=p.armor?`${rarityOf(p.armor.rarity).name}品护甲`:'未穿护甲';
    $('armor-durability').textContent=p.armor?Math.ceil(p.armor.durability):'0';
    $('armor-fill').style.width=p.armor?`${100*p.armor.durability/p.armor.maxDurability}%`:'0';
    $('energy-value').textContent=p.overload>0?`${p.overload.toFixed(1)}s`:Math.floor(p.energy)+'%';
    $('energy-fill').style.width=`${p.energy}%`;
    $('energy-label').textContent=p.overload>0?'过载运行中':p.energy>=100?'战术过载就绪':'过载未就绪';
    $('overload-button').disabled=p.energy<100||p.overload>0||paused;
    $('overload-button').classList.toggle('ready',p.energy>=100);
    for(const slot of [0,1]){
      const equipped=p.weapons[slot],weapon=weaponOf(equipped),grade=rarityOf(equipped.rarity),button=$('quick-slot-'+slot);
      button.innerHTML=`${slot+1} · ${escapeHTML(weapon.name)}<small>${grade.name}品 / Lv.${equipped.level||1}${equipped.enchant&&equipped.enchant!=='none'?' · '+ENCHANTS[equipped.enchant].name:''}</small>`;
      button.title=equipped.name;
      button.style.setProperty('--rarity',grade.color);button.classList.toggle('active',p.activeSlot===slot);
    }
    $('laser-label').textContent=p.laserDisabled?'镭射干扰 · 白线瞄准':p.laser?'镭射已装 · 红线瞄准':'白线瞄准 · 未装镭射';$('laser-label').classList.toggle('laser-on',!!p.laser&&!p.laserDisabled);
    $('loot-value').textContent=number(Math.round(raid.carriedValue()*raid.rewardMultiplier));$('bag-count').textContent=`${raid.equipmentCount()} / ${raid.capacity}`;
    $('divider-count').textContent=p.dividers;$('medkit-count').textContent=p.medkits;
    const buffs=[];if(p.chilled>0)buffs.push('寒霜减速');if(p.overload>0)buffs.push('过载');for(const[key,label]of[['fury','增幅'],['phase','相位'],['magnet','牵引']])if(p.buffs[key]>0)buffs.push(`${label} ${Math.ceil(p.buffs[key])}s`);
    $('buff-label').textContent=buffs.join(' · ');$('parry-status').textContent=p.parryWindow>0?'判定中':p.parryCooldown>0?p.parryCooldown.toFixed(1)+'s':'弹反就绪';
    $('mission-name').textContent=raid.world.theme+' / '+raid.difficulty.name;$('zone-name').textContent=`${zone.name} · ${zone.riskLabel}`;
    $('terrain-label').textContent=raid.ground()?.name||'开阔地';
    const pressure=raid.pressureInfo();$('pressure-readout').textContent=`巡游${pressure.wave} / 近敌${pressure.near}`;$('pressure-readout').title=pressure.label;
    $('heat-value').textContent=`热度 ${Math.floor(pressure.heat)} · 追猎${pressure.heatLevel}`;$('heat-fill').style.width=`${pressure.heat}%`;$('heat-fill').style.background=pressure.heat>=75?'#ff6080':pressure.heat>=50?'#ff9b4d':'#e5c35b';
    $('heat-hunters').textContent=`猎手 ${pressure.hunters} · 钥卡 ${raid.exitKeys}`;
    $('form-label').textContent=`${p.form.name} · 机动${Math.round(p.form.speed*raid.run.playerSpeed*100)}%${p.form.damage<1?' · 减伤'+Math.round((1-p.form.damage)*100)+'%':''}${p.formPending?' · 体型待展开':''}`;
    $('exit-status').textContent=raid.extractionReady()?'撤离已开放':`撤离 ${formatTime(raid.difficulty.extractAt-raid.elapsed)} 后开放`;$('time-value').textContent=formatTime(raid.duration-raid.elapsed);
    $('map-scale').textContent=`${raid.world.bounds.width*raid.world.bounds.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}×`;$('map-theme').textContent=raid.world.theme;
    const near=raid.nearbyGear();$('nearby-gear').hidden=!near||paused||!!raid.result;if(near){$('nearby-gear').textContent=`F · ${near.name}`;$('nearby-gear').style.color=rarityOf(near.rarity).color;}
    const context=raid.context();$('interaction').hidden=!context||paused||!!raid.result;
    if(context){$('interaction-text').textContent=context.kind==='exit'?(context.locked?context.status.label:'静止 · 按住撤离'):context.kind==='merchant'?'E · 与商人交易':context.kind==='node'?'静止 · 启用运算节点':context.target.keyCard?'静止 · 搜索撤离钥卡':'静止 · 按住搜索';$('interaction-count').textContent=context.kind==='exit'?(context.locked?(context.status.wait?formatTime(context.status.wait):'LOCK'):`${Math.max(0,RULES.extractSeconds-raid.extractProgress).toFixed(1)}s`):'';$('interaction-fill').style.width=`${Math.min(100,context.progress*100)}%`;}
    document.querySelector('.touch-actions [data-control="ShiftLeft"] small').textContent=raid.run.noDodge?'禁用':'闪避';
    document.querySelector('.touch-actions [data-control="KeyQ"] small').textContent=`${p.dividers} 个`;
    document.querySelector('.touch-actions [data-control="KeyR"] small').textContent=`${p.medkits} 个`;
    document.querySelector('.touch-actions [data-control="KeyG"] small').textContent=p.overload>0?'运行中':`${Math.floor(p.energy)}%`;
    this.tick();
  }
  show(html,wide=false) { $('overlay').hidden=false;$('dialog').className=`dialog${wide?' wide':''}`;$('dialog').innerHTML=html;requestAnimationFrame(()=>$('dialog').querySelector('button:not(:disabled)')?.focus()); }
  hide(focus=true) { $('overlay').hidden=true;if(focus)$('game-canvas').focus(); }
  help() { this.show(`<button class="dialog-close" data-action="close" aria-label="关闭规则">×</button><span class="eyebrow">FIELD MANUAL / v${VERSION}</span><h2 id="dialog-title">搜据点，造装备，带资源回家。</h2><div class="rule-grid"><div class="rule-card"><b>01 / 资源与守卫</b><p>大部分敌人驻守资源点，野外只有少量巡游。靠近据点可能引来有限增援；离开后守卫会返回。难度与区域风险影响敌人数值、数量和收益。</p></div><div class="rule-card"><b>02 / 合成与战斗</b><p>同数中立数字合成，最大2048。低于自己的敌人残骸靠近后回收成金币；满级可回收同级残骸。碎片、金币和材料不限量，只有装备占格。白色Lv.1无增益、无护甲时，8对4伤害50%/25%，16对4为75%/12.5%。Q减半打断，G消耗满能量启动七秒过载。</p></div><div class="rule-card"><b>03 / 右键弹反</b><p>朝向来袭方向，在命中前按右键或C。判定窗口0.18秒，成功反射弹丸或震慑近战敌人，并获得能量。不能弹反毒雾或普通爆炸。失败有冷却，不能一直按住防御。</p></div><div class="rule-card"><b>04 / 附魔与打造</b><p>附魔共12种：吸血、闪电、眩晕、毒雾、烈焰、寒霜、流血、破甲、爆裂、暴击、重力、回能。庇护所可花资源打造当前出击武器，最高Lv.5，每级强化伤害与击退，打造进度在死亡后保留。</p></div><div class="rule-card"><b>05 / 商人与安全屋</b><p>西侧安全屋旁的商人可用背包物资兑换修复剂、减半道具与装备。低风险出口保护圈免受伤害，但屋内不能攻击；每处安全屋每局治疗一次。</p></div><div class="rule-card"><b>06 / 首领与撤离</b><p>高风险据点出现九种首领，图鉴可查看招式与克制策略：震地、冲锋、弹幕、环射、毒雾和增援；半血进入第二阶段。击败守门首领后对应出口解锁。生存到撤离开放，再静止按E四秒。失败保留庇护所和打造资产。</p></div></div><div class="key-help"><kbd>WASD</kbd>移动 <kbd>鼠标</kbd>瞄准 <kbd>左键/空格</kbd>攻击 <kbd>右键/C</kbd>弹反 <kbd>Shift</kbd>闪避 <kbd>Q</kbd>÷2 <kbd>R</kbd>修复 <kbd>G</kbd>过载 <kbd>F</kbd>拾取 <kbd>B</kbd>换装 <kbd>1/2</kbd>切槽 <kbd>E</kbd>交互 <kbd>Esc</kbd>暂停</div><p>出击前可配置最多3个行动词条。热度上升会引来有预警的追猎队；64、256、1024改变体型与机动。特殊出口条件见右上角撤离情报，西侧为保底出口。选择七巧遗迹、裂谷放射、补给街区或多心荒原，也可随机。出生教学路线保持低风险。前沿试验箱有四种原附魔，旁边军械试验箱提供八种新增附魔与六种新武器；试用品不可出售。右上角可开启音效。</p><button class="primary-button" data-action="close">明白了 ${icon('arrow')}</button>`,true); }

  pause() { this.show(`<span class="eyebrow">SIGNAL HELD</span><h2 id="dialog-title">行动暂停</h2><p>计时与敌人已经停止。准备好后继续行动。</p><button class="primary-button" data-action="close">继续行动 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="help">查看规则</button><button class="secondary-button" data-action="abandonAsk">返回庇护所</button></div>`); }
  abandonAsk() { this.show(`<span class="eyebrow">RETURN TO SHELTER</span><h2 id="dialog-title">放弃这次远征？</h2><p>尚未撤离的物资会丢失。庇护所已经保存的资源与升级保留。</p><button class="primary-button" data-action="close">继续搜索 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="abandon">放弃并返回庇护所</button></div>`); }
  rulesPanel(save){
    const ids=normalizeMutators(save.selectedMutators),profile=runRules(ids);
    return `<section class="rules-panel"><span class="eyebrow">EXPEDITION MODIFIERS</span><h2>行动设置 · 最多3个词条</h2><p>词条只影响本局，不改写仓库装备属性。热度、数字体型与变化撤离条件每局生效；西侧出口不需要钥卡、指定数字或击败首领。</p><div class="rule-summary">已选 ${ids.length} / 3 · 结算奖励 +${Math.round((profile.reward-1)*100)}% · 热度速度 ×${profile.heatRate.toFixed(1)}</div><div class="mutator-grid">${Object.entries(MUTATORS).map(([id,m])=>`<button class="mutator-card ${ids.includes(id)?'selected':''}" data-action="toggleMutator" data-key="${id}" aria-pressed="${ids.includes(id)}" ${ids.length>=3&&!ids.includes(id)?'disabled':''}><b>${m.name}</b><span>${m.description}</span><small>${ids.includes(id)?'已选择':'点击加入'}</small></button>`).join('')}</div><div class="number-form-info"><h3>数字身份</h3><p>1–32：标准体型与机动。64–128：体型略大，步行 +4%。256–512：更大体型，步行 -6%、减伤8%。1024–2048：大体型，步行 -14%、减伤14%。闪避距离不随体型缩短。</p><h3>变化撤离</h3><p>除西侧保底出口外，其他出口可能要求钥卡、数字门槛、击败守门首领，或每70秒开放30秒。前沿钥卡箱提供一张钥卡，完成撤离时才消耗。局内右上角“撤离情报”可查看条件和方向。</p></div><button class="rules-return" data-action="shelterTab" data-key="deploy">返回出击准备</button></section>`;
  }
  exits(raid){
    const directions=['东','东南','南','西南','西','西北','北','东北'];
    this.show(`<span class="eyebrow">EXTRACTION INTELLIGENCE</span><h2 id="dialog-title">撤离情报</h2><p>行动已暂停。持有钥卡 ${raid.exitKeys} 张；当前数字 ${raid.player.value}。西侧保底出口始终保留。</p><div class="exit-brief-list">${raid.world.exits.map(exit=>{
      const state=raid.extractionStatus(exit),direction=directions[(Math.round(Math.atan2(exit.y-raid.player.y,exit.x-raid.player.x)/(Math.PI/4))+8)%8];
      const rule=exit.kind==='key'?'完成撤离消耗1张钥卡，前沿钥卡箱可获得':exit.kind==='number'?`数字达到 ${exit.requiredNumber}`:exit.kind==='window'?'每70秒开放30秒，需要连续4秒读条':exit.bossId?'击败此出口的守门首领':'无额外门槛，开放后持续可用';
      return `<article class="exit-brief-item"><div><b>${exit.label} · ${exit.name}</b><small>${exitKindName(exit)} · ${direction}</small><p>${rule}</p></div><strong class="${state.ready?'ready':''}">${state.label}</strong></article>`;
    }).join('')}</div><button class="primary-button" data-action="close">返回行动</button>`,true);
  }
  recycleConfirm(record){
    const item=hydrateEquipment(record),rank=RARITIES_INDEX(record.rarity);
    this.show(`<span class="eyebrow">RECYCLE EQUIPMENT</span><h2 id="dialog-title">回收这件装备？</h2><p>${escapeHTML(item.name)}</p><p>获得 ${Math.max(1,Math.floor(item.value*.35))} 数据币、${Math.max(1,rank+1)} 合金${rank>=4?'、1 核心':''}。回收后装备消失，相关出击选择也会取消。</p><div class="dialog-actions"><button class="secondary-button" data-action="close">保留装备</button><button class="primary-button" data-action="confirmRecycle">确认回收</button></div>`);
  }
  warehousePanel(save){
    const capacity=warehouseCapacity(save),level=facilityLevel(save,'warehouse'),cost=facilityCost('warehouse',level),plan=plannedWarehouseGear(save);
    const chosen=[['0','武器 1',plan.weapons[0]],['1','武器 2',plan.weapons[1]],['armor','护甲',plan.armor],['laser','配件',plan.laser]];
    const card=(record,pending)=>{
      const item=hydrateEquipment(record),repair=warehouseRepairCost(record),selected=Object.values(save.deployment).includes(record.id);
      return `<article class="vault-item" style="--rarity:${rarityOf(item.rarity).color}"><small>${pending?'待收装备':selected?'已选择出击':'仓库装备'}</small><h3>${escapeHTML(item.name)}</h3><p>${record.kind==='armor'?`${Math.ceil(item.durability)} / ${item.maxDurability} 耐久`:record.kind==='weapon'?`Lv.${item.level} · ${ENCHANTS[item.enchant].name}`:'缩小弹道散布'}</p><div class="vault-actions">${pending?'':record.kind==='weapon'?`<button data-action="vaultSelect" data-key="0:${record.id}">带入武器1</button><button data-action="vaultSelect" data-key="1:${record.id}">带入武器2</button>`:`<button data-action="vaultSelect" data-key="${record.kind}:${record.id}" ${record.kind==='armor'&&record.durability<=0?'disabled':''}>选择出击</button>`}${repair?`<button data-action="repairGear" data-key="${record.id}" ${save.credits<repair?'disabled':''}>修理 · ${repair} ◇</button>`:''}<button class="vault-recycle" data-action="askRecycle" data-key="${record.id}">回收</button></div></article>`;
    };
    return `<section class="warehouse-panel"><div class="section-heading"><div><span class="eyebrow">PERSISTENT EQUIPMENT</span><h2>战备仓库</h2></div><b class="warehouse-count">${save.warehouse.items.length} / ${capacity} 格 · Lv.${level}</b></div><p>成功撤离的装备保留品质、附魔、等级和护甲耐久。选择后在出击时带入；失败会丢失带入装备。工坊基础装备与试用品不存仓。</p><div class="vault-toolbar"><button data-action="upgradeFacility" data-key="warehouse" ${canUpgradeFacility(save,'warehouse')?'':'disabled'}>${cost?`扩容 +12格 · ${cost.credits} ◇ / ${cost.alloy} 合金${cost.core?' / '+cost.core+'核心':''}`:'仓库已满级'}</button><button data-action="claimPending" ${!save.warehouse.pending.length||save.warehouse.items.length>=capacity?'disabled':''}>收纳待收装备 · ${save.warehouse.pending.length}件</button></div><div class="deployment-slots">${chosen.map(([slot,label,item])=>`<div><small>${label}</small><b>${item?escapeHTML(item.name):'工坊默认装备'}</b>${item?`<button data-action="vaultSelect" data-key="${slot}:">取消带入</button>`:''}</div>`).join('')}</div><div class="vault-grid">${save.warehouse.items.map(i=>card(i,false)).join('')||'<p class="muted">仓库为空。带装备成功撤离后，装备会存放在这里。</p>'}</div>${save.warehouse.pending.length?`<h3>待收区 · ${save.warehouse.pending.length}件</h3><p>满仓装备暂存在此处。扩容或回收库存后收纳，待收装备需先入仓才能出击。</p><div class="vault-grid">${save.warehouse.pending.map(i=>card(i,true)).join('')}</div>`:''}</section>`;
  }
  bossCodex(save){
    const rank=difficultyOf(save.selectedDifficulty).rank;
    return `<section class="boss-codex"><span class="eyebrow">ENCOUNTER INTELLIGENCE</span><h2>首领图鉴 · ${Object.keys(BOSSES).length}种</h2><p>每位首领拥有三种轮换招式，半血进入强化阶段。红色预警先于攻击；地面区域不能弹反，弹丸和正面近战可以尝试弹反。</p><div class="boss-cards">${Object.entries(BOSSES).map(([key,boss])=>`<article class="boss-card" style="--boss-color:${boss.color}"><span class="boss-glyph">${boss.glyph}</span><h3>${boss.name}</h3><p>${boss.moves.map(m=>BOSS_MOVES[m]).join(' · ')}</p><small>${boss.tip}</small><p>专属掉落：紫品 ${WEAPONS[boss.weapon].name} Lv.3 · ${ENCHANTS[boss.enchant].name}</p><button data-action="trackBoss" data-key="${key}" ${boss.minRank>rank?'disabled':''}>${boss.minRank>rank?`难度${boss.minRank}起可追踪`:'设为出击目标'}</button></article>`).join('')}</div></section>`;
  }
  resourcePouch(raid) {
    const groups=new Map();
    for(const item of raid.bag.filter(item=>!isEquipment(item))){
      const key=item.currencyOnly?'coins':item.bossLoot?'boss':`${item.zone??0}:${item.name}`;
      const group=groups.get(key)||{name:item.currencyOnly?'残骸金币':item.bossLoot?'首领核心物资':item.name||'物资',value:0,count:0};
      group.value+=item.value;group.count++;groups.set(key,group);
    }
    return `<section class="resource-pouch"><div class="section-heading"><h2>资源袋 · 不限量</h2><span>可交易 ${number(tradeValue(raid))} ◇</span></div><p>碎片、金币和材料不占装备格。成功撤离后入库；局内也可用于行商交易。撤离钥卡 ${raid.exitKeys} 张。</p><div class="resource-stacks">${groups.size?[...groups.values()].map(group=>`<div class="resource-stack"><b>${escapeHTML(group.name)}</b><span>${number(group.value)} ◇</span><small>${number(group.count)} 份 · 不占格</small></div>`).join(''):'<p class="muted">尚未收集资源。靠近低等级敌人残骸可回收金币。</p>'}</div><small>本局累计回收 ${raid.recycled} 份残骸，产出 ${number(raid.recycledValue)} 金币。</small></section>`;
  }
  inventory(raid) {
    const p=raid.player,full=raid.equipmentCount()>=raid.capacity,disabled=full?'disabled title="装备背包已满"':'';
    const equipped=p.weapons.map((item,slot)=>`<div class="equipped-card" style="--rarity:${rarityOf(item.rarity).color}"><small>武器 ${slot+1}${p.activeSlot===slot?' / 当前':''}</small><b>${escapeHTML(item.name)}</b><span>${weaponOf(item).mode==='ranged'?'枪械':'近战'} · ${weaponOf(item).range} 范围</span><button class="secondary-button" data-action="slot" data-key="${slot}" ${p.activeSlot===slot?'disabled':''}>切换至此武器</button></div>`).join('');
    const gear=raid.bag.map((item,index)=>({item,index})).filter(({item})=>isEquipment(item));
    const rows=gear.map(({item,index})=>`<div class="inventory-item" style="--rarity:${rarityOf(item.rarity).color}"><div><b>${escapeHTML(item.name)}</b><small>撤离后入仓${item.kind==='weapon'?' / 伤害×'+rarityOf(item.rarity).multiplier:item.kind==='armor'?' / '+Math.ceil(item.durability)+'耐久':''}</small></div><div class="inventory-actions">${item.kind==='weapon'?`<button data-action="equip0" data-key="${index}">装至1</button><button data-action="equip1" data-key="${index}">装至2</button>`:`<button data-action="equip" data-key="${index}">装备</button>`}<button data-action="drop" data-key="${index}">丢弃</button></div></div>`).join('');
    this.show(`<button class="dialog-close" data-action="close" aria-label="关闭背包">×</button><span class="eyebrow">FIELD LOADOUT</span><h2 id="dialog-title">局内装备</h2><p class="modal-info">行动已暂停。只有武器、护甲和配件占背包格，资源袋不限量。成功撤离后装备入仓、资源入库；带入的仓库装备失败会丢失，工坊基础装备重新发放。</p><div class="equipped-grid">${equipped}</div><div class="attachment-row"><span>${p.armor?escapeHTML(p.armor.name)+' / '+Math.ceil(p.armor.durability)+'耐久':'未穿护甲'}</span>${p.armor?`<button data-action="remove" data-key="armor" ${disabled}>收起护甲</button>`:''}</div><div class="attachment-row"><span>${p.laserDisabled?'本局镭射受干扰 · 白线瞄准':p.laser?'镭射已装配 · 红线瞄准':'未装镭射 · 白线瞄准'}</span>${p.laser?`<button data-action="remove" data-key="laser" ${disabled}>卸下镭射</button>`:''}</div>${this.resourcePouch(raid)}<div class="section-heading"><h2>装备背包 ${raid.equipmentCount()} / ${raid.capacity}</h2><span>预计带出 ${number(Math.round(raid.carriedValue()*raid.rewardMultiplier))} ◇</span></div><div class="inventory-list">${rows||'<p class="muted">装备背包为空。打开装备箱，按F拾取装备。</p>'}</div><button class="primary-button" data-action="close">返回行动 ${icon('arrow')}</button>`,true);
  }
}
