"""Synthetic v5 scope tests. No real devices or vendor writes."""
import copy
import unittest
from mvp_runtime.catalog import resolve_manifest
from mvp_runtime.polling import PollingError, run_plan, validate_plan_actions, validate_plan_interval
from mvp_runtime.polling_job import PollingJob

GROUPS=[("set_te20_auto_answer_manual",["TE20"]),("set_te_family_auto_answer_manual",["TE30","TE40","TE50","TE60"]),
        ("set_huawei_310_auto_answer_manual",["Bar 310","Box 310","Box 610"]),("set_huawei_300_auto_answer_manual",["Bar 300","Box 300","Box 600"]),
        ("set_polycom_group_auto_answer",["RealPresence Group 300","RealPresence Group 310","RealPresence Group 500","RealPresence Group 700"])]
def plan():
    devices=[]
    for action,models in GROUPS:
        for model in models:devices.append({"ip":f"192.0.2.{10+len(devices)}","category":"vcs","manufacturer":"Polycom" if model.startswith("Real") else "Huawei","model":model,"pollingSupported":True,"managementTasks":[action]})
    tasks=[action for action,_ in GROUPS]
    return {"schemaVersion":5,"managementRouting":"per_device_answer","managementTasks":tasks,"selectedActions":tasks[:],
            "devices":devices,"sourceTargetIps":[d["ip"] for d in devices],"targetSource":"device_list","targetSourceSheets":["Devices"],
            "targetSourceSha256":"a"*64,"selection":{"mode":"filters"},"collectJson":False,"collectLogs":False,
            "polycomAnswerChanges":{"pointToPoint":"manual","multipoint":"manual"},"intervalMinSeconds":0,"intervalMaxSeconds":0}

