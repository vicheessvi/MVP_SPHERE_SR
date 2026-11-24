"""Action/target isolation, synthetic devices only. No vendor network access."""
import copy
import unittest
from mvp_runtime.polling import PollingError, run_plan, validate_plan_actions
from mvp_runtime.polling_job import PollingJob

ACTION="set_te20_auto_answer_manual"
DEVICE={"ip":"192.0.2.20","category":"vcs","manufacturer":"Huawei","model":"TE20","pollingSupported":True}
def plan(json=False,logs=False,write=False):
    actions=(["collect_json"] if json else [])+(["collect_logs"] if logs else [])+([ACTION] if write else [])
    return {"schemaVersion":4,"devices":[copy.deepcopy(DEVICE)],"collectJson":json,"collectLogs":logs,"managementTasks":[ACTION] if write else [],
            "selectedActions":actions,"targetSource":"device_list","targetSourceSha256":"a"*64,"targetSourceSheets":["Selected"],
            "sourceTargetIps":["192.0.2.20"],"selection":{"mode":"filters"},"intervalMinSeconds":0,"intervalMaxSeconds":0}

class ExplicitPlanTests(unittest.TestCase):
    def test_seven_combinations_forward_only_selected_actions(self):
        for mask in range(1,8):
            with self.subTest(mask=mask):
                target=plan(bool(mask&1),bool(mask&2),bool(mask&4));calls=[]
                def adapter(device,credentials,options):
                    calls.append(copy.deepcopy(options))
                    return {"ok":True,"managementActions":[{"id":ACTION,"status":"already_compliant"}] if mask&4 else [],
                            **({"logCollection":{"status":"saved"}} if mask&2 else {})}
                result=run_plan(target,{"ping":lambda *_:{"ok":True},"adapters":{"huawei_te20_web_cgi_v1":adapter}})
                self.assertEqual(len(calls),1);self.assertEqual(calls[0]["collect_json"],bool(mask&1));self.assertEqual(calls[0]["collect_logs"],bool(mask&2))
                self.assertEqual(calls[0]["management_tasks"],[ACTION] if mask&4 else []);self.assertEqual(len(result),1)

    def test_missing_mutated_membership_or_actions_reject_before_network(self):
        bad=[]
        value=plan();bad.append(value)
        value=plan(json=True);value.pop("collectJson");bad.append(value)
        value=plan(json=True);value["selectedActions"]=["collect_logs"];bad.append(value)
        value=plan(json=True);value["sourceTargetIps"]=["192.0.2.21"];bad.append(value)
        value=plan(json=True);value["targetSourceSheets"]=[];bad.append(value)
        value=plan(json=True);value["schemaVersion"]=3;bad.append(value)
        for value in bad:
            calls=[]
            with self.assertRaises(PollingError):run_plan(value,{"ping":lambda *_:calls.append(True)})
            self.assertEqual(calls,[])

    def test_write_single_target_and_compatible_answer_group_constraints_remain(self):
        value=plan(write=True);validate_plan_actions(value)
        value["devices"].append({**DEVICE,"ip":"192.0.2.21","model":"TE40"});value["sourceTargetIps"].append("192.0.2.21")
        with self.assertRaises(PollingError):validate_plan_actions(value)
        value=plan(write=True);value["managementTasks"]=["set_te20_ssh_disabled"];value["selectedActions"]=value["managementTasks"][:]
        validate_plan_actions(value)
        value["devices"].append({**DEVICE,"ip":"192.0.2.21"});value["sourceTargetIps"].append("192.0.2.21")
        with self.assertRaises(PollingError):validate_plan_actions(value)

    def test_job_copies_intent_before_execution(self):
        value=plan(write=True);job=PollingJob({"plan":value,"credentials":[{"username":"synthetic","password":"synthetic-only"}],"autostart":False})
        value["collectJson"]=True;value["selectedActions"].append("collect_json");value["devices"].append({**DEVICE,"ip":"192.0.2.21"})
        self.assertFalse(job.status()["collectJson"]);self.assertEqual(job.status()["total"],1);job.discard()

if __name__=="__main__":unittest.main()
