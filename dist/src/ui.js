import { RULES, UPGRADES } from './config.js';
import { attackDamage, bagTotal, tier, zoneAt } from './math.js';

const $=id=>document.getElementById(id);
export const formatTime=seconds=>`${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;

export class UI {
  constructor(actions) {
    this.actions=actions;this.toastUntil=0;this.previousBag='';
    $('dialog').addEventListener('click',e=>{
      const button=e.target.closest('[data-action]');
      if(button&&!button.disabled)actions[button.dataset.action]?.(button.dataset.key);
    });
    $('dialog').addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;
      const focus=[...$('dialog').querySelectorAll('button:not(:disabled),a[href]')];
      if(!focus.length)return;
      if(e.shiftKey&&document.activeElement===focus[0]){e.preventDefault();focus.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===focus.at(-1)){e.preventDefault();focus[0].focus();}
    });
    $('pause-button').onclick=actions.pause;$('raid-tab').onclick=actions.close;
    $('help-button').onclick=actions.help;$('vault-button').onclick=actions.vault;$('upgrade-button').onclick=actions.vault;
    $('sound-button').onclick=actions.sound;
  }
  toast(text){$('message').textContent=text;$('message').classList.add('visible');this.toastUntil=performance.now()+4200;}
  update(raid,save,started,paused){
    const p=raid.player,z=zoneAt(p.x);
    $('player-value').textContent=p.value;
    $('player-value').style.fontSize=p.value>=100?(innerWidth<651?'26px':'44px'):'';
    $('next-value').textContent=p.value<RULES.maxValue?`${p.value} + ${p.value} → ${p.value*2}`:'本版成长上限';
    $('tier-label').textContent=`TIER ${String(tier(p.value)).padStart(2,'0')}`;
    $('attack-stat').textContent=`攻击力 ${attackDamage(p.value,p.value)}`;
    $('evolution-track').querySelectorAll('span').forEach((el,i)=>el.classList.toggle('on',p.value>=2**i));
    $('health-value').textContent=Math.ceil(p.hp);$('health-bar').style.width=`${p.hp}%`;$('health-bar').style.background=p.hp<30?'var(--red)':'var(--mint)';
    $('divider-count').textContent=p.dividers;$('medkit-count').textContent=p.medkits;
    document.querySelector('.touch-actions [data-control="KeyQ"] small').textContent=`剩余 ${p.dividers}`;
    document.querySelector('.touch-actions [data-control="KeyR"] small').textContent=`剩余 ${p.medkits}`;
    document.querySelector('.touch-actions [data-control="ShiftLeft"] small').textContent=p.dashCooldown>0?`${p.dashCooldown.toFixed(1)}s`:'闪避';
    $('bag-count').textContent=`${raid.bag.length} / ${raid.capacity}`;
    $('loot-value').textContent=bagTotal(raid.bag);$('bank-value').textContent=save.credits;
    const signature=JSON.stringify(raid.bag)+raid.capacity;
    if(signature!==this.previousBag){this.previousBag=signature;$('bag-grid').innerHTML=Array.from({length:raid.capacity},(_,i)=>{
      const item=raid.bag[i];return item?`<div class="bag-slot filled" title="${item.name} · ${item.value} 数据币" aria-label="${item.name}，价值 ${item.value}">◇<small>${item.value}</small></div>`:'<div class="bag-slot" aria-label="空槽位">+</div>';
    }).join('');}
    $('goal-merge').classList.toggle('done',raid.tutorial.merge);$('goal-loot').classList.toggle('done',raid.bag.length>0);$('goal-exit').classList.toggle('done',raid.result?.success===true);
    $('time-value').textContent=formatTime(RULES.raidSeconds-raid.elapsed);$('time-value').classList.toggle('danger-text',RULES.raidSeconds-raid.elapsed<60);
    $('zone-name').textContent=z.name;$('zone-risk').textContent=`SECTOR 0${z.id+1} · ${z.risk}`;$('zone-led').style.background=z.color;$('zone-en').textContent=z.en;
    $('coordinates').textContent=`${Math.round(p.x).toString().padStart(4,'0')} · ${Math.round(p.y).toString().padStart(4,'0')}`;
    $('dash-label').textContent=p.dashCooldown>0?`${p.dashCooldown.toFixed(1)}s`:'闪避';
    $('status-label').textContent=!started?'待部署':raid.result?'已结算':paused?'已暂停':'行动中';
    if(performance.now()>this.toastUntil)$('message').classList.remove('visible');
    const context=raid.context();
    $('interaction').hidden=!context||!started||paused||!!raid.result;
    if(context){$('interaction-text').textContent=context.kind==='exit'?'静止 · 按住撤离':'静止 · 按住搜索';$('interaction-count').textContent=context.kind==='exit'?`${Math.max(0,RULES.extractSeconds-raid.extractProgress).toFixed(1)}s`:'';$('interaction-fill').style.width=`${Math.min(100,context.progress*100)}%`;}
  }
  show(html,wide=false){$('overlay').hidden=false;$('dialog').className=`dialog${wide?' wide':''}`;$('dialog').innerHTML=html;$('overlay').scrollTop=0;requestAnimationFrame(()=>$('dialog').querySelector('button:not(:disabled)')?.focus());}
  hide(){$('overlay').hidden=true;$('game-canvas').focus();}
  warning(available){return available?'':'<p class="save-warning">当前浏览器无法保存进度。本次会话仍可游玩，但关闭页面后仓库可能丢失。</p>';}
  home(available){this.show(`
    <div class="eyebrow"><span class="line"></span> FIRST EXPEDITION / 第一次远征</div>
    <div class="hero-symbols" aria-hidden="true"><div class="hero-cube">1</div><span>+</span><div class="hero-cube ghost">1</div><span>→</span><div class="hero-cube ghost faint">2</div></div>
    <h1>每次翻倍，<br>都是一次<em>冒险。</em></h1>
    <p class="lead">你从数字 1 出发。在失序的世界中合成、战斗，<br>带着找到的一切，活着回来。</p>
    <div class="loop-chips"><div><b>搜</b> 寻找价值</div><span>→</span><div><b>打</b> 数学破局</div><span>→</span><div><b>撤</b> 安全兑现</div></div>
    <button class="primary-button" data-action="start">开始行动 <span>↗</span></button>
    <div class="dialog-note">一局最多 7 分钟 · 单机 · 支持键盘与触屏<br><button data-action="help">第一次来？查看操作与规则</button></div>${this.warning(available)}`);}
  help(){this.show(`
    <button class="dialog-close" data-action="close" aria-label="关闭规则">×</button><div class="eyebrow">FIELD MANUAL / 规则手册</div><h2 id="dialog-title">数字是力量，策略是出路。</h2>
    <div class="rule-grid"><div class="rule-card"><b>01 · 同数才能合成</b><p>触碰中立的相同数字，<strong>1 + 1 = 2</strong>。不同数字不会合成。敌人先击败，才能拾取掉落的数字。</p></div>
    <div class="rule-card"><b>02 · 不同数字也能打</b><p>攻击自动锁定范围内最近的敌人。强敌会减伤。<strong>Q：敌人 ÷2，并眩晕 1.25 秒</strong>。紫色角标是运算目标。</p></div>
    <div class="rule-card"><b>03 · 读懂危险再出手</b><p>红圈和虚线是攻击预警。<strong>Shift 闪避</strong>短暂无敌，冷却 2.8 秒。<strong>R 修复 30 点生命</strong>，需要修复剂。</p></div>
    <div class="rule-card"><b>04 · 活着带走才算数</b><p>靠近补给箱静止按住 E 搜索。进入<strong>绿色撤离圈静止按住 E 4 秒</strong>。移动、松键或受伤会打断。死亡或超时丢失全部本局战利品。</p></div></div>
    <div class="key-help"><kbd>WASD</kbd> / 方向键 移动 <kbd>SPACE</kbd> 攻击 <kbd>Q</kbd> ÷2 <kbd>SHIFT</kbd> 闪避 <kbd>E</kbd> 按住交互 <kbd>R</kbd> 修复 <kbd>ESC</kbd> 暂停</div>
    <p class="modal-info">地图从左到右：低危 → 中危 → 高危。物资价值随危险提升。每次出击都从 1 开始；仓库中的数据币可购买下一局的背包与道具升级。手机版使用画面下方摇杆和按钮。</p><button class="primary-button" data-action="close">明白了 <span>→</span></button>`,true);}
  pause(){this.show(`<div class="eyebrow">SIGNAL HELD / 行动暂停</div><h2 id="dialog-title">停下来，想想下一步。</h2><p class="lead">暂停时，行动计时与敌人都会停止。<br>切换标签页或窗口失焦也会自动暂停。</p><button class="primary-button" data-action="close">继续行动 <span>→</span></button><div class="dialog-actions"><button class="secondary-button" data-action="help">查看规则</button><button class="secondary-button" data-action="abandonAsk">放弃本局</button></div>`);}
  abandonAsk(){this.show(`<div class="eyebrow">ABORT RAID</div><h2 id="dialog-title">确定放弃这次行动？</h2><p class="lead">本局未撤离的战利品将全部丢失。已经保存在基地的资产不受影响。</p><button class="primary-button" data-action="close">继续行动 <span>→</span></button><div class="dialog-actions"><button class="secondary-button" data-action="abandon">确认放弃并结算</button></div>`);}
  result(result,save,available){const success=result.success;this.show(`
    <div class="eyebrow">${success?'EXTRACTION COMPLETE / 信号已回收':'SIGNAL LOST / 行动结束'}</div><div class="result-mark ${success?'':'failed'}">${success?'↗':'×'}</div>
    <h2 id="dialog-title">${success?'这次冒险，有了回报。':'从 1 开始，再来一次。'}</h2><p class="lead">${success?'战利品已结算为数据币，安全存入基地。':result.reason+'。本局战利品全部丢失，基地资产仍然保留。'}</p>
    <div class="result-summary"><div><span>${success?'安全带出':'损失价值'}</span><b>${success?'+':'−'}${result.value} ◇</b></div><div><span>最终数字</span><b>${result.number}</b></div><div><span>探索时长</span><b>${formatTime(result.seconds)}</b></div></div>
    <p class="result-loot">${result.kills} 次击破 · ${result.merges} 次合成 · ${result.loot.length} 件物资<br>基地余额 ${save.credits} ◇ · 累计成功撤离 ${save.extractions} 次</p>${this.warning(available)}
    <div class="dialog-actions"><button class="primary-button" data-action="start">再次出击 <span>↗</span></button><button class="secondary-button" data-action="vault">基地升级</button></div>`);}
  vault(save,active,available){this.show(`
    <button class="dialog-close" data-action="close" aria-label="关闭基地">×</button><div class="eyebrow">BASE CAMP / 基地仓库</div><h2 id="dialog-title">每次回来，都更有准备。</h2>
    <div class="vault-balance">${save.credits} <small>◇ 数据币</small></div>
    ${Object.entries(UPGRADES).map(([key,def])=>{const level=save.upgrades[key],maxed=level>=def.max;return `<div class="upgrade-card"><div><b>${def.name} <span class="muted tiny">Lv.${level} / ${def.max}</span></b><p>${key==='capacity'?`当前 ${RULES.bagCapacity+level*2} 格 · 每级 +2 格背包`:`开局 ${RULES.startingDividers+level} 个 ÷2 · 每级 +1 个`}<br>下次出击生效</p></div><button data-action="upgrade" data-key="${key}" ${active||maxed||save.credits<def.cost(level)?'disabled':''}>${maxed?'已满级':def.cost(level)+' ◇ 升级'}</button></div>`;}).join('')}
    <p class="modal-info">${active?'当前行动已暂停。请先撤离或结算，再购买升级。':'战利品在撤离时自动兑换为数据币。装备仓库和交易系统留待后续版本。'}</p>
    <div class="run-history">${save.lastRuns.length?save.lastRuns.slice(0,3).map(r=>`<div class="run-row"><span class="${r.success?'mint':'danger-text'}">${r.success?'成功撤离':'行动失败'}</span><span>数字 ${r.number}</span><span>${formatTime(r.seconds)}</span><span>+${r.value} ◇</span></div>`).join(''):'尚无行动记录，完成第一次撤离后回来看看。'}</div>
    <p class="tiny muted">进度保存在当前浏览器。清除网站数据会清除仓库；不同设备之间暂不共享。</p>${this.warning(available)}<button class="primary-button" data-action="close">${active?'返回行动':'返回终端'} <span>→</span></button>`);}
}
