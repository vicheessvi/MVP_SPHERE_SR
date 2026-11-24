"""Only selected vendor operations may issue requests. All transports are fake."""
import io
import json
import unittest
from mvp_runtime.adapters.huawei_te40 import poll_huawei_te_device
from mvp_runtime.adapters.huawei_bar310 import poll_huawei_bar310_device
from mvp_runtime.adapters.huawei_300 import poll_huawei_bar300_device
from mvp_runtime.adapters.polycom_group import poll_polycom_group310_device
from python_tests import test_huawei_te40 as te_fixture
from python_tests import test_huawei_bar310 as bar_fixture
from python_tests.test_huawei_300 import fake_request
from python_tests import test_huawei_300 as series300_fixture
from python_tests import test_polycom_group as poly_fixture

class SelectedAdapterReadTests(unittest.TestCase):
    def test_write_only_performs_only_requested_pre_read_write_and_post_read(self):
        cases=[]
        calls=[]
        request=te_fixture.HuaweiTe40Tests().success_request(calls,terminal_model="Huawei TE20",preauth_legacy=True,configuration={"autoreply":0},overrides={"/system/web_all.js":{"status_code":200,"headers":[],"body":te_fixture.RESOURCE_MARKERS+" WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply"}})
        cases.append((poll_huawei_te_device,{"ip":"192.0.2.20","model":"TE20"},request,calls,{"username":"synthetic-user","password":"SYNTHETIC-PASSWORD"},"set_te20_auto_answer_manual",{}))
        calls=[]
        request=bar_fixture.HuaweiBar310Tests().success_request(calls,overrides={"/static/js/main.synthetic.chunk.js":{"status_code":200,"headers":[],"body":bar_fixture.ANSWER_WRITE_BUNDLE}},configuration_values={**bar_fixture.SYNTHETIC_SETTINGS,"autoreply":1})
        cases.append((poll_huawei_bar310_device,{"ip":"192.0.2.31","model":"Bar 310"},request,calls,{"username":"good-user","password":"GOOD-SYNTHETIC"},"set_huawei_310_auto_answer_manual",{}))
        calls=[]
        base=fake_request(calls,bundle=series300_fixture.ANSWER_WRITE_BUNDLE)
        state={"code":0}
        def request300(options):
            if "WEB_SaveCfgParamAPI" in options["path"]:
                calls300.append(options);state["code"]=1;return series300_fixture.envelope({})
            if "WEB_GetCfgParamAPI" in options["path"]:
                calls300.append(options);return series300_fixture.envelope({"autoreply":state["code"]})
            return base(options)
        calls300=calls
        cases.append((poll_huawei_bar300_device,{"ip":"192.0.2.30","model":"Bar 300"},request300,calls,{"username":"synthetic-user","password":"SYNTHETIC-PASSWORD"},"set_huawei_300_auto_answer_manual",{}))
        calls=[]
        request=poly_fixture.PolycomGroupTests().fake_request(calls,bundle=poly_fixture.FULL_SETTINGS_BUNDLE+" "+poly_fixture.AUTO_ANSWER_WRITE_MARKERS,config_values={**poly_fixture.FULL_SETTING_VALUES})
        cases.append((poll_polycom_group310_device,{"ip":"192.0.2.31","model":"RealPresence Group 310"},request,calls,{"username":"synthetic-user","password":poly_fixture.SYNTHETIC_PASSWORD},"set_polycom_group_auto_answer",{"polycom_answer_changes":{"pointToPoint":"manual","multipoint":"automatic"},"answer_wait":lambda _:None}))
        for adapter,device,request,calls,credentials,action,extra in cases:
            with self.subTest(model=device["model"]):
                result=adapter(device,[credentials],{"request":request,"collect_json":False,"collect_logs":False,"management_tasks":[action],**extra})
                self.assertTrue(result["ok"],result)
                self.assertEqual(result["managementActions"][0]["status"],"applied",result)
                config_calls=[call for call in calls if "WEB_GetCfgParamAPI" in call["path"] or call["path"] in {"/v1/om/config","/rest/config"}]
                for call in config_calls:
                    payload=json.loads(call["body"])
                    if call["path"]=="/rest/config":
                        names=[item["name"] if isinstance(item,dict) else item for item in payload.get("vars",payload.get("names",[]))]
                        self.assertTrue(set(names).issubset({poly_fixture.AUTO_ANSWER_SINGLE_NAME,poly_fixture.AUTO_ANSWER_MULTI_NAME}),payload)
                    else:
                        ids=payload.get("CfgIDString") or [item["CfgItemID"] for item in payload.get("CfgItemInt",[])]
                        self.assertEqual(ids,["autoreply"],payload)
                self.assertFalse(any("export" in call["path"].lower() or "GetSysLocalTime" in call["path"] or call["path"] in {"/rest/system/status","/rest/system/time","/rest/system/uptime"} for call in calls))
                self.assertNotIn("siteName",result);self.assertNotIn("deviceSettings",result)

    def test_logs_only_never_reads_unselected_settings_site_or_full_status(self):
        cases=[]
        calls=[];request=te_fixture.HuaweiTe40Tests().success_request(calls,terminal_model="Huawei TE20",preauth_legacy=True,overrides={"/system/web_all.js":{"status_code":200,"headers":[],"body":te_fixture.RESOURCE_MARKERS+" exportLogFile '?actkn='"}})
        cases.append((poll_huawei_te_device,{"ip":"192.0.2.20","model":"TE20"},request,calls,{"username":"synthetic-user","password":"SYNTHETIC-PASSWORD"}))
        calls=[];request=bar_fixture.HuaweiBar310Tests().success_request(calls,overrides={"/static/js/main.synthetic.chunk.js":{"status_code":200,"headers":[],"body":bar_fixture.LOG_EXPORT_BUNDLE}})
        cases.append((poll_huawei_bar310_device,{"ip":"192.0.2.31","model":"Bar 310"},request,calls,{"username":"good-user","password":"GOOD-SYNTHETIC"}))
        calls=[];cases.append((poll_huawei_bar300_device,{"ip":"192.0.2.30","model":"Bar 300"},fake_request(calls),calls,{"username":"synthetic-user","password":"SYNTHETIC-PASSWORD"}))
        calls=[];cases.append((poll_polycom_group310_device,{"ip":"192.0.2.31","model":"RealPresence Group 310"},poly_fixture.PolycomGroupTests().fake_request(calls,bundle=poly_fixture.LOG_BUNDLE),calls,{"username":"synthetic-user","password":poly_fixture.SYNTHETIC_PASSWORD}))
        for adapter,device,request,calls,credentials in cases:
            with self.subTest(model=device["model"]):
                result=adapter(device,[credentials],{"request":request,"collect_json":False,"collect_logs":True,"log_opener":lambda *_:io.BytesIO(b"synthetic"),"on_log":lambda *_:{"status":"saved"}})
                self.assertTrue(result["ok"],result)
                forbidden=[call for call in calls if any(word in call["path"] for word in ("WEB_GetTermSpecsInfoAPI","WEB_GetSysLocalTimeAPI","WEB_GetDhcpIPInfoAPI","/rest/system/status","/rest/system/time","/rest/system/uptime"))]
                self.assertEqual(forbidden,[],device["model"])
                cfg=[call for call in calls if "WEB_GetCfgParamAPI" in call["path"] or call["path"]=="/v1/om/config" or call["path"]=="/rest/config"]
                self.assertEqual(cfg,[],device["model"])
                self.assertNotIn("deviceSettings",result);self.assertNotIn("siteName",result);self.assertNotIn("rawResources",result)

if __name__=="__main__":unittest.main()
