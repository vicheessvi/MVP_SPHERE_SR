"use strict";
const assert=require("assert/strict"),{row}=require("./test-explicit-plan"),api=global.MvpSphereSR,recovery=require("../runtime/polling-recovery");
const groups=[['set_te20_auto_answer_manual',['TE20']],['set_te_family_auto_answer_manual',['TE30','TE40','TE50','TE60']],['set_huawei_310_auto_answer_manual',['Bar 310','Box 310','Box 610']],['set_huawei_300_auto_answer_manual',['Bar 300','Box 300','Box 600']],['set_polycom_group_auto_answer',['RealPresence Group 300','RealPresence Group 310','RealPresence Group 500','RealPresence Group 700']]];
function fixture(){
  const rows=[];for(const[action,models]of groups)for(const model of models){const ip='192.0.2.'+(10+rows.length);rows.push({...row(ip),'Модель':model,'Производитель':model.startsWith('Real')?'Polycom':'Huawei'});}
  const parsed=api.parseManagementTargetRows({headers:api.SR_CANONICAL_HEADERS,rows});assert(parsed.ok);
  const input={explicitActions:true,answerModeRouting:'per_device',targetSource:'device_list',mode:'filters',domains:['*'],categories:['*'],manufacturers:['*'],models:['*'],managementTargetDevices:parsed.devices,managementTargetSourceSha256:'a'.repeat(64),managementTargetSheets:['Devices'],credentialsReady:true,credentialSourceSha256:'b'.repeat(64),scheduledAt:'2026-11-24T00:00:00Z',intervalMinSeconds:0,intervalMaxSeconds:0,collectJson:false,collectLogs:false,te20AnswerMode:'manual',teFamilyAnswerMode:'manual',huawei310AnswerMode:'manual',huawei300AnswerMode:'manual',polycomPointToPointAnswerMode:'manual',polycomMultipointAnswerMode:'manual'};
  return {state:api.createDemoState(),input};
}
async function run(){
  const {state,input}=fixture(),result=api.createPollingPlan(state,input);assert(result.ok,result.errors?.join('; '));
  const plan=api.buildPollingPlanExport(result.state,result.plan.id).payload;
  assert.equal(plan.schemaVersion,5);assert.equal(plan.managementRouting,'per_device_answer');assert.equal(plan.devices.length,15);
  assert.deepEqual(plan.selectedActions,groups.map(([action])=>action));
  for(const[action,models]of groups)for(const model of models)assert.deepEqual(plan.devices.find(device=>device.model===model).managementTasks,[action]);
  const noChange={...input,teFamilyAnswerMode:'',huawei310AnswerMode:'',huawei300AnswerMode:'',polycomPointToPointAnswerMode:'',polycomMultipointAnswerMode:''};
  const subset=api.createPollingPlan(state,noChange);assert(subset.ok,subset.errors?.join('; '));assert.equal(subset.plan.selectionSummary.notRequested,14);assert.equal(subset.plan.selectionSummary.writeTargets,1);
  const subsetPlan=api.buildPollingPlanExport(subset.state,subset.plan.id).payload;
  assert.equal(subsetPlan.devices.filter(device=>!device.managementTasks.length).length,14);
  const noopIndex=subsetPlan.devices.findIndex(device=>!device.managementTasks.length),writeIndex=subsetPlan.devices.findIndex(device=>device.managementTasks.length);
  const manifest=recovery.create(subsetPlan,false);recovery.record(manifest,noopIndex,true,{ok:true,notRequested:true,networkAttempted:false});
  assert.equal(recovery.validate(JSON.parse(JSON.stringify(manifest))).outcomes[0].notRequested,true);
  assert.throws(()=>recovery.record(recovery.create(plan,false),0,true,{ok:true,managementActions:[{id:groups[2][0],status:'applied',changed:true,writeAttempted:true}]}),'Outcome cannot claim another contract action');
  const interrupted=recovery.create(subsetPlan,false);interrupted.nextIndex=writeIndex;
  const remaining=recovery.remaining(interrupted,[]);assert.deepEqual(remaining.skippedForReview,[writeIndex]);assert(remaining.originalIndices.includes(noopIndex),'No-change entry is not an uncertain write');
  interrupted.requiresReview=remaining.skippedForReview;assert.equal(recovery.completionStatus(interrupted,'completed'),'completed_with_errors','Review cannot disappear after completing the other contracts');
  assert(!api.createPollingPlan(state,{...input,te20HttpMode:'open'}).ok);
  const unknown={...input,managementTargetDevices:[{...input.managementTargetDevices[0],modelRaw:'TE20 suffix'}]};assert(!api.createPollingPlan(state,unknown).ok);
  const legacy={...input};delete legacy.answerModeRouting;assert(!api.createPollingPlan(state,legacy).ok,'Legacy plan cannot silently become mixed');
  const withCollections=api.createPollingPlan(state,{...noChange,collectJson:true,collectLogs:true});assert(withCollections.ok);assert.equal(withCollections.plan.selectionSummary.notRequested,0);
  const varied=api.createPollingPlan(state,{...input,te20AnswerMode:'automatic',huawei310AnswerMode:'automatic',polycomPointToPointAnswerMode:'automatic'});assert(varied.ok);
  assert.deepEqual(varied.plan.targetDevices.find(device=>device.model==='TE20').managementTasks,['set_te20_auto_answer_automatic']);
  assert.deepEqual(varied.plan.targetDevices.find(device=>device.model==='Bar 310').managementTasks,['set_huawei_310_auto_answer_automatic']);
  assert.deepEqual(varied.plan.targetDevices.find(device=>device.model==='Bar 300').managementTasks,['set_huawei_300_auto_answer_manual']);
  assert.deepEqual(varied.plan.polycomAnswerChanges,{pointToPoint:'automatic',multipoint:'manual'});
  const noActions={...noChange,te20AnswerMode:''};assert(!api.createPollingPlan(state,noActions).ok);
  console.log('PASS: mixed per-device plan snapshot, no-change, scoped recovery, collections, legacy and unrelated-write rejection');
}
module.exports={run,fixture,groups};if(require.main===module)run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
