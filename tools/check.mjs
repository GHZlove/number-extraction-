import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
let count=0;
for(const file of await readdir(resolve(root,'dist/src'))){
  if(!file.endsWith('.js'))continue;
  const path=resolve(root,'dist/src',file);
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  const source=await readFile(path,'utf8');
  for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))await access(resolve(dirname(path),match[1]));
  count++;
}
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))if(match[1]!=='./')await access(resolve(root,'dist',match[1]));
console.log(`Validated syntax and local references for ${count} JavaScript modules and index.html.`);
