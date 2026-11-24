"use strict";
const assert=require("assert/strict");
global.XLSX=require("../vendor/xlsx.full.min.js");
require("../app.js");const api=global.MvpSphereSR;
const row=(ip)=>({"SmartRoom ID локации":"synthetic-location","Наименование локации":"Synthetic room","Адрес локации":"Synthetic address",
  "SmartRoom ID оборудования":ip,"Класс оборудования":"vcs","Наименование оборудования":"Synthetic TE20","Тип":"Video Conference",
  "Производитель":"Huawei","Модель":"TE20","IP адрес":ip,"MAC адрес":"02:00:00:00:00:20","Общий статус оборудования":"Учёт","Telnet/HTTP":"Отключить"});
function workbook(duplicate=false){
  const book=global.XLSX.utils.book_new(),headers=[...api.SR_CANONICAL_HEADERS,"Telnet/HTTP"];
  global.XLSX.utils.book_append_sheet(book,global.XLSX.utils.aoa_to_sheet([["Вспомогательный лист"]]),"Описание");
  for(const [name,ip] of [["Первый","192.0.2.20"],["Второй",duplicate?"192.0.2.20":"192.0.2.21"]]){
    const data=row(ip);global.XLSX.utils.book_append_sheet(book,global.XLSX.utils.aoa_to_sheet([headers,headers.map(key=>data[key]||"")]),name);
  }
  return global.XLSX.write(book,{type:"array",bookType:"xlsx"});
}
async function run(){
  const bytes=workbook(),choice=await api.parseManagementTargetWorkbook({arrayBuffer:bytes});
  assert.equal(choice.ok,false);assert.equal(choice.needsSheetSelection,true);assert.deepEqual(choice.sheetNames,["Описание","Первый","Второй"]);
  const second=await api.parseManagementTargetWorkbook({arrayBuffer:bytes,selectedSheets:["Второй"]});
  assert(second.ok);assert.deepEqual(second.devices.map(d=>d.ipNormalized),["192.0.2.21"]);assert.deepEqual(second.selectedSheets,["Второй"]);
  const combined=await api.parseManagementTargetWorkbook({arrayBuffer:bytes,selectedSheets:["Первый","Второй"]});
  assert(combined.ok);assert.equal(combined.devices.length,2);
  assert(!(await api.parseManagementTargetWorkbook({arrayBuffer:bytes,selectedSheets:["Описание"]})).ok);
  assert(!(await api.parseManagementTargetWorkbook({arrayBuffer:workbook(true),selectedSheets:["Первый","Второй"]})).ok);
  const state=api.createDemoState(),input={explicitActions:true,targetSource:"device_list",mode:"filters",domains:["*"],categories:["*"],manufacturers:["*"],models:["*"],
    managementTargetDevices:second.devices,managementTargetSourceSha256:second.sourceSha256,managementTargetSheets:second.selectedSheets,
    scheduledAt:"2026-11-24T12:00:00Z",intervalMinSeconds:0,intervalMaxSeconds:0,credentialsReady:true,credentialSourceSha256:"b".repeat(64),collectJson:false,collectLogs:false};
  assert.equal(api.createPollingPlan(state,input).ok,false,"No actions cannot start");
  const json=api.createPollingPlan(state,{...input,collectJson:true});assert(json.ok,json.errors?.join("; "));
  const exported=api.buildPollingPlanExport(json.state,json.plan.id).payload;
  assert.equal(exported.schemaVersion,4);assert.equal(exported.targetSource,"device_list");assert.equal(exported.collectJson,true);assert.equal(exported.collectLogs,false);
  assert.deepEqual(exported.selectedActions,["collect_json"]);assert.deepEqual(exported.managementTasks,[]);
  assert.deepEqual(exported.targetSourceSheets,["Второй"]);assert.deepEqual(exported.devices.map(d=>d.ip),["192.0.2.21"]);
  const write=api.createPollingPlan(state,{...input,te20AnswerMode:"manual"});assert(write.ok,write.errors?.join("; "));
  const writePlan=api.buildPollingPlanExport(write.state,write.plan.id).payload;
  assert.equal(writePlan.collectJson,false);assert.equal(writePlan.collectLogs,false);assert.deepEqual(writePlan.selectedActions,["set_te20_auto_answer_manual"]);
  const missing=api.deriveAutomaticPollingPlan(state,{...input,managementTargetDevices:[]});assert.equal(missing.selectedDevices.length,0,"No SR fallback");
  assert(!api.createPollingPlan(state,{...input,collectJson:true,managementTargetSheets:[]}).ok);
  const srState={...state,inventoryDevices:[...second.devices,{...second.devices[0],id:"invalid-unselected",ipNormalized:"not-an-ip"}],srImports:[{id:"synthetic-sr",status:"processed",rawSha256:"c".repeat(64)}]};
  const sr=api.createPollingPlan(srState,{...input,targetSource:"sr",mode:"single_ip",ipAddress:"192.0.2.21",collectJson:true});
  assert(sr.ok,sr.errors?.join("; "));assert.deepEqual(sr.plan.sourceTargetIps,["192.0.2.21"]);
  const recovery=require("../runtime/polling-recovery"),journal=recovery.create(writePlan,false);
  recovery.record(journal,0,true,{ok:true,managementActions:[{id:"set_te20_auto_answer_manual",status:"applied",changed:true,writeAttempted:true,before:"automatic",after:"manual"}]});
  assert.equal(recovery.validate(JSON.parse(JSON.stringify(journal))).outcomes[0].managementActions[0].after,"manual");
  const secret=JSON.parse(JSON.stringify(journal));secret.outcomes[0].managementActions[0].after={password:"must-not-persist"};assert.throws(()=>recovery.validate(secret));
  const raw=JSON.parse(JSON.stringify(journal));raw.outcomes[0].rawText="forbidden";assert.throws(()=>recovery.validate(raw));
  const corrupt=JSON.parse(JSON.stringify(journal));corrupt.plan.selectedActions=["collect_json"];assert.throws(()=>recovery.validate(corrupt));
  assert.equal(api.pollingStartEnabled({...input,targetListReady:false},true,false),false);
  const originalIp=exported.devices[0].ip;second.devices[0].ipNormalized="192.0.2.99";
  assert.equal(api.buildPollingPlanExport(json.state,json.plan.id).payload.devices[0].ip,originalIp,"Plan targets are a frozen snapshot");
  console.log("PASS: explicit multi-sheet targets, no action/source defaults, JSON-only and write-only plan snapshots");
}
module.exports={run,workbook,row};if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
