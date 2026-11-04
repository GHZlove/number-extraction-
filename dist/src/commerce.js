import { decorateWeapon, makeEquipment } from './equipment.js';

export const SHOP=Object.freeze({
  medkit:{name:'修复剂',cost:24,stock:3,description:'回复30生命，按R使用。'},
  divider:{name:'减半运算',cost:30,stock:3,description:'补充一个Q运算道具。'},
  armor:{name:'绿品护甲',cost:65,stock:1,description:'装备后吸收伤害，耐久有限。'},
  laser:{name:'镭射瞄准器',cost:36,stock:1,description:'缩小枪械散布。'},
  weapon:{name:'附魔步枪 Lv.2',cost:110,stock:1,description:'绿品 · 闪电附魔，放入背包。'},
});
export const tradeValue=raid=>raid.bag.filter(i=>!i.kind||i.kind==='loot').reduce((sum,i)=>sum+i.value,0);
export function buyFromMerchant(raid,merchantId,key){
  const merchant=raid.world.merchants.find(m=>m.id===merchantId),offer=SHOP[key];
  if(raid.status!=='playing'||!merchant||!offer||Math.hypot(raid.player.x-merchant.x,raid.player.y-merchant.y)>125||
     !raid.visible(raid.player,merchant)||(merchant.stock[key]||0)<=0||tradeValue(raid)<offer.cost)return false;
  const gear=['weapon','armor','laser'].includes(key);if(gear&&raid.bag.length>=raid.capacity)return false;
  let remaining=offer.cost;
  for(const item of raid.bag)if(!item.kind||item.kind==='loot'){const take=Math.min(remaining,item.value);item.value-=take;remaining-=take;if(!remaining)break;}
  raid.bag=raid.bag.filter(i=>i.kind&&i.kind!=='loot'||i.value>0);merchant.stock[key]--;
  if(key==='medkit')raid.player.medkits++;
  else if(key==='divider')raid.player.dividers++;
  else{
    const item=key==='weapon'?decorateWeapon(makeEquipment('weapon','rifle','green',`trade-${merchant.id}`),'lightning',2):makeEquipment(key,'','green',`trade-${merchant.id}-${key}`);
    raid.bag.push(item);
  }
  raid.event('loot');return true;
}
