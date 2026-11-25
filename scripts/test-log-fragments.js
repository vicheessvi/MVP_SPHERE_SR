"use strict";
const assert=require('assert/strict');require('../app');
const api=global.MvpSphereSR,parsers=[require('../runtime/huawei-te-log-events'),require('../runtime/huawei-310-log-events'),require('../runtime/huawei-300-log-events')];
function file(text,name='192.0.2.40.xml'){const f=new Blob([text]);f.name=name;f.webkitRelativePath='archive/'+name;f.lastModified=1;return f;}
async function run(){
  const head="<?xml version='1.0'?><LogModule>\n";
  for(const parser of parsers){
    const body=head+"[Info][Main] 2026-11-01 18:00:00 LOG_MOD_CTL 7 Controller command: Shut down\n";
    const complete=await parser.scanFile(file(body+'</LogModule>')),fragment=await parser.scanFile(file(body));
    assert.equal(complete.ok,true);assert.equal(complete.sourceCompleteness,'complete');assert.equal(fragment.ok,true);assert.equal(fragment.sourceCompleteness,'fragment');assert.deepEqual(fragment.markers,complete.markers);
    assert.equal((await parser.scanFile(file('unrecognized'))).ok,false);
    const short={size:body.length+100,slice:(start,end)=>start===0&&end===2048?new Blob([body]):new Blob(['short'])};
    assert.equal((await parser.scanFile(short)).ok,false,'Short IO is not a successfully parsed fragment');
  }
  const state=api.createDemoState();state.srImports=[{rawSha256:'a'.repeat(64)}];state.inventoryDevices=[{id:'te',category:'vcs',manufacturerRaw:'Huawei',modelRaw:'TE40',ipNormalized:'192.0.2.40',inCurrentSr:true}];
  const body=head+'[Info][Main] 2026-11-01 18:00:00 LOG_MOD_CTL 7 Controller command: Shut down\n';
  const f=file(body),initial=await api.prepareDeviceLogImport([f],state);
  assert.equal(initial.problems.blocking,0);assert(initial.problems.items.some(p=>p.reason==='fragment_log'));assert.equal(initial.indexes.te.events[0].sourceFragment,true);
  const legacy=JSON.parse(JSON.stringify(initial));legacy.registry.forEach(row=>{delete row.analysisRuleset;delete row.analysisRuleVersion;});
  const saved=new Map(),checkpoint={list:async scope=>[...(saved.get(scope)?.keys()||[])],read:async(scope,key)=>saved.get(scope)?.get(key),write:async(scope,key,value)=>{if(!saved.has(scope))saved.set(scope,new Map());saved.get(scope).set(key,value);}};
  const rebuilt=await api.prepareDeviceLogImport([f],state,{existing:legacy,checkpoint});assert.equal(rebuilt.indexes.te.events.length,1);assert.equal(rebuilt.registry[0].sourceCompleteness,'fragment');
  const cached=await api.prepareDeviceLogImport([f],state,{existing:legacy,checkpoint,scanClient:{scan:()=>assert.fail('Ready fragment should be restored from checkpoint')}});assert.equal(cached.recoveredFiles,1);
  console.log('PASS: recognized fragments preserve positive records, short reads fail, full upgrade publishes warning and checkpoints reuse unchanged source');
}
module.exports={run};if(require.main===module)run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
