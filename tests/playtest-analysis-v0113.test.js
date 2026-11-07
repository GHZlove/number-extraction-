// Synthetic input fixtures verify review behaviour; they are not human playtests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAnalysisCLI } from '../tools/analyze-playtests.mjs';
import { parseAnonymousReport, analyzePlaytestReports, MAX_REVIEW_REPORTS, MAX_REPORT_BYTES, MAX_REVIEW_BYTES } from '../dist/src/playtest-analysis.js';
import { emptyJournal, recordStart, recordFinish, serializeJournal } from '../dist/src/playtest.js';

function run(session,patch={}){
 const outcome=patch.outcome||'extracted';
 return{session,buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:10000+session,difficulty:'scout',map:'blocks',mutators:[],loadout:{weapons:[{weapon:'pistol',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},duration:240,seconds:60,number:16,heat:30,hpPercent:outcome==='defeated'?0:100,rawValue:80,gearCount:2,bagCapacity:8,chests:2,huntersSpawned:0,firstHunterAt:null,hunterWaves:0,kills:4,outcome,deathCause:outcome==='defeated'?'projectile':null,exitType:outcome==='extracted'?'fallback':null,...patch,feedback:{extractReason:null,pressure:null,unfair:null,...patch.feedback}};
}
const rows=(count,patch={},start=1)=>Array.from({length:count},(_,index)=>run(start+index,typeof patch==='function'?patch(index):patch));
const report=runs=>JSON.stringify({game:'number-extraction-playtest',schema:1,balanceVersion:'0.11.1',runs});
const only=review=>{assert.equal(review.cohorts.length,1);return review.cohorts[0];};
const watched=cohort=>cohort.findings.filter(finding=>finding.severity==='watch').map(finding=>finding.code);

test('real anonymous serializer output is accepted without private ids, coercion or source mutation',()=>{
 const journal=emptyJournal(),snapshot={id:'local-absolute-time-id',buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:101,difficulty:'scout',map:'blocks',mutators:['fog'],duration:240,seconds:0,number:1,heat:0,hpPercent:100,rawValue:0,gearCount:0,bagCapacity:8,chests:0,huntersSpawned:0,firstHunterAt:null,hunterWaves:0,loadout:{weapons:[{weapon:'pistol',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false}};
 recordStart(journal,snapshot);recordFinish(journal,{id:snapshot.id,success:true,extractedVia:'key',seconds:61,heat:32,rawValue:42,kills:4,number:16,playtest:{...snapshot,seconds:61,heat:32,number:16,rawValue:42}});
 const text=serializeJournal(journal),before=JSON.stringify(journal),parsed=parseAnonymousReport(text);assert.equal(parsed.runs.length,1);assert.equal(parsed.runs[0].exitType,'key');assert.equal(Object.hasOwn(parsed.runs[0],'id'),false);assert.equal(JSON.stringify(journal),before);assert.equal(JSON.stringify(parsed).includes(snapshot.id),false);
});

test('strict schemas reject personal fields, raw ids, arbitrary text, duplicate sessions and malformed metrics',()=>{
 const bad=[];const top=JSON.parse(report([run(1)]));top.email='private@example.test';bad.push(JSON.stringify(top));
 const extra=run(1);extra.id='private-id';bad.push(report([extra]));
 bad.push(report([run(1,{feedback:{unfair:'private@example.test'}})]));bad.push(report([run(1),run(1)]));
 for(const patch of [{heat:101},{hpPercent:-1},{seconds:'60'},{number:3},{seed:4294967296},{mutators:['fog','fog']},{mutators:['unknown']},{buildVersion:'private@example.test'},{loadout:{weapons:[],armorRarity:'none',laser:false,path:'/private/file'}}])bad.push(report([run(1,patch)]));
 for(const text of bad)assert.throws(()=>parseAnonymousReport(text));
 assert.throws(()=>parseAnonymousReport('{invalid'));assert.throws(()=>parseAnonymousReport(JSON.stringify({game:'number-extraction',version:5,credits:100})));
});

test('semantic contradictions cannot appear as valid observations',()=>{
 for(const value of [run(1,{outcome:'defeated',exitType:'key'}),run(1,{outcome:'extracted',deathCause:'contact'}),run(1,{outcome:'interrupted',feedback:{pressure:5}}),run(1,{outcome:'abandoned',feedback:{extractReason:'pressure'}}),run(1,{huntersSpawned:0,firstHunterAt:20}),run(1,{huntersSpawned:1,firstHunterAt:100}),run(1,{seconds:300,duration:240})])assert.throws(()=>parseAnonymousReport(report([value])));
});

test('bounded UTF-8 inputs accept exact limits and reject excessive report count, per-report or batch bytes',()=>{
 assert.equal(MAX_REVIEW_REPORTS,8);assert.equal(MAX_REPORT_BYTES,262144);assert.equal(MAX_REVIEW_BYTES,2097152);
 const padded=Array.from({length:8},(_,index)=>{const text=report([run(1,{seed:1000+index})]);return text+'\n'.repeat(MAX_REPORT_BYTES-new TextEncoder().encode(text).length);});
 const result=analyzePlaytestReports(padded);assert.equal(result.acceptedReportCount,8);assert.equal(result.totalStarted,8);
 assert.throws(()=>parseAnonymousReport(padded[0]+' '));assert.throws(()=>analyzePlaytestReports([...padded,report([])]));assert.throws(()=>analyzePlaytestReports(padded.map(text=>text+' ')));assert.throws(()=>analyzePlaytestReports([{}]));
});

test('eight independent 100-run reports retain all 800 observations without a journal-window truncation',()=>{
 const texts=Array.from({length:8},(_,source)=>report(rows(100,index=>({seed:source*1000+index+1,huntersSpawned:1,firstHunterAt:20}))));
 const review=analyzePlaytestReports(texts),cohort=only(review);assert.equal(review.totalStarted,800);assert.equal(review.totalFinished,800);assert.equal(cohort.started,800);assert.equal(cohort.knownHunterExtractions,800);assert.equal(review.overlapCount,0);
});

test('canonical duplicate reports count once even with reordered fields, rows and modifiers',()=>{
 const first=rows(2,{mutators:['fog','doubled']}),second=[...first].reverse().map(value=>({...value,mutators:['doubled','fog']}));
 const reversed={runs:second,balanceVersion:'0.11.1',schema:1,game:'number-extraction-playtest'};
 const review=analyzePlaytestReports([report(first),JSON.stringify(reversed,null,2)]);assert.equal(review.reportCount,2);assert.equal(review.acceptedReportCount,1);assert.equal(review.duplicateReportCount,1);assert.equal(review.totalFinished,2);assert.equal(review.overlapCount,0);assert.equal(only(review).ready,false);assert.deepEqual(only(review).reviewQueue,[]);
});

test('separate reports may reuse local session numbers without being treated as the same player or run',()=>{
 const review=analyzePlaytestReports([report(rows(5,index=>({seed:1000+index}))),report(rows(5,index=>({seed:2000+index})))]);assert.equal(review.acceptedReportCount,2);assert.equal(review.totalFinished,10);assert.equal(review.overlapCount,0);assert.equal(only(review).ready,true);
});

test('possible partial overlap ignores changed feedback, preserves rows and suspends every review queue',()=>{
 const first=rows(6,{exitType:'key'}),second=[{...first[0],feedback:{extractReason:'pressure',pressure:3,unfair:null}},...rows(6,{exitType:'key'},20)];
 const review=analyzePlaytestReports([report(first),report(second)]),cohort=only(review);assert.equal(review.duplicateReportCount,0);assert.equal(review.totalFinished,13);assert.equal(review.overlapCount,1);assert.equal(cohort.ready,false);assert.deepEqual(cohort.reviewQueue,[]);assert.ok(review.warnings.some(warning=>warning.code==='possible_overlap'));assert.ok(cohort.findings.every(finding=>finding.severity==='info'));
});

test('build, balance and difficulty cohorts are not pooled into a large apparent sample',()=>{
 const values=[...rows(5,{seconds:60}),...rows(5,{buildVersion:'0.11.3',seconds:90},20),...rows(5,{difficulty:'hard',seconds:120},40),...rows(5,{balanceVersion:'0.11.0',seconds:150},60)];
 const review=analyzePlaytestReports([report(values)]);assert.equal(review.totalFinished,20);assert.equal(review.cohorts.length,4);assert.deepEqual(review.cohorts.map(cohort=>cohort.averageSeconds).sort((a,b)=>a-b),[60,90,120,150]);assert.ok(review.cohorts.every(cohort=>!cohort.ready&&!cohort.reviewQueue.length));
});

test('unknown metadata remains unknown and cannot be silently assigned current configuration',()=>{
 const cohort=only(analyzePlaytestReports([report(rows(10,{buildVersion:null,difficulty:null,balanceVersion:null,map:null}))]));assert.equal(cohort.buildVersion,null);assert.equal(cohort.difficulty,null);assert.equal(cohort.unknownMaps,10);assert.equal(cohort.ready,false);assert.deepEqual(cohort.reviewQueue,[]);assert.ok(cohort.findings.some(finding=>finding.code==='unknown_cohort'));
});

test('fewer than ten finished runs never produces a numerical-adjustment investigation queue',()=>{
 const cohort=only(analyzePlaytestReports([report(rows(9,{exitType:'key'}))]));assert.equal(cohort.finished,9);assert.equal(cohort.ready,false);assert.deepEqual(cohort.reviewQueue,[]);assert.ok(cohort.findings.every(finding=>finding.severity==='info'));
});

test('outcome, known-exit and known-hunter denominators exclude interrupted states and missing metrics',()=>{
 const values=[...rows(3,{exitType:'key'}),run(4,{exitType:'fallback',huntersSpawned:2,firstHunterAt:20}),run(5,{exitType:null,huntersSpawned:null}),run(6,{outcome:'defeated'}),run(7,{outcome:'abandoned'}),run(8,{outcome:'timeout'}),run(9,{outcome:'interrupted'}),run(10,{outcome:'in_progress'})];
 const cohort=only(analyzePlaytestReports([report(values)]));assert.equal(cohort.started,10);assert.equal(cohort.finished,8);assert.equal(cohort.extracted,5);assert.equal(cohort.knownExits,4);assert.equal(cohort.unknownExitExtractions,1);assert.equal(cohort.fallbackShare,.25);assert.equal(cohort.knownHunterExtractions,4);assert.equal(cohort.beforeHunterExtractions,3);assert.equal(cohort.beforeHunterShare,.75);assert.equal(cohort.defeated,1);assert.equal(cohort.abandoned,1);assert.equal(cohort.timeouts,1);assert.equal(cohort.interrupted,1);assert.equal(cohort.inProgress,1);
});

test('unknown hunter and death observations are not manufactured into no-pressure or known causes',()=>{
 const values=[...rows(5,{huntersSpawned:null,exitType:null}),...rows(5,{outcome:'defeated',deathCause:'unknown'},10)];
 const cohort=only(analyzePlaytestReports([report(values)]));assert.equal(cohort.knownExits,0);assert.equal(cohort.fallbackShare,null);assert.equal(cohort.knownHunterExtractions,0);assert.equal(cohort.beforeHunterExtractions,0);assert.equal(cohort.beforeHunterShare,null);assert.equal(cohort.knownDeathCount,0);assert.equal(cohort.dominantDeath,null);assert.equal(cohort.pressureResponses,0);assert.equal(cohort.meanPressure,null);assert.equal(cohort.unfairResponses,0);assert.equal(cohort.unfairCounts.none,0);assert.ok(!watched(cohort).includes('unhunted_majority'));
});

test('fallback threshold is strictly below twenty percent with at least five known exits',()=>{
 const base=[...rows(5,{exitType:'key'}),...rows(5,{outcome:'abandoned'},20)];
 const low=only(analyzePlaytestReports([report(base)]));assert.ok(watched(low).includes('fallback_low'));
 const at=only(analyzePlaytestReports([report(base.map((value,index)=>index===0?{...value,exitType:'fallback'}:value))]));assert.equal(at.fallbackShare,.2);assert.ok(!watched(at).includes('fallback_low'));
 const few=only(analyzePlaytestReports([report([...rows(4,{exitType:'key'}),...rows(6,{outcome:'abandoned'},20)])]));assert.ok(!watched(few).includes('fallback_low'));
});

test('before-hunter signal needs a strict majority, five known extractions and ten completed outcomes',()=>{
 const make=(noHunters,count)=>[...rows(count,index=>index<noHunters?{}:{huntersSpawned:1,firstHunterAt:20}),...rows(10-count,{outcome:'abandoned'},20)];
 assert.ok(watched(only(analyzePlaytestReports([report(make(3,5))]))).includes('unhunted_majority'));
 assert.ok(!watched(only(analyzePlaytestReports([report(make(3,6))]))).includes('unhunted_majority'));
 assert.ok(!watched(only(analyzePlaytestReports([report(make(4,4))]))).includes('unhunted_majority'));
});

test('known death concentration uses five known deaths and sixty percent without calling it unfair',()=>{
 const values=[...rows(5,index=>({outcome:'defeated',deathCause:index<3?'projectile':'contact'})),...rows(5,{exitType:'fallback',huntersSpawned:1,firstHunterAt:20},20)];
 const cohort=only(analyzePlaytestReports([report(values)]));assert.equal(cohort.knownDeathCount,5);assert.deepEqual(cohort.dominantDeath,{cause:'projectile',count:3,share:.6});assert.ok(watched(cohort).includes('dominant_death'));assert.equal(cohort.unfairResponses,0);assert.equal(cohort.unfairCounts.none,0);
});

test('selection counts are local started observations, while late extractions use their own time limits',()=>{
 const values=[...rows(5,{mutators:['fog','doubled'],seconds:180}),...rows(5,{outcome:'interrupted',mutators:['rich']},20),run(40,{seconds:179}),run(41,{seconds:200,huntersSpawned:null}),run(42,{seconds:220,duration:null})];
 const cohort=only(analyzePlaytestReports([report(values)]));assert.equal(cohort.modifierCounts.fog,5);assert.equal(cohort.modifierCounts.rich,5);assert.equal(cohort.finished,8);assert.equal(cohort.lateExtractions,6);assert.equal(cohort.lateUnhuntedExtractions,5);assert.ok(cohort.unusedModifiers.includes('volatile'));assert.ok(cohort.comboCounts.some(row=>row.mutators.join('+')==='doubled+fog'&&row.count===5));
});

test('review queue never exceeds two, prioritises readable-loss investigation and never edits input',()=>{
 const values=[...rows(5,{exitType:'key'}),...rows(5,{outcome:'defeated',deathCause:'projectile'},20)],text=report(values),cohort=only(analyzePlaytestReports([text]));
 assert.equal(cohort.ready,true);assert.equal(cohort.reviewQueue.length,2);assert.equal(cohort.reviewQueue[0].code,'dominant_death');assert.equal(cohort.reviewQueue[1].code,'fallback_low');assert.equal(text,report(values));
});

test('CLI reads local reports, emits grouped JSON/Markdown and keeps input paths out of reports',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'nextract-analysis-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const input=join(directory,'private-player-name.json'),output=join(directory,'analysis.md');writeFileSync(input,report(rows(10)));
 const io={stdout:text=>{io.out+=text;},stderr:text=>{io.err+=text;},out:'',err:''};assert.equal(await runAnalysisCLI([input,'--format','json'],io),0);const json=io.out;assert.equal(JSON.parse(json).totalFinished,10);assert.equal(json.includes('private-player-name'),false);assert.equal(json.includes(directory),false);
 assert.equal(await runAnalysisCLI([input,'--format=markdown','--output',output],io),0);const markdown=readFileSync(output,'utf8');assert.match(markdown,/Choose at most one or two actual changes per patch/);assert.match(markdown,/known exits/);assert.equal(markdown.includes(input),false);assert.equal(markdown.includes('private-player-name'),false);
 writeFileSync(output,'old output '.repeat(markdown.length));assert.equal(await runAnalysisCLI([input,'--output',output],io),0);assert.equal(readFileSync(output,'utf8'),markdown);assert.equal(readFileSync(input,'utf8'),report(rows(10)));
});

test('CLI rejects malformed input and unsupported options without printing raw contents or filenames',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'nextract-analysis-errors-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const input=join(directory,'private-name.json');writeFileSync(input,'{"email":"private@example.test"}');
 const io={stdout:text=>{io.out+=text;},stderr:text=>{io.err+=text;},out:'',err:''};assert.equal(await runAnalysisCLI([input],io),1);assert.equal(io.out,'');assert.equal(io.err.includes('private@example.test'),false);assert.equal(io.err.includes(input),false);assert.equal(io.err.includes('private-name'),false);
 io.err='';assert.equal(await runAnalysisCLI([input,'--format=csv'],io),1);assert.match(io.err,/Choose --format/);
});


function sourceProtectionFixture(t){
 const directory=mkdtempSync(join(tmpdir(),'nextract-analysis-source-protection-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const first=join(directory,'private-first-report.json'),second=join(directory,'private-second-report.json');
 const contents=[report(rows(5)),report(rows(5,index=>({seed:20000+index})))];writeFileSync(first,contents[0]);writeFileSync(second,contents[1]);
 const io={stdout:text=>{io.out+=text;},stderr:text=>{io.err+=text;},out:'',err:''};
 return{directory,first,second,contents,io,check(){assert.equal(readFileSync(first,'utf8'),contents[0]);assert.equal(readFileSync(second,'utf8'),contents[1]);assert.equal(io.out,'');assert.match(io.err,/different file from every input report/);assert.equal(io.err.includes(directory),false);assert.equal(io.err.includes('private-second-report'),false);}};
}

test('CLI refuses a resolved output path that names any source report without changing either input',async t=>{
 const fixture=sourceProtectionFixture(t);const code=await runAnalysisCLI([fixture.first,fixture.second,'--output',join(fixture.directory,'unused','..','private-second-report.json')],fixture.io);
 assert.equal(code,1);fixture.check();
});

test('CLI refuses an output symlink to a source report before truncation or writing',async t=>{
 const fixture=sourceProtectionFixture(t);let alias;
 if(process.platform==='win32'){
  const aliasRoot=mkdtempSync(join(tmpdir(),'nextract-analysis-alias-'));t.after(()=>rmSync(aliasRoot,{recursive:true,force:true}));
  const junction=join(aliasRoot,'source');symlinkSync(fixture.directory,junction,'junction');alias=join(junction,'private-second-report.json');
 }else{alias=join(fixture.directory,'analysis-output-symlink.md');symlinkSync(fixture.second,alias,'file');}
 const code=await runAnalysisCLI([fixture.first,fixture.second,'--output',alias],fixture.io);assert.equal(code,1);fixture.check();assert.equal(readFileSync(alias,'utf8'),fixture.contents[1]);
});

test('CLI refuses an output hardlink to a source report before truncation or writing',async t=>{
 const fixture=sourceProtectionFixture(t),alias=join(fixture.directory,'analysis-output-hardlink.md');linkSync(fixture.second,alias);
 const code=await runAnalysisCLI([fixture.first,fixture.second,'--output',alias],fixture.io);assert.equal(code,1);fixture.check();assert.equal(readFileSync(alias,'utf8'),fixture.contents[1]);
});
