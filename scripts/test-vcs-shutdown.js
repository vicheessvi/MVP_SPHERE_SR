"use strict";
const assert=require("assert/strict");
const shutdown=require("../runtime/vcs-shutdown");
const te=require("../runtime/huawei-te-log-events");
const cloud310=require("../runtime/huawei-310-log-events");
const cloud300=require("../runtime/huawei-300-log-events");
const positive=["Shut down","Controller command: Shut down","Shut down terminal from controller",
  "Web user shut down terminal","User shut down terminal via remote","Terminal shut down successfully","API: SHUT\t DOWN device"];
const negative=["Shut down terminal failed","Shut down denied","Shut down cancelled","Cannot shut down terminal",
  "Shut down network interface","Ethernet port shut down","Application shut down","Show Shut down dialog",
  "Shut down timer=30","Scheduled shut down enabled","Auto shut down=1","Select Shut down","No shut down terminal",
  "Reboot terminal success","Enter sleep mode","Shut down terminal request queued","Shut down terminal service"];
const head="<?xml version='1.0'?><LogModule>\n",tail="</LogModule>";
const formats=[
  {parser:te,options:{model:"te20"},line:(time,message)=>`[Info][Main] ${time} LOG_MOD_CTL 17 2048[A:111 B:222] ${message}\n`,boot:time=>`[Info][Main] ${time} LOG_MOD_MC 18 2048[A:111 B:222] System boot\n`},
  {parser:te,options:{model:"te40"},line:(time,message)=>`[Info][Main] ${time} LOG_MOD_CTL 17 ${message}\n`,boot:time=>`[Info][Main] ${time} LOG_MOD_MC 18 System start\n`},
  {parser:cloud310,line:(time,message)=>`${time} ${message}\n`,boot:time=>`${time} System boot\n`},
  {parser:cloud300,line:(time,message)=>`[${time}.000+03:00][Info][Main] LOG_MOD_CTL 17 ${message}\n`,boot:time=>`[${time}.000+03:00][Info][Main] LOG_MOD_MC 18 System boot\n`}
];
async function run(options={}){
  for(const text of positive)assert(shutdown.isTerminalShutdown(text),text);
  for(const text of negative)assert(!shutdown.isTerminalShutdown(text),text);
  const source=[{id:"off",deviceId:"synthetic",ip:"192.0.2.40",kind:"power_off",shutdownBasis:"registered_terminal_shutdown",deviceLocalTime:"2026-11-01 18:01:00"},
    {id:"boot",deviceId:"synthetic",ip:"192.0.2.40",kind:"unknown_start",deviceLocalTime:"2026-11-02 07:00:00",silenceGap:{seconds:40000}}];
  const linked=shutdown.reconcileStarts(source);
  assert.equal(source[1].kind,"unknown_start");assert.equal(linked[1].kind,"start_after_shutdown");assert.equal(linked[1].silenceGap,null);
  assert.equal(shutdown.reconcileStarts([linked[0],{...linked[1],kind:"confirmed_reboot"}])[1].kind,"confirmed_reboot");
  const later=shutdown.reconcileStarts([...linked,{id:"between",deviceId:"synthetic",ip:"192.0.2.40",kind:"unknown_start",deviceLocalTime:"2026-11-01 19:00:00"}]);
  assert.equal(later.find(row=>row.id==="boot").kind,"unknown_start");assert.equal(later.find(row=>row.id==="boot").silenceGap.seconds,40000);
  assert.equal(later.find(row=>row.id==="between").kind,"start_after_shutdown");
  const sameTime=shutdown.reconcileStarts([source[0],{...source[1],id:"a",deviceLocalTime:source[0].deviceLocalTime},{...source[1],id:"later"}]);
  assert.equal(sameTime.find(row=>row.id==="later").kind,"unknown_start");
  assert.equal(shutdown.reconcileStarts([{...source[1],_shutdownLink:{version:0,previousKind:"invalid"}}])[0].kind,"unknown_start");
  assert.equal(te.parseEventLine("[Info][Main] 2026-11-01 18:01:00 LOG_MOD_BSP 7 Terminal powered off failed",1),null);
  for(const {parser,line,boot,options} of formats){
    const xml=head+line("2026-11-01 18:01:00","Controller command: Shut down")+boot("2026-11-02 07:00:00")+tail;
    const scan=parser.scanText(xml,options);assert(scan.ok);
    const events=parser.deriveEvents(scan.markers);
    assert.equal(events.filter(event=>event.kind==="power_off").length,1);
    assert.equal(events.filter(event=>event.kind==="confirmed_reboot").length,0);
    assert.equal(events.filter(event=>event.kind==="start_after_shutdown").length,1);
    assert.equal(events.find(event=>event.kind==="power_off").method,"unknown");
    const file=await parser.scanFile(new Blob([xml]),options);assert(file.ok);
    assert.deepEqual(file.markers,scan.markers);
    const invalid=await parser.scanFile(new Blob([xml.replace(tail,"")]),options);assert.equal(invalid.ok,false,"Incomplete XML cannot be published");
    for(const message of negative){
      const bad=parser.scanText(head+line("2026-11-01 18:01:00",message)+tail,options);
      assert.equal(parser.deriveEvents(bad.markers).filter(event=>event.kind==="power_off").length,0,message);
    }
    const duplicate=parser.scanText(head+line("2026-11-01 18:01:00","Web user shut down terminal")+line("2026-11-01 18:01:00","Controller command: Shut down")+tail,options);
    assert.equal(parser.deriveEvents(duplicate.markers).filter(event=>event.kind==="power_off").length,1);
  }
  require("../app");const api=global.MvpSphereSR,state=api.createDemoState();
  state.srImports=[{rawSha256:"a".repeat(64)}];state.inventoryDevices=[{id:"te",category:"vcs",manufacturerRaw:"Huawei",modelRaw:"TE40",ipNormalized:"192.0.2.40",inCurrentSr:true}];
  for(const [index,models] of [[0,["TE20"]],[1,["TE30","TE40","TE50","TE60"]],[2,["Bar 310","Box 310","Box 610"]],[3,["Bar 300","Box 300","Box 600"]]]){
    const {parser,line,boot,options}=formats[index];
    const scan=parser.scanText(head+line("2026-11-01 18:01:00","Controller command: Shut down")+boot("2026-11-02 07:00:00")+tail,options);
    for(const model of models){
      const candidate={...state,inventoryDevices:[{...state.inventoryDevices[0],modelRaw:model}]};
      const row={path:"synthetic/192.0.2.40.xml",ip:"192.0.2.40",deviceId:"te",matchStatus:"Сопоставлено",format:index<2?"Huawei TE XML":index===2?"Huawei 310 XML":"Huawei 300 XML"};
      const result=index<2?api.buildHuaweiTeLogEventIndex([{row,scan}],candidate):index===2?api.buildHuawei310LogEventIndex([{row,scan}],candidate):api.buildHuawei300LogEventIndex([{row,scan}],candidate,model.startsWith("Box")?"box":"bar");
      assert.equal(result.events.filter(event=>event.kind==="power_off").length,1,model);
      assert.equal(result.events.filter(event=>event.kind==="start_after_shutdown").length,1,model);
      assert.equal(result.events.find(event=>event.kind==="power_off").shutdownInitiator,"not_established");
    }
  }
  const make=(run,message,time)=>{const file=new Blob([head+`[Info][Main] ${time} LOG_MOD_CTL 7 ${message}\n`+tail]);file.name="192.0.2.40.xml";file.webkitRelativePath=run+"/"+file.name;file.lastModified=run.length;return file;};
  const files=[make("one","Shut down terminal","2026-11-01 18:01:00"),make("two","Synthetic activity","2026-11-02 07:00:00")];
  let reads=[];const client={scan:file=>{reads.push(file.webkitRelativePath);return te.scanFile(file,{model:"te40"});}};
  const first=await api.prepareDeviceLogImport(files,state,{scanClient:client});
  const legacy=JSON.parse(JSON.stringify(first));legacy.registry.forEach(row=>{delete row.analysisRuleset;delete row.analysisRuleVersion;});
  const before=JSON.stringify(legacy);reads=[];
  await assert.rejects(api.prepareDeviceLogImport(files.slice(0,1),state,{existing:legacy,scanClient:client}),/log_rules_recheck_required/);
  assert.equal(reads.length,0);
  const scopes=new Map();let cancelled=false;
  const checkpoint={list:async scope=>[...(scopes.get(scope)?.keys()||[])],read:async(scope,key)=>scopes.get(scope)?.get(key),
    write:async(scope,key,value)=>{if(!scopes.has(scope))scopes.set(scope,new Map());scopes.get(scope).set(key,value);cancelled=true;}};
  await assert.rejects(api.prepareDeviceLogImport(files,state,{existing:legacy,scanClient:client,checkpoint,shouldCancel:()=>cancelled}),/log_import_cancelled/);
  assert.equal(JSON.stringify(legacy),before);assert.equal(reads.length,1);
  reads=[];cancelled=false;checkpoint.write=async(scope,key,value)=>{if(!scopes.has(scope))scopes.set(scope,new Map());scopes.get(scope).set(key,value);};
  let upgrade=false;
  const resumed=await api.prepareDeviceLogImport(files,state,{existing:legacy,scanClient:client,checkpoint,onStart:({rulesChanged})=>{upgrade=rulesChanged;}});
  assert(upgrade);assert.equal(resumed.recoveredFiles,1);assert.equal(reads.length,1);
  assert(resumed.registry.every(row=>row.analysisRuleset===api.LOG_ANALYSIS_RULESET&&row.analysisRuleVersion===te.RULE_VERSION));
  reads=[];await api.prepareDeviceLogImport(files,state,{existing:resumed,scanClient:client});assert.equal(reads.length,0);
  if(!options.quiet){
    console.log("PASS: shared shutdown classifier, 4 known formats, file/text parity, failures, incomplete XML, dedup and next startup");
    console.log("PASS: old rules require a complete selection; interrupted upgrade resumes checkpoints; current rules skip unchanged sources");
  }
}
module.exports={run};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
