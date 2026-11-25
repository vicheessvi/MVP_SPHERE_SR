"use strict";
const assert=require("assert/strict");
require("../app.js");
const api=global.MvpSphereSR,te=require("../runtime/huawei-te-log-events"),h310=require("../runtime/huawei-310-log-events"),h300=require("../runtime/huawei-300-log-events");
const head="<?xml version='1.0'?><LogModule>\n",tail="\n</LogModule>";
function file(run,text,mtime=1){const value=new Blob([text]);value.name=run==="metadata"?"notes.txt":"192.0.2.40.xml";value.webkitRelativePath=run+"/"+value.name;value.lastModified=mtime;return value;}
function state(){const value=api.createDemoState();value.srImports=[{rawSha256:"a".repeat(64)}];value.inventoryDevices=[{id:"te",category:"vcs",manufacturerRaw:"Huawei",modelRaw:"TE40",ipNormalized:"192.0.2.40",inCurrentSr:true}];return value;}
function valid(run,hour){return file(run,head+`[Info][Main] 2026-11-01 ${hour}:00:00 LOG_MOD_MC 7 System start`+tail);}
const legacy=result=>({...result,registry:result.registry.map(row=>{const copy={...row};delete copy.analysisRuleset;delete copy.analysisRuleVersion;return copy;})});
function checkpointStore(){const rows=new Map();return {rows,list:async scope=>[...(rows.get(scope)?.keys()||[])],read:async(scope,key)=>rows.get(scope)?.get(key),write:async(scope,key,value)=>{if(!rows.has(scope))rows.set(scope,new Map());rows.get(scope).set(key,value);}};}
async function metadataDoesNotBlock(){
  const current=state(),files=[valid("one","10"),file("metadata","Synthetic auxiliary file")];
  const first=await api.prepareDeviceLogImport(files,current);
  const next=await api.prepareDeviceLogImport(files,current,{existing:legacy(first)});
  assert.equal(next.indexes.te.events.length,1);assert.equal(next.summary.files,2);assert.equal(next.fullRecheck,true);
  const broken=file("bad",head+"Synthetic truncated log");
  const initial=await api.prepareDeviceLogImport([files[0],broken],current);
  const retried=await api.prepareDeviceLogImport([files[0],broken],current,{existing:legacy(initial)});
  assert.equal(retried.indexes.te.events.length,1);assert.equal(retried.problems.total,1);assert.equal(retried.problems.blocking,0);
  assert.equal(retried.registry.find(row=>row.path.startsWith("bad/")).analysisComplete,true);
  assert.equal(retried.registry.find(row=>row.path.startsWith("bad/")).sourceCompleteness,'fragment');
  const added=await api.prepareDeviceLogImport([files[0],broken,valid("new","13")],current,{existing:retried});
  assert.equal(added.fullRecheck,false,"A known parse failure must not force a rules-upgrade loop");
}
async function evidenceFailureProcessesRestAndResumes(){
  const current=state(),files=[valid("one","10"),valid("two","11"),valid("three","12")];
  const previous=legacy(await api.prepareDeviceLogImport(files,current)),before=JSON.stringify(previous),checkpoint=checkpointStore(),reads=[],progress=[];
  let error;
  try{await api.prepareDeviceLogImport(files,current,{existing:previous,checkpoint,onProgress:value=>progress.push(value),scanClient:{scan:async value=>{reads.push(value.webkitRelativePath);if(value.webkitRelativePath.startsWith("one/"))throw Error("synthetic-only");return te.scanFile(value,{model:"te40"});}}});}catch(value){error=value;}
  assert(error);assert.equal(error.message,"log_recheck_incomplete");assert.equal(reads.length,3,"Other files must still finish");
  assert.equal(error.logProblems.processed,3);assert.equal(error.logProblems.blocking,1);assert.equal(error.logProblems.items[0].path,"one/192.0.2.40.xml");assert.equal(error.logProblems.items[0].reason,"read_failed");
  assert.equal(error.logProblems.canResume,true);
  assert.equal(progress.at(-1).processed,3);assert.equal(progress.at(-1).failedFiles,1);assert.equal(JSON.stringify(previous),before);
  reads.length=0;
  const resumed=await api.prepareDeviceLogImport(files,current,{existing:previous,checkpoint,scanClient:{scan:async value=>{reads.push(value.webkitRelativePath);return te.scanFile(value,{model:"te40"});}}});
  assert.deepEqual(reads,["one/192.0.2.40.xml"]);assert.equal(resumed.recoveredFiles,2);assert.equal(resumed.indexes.te.events.length,3);
  const unsupported=[file("one","Synthetic unrecognized replacement",2),files[1],files[2]];
  await assert.rejects(api.prepareDeviceLogImport(unsupported,current,{existing:previous}),value=>value.message==="log_recheck_incomplete"&&value.logProblems.items[0].reason==="unsupported_log_format");
  const unknownLegacy=JSON.parse(JSON.stringify(previous));unknownLegacy.registry[0].deviceId=null;
  await assert.rejects(api.prepareDeviceLogImport(files,current,{existing:unknownLegacy,scanClient:{scan:value=>value.webkitRelativePath.startsWith("one/")?Promise.reject(Error("synthetic")):te.scanFile(value,{model:"te40"})}}),value=>value.message==="log_recheck_incomplete"&&value.logProblems.blocking===1&&value.logProblems.canResume===false,"A legacy identity gap must not erase evidence; file-only mode must not promise persisted checkpoints");
}
async function xmlPaddingIsNotTruncation(){
  for(const parser of [te,h310,h300]){
    assert.equal((await parser.scanFile(file("padding",head+tail+" ".repeat(1024*1024+1024)))).ok,true,"Closing tag followed by whitespace is complete");
    assert.equal((await parser.scanFile(file("truncated",head+"Synthetic partial body"))).sourceCompleteness,'fragment');
    assert.equal((await parser.scanFile(file("garbage",head+tail+"unrecognized trailer"))).sourceCompleteness,'fragment');
    const brokenTag=head+"x".repeat(1024*1024-head.length-5-100)+"</Log"+" ".repeat(100)+"Module>";
    assert.equal((await parser.scanFile(file("split-invalid-tag",brokenTag))).sourceCompleteness,'fragment',"Whitespace at a chunk boundary must not stitch an invalid closing tag into complete XML");
  }
}
async function crashedWorkerIsReplaced(){
  const current=state(),files=[valid("one","10"),valid("two","11"),valid("three","12")],previous=legacy(await api.prepareDeviceLogImport(files,current));
  const savedWorker=global.Worker;let created=0,failed=false,error;
  global.Worker=class{
    constructor(){created+=1;this.closed=false;}
    postMessage(message){
      if(!failed&&message.file.webkitRelativePath.startsWith("one/")){failed=true;queueMicrotask(()=>this.onerror?.({type:"error"}));return;}
      te.scanFile(message.file,{model:"te40"}).then(scan=>{if(!this.closed)this.onmessage?.({data:{type:"result",taskId:message.taskId,scan}});});
    }
    terminate(){this.closed=true;}
  };
  try{await api.prepareDeviceLogImport(files,current,{existing:previous});}catch(value){error=value;}finally{if(savedWorker===undefined)delete global.Worker;else global.Worker=savedWorker;}
  assert(error);assert.equal(error.logProblems.processed,3);assert.equal(error.logProblems.blocking,1);assert.equal(error.logProblems.items[0].reason,"worker_failed");assert(created>=2);
}
async function boundedReportPrioritizesEvidence(){
  const current=state(),files=[...Array.from({length:105},(_,i)=>file("aux-"+i,"Synthetic metadata")),valid("one","10")];
  const previous=legacy(await api.prepareDeviceLogImport(files,current));let error;
  try{await api.prepareDeviceLogImport(files,current,{existing:previous,scanClient:{scan:()=>Promise.reject(Error("synthetic"))}});}catch(value){error=value;}
  assert(error);assert.equal(error.logProblems.processed,106);assert.equal(error.logProblems.total,106);assert.equal(error.logProblems.items.length,100);assert.equal(error.logProblems.items[0].blocking,true);assert.equal(error.logProblems.items[0].path,"one/192.0.2.40.xml");
}
async function run(){await metadataDoesNotBlock();await evidenceFailureProcessesRestAndResumes();await xmlPaddingIsNotTruncation();await crashedWorkerIsReplaced();await boundedReportPrioritizesEvidence();console.log("PASS: metadata does not block; evidence read failures finish other files and resume; bounded errors prioritize evidence; workers recover; XML fragments explicitly qualified");}
module.exports={run,metadataDoesNotBlock,evidenceFailureProcessesRestAndResumes,xmlPaddingIsNotTruncation};
if(require.main===module)run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
