(function (global) {
  "use strict";

  const KIND = "mvp-sphere-polling-recovery";
  const VERSION = 1;
  const FILE = "polling-recovery.json";
  const SECRET_KEY = /^(password|pass|username|login|credential|credentials|authorization|cookie|token|secret)$/i;

  function rejectSecrets(value) {
    if (Array.isArray(value)) { value.forEach(rejectSecrets); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error("recovery_secret_field");
      rejectSecrets(child);
    }
  }

  function validateSafeState(value, depth = 0) {
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value === "string" && value.length <= 256 && !/[\x00-\x1f]/.test(value)) return;
    if (!value || typeof value !== "object" || Array.isArray(value) || depth >= 3 || Object.keys(value).length > 16) throw new Error("recovery_manifest_invalid");
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,48}$/.test(key) || /raw|resource|block|payload/i.test(key)) throw new Error("recovery_manifest_invalid");
      validateSafeState(child, depth + 1);
    }
  }

  function validateOutcomes(value, count) {
    if (value.outcomes === undefined) return;
    if (!Array.isArray(value.outcomes) || value.outcomes.length > count) throw new Error("recovery_manifest_invalid");
    rejectSecrets(value.outcomes);
    const seen = new Set(), tasks = new Set(value.plan.managementTasks || []);
    const code = text => text === null || (typeof text === "string" && /^[a-z0-9_]{1,80}$/.test(text));
    for (const outcome of value.outcomes) {
      if (!outcome || Object.keys(outcome).some(key => !["index", "ok", "notRequested", "managementActions", "logStatus", "safeError"].includes(key)) || !Number.isInteger(outcome.index) || outcome.index < 0 || outcome.index >= count || seen.has(outcome.index) || typeof outcome.ok !== "boolean" || !code(outcome.logStatus) || !code(outcome.safeError) || !Array.isArray(outcome.managementActions) || outcome.managementActions.length > tasks.size) throw new Error("recovery_manifest_invalid");
      const allowed = value.plan.schemaVersion === 5 ? new Set(value.plan.devices[outcome.index].managementTasks) : tasks;
      if (outcome.notRequested !== undefined && typeof outcome.notRequested !== "boolean") throw new Error("recovery_manifest_invalid");
      if (outcome.notRequested === true && (value.plan.schemaVersion !== 5 || allowed.size || value.plan.collectJson || value.plan.collectLogs || !outcome.ok || outcome.managementActions.length || outcome.logStatus !== null)) throw new Error("recovery_manifest_invalid");
      seen.add(outcome.index);
      const ids = new Set();
      for (const action of outcome.managementActions) {
        if (!action || Object.keys(action).some(key => !["id", "status", "changed", "writeAttempted", "before", "after", "safeError"].includes(key)) || !allowed.has(action.id) || ids.has(action.id) || !code(action.status) || !action.status || !code(action.safeError) || typeof action.changed !== "boolean" || typeof action.writeAttempted !== "boolean") throw new Error("recovery_manifest_invalid");
        ids.add(action.id);
        validateSafeState(action.before);
        validateSafeState(action.after);
      }
    }
  }

  function create(plan, allowInsecureTls, createdAt) {
    if (!plan || !Array.isArray(plan.devices) || !plan.devices.length) throw new Error("recovery_plan_invalid");
    const safePlan = JSON.parse(JSON.stringify(plan));
    delete safePlan.authenticationInputSha256;
    rejectSecrets(safePlan);
    return { kind: KIND, version: VERSION, createdAt: createdAt || new Date().toISOString(), status: "interrupted", allowInsecureTls: allowInsecureTls === true, plan: safePlan, savedIndices: [], saveFailures: [], nextIndex: 0 };
  }

  function validate(value) {
    if (!value || value.kind !== KIND || value.version !== VERSION || !value.plan || ![3,4,5].includes(value.plan.schemaVersion) || !Array.isArray(value.plan.devices) || !value.plan.devices.length || !Array.isArray(value.savedIndices) || !Array.isArray(value.saveFailures) || !Number.isInteger(value.nextIndex) || value.nextIndex < 0 || value.nextIndex > value.plan.devices.length || typeof value.allowInsecureTls !== "boolean" || !["interrupted", "running", "completed", "completed_with_errors", "cancelled"].includes(value.status)) throw new Error("recovery_manifest_invalid");
    if(value.plan.schemaVersion===3){value.plan.collectJson=value.plan.collectJson!==false;value.plan.collectLogs=value.plan.collectLogs===true;}
    if(value.plan.schemaVersion>=4){
      if(typeof value.plan.collectJson!=="boolean"||typeof value.plan.collectLogs!=="boolean"||!Array.isArray(value.plan.managementTasks))throw new Error("recovery_manifest_invalid");
      const actions=[...(value.plan.collectJson?["collect_json"]:[]),...(value.plan.collectLogs?["collect_logs"]:[]),...value.plan.managementTasks];
      if(!actions.length||JSON.stringify(actions)!==JSON.stringify(value.plan.selectedActions))throw new Error("recovery_manifest_invalid");
    }
    if (value.plan.schemaVersion === 5) {
      const tasks = value.plan.managementTasks, pattern = /^set_(?:(?:te20|te_family|huawei_310|huawei_300)_auto_answer_(?:automatic|manual)|polycom_group_auto_answer)$/;
      if (value.plan.managementRouting !== "per_device_answer" || !tasks.length || tasks.some(task => typeof task !== "string" || !pattern.test(task)) || new Set(tasks.map(task=>task.replace(/_(automatic|manual)$/,""))).size !== tasks.length || value.plan.ntpChanges != null || value.plan.powerChanges != null) throw new Error("recovery_manifest_invalid");
      if (value.plan.devices.some(device => !Array.isArray(device.managementTasks) || device.managementTasks.length > 1 || device.managementTasks.some(task => !tasks.includes(task)))) throw new Error("recovery_manifest_invalid");
    } else if (value.plan.devices.some(device => Object.hasOwn(device,"managementTasks"))) throw new Error("recovery_manifest_invalid");
    if (Object.hasOwn(value.plan, "authenticationInputSha256")) throw new Error("recovery_secret_field");
    rejectSecrets(value.plan);
    const count = value.plan.devices.length;
    if (value.savedIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= count) || new Set(value.savedIndices).size !== value.savedIndices.length || value.saveFailures.some((event) => !event || !Number.isInteger(event.index) || event.index < 0 || event.index >= count || event.code !== "result_save_failed")) throw new Error("recovery_manifest_invalid");
    if (value.jobId !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(String(value.jobId))) throw new Error("recovery_manifest_invalid");
    if (value.logFolderName !== undefined && !/^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d(?:-\d+)?$/.test(value.logFolderName)) throw new Error("recovery_manifest_invalid");
    if (value.plan.collectLogs === true && typeof value.logFolderName !== "string") throw new Error("recovery_manifest_invalid");
    if (value.plan.collectJson === false && value.plan.collectLogs !== true && !value.plan.managementTasks?.length) throw new Error("recovery_manifest_invalid");
    if (value.activeOriginalIndices !== undefined && (!Array.isArray(value.activeOriginalIndices) || value.activeOriginalIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= count) || new Set(value.activeOriginalIndices).size !== value.activeOriginalIndices.length)) throw new Error("recovery_manifest_invalid");
    if (value.requiresReview !== undefined && (!Array.isArray(value.requiresReview) || value.requiresReview.some(index=>!Number.isInteger(index)||index<0||index>=count) || new Set(value.requiresReview).size!==value.requiresReview.length)) throw new Error("recovery_manifest_invalid");
    validateOutcomes(value, count);
    return value;
  }

  function record(value, index, saved, result) {
    validate(value);
    if (!Number.isInteger(index) || index < 0 || index >= value.plan.devices.length) throw new Error("recovery_index_invalid");
    if (value.plan.schemaVersion === 5 && (result?.managementActions || []).some(action => !value.plan.devices[index].managementTasks.includes(action.id))) throw new Error("recovery_action_scope_invalid");
    if (saved) {
      if (!value.savedIndices.includes(index)) value.savedIndices.push(index);
      value.saveFailures = value.saveFailures.filter((event) => event.index !== index);
    }
    if (!saved && !value.saveFailures.some((event) => event.index === index)) value.saveFailures.push({ index, code: "result_save_failed" });
    if(result&&value.plan.schemaVersion>=4&&(value.plan.collectJson===false||value.plan.managementTasks.length)){
      const allowed=new Set(value.plan.schemaVersion===5?value.plan.devices[index].managementTasks:value.plan.managementTasks),safeCode=code=>typeof code==="string"&&/^[a-z0-9_]{1,80}$/.test(code)?code:null;
      const actions=(result.managementActions||[]).filter(action=>allowed.has(action.id)).map(action=>({id:action.id,status:action.status,changed:action.changed===true,writeAttempted:action.writeAttempted===true,before:action.before??null,after:action.after??null,safeError:safeCode(action.safeError)}));
      value.outcomes=(value.outcomes||[]).filter(outcome=>outcome.index!==index);
      value.outcomes.push({index,ok:result.ok===true,...(value.plan.schemaVersion===5?{notRequested:result.notRequested===true}:{}),managementActions:actions,logStatus:result.logCollection?.status||null,safeError:safeCode(result.safeError)});
      rejectSecrets(value.outcomes);
      validateOutcomes(value, value.plan.devices.length);
    }
    value.nextIndex = Math.max(value.nextIndex, index + 1);
    return value;
  }

  function remaining(value, verifiedSavedIndices) {
    validate(value);
    const saved = new Set(verifiedSavedIndices);
    const skippedForReview = [];
    const originalIndices = [];
    const devices = [];
    value.plan.devices.forEach((device, index) => {
      if (saved.has(index)) return;
      const writes = value.plan.schemaVersion === 5 ? device.managementTasks.length > 0 : value.plan.managementTasks?.length > 0;
      if (writes && index <= value.nextIndex) { skippedForReview.push(index); return; }
      originalIndices.push(index);
      devices.push(device);
    });
    return { originalIndices, skippedForReview, plan: { ...value.plan, scheduledAt: new Date().toISOString(), devices } };
  }

  function completionStatus(value, status) {
    validate(value);
    return status === "completed" ? value.saveFailures.length || value.requiresReview?.length ? "completed_with_errors" : "completed" : "interrupted";
  }

  const api = { FILE, create, validate, record, remaining, completionStatus };
  global.MVP_POLLING_RECOVERY = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
