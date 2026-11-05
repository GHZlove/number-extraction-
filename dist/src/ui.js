import { RULES, FACILITIES, DIFFICULTIES, LEGACY_WORLD, difficultyOf, VERSION, ENEMY_TYPES, MAP_LAYOUTS } from './config.js';
import { tier, zoneAt } from './math.js';
import { activeWeapon, weaponOf, rarityOf, WEAPONS, ENCHANTS } from './equipment.js';
import { facilityLevel, facilityCost, facilityBenefit, canUpgradeFacility, workshopGrade, starterLoadout, rewardMultiplier, shelterLevel, forgeCost, canForge } from './shelter.js';
import { SHOP, tradeValue } from './commerce.js';
import { icon, shelterArt } from './art.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
      if(['selectWeapon','selectMap','selectEnchant'].includes(event.target.dataset.action)) actions[event.target.dataset.action]?.(event.target.value);
    });
    $('dialog').addEventListener('keydown',event=>{
      if(event.key !== 'Tab') return;
      const focus = [...$('dialog').querySelectorAll('button:not(:disabled),a[href]')];
      if(!focus.length)return;
      if(event.shiftKey && document.activeElement === focus[0]) { event.preventDefault();focus.at(-1).focus(); }
      else if(!event.shiftKey && document.activeElement === focus.at(-1)) { event.preventDefault();focus[0].focus(); }
    });
    for(const [id,name,action] of [['loadout-button','bag','inventory'],['help-button','help','help'],['pause-button','pause','pause']]) {
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
  saveTransfer(save,pending){
    this.show(`<span class="eyebrow">SAVE / TRANSFER</span><h2 id="dialog-title">存档与迁移</h2><p>当前：${number(save.credits)} 数据币 · ${save.materials.alloy} 合金 · ${save.materials.core} 核心 · ${Object.keys(save.forged||{}).length} 件打造记录。</p><p>浏览器与桌面版各自保存进度。先在原版导出JSON，再在桌面版导入。未结束的战局不包含在存档中。</p><div class="dialog-actions"><button class="primary-button" data-action="exportSave">导出存档</button><button class="secondary-button" data-action="importSave">选择JSON导入</button></div>${pending?`<section class="save-preview"><b>待导入：${number(pending.credits)} 数据币 · ${pending.materials.alloy} 合金 · ${pending.materials.core} 核心</b><p>${Object.keys(pending.forged||{}).length} 件打造记录。确认后替换当前进度，原进度会先备份。</p><button class="primary-button" data-action="confirmImport">确认导入</button></section>`:''}<div class="dialog-actions"><button class="secondary-button" data-action="restoreBackup">查看导入前备份</button><button class="secondary-button" data-action="close">返回庇护所</button></div>`,true);
  }
  forgePanel(save){
    const cost=forgeCost(save),owned=save.forged?.[save.selectedWeapon],weapon=WEAPONS[save.selectedWeapon];
    return `<section class="forge-panel"><span class="eyebrow">FORGE / PERMANENT LOADOUT</span><h2>打造 · ${weapon.name}</h2><label for="forge-weapon-choice">选择打造武器</label><select id="forge-weapon-choice" data-action="selectWeapon">${Object.entries(WEAPONS).map(([key,w])=>`<option value="${key}" ${key===save.selectedWeapon?'selected':''} ${w.unlock>facilityLevel(save,'workshop')?'disabled':''}>${w.name}${w.unlock>facilityLevel(save,'workshop')?' · 工坊Lv.'+w.unlock+'解锁':''}</option>`).join('')}</select><p>打造当前出击武器，最高 Lv.5。每级伤害 +8%，击退增强。打造记录永久保存，每次出击重新发放；死亡保留打造进度。</p><p>${owned?`当前 Lv.${owned.level} · ${ENCHANTS[owned.enchant].name}`:'尚未打造 · 第一次打造获得 Lv.1'}</p><label for="enchant-choice">此次打造附魔</label><select id="enchant-choice" data-action="selectEnchant">${Object.entries(ENCHANTS).map(([key,e])=>`<option value="${key}" ${key===save.selectedEnchant?'selected':''}>${e.name}</option>`).join('')}</select><p>${ENCHANTS[save.selectedEnchant].description}</p><button class="upgrade-button" data-action="forge" ${canForge(save)?'':'disabled'}><b>${cost?(owned?.level===5?'重铸附魔':'打造 / 升至 Lv.'+((owned?.level||0)+1)):'已达 Lv.5'}</b>${cost?`<span class="cost-list">${costHTML(cost)}</span>`:''}</button><small>更换出击武器可打造其他类型。升级时可选择新的附魔，满级后可付费重铸附魔。战局拾取装备仍在撤离时兑换资源。</small></section>`;
  }
  shop(raid,id){
    const trader=raid.world.merchants.find(m=>m.id===id);if(!trader)return;
    const funds=tradeValue(raid);
    this.show(`<span class="eyebrow">FIELD TRADER</span><h2 id="dialog-title">${escapeHTML(trader.name)}</h2><p>可交易物资 <b>${funds} ◇</b>。消费背包里的物资价值，庇护所存款不受影响。装备商品放入背包，按 B 换装。</p><div class="shop-list">${Object.entries(SHOP).map(([key,offer])=>`<article class="shop-item"><div><b>${offer.name}</b><p>${offer.description}</p><small>本局剩余 ${trader.stock[key]} 件</small></div><button data-action="buy" data-key="${key}" ${trader.stock[key]<=0||funds<offer.cost||(['weapon','armor','laser'].includes(key)&&raid.bag.length>=raid.capacity)?'disabled':''}>${offer.cost} ◇ · 购买</button></article>`).join('')}</div><button class="primary-button" data-action="close">返回战区</button>`,true);
  }
  shelter(save,{lastResult=null,saveAvailable=true}={}) {
    const selected=difficultyOf(save.selectedDifficulty),loadout=starterLoadout(save),level=shelterLevel(save);
    const report=lastResult||save.lastRuns[0];
    const rewards=report?.success?`+${number(report.value)} ◇ · +${report.materials?.alloy||0} 合金 · +${report.materials?.core||0} 核心`:'本次未带出资源';
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
      <nav class="shelter-tabs" aria-label="庇护所功能">${[['deploy','出击终端','OPERATIONS'],['base','基地设施','SHELTER'],['forge','武器工坊','WORKSHOP']].map(([key,label,en])=>`<button data-action="shelterTab" data-key="${key}" aria-pressed="${this.shelterTab===key}"><span>${label}</span><small>${en}</small></button>`).join('')}</nav>
      <div class="shelter-layout"><div class="shelter-main">
        <section class="shelter-hero"><div class="hero-heading"><div><span class="eyebrow">HOME / SECTOR ZERO</span><h1>第零庇护所</h1><p>带资源回来。让下一次出发更有准备。</p></div><span class="safe-tag"><i class="signal-dot"></i>安全区 · Lv.${level}</span></div>${shelterArt(save)}<div class="hero-footer"><div><span>当前出击装备</span><b>${escapeHTML(loadout.weapons[0].name)} / ${escapeHTML(loadout.weapons[1].name)}</b></div><div><span>设施建设阶段</span><div class="hero-stage">${Array.from({length:10},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('')}</div></div></div></section>
        <div class="section-heading"><h2>庇护所设施</h2><span>资源投入，长期成长</span></div><section class="facilities-grid">${facilities}</section>
        ${this.forgePanel(save)}
        <div class="shelter-stats"><div class="stat-card"><small>成功撤离</small><b>${save.extractions}</b></div><div class="stat-card"><small>最高数字</small><b>${save.best}</b></div><div class="stat-card"><small>累计行动</small><b>${save.extractions+save.deaths}</b></div></div>
      </div><aside class="expedition-panel" aria-label="出击准备"><span class="eyebrow">NEXT EXPEDITION</span><h2>远征准备</h2><p class="muted">资源点有重兵驻守，野外只有少量巡游。选择不同地图，寻找商人、安全屋和首领。</p>
        <button class="deploy-button" data-action="start"><span>确认出击</span>${icon('arrow')}</button><div class="difficulty-list">${DIFFICULTIES.map(mission=>`<button class="difficulty-card ${mission.id===selected.id?'selected':''}" style="--difficulty:${mission.color}" data-action="selectDifficulty" data-key="${mission.id}" aria-pressed="${mission.id===selected.id}"><div class="difficulty-top"><b>${mission.name}</b><span>${'◆'.repeat(mission.rank)}${'◇'.repeat(5-mission.rank)}</span></div><div class="difficulty-meta"><span>地图 ×${mission.width*mission.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}</span><span>敌人 ${2**(mission.enemyShift+1)}–${128*2**mission.enemyShift}</span><span>收益 ×${mission.reward}</span></div></button>`).join('')}</div>
        <div class="weapon-choice"><label for="map-choice">地图布局</label><select id="map-choice" data-action="selectMap">${MAP_LAYOUTS.map(map=>`<option value="${map.id}" ${map.id===save.selectedMap?'selected':''}>${map.name}</option>`).join('')}</select></div><p class="deploy-note">${Object.keys(ENEMY_TYPES).length} 类敌人 + 3种首领 · ${Object.keys(WEAPONS).length} 类武器 · 4 个撤离点</p><div class="weapon-choice"><label for="starter-choice">工坊出击武器 · ${workshopGrade(save).name}品</label><select id="starter-choice" data-action="selectWeapon">${Object.entries(WEAPONS).map(([key,weapon])=>`<option value="${key}" ${key===save.selectedWeapon?'selected':''} ${weapon.unlock>facilityLevel(save,'workshop')?'disabled':''}>${weapon.name}${weapon.unlock>facilityLevel(save,'workshop')?' · 工坊Lv.'+weapon.unlock+'解锁':''}</option>`).join('')}</select><p>工坊 2 级配备基础护甲，4 级配备镭射。拾取装备在撤离后兑换资源，每次出击重新领取基础装备。</p></div>
        <div class="expedition-summary"><div><small>战区尺寸</small><b>${selected.width} × ${selected.height}</b></div><div><small>行动时限</small><b>${formatTime(selected.seconds)}</b></div><div><small>撤离开放</small><b>${formatTime(selected.extractAt)} 后</b></div><div><small>怪潮节奏</small><b>据点驻守 / 稀疏巡游</b></div><div><small>背包容量</small><b>${RULES.bagCapacity+facilityLevel(save,'storage')*2} 格</b></div><div><small>总收益倍率</small><b>×${rewardMultiplier(save,selected.id).toFixed(2)}</b></div></div>
        <p class="deploy-note">成功撤离才带出资源 · 失败保留基地资产</p>
      </aside></div><footer class="shelter-footer"><span>${window.numberExtractionDesktop?'WINDOWS DESKTOP':'LOCAL SOLO'} / v${VERSION} · 进度保存在本机</span><div><button data-action="saves">存档 · 导入 / 导出</button><button data-action="help">操作与战斗规则 ↗</button></div></footer>`;
  }
  update(raid,save,started,paused) {
    const p=raid.player,zone=zoneAt(p,raid.world.zones),item=activeWeapon(p);
    $('player-value').textContent=p.value;
    $('player-value').style.fontSize=p.value>=1000?'22px':p.value>=100?'27px':'';
    $('health-value').textContent=Number(p.hp.toFixed(1));$('health-bar').style.width=`${p.hp}%`;
    $('health-bar').style.background=p.hp<30?'var(--red)':'var(--mint)';
    const boss=raid.world.enemies.filter(e=>e.boss&&!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<950&&(e.hp<e.maxHp||e.state==='windup'||e.bossPhase===2)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
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
    $('laser-label').textContent=p.laser?'镭射已装 · 红线瞄准':'白线瞄准 · 未装镭射';$('laser-label').classList.toggle('laser-on',!!p.laser);
    $('loot-value').textContent=number(Math.round(raid.carriedValue()*raid.rewardMultiplier));$('bag-count').textContent=`${raid.bag.length} / ${raid.capacity}`;
    $('divider-count').textContent=p.dividers;$('medkit-count').textContent=p.medkits;
    const buffs=[];if(p.overload>0)buffs.push('过载');for(const[key,label]of[['fury','增幅'],['phase','相位'],['magnet','牵引']])if(p.buffs[key]>0)buffs.push(`${label} ${Math.ceil(p.buffs[key])}s`);
    $('buff-label').textContent=buffs.join(' · ');$('parry-status').textContent=p.parryWindow>0?'判定中':p.parryCooldown>0?p.parryCooldown.toFixed(1)+'s':'弹反就绪';
    $('mission-name').textContent=raid.world.theme+' / '+raid.difficulty.name;$('zone-name').textContent=`${zone.name} · ${zone.riskLabel}`;
    $('terrain-label').textContent=raid.ground()?.name||'开阔地';
    const pressure=raid.pressureInfo();$('pressure-readout').textContent=`巡游${pressure.wave} / 近敌${pressure.near}`;$('pressure-readout').title=pressure.label;
    $('exit-status').textContent=raid.extractionReady()?'撤离已开放':`撤离 ${formatTime(raid.difficulty.extractAt-raid.elapsed)} 后开放`;$('time-value').textContent=formatTime(raid.duration-raid.elapsed);
    $('map-scale').textContent=`${raid.world.bounds.width*raid.world.bounds.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}×`;$('map-theme').textContent=raid.world.theme;
    const near=raid.nearbyGear();$('nearby-gear').hidden=!near||paused||!!raid.result;if(near){$('nearby-gear').textContent=`F · ${near.name}`;$('nearby-gear').style.color=rarityOf(near.rarity).color;}
    const context=raid.context();$('interaction').hidden=!context||paused||!!raid.result;
    if(context){$('interaction-text').textContent=context.kind==='exit'?(context.bossLocked?'击败守门首领后撤离':context.locked?'等待撤离开放':'静止 · 按住撤离'):context.kind==='merchant'?'E · 与商人交易':context.kind==='node'?'静止 · 启用运算节点':'静止 · 按住搜索';$('interaction-count').textContent=context.kind==='exit'?(context.bossLocked?'BOSS':context.locked?formatTime(raid.difficulty.extractAt-raid.elapsed):`${Math.max(0,RULES.extractSeconds-raid.extractProgress).toFixed(1)}s`):'';$('interaction-fill').style.width=`${Math.min(100,context.progress*100)}%`;}
    document.querySelector('.touch-actions [data-control="KeyQ"] small').textContent=`${p.dividers} 个`;
    document.querySelector('.touch-actions [data-control="KeyR"] small').textContent=`${p.medkits} 个`;
    document.querySelector('.touch-actions [data-control="KeyG"] small').textContent=p.overload>0?'运行中':`${Math.floor(p.energy)}%`;
    this.tick();
  }
  show(html,wide=false) { $('overlay').hidden=false;$('dialog').className=`dialog${wide?' wide':''}`;$('dialog').innerHTML=html;requestAnimationFrame(()=>$('dialog').querySelector('button:not(:disabled)')?.focus()); }
  hide(focus=true) { $('overlay').hidden=true;if(focus)$('game-canvas').focus(); }
  help() { this.show(`<button class="dialog-close" data-action="close" aria-label="关闭规则">×</button><span class="eyebrow">FIELD MANUAL / v0.7</span><h2 id="dialog-title">搜据点，造装备，带资源回家。</h2><div class="rule-grid"><div class="rule-card"><b>01 / 资源与守卫</b><p>大部分敌人驻守资源点，野外只有少量巡游。靠近据点可能引来有限增援；离开后守卫会返回。难度与区域风险影响敌人数值、数量和收益。</p></div><div class="rule-card"><b>02 / 合成与战斗</b><p>同数中立数字合成，最大2048。白色Lv.1无增益、无护甲时，8对4伤害50%/25%，16对4为75%/12.5%。Q减半打断，G消耗满能量启动七秒过载。</p></div><div class="rule-card"><b>03 / 右键弹反</b><p>朝向来袭方向，在命中前按右键或C。判定窗口0.18秒，成功反射弹丸或震慑近战敌人，并获得能量。不能弹反毒雾或普通爆炸。失败有冷却，不能一直按住防御。</p></div><div class="rule-card"><b>04 / 附魔与打造</b><p>吸血回复生命，闪电传导伤害，眩晕打断敌人，毒雾持续伤害。庇护所可花资源打造当前出击武器，最高Lv.5，每级强化伤害与击退，打造进度在死亡后保留。</p></div><div class="rule-card"><b>05 / 商人与安全屋</b><p>西侧安全屋旁的商人可用背包物资兑换修复剂、减半道具与装备。低风险出口保护圈免受伤害，但屋内不能攻击；每处安全屋每局治疗一次。</p></div><div class="rule-card"><b>06 / 首领与撤离</b><p>高风险据点出现首领：震地、冲锋、弹幕、环射、毒雾和增援；半血进入第二阶段。击败守门首领后对应出口解锁。生存到撤离开放，再静止按E四秒。失败保留庇护所和打造资产。</p></div></div><div class="key-help"><kbd>WASD</kbd>移动 <kbd>鼠标</kbd>瞄准 <kbd>左键/空格</kbd>攻击 <kbd>右键/C</kbd>弹反 <kbd>Shift</kbd>闪避 <kbd>Q</kbd>÷2 <kbd>R</kbd>修复 <kbd>G</kbd>过载 <kbd>F</kbd>拾取 <kbd>B</kbd>换装 <kbd>1/2</kbd>切槽 <kbd>E</kbd>交互 <kbd>Esc</kbd>暂停</div><p>出击前选择七巧遗迹、裂谷放射、补给街区或多心荒原，也可随机。出生教学路线保持低风险。前沿试验箱有四种附魔武器。右上角可开启音效。</p><button class="primary-button" data-action="close">明白了 ${icon('arrow')}</button>`,true); }

  pause() { this.show(`<span class="eyebrow">SIGNAL HELD</span><h2 id="dialog-title">行动暂停</h2><p>计时与敌人已经停止。准备好后继续行动。</p><button class="primary-button" data-action="close">继续行动 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="help">查看规则</button><button class="secondary-button" data-action="abandonAsk">返回庇护所</button></div>`); }
  abandonAsk() { this.show(`<span class="eyebrow">RETURN TO SHELTER</span><h2 id="dialog-title">放弃这次远征？</h2><p>尚未撤离的物资会丢失。庇护所已经保存的资源与升级保留。</p><button class="primary-button" data-action="close">继续搜索 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="abandon">放弃并返回庇护所</button></div>`); }
  inventory(raid) {
    const p=raid.player,full=raid.bag.length>=raid.capacity,disabled=full?'disabled title="背包已满"':'';
    const equipped=p.weapons.map((item,slot)=>`<div class="equipped-card" style="--rarity:${rarityOf(item.rarity).color}"><small>武器 ${slot+1}${p.activeSlot===slot?' / 当前':''}</small><b>${escapeHTML(item.name)}</b><span>${weaponOf(item).mode==='ranged'?'枪械':'近战'} · ${weaponOf(item).range} 范围</span><button class="secondary-button" data-action="slot" data-key="${slot}" ${p.activeSlot===slot?'disabled':''}>切换至此武器</button></div>`).join('');
    this.show(`<button class="dialog-close" data-action="close" aria-label="关闭背包">×</button><span class="eyebrow">FIELD LOADOUT</span><h2 id="dialog-title">局内装备</h2><p class="modal-info">行动已暂停。装备可放入两个武器槽；拾取的旧装备回背包。成功撤离后兑换资源，每局重新领取工坊装备。</p><div class="equipped-grid">${equipped}</div><div class="attachment-row"><span>${p.armor?escapeHTML(p.armor.name)+' / '+Math.ceil(p.armor.durability)+'耐久':'未穿护甲'}</span>${p.armor?`<button data-action="remove" data-key="armor" ${disabled}>收起护甲</button>`:''}</div><div class="attachment-row"><span>${p.laser?'镭射已装配 · 红线瞄准':'未装镭射 · 白线瞄准'}</span>${p.laser?`<button data-action="remove" data-key="laser" ${disabled}>卸下镭射</button>`:''}</div><div class="section-heading"><h2>背包 ${raid.bag.length} / ${raid.capacity}</h2><span>预计带出 ${number(Math.round(raid.carriedValue()*raid.rewardMultiplier))} ◇</span></div><div class="inventory-list">${raid.bag.length?raid.bag.map((item,index)=>`<div class="inventory-item" style="--rarity:${rarityOf(item.rarity).color}"><div><b>${escapeHTML(item.name)}</b><small>${item.value} ◇${item.kind==='weapon'?' / 伤害×'+rarityOf(item.rarity).multiplier:item.kind==='armor'?' / '+Math.ceil(item.durability)+'耐久':''}</small></div><div class="inventory-actions">${item.kind==='weapon'?`<button data-action="equip0" data-key="${index}">装至1</button><button data-action="equip1" data-key="${index}">装至2</button>`:['armor','laser'].includes(item.kind)?`<button data-action="equip" data-key="${index}">装备</button>`:''}<button data-action="drop" data-key="${index}">丢弃</button></div></div>`).join(''):'<p class="muted">背包为空。打开出生区装备箱，按F拾取装备。</p>'}</div><button class="primary-button" data-action="close">返回行动 ${icon('arrow')}</button>`,true);
  }
}
