import { RULES, FACILITIES, DIFFICULTIES, LEGACY_WORLD, difficultyOf, VERSION, ENEMY_TYPES } from './config.js';
import { tier, zoneAt } from './math.js';
import { activeWeapon, weaponOf, rarityOf, WEAPONS } from './equipment.js';
import { facilityLevel, facilityCost, facilityBenefit, canUpgradeFacility, workshopGrade, starterLoadout, rewardMultiplier, shelterLevel } from './shelter.js';
import { icon, shelterArt } from './art.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => Math.floor(value).toLocaleString('en-US');
export const formatTime = seconds => `${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
const costHTML = cost => `<span>${icon('data')}${number(cost.credits)}</span><span>${icon('alloy')}${cost.alloy}</span>${cost.core?`<span>${icon('core')}${cost.core}</span>`:''}`;

export class UI {
  constructor(actions) {
    this.actions = actions; this.toastUntil = 0;
    const dispatch = event => {
      const button = event.target.closest('[data-action]');
      if (button && !button.disabled) actions[button.dataset.action]?.(button.dataset.key);
    };
    $('dialog').addEventListener('click',dispatch);
    $('shelter-screen').addEventListener('click',dispatch);
    $('shelter-screen').addEventListener('change',event=>{
      if (event.target.dataset.action === 'selectWeapon') actions.selectWeapon(event.target.value);
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
    $('shelter-screen').innerHTML=`
      <header class="shelter-top"><div class="brand"><span class="brand-logo">n</span><div><strong>数字进化</strong><small>NUMBER EXTRACTION / SHELTER</small></div></div><div class="shelter-resources">${resources.map(([symbol,label,value,cls])=>`<div class="resource-chip ${cls}">${icon(symbol)}<div><small>${label}</small><b>${number(value)}</b></div></div>`).join('')}</div></header>
      ${reportHTML}${this.warning(saveAvailable)}
      <div class="shelter-layout"><div class="shelter-main">
        <section class="shelter-hero"><div class="hero-heading"><div><span class="eyebrow">HOME / SECTOR ZERO</span><h1>第零庇护所</h1><p>带资源回来。让下一次出发更有准备。</p></div><span class="safe-tag"><i class="signal-dot"></i>安全区 · Lv.${level}</span></div>${shelterArt(save)}<div class="hero-footer"><div><span>当前出击装备</span><b>${escapeHTML(loadout.weapons[0].name)} / ${escapeHTML(loadout.weapons[1].name)}</b></div><div><span>设施建设阶段</span><div class="hero-stage">${Array.from({length:10},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('')}</div></div></div></section>
        <div class="section-heading"><h2>庇护所设施</h2><span>资源投入，长期成长</span></div><section class="facilities-grid">${facilities}</section>
        <div class="shelter-stats"><div class="stat-card"><small>成功撤离</small><b>${save.extractions}</b></div><div class="stat-card"><small>最高数字</small><b>${save.best}</b></div><div class="stat-card"><small>累计行动</small><b>${save.extractions+save.deaths}</b></div></div>
      </div><aside class="expedition-panel" aria-label="出击准备"><span class="eyebrow">NEXT EXPEDITION</span><h2>下一次，去哪里？</h2><p class="muted">更高难度带来更大的战区、更强的数字与更丰厚的资源。</p>
        <div class="difficulty-list">${DIFFICULTIES.map(mission=>`<button class="difficulty-card ${mission.id===selected.id?'selected':''}" style="--difficulty:${mission.color}" data-action="selectDifficulty" data-key="${mission.id}" aria-pressed="${mission.id===selected.id}"><div class="difficulty-top"><b>${mission.name}</b><span>${'◆'.repeat(mission.rank)}${'◇'.repeat(5-mission.rank)}</span></div><div class="difficulty-meta"><span>地图 ×${mission.width*mission.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}</span><span>敌人 ${2**(mission.enemyShift+1)}–${512*2**mission.enemyShift}</span><span>收益 ×${mission.reward}</span></div></button>`).join('')}</div>
        <p class="deploy-note">${Object.keys(ENEMY_TYPES).length} 类敌人 · ${Object.keys(WEAPONS).length} 类武器 · 4 个撤离点</p><div class="weapon-choice"><label for="starter-choice">工坊出击武器 · ${workshopGrade(save).name}品</label><select id="starter-choice" data-action="selectWeapon">${Object.entries(WEAPONS).map(([key,weapon])=>`<option value="${key}" ${key===save.selectedWeapon?'selected':''} ${weapon.unlock>facilityLevel(save,'workshop')?'disabled':''}>${weapon.name}${weapon.unlock>facilityLevel(save,'workshop')?' · 工坊Lv.'+weapon.unlock+'解锁':''}</option>`).join('')}</select><p>工坊 2 级配备基础护甲，4 级配备镭射。拾取装备在撤离后兑换资源，每次出击重新领取基础装备。</p></div>
        <div class="expedition-summary"><div><small>战区尺寸</small><b>${selected.width} × ${selected.height}</b></div><div><small>行动时限</small><b>${formatTime(selected.seconds)}</b></div><div><small>背包容量</small><b>${RULES.bagCapacity+facilityLevel(save,'storage')*2} 格</b></div><div><small>总收益倍率</small><b>×${rewardMultiplier(save,selected.id).toFixed(2)}</b></div></div>
        <button class="deploy-button" data-action="start"><span>确认出击</span>${icon('arrow')}</button><p class="deploy-note">成功撤离才带出资源 · 失败保留基地资产</p>
      </aside></div><footer class="shelter-footer"><span>LOCAL SOLO / v${VERSION} · 进度保存在当前浏览器</span><button data-action="help">操作与战斗规则 ↗</button></footer>`;
  }
  update(raid,save,started,paused) {
    const p=raid.player,zone=zoneAt(p.x,raid.world.zones),item=activeWeapon(p);
    $('player-value').textContent=p.value;
    $('player-value').style.fontSize=p.value>=1000?'22px':p.value>=100?'27px':'';
    $('health-value').textContent=Number(p.hp.toFixed(1));$('health-bar').style.width=`${p.hp}%`;
    $('health-bar').style.background=p.hp<30?'var(--red)':'var(--mint)';
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
      button.innerHTML=`${slot+1} · ${escapeHTML(weapon.name)}<small>${grade.name}品 / ${weapon.short}</small>`;
      button.style.setProperty('--rarity',grade.color);button.classList.toggle('active',p.activeSlot===slot);
    }
    $('laser-label').textContent=p.laser?'镭射已装 · 红线瞄准':'白线瞄准 · 未装镭射';$('laser-label').classList.toggle('laser-on',!!p.laser);
    $('loot-value').textContent=number(Math.round(raid.carriedValue()*raid.rewardMultiplier));$('bag-count').textContent=`${raid.bag.length} / ${raid.capacity}`;
    $('divider-count').textContent=p.dividers;$('medkit-count').textContent=p.medkits;
    const buffs=[];if(p.overload>0)buffs.push('过载');for(const[key,label]of[['fury','增幅'],['phase','相位'],['magnet','牵引']])if(p.buffs[key]>0)buffs.push(`${label} ${Math.ceil(p.buffs[key])}s`);
    $('buff-label').textContent=buffs.join(' · ');
    $('mission-name').textContent=raid.difficulty.name;$('zone-name').textContent=zone.name;
    $('terrain-label').textContent=raid.ground()?.name||'开阔地';
    $('coordinates').textContent=`${Math.round(p.x)} / ${Math.round(p.y)}`;$('time-value').textContent=formatTime(raid.duration-raid.elapsed);
    $('map-scale').textContent=`${raid.world.bounds.width*raid.world.bounds.height/(LEGACY_WORLD.width*LEGACY_WORLD.height)}×`;$('map-theme').textContent=raid.world.theme;
    const near=raid.nearbyGear();$('nearby-gear').hidden=!near||paused||!!raid.result;if(near){$('nearby-gear').textContent=`F · ${near.name}`;$('nearby-gear').style.color=rarityOf(near.rarity).color;}
    const context=raid.context();$('interaction').hidden=!context||paused||!!raid.result;
    if(context){$('interaction-text').textContent=context.kind==='exit'?'静止 · 按住撤离':context.kind==='node'?'静止 · 启用运算节点':'静止 · 按住搜索';$('interaction-count').textContent=context.kind==='exit'?`${Math.max(0,RULES.extractSeconds-raid.extractProgress).toFixed(1)}s`:'';$('interaction-fill').style.width=`${Math.min(100,context.progress*100)}%`;}
    document.querySelector('.touch-actions [data-control="KeyQ"] small').textContent=`${p.dividers} 个`;
    document.querySelector('.touch-actions [data-control="KeyR"] small').textContent=`${p.medkits} 个`;
    document.querySelector('.touch-actions [data-control="KeyG"] small').textContent=p.overload>0?'运行中':`${Math.floor(p.energy)}%`;
    this.tick();
  }
  show(html,wide=false) { $('overlay').hidden=false;$('dialog').className=`dialog${wide?' wide':''}`;$('dialog').innerHTML=html;requestAnimationFrame(()=>$('dialog').querySelector('button:not(:disabled)')?.focus()); }
  hide(focus=true) { $('overlay').hidden=true;if(focus)$('game-canvas').focus(); }
  help() { this.show(`<button class="dialog-close" data-action="close" aria-label="关闭规则">×</button><span class="eyebrow">FIELD MANUAL</span><h2 id="dialog-title">数字是力量，策略是出路。</h2><div class="rule-grid"><div class="rule-card"><b>01 / 合成与过载</b><p>同数中立方块接触合成，最大2048。连续合成积累能量，满能量按G启动7秒过载，伤害与攻速提高，并震慑附近敌人。</p></div><div class="rule-card"><b>02 / 数字战斗</b><p>白色、无护甲时，8对4造成50%/25%伤害，16对4为75%/12.5%。品质与护甲会改变最终值。Q减半并打断敌人。</p></div><div class="rule-card"><b>03 / 装备与节点</b><p>F拾装备，B换装，1/2切武器。镭射缩小枪械散布。E启用运算节点，获得增幅、相位或牵引增益。</p></div><div class="rule-card"><b>04 / 返回庇护所</b><p>在绿色出口静止按E四秒。撤离带出的货币、合金与核心可升级设施。失败不入账，结束后直接回庇护所。</p></div></div><div class="key-help"><kbd>WASD</kbd>移动 <kbd>鼠标</kbd>瞄准 <kbd>左键/空格</kbd>攻击 <kbd>Shift</kbd>闪避 <kbd>Q</kbd>÷2 <kbd>R</kbd>修复 <kbd>G</kbd>过载 <kbd>B</kbd>背包 <kbd>Esc</kbd>暂停</div><p>霰弹五发共享一次伤害；磁轨穿透三目标，复合弩穿透两目标。卡宾枪三连发，榴弹范围爆炸，长枪适合远距刺击，战锤可打断敌人。工坊解锁更多出击武器；难度越高，地图越大，敌人数字与收益越高。</p><button class="primary-button" data-action="close">明白了 ${icon('arrow')}</button>`,true); }
  pause() { this.show(`<span class="eyebrow">SIGNAL HELD</span><h2 id="dialog-title">行动暂停</h2><p>计时与敌人已经停止。准备好后继续行动。</p><button class="primary-button" data-action="close">继续行动 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="help">查看规则</button><button class="secondary-button" data-action="abandonAsk">返回庇护所</button></div>`); }
  abandonAsk() { this.show(`<span class="eyebrow">RETURN TO SHELTER</span><h2 id="dialog-title">放弃这次远征？</h2><p>尚未撤离的物资会丢失。庇护所已经保存的资源与升级保留。</p><button class="primary-button" data-action="close">继续搜索 ${icon('arrow')}</button><div class="dialog-actions"><button class="secondary-button" data-action="abandon">放弃并返回庇护所</button></div>`); }
  inventory(raid) {
    const p=raid.player,full=raid.bag.length>=raid.capacity,disabled=full?'disabled title="背包已满"':'';
    const equipped=p.weapons.map((item,slot)=>`<div class="equipped-card" style="--rarity:${rarityOf(item.rarity).color}"><small>武器 ${slot+1}${p.activeSlot===slot?' / 当前':''}</small><b>${escapeHTML(item.name)}</b><span>${weaponOf(item).mode==='ranged'?'枪械':'近战'} · ${weaponOf(item).range} 范围</span><button class="secondary-button" data-action="slot" data-key="${slot}" ${p.activeSlot===slot?'disabled':''}>切换至此武器</button></div>`).join('');
    this.show(`<button class="dialog-close" data-action="close" aria-label="关闭背包">×</button><span class="eyebrow">FIELD LOADOUT</span><h2 id="dialog-title">局内装备</h2><p class="modal-info">行动已暂停。装备可放入两个武器槽；拾取的旧装备回背包。成功撤离后兑换资源，每局重新领取工坊装备。</p><div class="equipped-grid">${equipped}</div><div class="attachment-row"><span>${p.armor?escapeHTML(p.armor.name)+' / '+Math.ceil(p.armor.durability)+'耐久':'未穿护甲'}</span>${p.armor?`<button data-action="remove" data-key="armor" ${disabled}>收起护甲</button>`:''}</div><div class="attachment-row"><span>${p.laser?'镭射已装配 · 红线瞄准':'未装镭射 · 白线瞄准'}</span>${p.laser?`<button data-action="remove" data-key="laser" ${disabled}>卸下镭射</button>`:''}</div><div class="section-heading"><h2>背包 ${raid.bag.length} / ${raid.capacity}</h2><span>预计带出 ${number(Math.round(raid.carriedValue()*raid.rewardMultiplier))} ◇</span></div><div class="inventory-list">${raid.bag.length?raid.bag.map((item,index)=>`<div class="inventory-item" style="--rarity:${rarityOf(item.rarity).color}"><div><b>${escapeHTML(item.name)}</b><small>${item.value} ◇${item.kind==='weapon'?' / 伤害×'+rarityOf(item.rarity).multiplier:item.kind==='armor'?' / '+Math.ceil(item.durability)+'耐久':''}</small></div><div class="inventory-actions">${item.kind==='weapon'?`<button data-action="equip0" data-key="${index}">装至1</button><button data-action="equip1" data-key="${index}">装至2</button>`:['armor','laser'].includes(item.kind)?`<button data-action="equip" data-key="${index}">装备</button>`:''}<button data-action="drop" data-key="${index}">丢弃</button></div></div>`).join(''):'<p class="muted">背包为空。打开出生区装备箱，按F拾取装备。</p>'}</div><button class="primary-button" data-action="close">返回行动 ${icon('arrow')}</button>`,true);
  }
}
