"""Port policy regression: all fixtures are synthetic, no device network."""
import unittest
import json
from unittest.mock import patch
from mvp_runtime.polling import PollingError, run_plan, probe_device
from python_tests import test_explicit_plan as explicit
from python_tests import test_server as server_fixture

LEGACY="disable_insecure_management_services"
class ExplicitPortPolicyTests(unittest.TestCase):
    def test_api_retired_action_never_creates_job(self):
        harness=server_fixture.ServerHarness();self.addCleanup(harness.close)
        cookie,csrf=harness.session()
        headers={"Cookie":cookie,"Origin":"http://"+harness.host,"X-MVP-CSRF":csrf,"Content-Type":"application/json"}
        with patch("mvp_runtime.server.create_polling_job") as factory:
            for version in (3,4,5):
                status,_,body=harness.request("POST","/api/polling/credentials",headers=headers,body=json.dumps({"pairs":[{"username":"synthetic-user","password":"synthetic-only"}]}));self.assertEqual(status,200)
                value=explicit.plan(write=True);value.update(schemaVersion=version,authenticationInputSha256=json.loads(body)["sourceSha256"],managementTasks=[LEGACY],selectedActions=[LEGACY])
                status,_,body=harness.request("POST","/api/polling/jobs",headers=headers,body=json.dumps({"plan":value}))
                self.assertEqual(status,400);self.assertEqual(json.loads(body)["error"],"legacy_port_action_retired")
            factory.assert_not_called()
    def test_legacy_bulk_rejected_for_all_plan_versions_before_ping(self):
        for version in (3,4,5):
            value=explicit.plan(write=True);value["schemaVersion"]=version
            value["managementTasks"]=value["selectedActions"]=[LEGACY]
            if version==3:value["targetSource"]="port_closure_list"
            if version==5:value["managementRouting"]="per_device_answer";value["devices"][0]["managementTasks"]=[LEGACY]
            pings=[]
            with self.assertRaises(PollingError) as caught:run_plan(value,{"ping":lambda *_:pings.append(True)})
            self.assertEqual(getattr(caught.exception,"code",None),"legacy_port_action_retired");self.assertEqual(pings,[])

    def test_direct_probe_cannot_bypass_the_bulk_retirement(self):
        pings=[]
        with self.assertRaises(PollingError) as caught:probe_device(explicit.DEVICE,{"allowed_ips":{"192.0.2.20"},"management_tasks":[LEGACY],"ping":lambda *_:pings.append(True)})
        self.assertEqual(getattr(caught.exception,"code",None),"legacy_port_action_retired");self.assertEqual(pings,[])

    def test_independent_te20_ports_still_require_exact_explicit_actions(self):
        for action in ("set_te20_http_open","set_te20_http_closed","set_te20_telnet_open","set_te20_telnet_closed"):
            value=explicit.plan(write=True);value["managementTasks"]=value["selectedActions"]=[action];calls=[]
            def adapter(device,credentials,options):
                calls.append(options["management_tasks"]);return {"ok":True,"managementActions":[{"id":action,"status":"already_compliant"}]}
            result=run_plan(value,{"ping":lambda *_:{"ok":True},"adapters":{"huawei_te20_web_cgi_v1":adapter}})
            self.assertEqual(calls,[[action]]);self.assertTrue(result[0]["ok"])

if __name__=="__main__":unittest.main()
