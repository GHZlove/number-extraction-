const KEY='number-extraction-siege-v1';

const order=(a,b)=>b.wave-a.wave||b.coreHp-a.coreHp||a.seconds-b.seconds;
const valid=entry=>entry&&typeof entry.id==='string'&&entry.id.length<=80&&
  Number.isSafeInteger(entry.wave)&&entry.wave>0&&entry.wave<=99999&&Number.isFinite(entry.coreHp)&&entry.coreHp>=0&&entry.coreHp<=100&&
  Number.isFinite(entry.seconds)&&entry.seconds>=0&&entry.seconds<=1e8;

export function readSiegeScores(storage){
  try{
    const data=JSON.parse(storage.getItem(KEY));
    return (Array.isArray(data)?data:[]).filter(valid).sort(order).slice(0,5);
  }catch{return [];}
}
export function saveSiegeScore(storage,entries,entry){
  if(!valid(entry))return entries;
  const scores=new Map();
  for(const row of [...readSiegeScores(storage),...entries,entry]){
    const old=scores.get(row.id);
    if(!old||order(row,old)<0)scores.set(row.id,row);
  }
  const top=[...scores.values()].sort(order).slice(0,5);
  try{storage?.setItem(KEY,JSON.stringify(top));}catch{}
  return top;
}
