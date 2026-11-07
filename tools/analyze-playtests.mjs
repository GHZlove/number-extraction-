#!/usr/bin/env node
// Read local anonymous reports; never modifies a journal, save or balance value.
import { readFile, open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePlaytestReports, MAX_REVIEW_REPORTS, MAX_REPORT_BYTES, MAX_REVIEW_BYTES, REVIEW_GATES } from '../dist/src/playtest-analysis.js';

const usage='Usage: node tools/analyze-playtests.mjs report-a.json [report-b.json ...] [--format markdown|json] [--output analysis.md]\nReads at most 8 anonymous JSON exports, 256KB each and 2MB total. No upload or balance changes.';
function argumentsOf(args){
 const result={files:[],format:'markdown',output:null,help:false};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--help'||arg==='-h'){result.help=true;continue;}
  if(arg==='--format'||arg.startsWith('--format=')){const value=arg==='--format'?args[++i]:arg.slice(9);if(!['json','markdown'].includes(value))throw Error('Choose --format json or markdown.');result.format=value;continue;}
  if(arg==='--output'||arg.startsWith('--output=')){const value=arg==='--output'?args[++i]:arg.slice(9);if(!value||value.startsWith('--'))throw Error('Provide an output path.');result.output=value;continue;}
  if(arg.startsWith('-'))throw Error('Unsupported command option. Use --help.');
  result.files.push(arg);
 }
 return result;
}
const percent=value=>value===null?'unknown':`${(value*100).toFixed(1)}%`;
const value=value=>value===null?'unknown':String(value);
function markdown(review){
 const lines=['# Local playtest batch review','',
  `Reports supplied: **${review.reportCount}**; accepted distinct content: **${review.acceptedReportCount}**; identical duplicates skipped: **${review.duplicateReportCount}**.`,
  `Retained started observations: **${review.totalStarted}**; finished outcomes: **${review.totalFinished}**; possible overlapping gameplay groups: **${review.overlapCount}**.`,
  '', 'This is a read-only description of imported exports. It does not verify human provenance, identify players, upload data or change gameplay. A report is not a player identity. Bring only each source’s latest non-overlapping export.',
  '',`Review gates: at least ${REVIEW_GATES.finished} finished runs per build/balance/difficulty cohort; at least ${REVIEW_GATES.known} known observations for a specific signal. Fallback <20%, before-hunter >50%, or a known death cause ≥60% are prompts to investigate, never causal conclusions.`,
  '', 'Maps, starting loadouts, routes, difficulty, practice, modifier assignment and missing feedback can confound a pattern. Choose at most one or two actual changes per patch only after human review; compare the next matched batch before extending changes.',''];
 if(review.warnings.length){lines.push('## Batch warnings','');for(const warning of review.warnings)lines.push(`- **${warning.code}**: ${warning.message}`);lines.push('');}
 if(!review.cohorts.length)lines.push('No cohort observations are available. Collect actual runs; do not substitute fixed CI or synthetic combat fixtures.','');
 for(const [index,cohort]of review.cohorts.entries()){
  lines.push(`## Cohort ${index+1}`,'',`Build **${cohort.buildVersion??'unknown'}**, balance **${cohort.balanceVersion??'unknown'}**, difficulty **${cohort.difficulty??'unknown'}**.`,
   '',`Started ${cohort.started}; finished ${cohort.finished}; extracted ${cohort.extracted}; defeated ${cohort.defeated}; timed out ${cohort.timeouts}; voluntarily returned ${cohort.abandoned}; interrupted ${cohort.interrupted}; in progress ${cohort.inProgress}.`,
   '',`Review eligibility: **${cohort.ready?'sufficient observations for cautious investigation':'descriptive only; no adjustment queue'}**. This is not statistical significance or permission to auto-tune.`,
   '', '| Observation | Count / denominator |','| --- | --- |',
   `| Fallback share of known exits | ${cohort.exitCounts.fallback} / ${cohort.knownExits} (${percent(cohort.fallbackShare)}) |`,
   `| Successful exits with unknown type | ${cohort.unknownExitExtractions} / ${cohort.extracted} |`,
   `| Extraction before any hunter materialised | ${cohort.beforeHunterExtractions} / ${cohort.knownHunterExtractions} (${percent(cohort.beforeHunterShare)}) |`,
   `| Late extractions without materialised hunters | ${cohort.lateUnhuntedExtractions} / ${cohort.lateExtractions} late extractions |`,
   `| Known combat death causes | ${cohort.knownDeathCount} / ${cohort.defeated} |`,
   `| Pressure feedback | ${cohort.pressureResponses}; mean ${value(cohort.meanPressure)} / 5 |`,
   `| Unfairness feedback | ${cohort.unfairResponses} answered |`,'',
   'Exit counts: '+Object.entries(cohort.exitCounts).map(([kind,count])=>`${kind} ${count}`).join('; ')+'.','',
   'Modifier selections among started observations: '+Object.entries(cohort.modifierCounts).map(([id,count])=>`${id} ${count}`).join('; ')+'.',
   'Unused in this cohort: '+(cohort.unusedModifiers.join(', ')||'none')+'. This is not a population preference.','',
   'Observed combinations: '+cohort.comboCounts.map(row=>`${row.mutators.length?row.mutators.join('+'):'none'} (${row.count})`).join('; ')+'.','',
   'Death counts: '+Object.entries(cohort.deathCounts).filter(([,count])=>count).map(([kind,count])=>`${kind} ${count}`).join('; ')+'.','',
   'Maps: '+Object.entries(cohort.maps).filter(([,count])=>count).map(([map,count])=>`${map} ${count}`).join('; ')+`; unknown ${cohort.unknownMaps}.`,'',
   'Starting loadouts (confounders, not controlled groups):','');
  for(const loadout of cohort.loadouts)lines.push(`- ${loadout.label}: ${loadout.count}`);
  lines.push('','### Descriptive findings','');
  for(const finding of cohort.findings)lines.push(`- **${finding.code} / ${finding.severity} — ${finding.title}**: ${finding.detail}`);
  if(!cohort.findings.length)lines.push('No configured signal was triggered. That does not prove the balance is satisfactory.');
  lines.push('','### At most two investigation priorities','');
  if(!cohort.reviewQueue.length)lines.push('None. Keep collecting or resolve missing/overlapping/configuration data before proposing a numerical patch.');
  else for(const finding of cohort.reviewQueue)lines.push(`- ${finding.title}: review player explanations and matched settings before choosing a change.`);
  lines.push('');
 }
 lines.push('## Method limits','',
  'Completed outcomes include extraction, combat defeat, timeout and voluntary return. Interrupted/in-progress runs are excluded. Exit percentages use known successful exits; missing exit types are reported separately. Hunter absence means a known zero materialised hunters, not an unknown field or cancelled warning. Late means at least 75% of the run limit elapsed.',
  '', 'Identical canonical reports are skipped once. Matching gameplay content across different reports only raises a possible-overlap warning; no anonymous player identity or perfect cross-export deduplication can be inferred. Potential overlaps pause all investigation queues until resolved.',
  '', 'The tool preserves build/balance/difficulty cohorts. It does not pool mixed configurations into an overall win rate or treat a full equipment bag as a maximum-resource haul. There is no resource-cap metric. Unfairness requires optional player feedback, not a label inferred from cause of death.','');
 return lines.join('\n');
}
async function execute(argsList,io){
 const args=argumentsOf(argsList);if(args.help){io.stdout(usage+'\n');return;}
 if(!args.files.length||args.files.length>MAX_REVIEW_REPORTS)throw Error('Provide 1–8 anonymous report files.');
 const texts=[],inputs=[];let total=0;
 for(const [index,file]of args.files.entries()){
  const resolved=resolve(file);
  let information;try{information=await stat(resolved,{bigint:true});}catch{throw Error(`Cannot read report ${index+1}.`);}
  if(!information.isFile()||information.size>BigInt(MAX_REPORT_BYTES))throw Error(`Report ${index+1} is not a file within the 256KB limit.`);
  inputs.push({path:resolved,dev:information.dev,ino:information.ino});
  total+=Number(information.size);if(total>MAX_REVIEW_BYTES)throw Error('Reports exceed the 2MB batch limit.');
  try{texts.push(await readFile(resolve(file),'utf8'));}catch{throw Error(`Cannot read report ${index+1}.`);}
 }
 const review=analyzePlaytestReports(texts),output=args.format==='json'?JSON.stringify(review,null,2)+'\n':markdown(review);
 if(args.output){
  const outputPath=resolve(args.output),conflict=Error('Analysis output must be a different file from every input report.');
  if(inputs.some(input=>input.path===outputPath))throw conflict;
  let handle;
  try{
   // Open without truncating, then check the actual file before any data write.
   // This also protects aliases swapped between pathname inspection and open.
   // Windows append-only handles cannot reliably truncate. Use a non-truncating
   // read/write handle, or exclusively create a new file, before checking it.
   try{handle=await open(outputPath,'r+');}
   catch(error){
    if(error.code!=='ENOENT')throw error;
    try{handle=await open(outputPath,'wx+');}
    catch(created){if(created.code!=='EEXIST')throw created;handle=await open(outputPath,'r+');}
   }
   const identity=await handle.stat({bigint:true});
   if(inputs.some(input=>input.dev===identity.dev&&input.ino===identity.ino))throw conflict;
   await handle.truncate(0);await handle.writeFile(output,'utf8');
  }catch(error){if(error===conflict)throw error;throw Error('Cannot write analysis output.');}
  finally{if(handle)await handle.close();}
 }
 else io.stdout(output);
}
export async function runAnalysisCLI(argsList,io={stdout:text=>process.stdout.write(text),stderr:text=>process.stderr.write(text)}){
 try{await execute(argsList,io);return 0;}
 catch(error){io.stderr(`Playtest review failed: ${error.message}\n`);return 1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runAnalysisCLI(process.argv.slice(2));
