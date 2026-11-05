import { SAVE_KEY } from './config.js';
import { normalizeSave } from './storage.js';

export const BACKUP_KEY='number-extraction-import-backup';
export function serializeSave(save){return JSON.stringify({game:'number-extraction',...normalizeSave(save)},null,2);}
export function parseSaveFile(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>131072)throw Error('存档文件不能超过128KB。');
  let data;try{data=JSON.parse(text);}catch{throw Error('无法读取JSON存档，请选择从游戏导出的文件。');}
  if(!data||Array.isArray(data)||![1,2,3].includes(data.version)||!Number.isFinite(data.credits)||data.credits<0)throw Error('这不是支持的数字进化存档。');
  return normalizeSave(data);
}
export function commitSaveImport(storage,current,incoming){
  const next=normalizeSave(incoming);
  // Preserve a recoverable copy before replacing the canonical progress.
  storage.setItem(BACKUP_KEY,serializeSave(current));
  storage.setItem(SAVE_KEY,JSON.stringify(next));return next;
}