class MixedAnswerModeTests(unittest.TestCase):
    def test_all_fifteen_devices_receive_only_their_bound_action_in_both_directions(self):
        for automatic in (False,True):
            value=plan()
            if automatic:
                value["managementTasks"]=[a.replace("_manual","_automatic") for a in value["managementTasks"]];value["selectedActions"]=value["managementTasks"][:]
                value["polycomAnswerChanges"]={"pointToPoint":"automatic","multipoint":"automatic"}
                for device in value["devices"]:device["managementTasks"]=[a.replace("_manual","_automatic") for a in device["managementTasks"]]
            calls=[];pings=[]
            def adapter(device,credentials,options):
                calls.append((device,options));return {"ok":True,"managementActions":[{"id":a,"status":"applied"} for a in options["management_tasks"]]}
            adapters={resolve_manifest(d)["transport"]:adapter for d in value["devices"]}
            results=run_plan(value,{"ping":lambda ip,*_:pings.append(ip) or {"ok":True},"adapters":adapters})
            self.assertEqual(len(pings),15);self.assertEqual(len(calls),15);self.assertEqual(len(results),15)
            for (device,options),expected in zip(calls,value["devices"]):
                self.assertEqual(options["management_tasks"],expected["managementTasks"]);self.assertFalse(options["collect_json"]);self.assertFalse(options["collect_logs"])
                self.assertEqual(options["polycom_answer_changes"],value["polycomAnswerChanges"] if device["manufacturer"]=="Polycom" else None)

    def test_no_change_devices_do_not_ping_login_or_consume_intervals(self):
        value=plan();value.pop("polycomAnswerChanges");value["managementTasks"]=value["selectedActions"]=[GROUPS[0][0]]
        for d in value["devices"]:d["managementTasks"]=[]
        value["devices"][0]["managementTasks"]=[GROUPS[0][0]]
        # Two real contacts and thirteen noops permit a single fixed gap.
        value["devices"][1]={**value["devices"][0],"ip":"192.0.2.11"};value["intervalMinSeconds"]=value["intervalMaxSeconds"]=5
        validate_plan_interval(value);pings=[];waits=[];credentials=[]
        def adapter(device,creds,options):return {"ok":True,"managementActions":[{"id":GROUPS[0][0],"status":"already_compliant"}]}
        results=run_plan(value,{"ping":lambda ip,*_:pings.append(ip) or {"ok":True},"adapters":{"huawei_te20_web_cgi_v1":adapter},"wait":lambda seconds,*_:waits.append(seconds),"get_credentials":lambda ip,*_:credentials.append(ip) or []})
        self.assertEqual(pings,["192.0.2.10","192.0.2.11"]);self.assertEqual(credentials,pings);self.assertEqual(waits,[5])
        self.assertEqual(sum(r.get("notRequested",False) for r in results),13)
        self.assertTrue(all(r["networkAttempted"] is False for r in results[2:]))

    def test_mutated_bindings_and_non_answer_writes_fail_before_network(self):
        bad=[]
        for change in (lambda p:p["devices"][0].pop("managementTasks"),lambda p:p["devices"][0].update(managementTasks=[GROUPS[2][0]]),
                       lambda p:p["devices"][0].update(managementTasks=[]),lambda p:p["devices"][0].update(managementTasks=[GROUPS[0][0]]*2),
                       lambda p:p["devices"][0].update(model="TE20 suffix"),lambda p:p.update(managementRouting="broadcast"),
                       lambda p:p.update(ntpChanges={}),lambda p:p.update(powerChanges={}),lambda p:p["selectedActions"].pop()):
            value=plan();change(value);bad.append(value)
        value=plan();value["managementTasks"].append("set_te20_auto_answer_automatic");value["selectedActions"]=value["managementTasks"][:];bad.append(value)
        value=plan();value["managementTasks"].append("set_te20_http_open");value["selectedActions"]=value["managementTasks"][:];bad.append(value)
        value=plan();value["schemaVersion"]=4;bad.append(value)
        for value in bad:
            pings=[]
            with self.assertRaises(PollingError):run_plan(value,{"ping":lambda *_:pings.append(True)})
            self.assertFalse(pings)

    def test_collections_are_explicit_and_do_not_add_writes_for_unchanged_groups(self):
        value=plan();value.pop("polycomAnswerChanges");value["managementTasks"]=[GROUPS[0][0]]
        for d in value["devices"][1:]:d["managementTasks"]=[]
        for json,logs in ((True,False),(False,True),(True,True)):
            value.update(collectJson=json,collectLogs=logs);value["selectedActions"]=(['collect_json'] if json else [])+(['collect_logs'] if logs else [])+value["managementTasks"]
            calls=[]
            def adapter(device,credentials,options):
                calls.append(options);return {"ok":True,"managementActions":[{"id":a,"status":"already_compliant"} for a in options["management_tasks"]],**({"logCollection":{"status":"saved"}} if logs else {})}
            run_plan(value,{"ping":lambda *_:{"ok":True},"adapters":{resolve_manifest(d)["transport"]:adapter for d in value["devices"]}})
            self.assertEqual(len(calls),15);self.assertEqual(sum(bool(c["management_tasks"]) for c in calls),1)
            self.assertTrue(all(c["collect_json"]==json and c["collect_logs"]==logs for c in calls))

    def test_job_freezes_bindings_and_counts_noops_separately(self):
        value=plan();job=PollingJob({"plan":value,"credentials":[{"username":"synthetic","password":"synthetic-only"}],"autostart":False})
        value["devices"][0]["managementTasks"]=[];self.assertEqual(job._plan["devices"][0]["managementTasks"],[GROUPS[0][0]])
        job._on_progress({"stage":"processed","result":{"ok":True,"notRequested":True,"networkAttempted":False}})
        self.assertEqual(job.status()["notRequested"],1);self.assertEqual(job.status()["successful"],0);job.discard()

    def test_resume_keeps_original_root_with_completed_contracts_absent(self):
        value=plan();value["devices"]=value["devices"][5:8]
        validate_plan_actions(value)
        for d in value["devices"]:self.assertEqual(d["managementTasks"],[GROUPS[2][0]])
        noop=plan();noop.pop("polycomAnswerChanges");noop["managementTasks"]=noop["selectedActions"]=[GROUPS[0][0]];noop["devices"]=noop["devices"][1:]
        for d in noop["devices"]:d["managementTasks"]=[]
        results=run_plan(noop,{"ping":lambda *_:self.fail("Noop continuation cannot connect")})
        self.assertEqual(len(results),14);self.assertTrue(all(r["notRequested"] for r in results))

if __name__=="__main__":unittest.main()
