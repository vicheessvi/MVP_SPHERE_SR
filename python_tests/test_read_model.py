"""DB-first views use bounded responses rather than rebuilding browser history."""
from __future__ import annotations

import json
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing
from hashlib import sha256
from pathlib import Path

from mvp_runtime.read_model import ReadModel, encode, version as version_value
from mvp_runtime.workspace import WorkspaceError, WorkspaceStore


def fixture():
    devices = [{"id": key, "nameRaw": name, "modelRaw": model, "manufacturerRaw": maker,
                "category": "vcs", "inCurrentSr": True, "equipmentOverallStatus": status,
                "ipNormalized": ip, "domain": domain, "locationId": "loc"} for key, name, model, maker, status, ip, domain in
               [("te", "Synthetic TE", "TE40", "Huawei", "Учёт", "192.0.2.40", "A"),
                ("bar", "Synthetic Bar", "Bar 310", "Huawei", "Норма", "192.0.2.41", "B"),
                ("poly", "Synthetic Poly", "RealPresence Group 310", "Polycom", "Учёт", "192.0.2.42", "A")]]
    def event(key, device, ip, kind, day, **extra):
        return {"id": key, "deviceId": device, "ip": ip, "kind": kind,
                "deviceLocalTime": f"2026-01-{day:02} 10:00:00", **extra}
    events = [event("a", "te", "192.0.2.40", "confirmed_reboot", 1),
              event("b", "te", "192.0.2.40", "power_off", 2),
              event("c", "te", "192.0.2.40", "unknown_start", 3, silenceGap={"seconds": 7200}),
              event("d", "te", "192.0.2.99", "confirmed_reboot", 4)]
    polls = [{"id": str(i), "deviceId": "te", "matchStatus": "matched", "parseStatus": "parsed",
              "pollStatus": status, "capturedAt": f"2026-01-0{i+1}T10:00:00Z",
              "normalizedData": {"siteName": {"status": "read", "value": "Synthetic site"},
                                 "webBlocks": {"Firmware": {"Version": version}}}}
             for i, (status, version) in enumerate([("success", "1"), ("success", "2"), ("authorization_error", "2")])]
    return {"schemaVersion": 1, "state": {"version": 3, "inventoryDevices": devices,
            "locations": [{"id": "loc", "name": "Synthetic room", "address": "Synthetic address", "vip": True}],
            "srImports": [{"id": "sr", "rawSha256": "a" * 64, "importedAt": "2026-01-01T00:00:00Z"}],
            "pollingResults": polls, "pollingRuns": []},
            "log": {"rows": [], "registry": [], "indexes": {"te": {"sourceSrSha256": "a" * 64, "events": events}}}}


class ReadModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        (root / "project").mkdir(); (root / "workspace").mkdir()
        self.store = WorkspaceStore(root / "profile" / "path.json", root / "project")
        self.workspace = self.store.select(root / "workspace")["workspaceId"]
        self.store.commit(0, fixture())
        self.model = ReadModel(self.store)
        self.assertTrue(self.model.prepare(self.workspace)["ready"])
        self.revision = self.model.bootstrap(self.workspace)["revision"]

    def view(self, name, filters=None, **kwargs):
        return self.model.view(self.workspace, self.revision, name, filters or {}, **kwargs)

    def test_migrated_summary_and_dynamic_gap_preserve_ip_and_status_gates(self):
        summary = self.view("summary")
        counts = {row["kind"]: row["events"] for row in summary["groups"]}
        self.assertEqual(counts, {"confirmed_reboot": 1, "power_off": 1, "suspected_power_loss": 1})
        counted = self.view("accounted")["counts"]
        self.assertEqual(counted["denominator"], 2)
        self.assertEqual(counted["reboots"], 1)
        self.assertEqual(counted["suspectedOnly"], 0)
        self.assertFalse(self.view("summary", {"domain": "B"})["groups"])
        self.assertIn("unknown_start", {row["kind"] for row in self.view("summary", {"logSilenceMinutes": 180})["groups"]})

    def test_filter_options_use_actual_sr_and_cascade_without_fictitious_types(self):
        with closing(self.model.connect(self.workspace)) as c,c:
            self.model.put(c,"inventoryDevices",[{"id":"control","nameRaw":"Control","modelRaw":"IPL Pro",
                "manufacturerRaw":"Extron","category":"controller","inCurrentSr":True,"domain":"C"}])
        values=lambda data,key:{row["value"] for row in data[key]}
        all_options=self.view("facets")
        self.assertEqual(values(all_options,"categories"),{"vcs","controller"})
        self.assertEqual(values(all_options,"manufacturers"),{"huawei","polycom","extron"})
        vcs=self.view("facets",{"category":"vcs"})
        self.assertEqual(values(vcs,"manufacturers"),{"huawei","polycom"})
        self.assertNotIn("ipl pro",values(vcs,"models"))
        huawei=self.view("facets",{"category":"vcs","manufacturer":"huawei"})
        self.assertEqual(values(huawei,"models"),{"te40","bar 310"})
        narrowed=self.view("facets",{"domain":"A","category":"vcs","manufacturer":"huawei"})
        self.assertEqual(values(narrowed,"models"),{"te40"})
        invalid=self.view("facets",{"category":"controller","manufacturer":"huawei","model":"te40"})
        self.assertEqual(invalid["selected"],{"category":"controller"})
        self.assertEqual(values(invalid,"manufacturers"),{"extron"})
        scoped=self.view("facets",{"scopeCategory":"vcs"})
        self.assertEqual(values(scoped,"domains"),{"a","b"})
        self.assertEqual(scoped["selected"]["category"],"vcs")

    def test_event_queries_use_selected_device_index_and_keep_sr_only_facets(self):
        with closing(self.model.connect(self.workspace)) as c:
            sql,args=self.model.cte(c,{"model":"TE40"},True)
            details=[row["detail"] for row in c.execute("EXPLAIN QUERY PLAN "+sql+" SELECT event_kind,count(*) FROM events GROUP BY event_kind",args)]
            self.assertTrue(any("SEARCH e USING COVERING INDEX rm_idx_event_scope" in detail and "device=?" in detail for detail in details),details)
            old=sql.replace("FROM devices d CROSS JOIN rm_records e INDEXED BY rm_idx_event_scope ON d.key=e.device","FROM rm_records e JOIN devices d ON d.key=e.device")
            query=" SELECT event_kind,count(*),count(DISTINCT device) FROM events GROUP BY event_kind"
            self.assertEqual([tuple(row) for row in c.execute(sql+query,args)],[tuple(row) for row in c.execute(old+query,args)])
        with patch.object(self.model,"cte",wraps=self.model.cte) as calls:
            self.view("facets",{"model":"TE40"})
            self.assertTrue(all(len(call.args)<3 or call.args[2] is False for call in calls.call_args_list))

    def test_prepare_adds_analytics_index_to_existing_database_without_reimport_or_revision_change(self):
        with closing(self.model.connect(self.workspace)) as c,c:
            c.execute("DROP INDEX rm_idx_event_scope") # This test owns its temporary database.
            before=[tuple(row) for row in c.execute("SELECT label,key,checksum FROM rm_records ORDER BY label,key")]
        self.assertTrue(self.model.prepare(self.workspace)["ready"])
        self.assertEqual(self.model.bootstrap(self.workspace)["revision"],self.revision)
        with closing(self.model.connect(self.workspace)) as c:
            self.assertIsNotNone(c.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='rm_idx_event_scope'").fetchone())
            self.assertEqual(before,[tuple(row) for row in c.execute("SELECT label,key,checksum FROM rm_records ORDER BY label,key")])

    def test_facets_read_large_sr_payload_only_once_and_use_compact_temporary_scope(self):
        with closing(self.model.connect(self.workspace)) as c,c:
            self.model.put(c,"inventoryDevices",[{"id":"large-sr","nameRaw":"Synthetic","manufacturerRaw":"Huawei","category":"vcs",
                "modelRaw":"TE40","domain":"Synthetic","inCurrentSr":True,"rawRow":{"description":"x"*65536}}])
            statements=[];c.set_trace_callback(statements.append)
            result=self.model.filter_options(c,{})
            c.set_trace_callback(None)
            source_passes=[sql for sql in statements if "FROM rm_records d" in sql]
            self.assertEqual(len(source_passes),1,"Шесть списков не должны перечитывать большие SR payload шестью проходами")
            columns={row["name"] for row in c.execute("PRAGMA temp.table_info(rm_filter_scope)")}
            self.assertNotIn("payload",columns);self.assertNotIn("rawRow",columns)
            self.assertIn("domain",columns);self.assertIn("manufacturer_label",columns)
            self.assertIn("synthetic",{row["value"] for row in result["domains"]})

    def test_inventory_versions_and_errors_are_paged_and_newest_failed_site_is_empty(self):
        result = self.view("inventory", {"deviceId": "te"})
        self.assertEqual(result["rows"][0]["status"], "authorization_error")
        self.assertEqual(result["rows"][0]["siteName"], "")
        versions = self.view("firmware-versions")["rows"]
        self.assertEqual(versions[0]["change"], "changed")
        self.assertEqual(versions[0]["previous"], "1")
        self.assertEqual(self.view("connection-errors")["rows"][0]["cases"], 1)
        with self.assertRaises(WorkspaceError):
            self.view("events", size=1000)
        for raw,expected in [(1e-7,"1e-7"),(0.000001,"0.000001"),(1e21,"1e+21"),(1.0,"1"),("001","001")]:
            self.assertEqual(version_value({"webBlocks":{"Firmware":{"Version":raw}}},"Firmware"),expected)

    def test_durable_staging_cannot_replace_published_data_until_finished(self):
        token = self.model.begin(self.workspace, self.revision, "logs")["token"]
        event = {"id": "e", "deviceId": "te", "ip": "192.0.2.40", "kind": "confirmed_reboot", "deviceLocalTime": "2026-02-01 12:00:00"}
        self.model.batch(self.workspace, token, "events:te", [event])
        self.assertEqual(self.view("summary")["groups"][0]["events"], 1)
        finished = self.model.finish(self.workspace, token, "a" * 64)
        with self.assertRaises(WorkspaceError):
            self.view("summary")
        self.revision = finished["revision"]
        reboot = next(row for row in self.view("summary")["groups"] if row["kind"] == "confirmed_reboot")
        self.assertEqual(reboot["events"], 2)
        with self.assertRaises(WorkspaceError):
            self.store.commit(1, fixture())

    def test_publish_progress_counts_batches_and_reaches_100_only_after_commit(self):
        token=self.model.begin(self.workspace,self.revision,"logs")["token"]
        for label in ("logRows","logRegistry"):
            for start in range(0,2550,500):
                self.model.batch(self.workspace,token,label,[{"id":f"progress-{i}","path":f"synthetic-{i}.xml"} for i in range(start,min(start+500,2550))])
        progress=[]
        def report(value):
            progress.append(value)
            if value["status"]=="completed":
                self.assertNotEqual(self.model.bootstrap(self.workspace)["revision"],self.revision)
            else:self.assertLess(value["percent"],100)
        self.model.finish(self.workspace,token,on_progress=report)
        self.assertEqual(progress[-1]["percent"],100)
        self.assertEqual(progress[-1]["status"],"completed")
        self.assertEqual([p["percent"] for p in progress],sorted(p["percent"] for p in progress))
        copying=[p for p in progress if p["stage"]=="records"]
        self.assertGreaterEqual(len(copying),3)
        self.assertEqual(copying[-1]["processed"],5100)
        counts=self.model.bootstrap(self.workspace)["counts"]
        self.assertEqual(counts["logRows"],2550)
        self.assertEqual(counts["logRegistry"],2550)

    def test_publish_progress_failure_rolls_back_and_retains_staging(self):
        token=self.model.begin(self.workspace,self.revision,"logs")["token"]
        self.model.batch(self.workspace,token,"logRows",[{"id":"not-published","path":"synthetic.xml"}])
        def fail(value):
            if value["stage"]=="records" and value["processed"]:raise RuntimeError("synthetic observer error")
        with self.assertRaises(RuntimeError):self.model.finish(self.workspace,token,on_progress=fail)
        self.assertEqual(self.model.bootstrap(self.workspace)["revision"],self.revision)
        with closing(self.model.connect(self.workspace)) as c:
            self.assertEqual(c.execute("SELECT count(*) FROM rm_staging WHERE batch=?",(token,)).fetchone()[0],1)

    def test_json_rebuild_uses_narrow_index_without_analyze_and_preserves_conflicts(self):
        from mvp_runtime.read_model import JSON_BOOT_OBSERVATIONS_SQL
        def poll(key,minute,digest="b",device="te"):
            return {"id":key,"deviceId":device,"parseStatus":"parsed","matchStatus":"matched","pollStatus":"success",
                    "capturedAt":f"2026-02-01T10:{minute:02}:00Z","rawSha256":digest*64,
                    "normalizedData":{"webBlocks":{"Device Status":{"Uptime Seconds":100}}}}
        with closing(self.model.connect(self.workspace)) as c,c:
            self.model.put(c,"pollingResults",[poll("equal-a",1),poll("equal-b",1),poll("conflict-a",2),poll("conflict-b",2,"c"),poll("unique",3),poll("unmatched",4,device="absent")])
            details=[row["detail"] for row in c.execute("EXPLAIN QUERY PLAN "+JSON_BOOT_OBSERVATIONS_SQL)]
            self.assertTrue(any("conflicting USING INDEX rm_idx_observation" in detail and "device=?" in detail and "<expr>=?" in detail for detail in details),details)
            original=JSON_BOOT_OBSERVATIONS_SQL.replace(" INDEXED BY rm_idx_observation","")
            expected=[tuple(row) for row in c.execute(original)]
            result=[tuple(row) for row in c.execute(JSON_BOOT_OBSERVATIONS_SQL)]
            self.assertEqual(result,expected)
            self.assertEqual({row[0] for row in result},{"equal-a","unique"})

    def test_interrupted_json_publish_reopens_and_reuses_saved_file_without_source_read(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        row={**fixture()["state"]["pollingResults"][0],"id":"saved-stage","runId":"synthetic-run","filename":"192.0.2.40.json","rawSha256":"c"*64,
             "sourceRelativePath":"synthetic/2026-02-01_10-00-00/192.0.2.40.json","sourceFileSize":4096,"sourceFileLastModified":1234,"sourcePrefixSha256":"d"*64}
        self.model.batch(self.workspace,token,"pollingResults",[row])
        self.model.batch(self.workspace,token,"pollingRuns",[{"id":"synthetic-run","capturedAt":"2026-02-01T10:00:00Z"}])
        def interrupt(value):
            if value["stage"]=="records":raise RuntimeError("synthetic interrupted publication")
        with self.assertRaises(RuntimeError):self.model.finish(self.workspace,token,on_progress=interrupt)
        reopened=ReadModel(WorkspaceStore(self.store.locator_path,self.store.project_root))
        self.assertEqual(reopened.bootstrap(self.workspace)["revision"],self.revision)
        self.assertEqual(reopened.begin(self.workspace,self.revision,"json")["token"],token)
        descriptor={"path":row["sourceRelativePath"],"size":4096,"mtime":1234,"prefix":"d"*64}
        self.assertEqual(reopened.files(self.workspace,[descriptor]),[True])
        self.assertIn("synthetic-run",[r["id"] for r in reopened.context(self.workspace,self.revision,"pollingRuns")["rows"]])
        reopened.finish(self.workspace,token,on_progress=lambda _:None)
        self.assertEqual(reopened.files(self.workspace,[descriptor]),[True])
        with closing(reopened.connect(self.workspace)) as c:
            self.assertEqual(c.execute("SELECT count(*) FROM rm_records WHERE label='pollingResults' AND key='saved-stage'").fetchone()[0],1)

    def test_big_event_page_has_bounded_response_and_complete_aggregates(self):
        with closing(self.model.connect(self.workspace)) as c, c:
            self.model.put(c, "events:te", [{"id": f"bulk-{i}", "deviceId": "te", "ip": "192.0.2.40",
                "kind": "confirmed_reboot", "deviceLocalTime": f"2026-03-{1+i//3600:02} 10:{i//60%60:02}:{i%60:02}"} for i in range(10000)])
        result = self.view("events", size=50)
        self.assertEqual(len(result["rows"]), 50)
        self.assertTrue(result["hasNext"])
        self.assertLess(len(encode(result).encode()), 64 * 1024)
        next_page = self.view("events", page=1, size=50)
        self.assertFalse({row["key"] for row in result["rows"]} & {row["key"] for row in next_page["rows"]})
        summary = self.view("summary")
        reboot = next(row for row in summary["groups"] if row["kind"] == "confirmed_reboot")
        self.assertEqual(reboot["events"], 10001)

    def test_sr_publish_preserves_poll_history_and_marks_old_log_binding_stale(self):
        token=self.model.begin(self.workspace,self.revision,"sr")["token"]
        source=fixture()
        self.model.batch(self.workspace,token,"inventoryDevices",source["state"]["inventoryDevices"])
        self.model.batch(self.workspace,token,"locations",source["state"]["locations"])
        self.model.batch(self.workspace,token,"srImports",[{"id":"new-sr","rawSha256":"b"*64,"importedAt":"2026-04-01"}])
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual(self.view("polls",{"deviceId":"te"})["rows"].__len__(),3)
        self.assertFalse(self.view("summary")["groups"])

    def test_json_staging_resume_reuses_run_and_does_not_publish_partial_records(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        result={**fixture()["state"]["pollingResults"][0],"id":"pending-poll","runId":"pending-run",
                "sourceRelativePath":"synthetic/result.json","sourceFileSize":123,"sourceFileLastModified":456,"sourcePrefixSha256":"c"*64}
        self.model.batch(self.workspace,token,"pollingResults",[result])
        self.model.batch(self.workspace,token,"pollingRuns",[{"id":"pending-run","identityKey":"synthetic-run"}])
        self.assertEqual(self.model.begin(self.workspace,self.revision,"json")["token"],token)
        self.assertTrue(self.model.files(self.workspace,[{"path":"synthetic/result.json","size":123,"mtime":456,"prefix":"c"*64}])[0])
        self.assertEqual(self.model.context(self.workspace,self.revision,"pollingRuns")["rows"][0]["id"],"pending-run")
        self.assertEqual(self.model.bootstrap(self.workspace)["counts"]["pollingResults"],3)
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual(self.model.bootstrap(self.workspace)["counts"]["pollingResults"],4)

    def test_site_alias_is_exact_and_explicit_unavailable_prevents_old_value_fallback(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        result={"id":"poly-poll","deviceId":"poly","matchStatus":"matched","parseStatus":"parsed","pollStatus":"success",
                "capturedAt":"2026-05-01","normalizedData":{"webBlocks":{"Device Info":{"Model":"RealPresence Group 310","System Name":"Synthetic alias"}}}}
        self.model.batch(self.workspace,token,"pollingResults",[result])
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual(self.view("site-name",{"deviceId":"poly"})["rows"][0]["siteName"],"Synthetic alias")
        result={**result,"id":"poly-new","capturedAt":"2026-06-01","normalizedData":{**result["normalizedData"],"siteName":{"status":"unavailable","value":None}}}
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        self.model.batch(self.workspace,token,"pollingResults",[result])
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual(self.view("site-name",{"deviceId":"poly"})["rows"][0]["siteName"],"")

    def test_json_uptime_observations_are_streamed_clustered_separately(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        results=[]
        for index,(at,uptime) in enumerate([("2026-01-01T10:00:00Z",3600),("2026-01-01T11:00:00Z",7200),("2026-01-02T10:00:00Z",3600)]):
            results.append({"id":f"uptime-{index}","deviceId":"te","matchStatus":"matched","parseStatus":"parsed",
                "pollStatus":"success","capturedAt":at,"normalizedData":{"webBlocks":{"Device Status":{"Uptime Seconds":uptime}}}})
        self.model.batch(self.workspace,token,"pollingResults",results)
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual(self.view("summary",{"source":"json"})["groups"][0]["events"],2)
        self.assertEqual(next(row for row in self.view("summary",{"source":"logs"})["groups"] if row["kind"]=="confirmed_reboot")["events"],1)

    def test_neighbors_and_pair_removals_preserve_late_generic_changes(self):
        with closing(self.model.connect(self.workspace)) as c,c:
            self.model.put(c,"deviceChanges",[{"id":"old-pair","deviceId":"te","fromPollingResultId":"0","toPollingResultId":"1","oldValue":"1","newValue":"2"}])
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        incoming={"id":"late","deviceId":"te","capturedAt":"2026-01-01T12:00:00Z","parseStatus":"parsed","matchStatus":"matched","pollStatus":"success",
                  "normalizedData":{"webBlocks":{"Firmware":{"Version":"1.5"}}}}
        seed=self.model.neighbors(self.workspace,token,{key:incoming[key] for key in ("id","deviceId","capturedAt","parseStatus")})
        self.assertEqual([row["id"] for row in seed["rows"]],["0","1"])
        self.model.batch(self.workspace,token,"pollingResults",[incoming])
        self.model.remove_pairs(self.workspace,token,[["te","0","1"]])
        self.model.batch(self.workspace,token,"deviceChanges",[
            {"id":"a-late","deviceId":"te","fromPollingResultId":"0","toPollingResultId":"late","oldValue":"1","newValue":"1.5"},
            {"id":"late-b","deviceId":"te","fromPollingResultId":"late","toPollingResultId":"1","oldValue":"1.5","newValue":"2"}])
        with closing(self.model.connect(self.workspace)) as c:
            self.assertIsNotNone(c.execute("SELECT key FROM rm_records WHERE label='deviceChanges' AND key='old-pair'").fetchone())
        self.revision=self.model.finish(self.workspace,token)["revision"]
        with closing(self.model.connect(self.workspace)) as c:
            pairs=[row[0] for row in c.execute("SELECT key FROM rm_records WHERE label='deviceChanges' ORDER BY key")]
        self.assertEqual(pairs,["a-late","late-b"])

    def test_future_events_are_excluded_from_rolling_period_and_duration_skips_equal_time_start(self):
        token=self.model.begin(self.workspace,self.revision,"logs")["token"]
        self.model.batch(self.workspace,token,"events:te",[
            {"id":"future","deviceId":"te","ip":"192.0.2.40","kind":"confirmed_reboot","deviceLocalTime":"2099-01-01 10:00:00"},
            {"id":"same-time","deviceId":"te","ip":"192.0.2.40","kind":"start_after_shutdown","deviceLocalTime":"2026-01-02 10:00:00"}])
        self.revision=self.model.finish(self.workspace,token,"a"*64)["revision"]
        self.assertNotIn("future",{row["key"] for row in self.view("events",{"period":"7d"})["rows"]})
        intervals=self.view("duration-rows",{"durationBucket":1,"source":"all"})["rows"]
        self.assertEqual(intervals[0]["seconds"],86400)
        self.assertEqual(intervals[0]["basis"],"confirmed")

    def test_export_honors_hour_drilldown_and_retains_device_metadata(self):
        rows=self.view("export-devices",{"kind":"confirmed_reboot","hour":11,"accounted":True})["rows"]
        self.assertEqual(rows,[])
        rows=self.view("export-devices",{"kind":"confirmed_reboot","hour":10,"accounted":True})["rows"]
        self.assertEqual(rows[0]["model"],"TE40")
        self.assertEqual(rows[0]["domain"],"A")
        self.assertEqual(rows[0]["vip"],1)

    def test_evidence_count_grows_beyond_visible_samples_without_duplicate_increment(self):
        for first,last in ((0,25),(24,26)):
            token=self.model.begin(self.workspace,self.revision,"logs")["token"]
            for index in range(first,last):
                event={"id":"a","deviceId":"te","ip":"192.0.2.40","kind":"confirmed_reboot","deviceLocalTime":"2026-01-01 10:00:00",
                       "sources":[{"path":f"synthetic/{index}.xml","line":7}],"sourceCount":1}
                self.model.batch(self.workspace,token,"events:te",[event])
            self.revision=self.model.finish(self.workspace,token,"a"*64)["revision"]
        payload=json.loads(self.view("events")["rows"][0]["payload"])
        self.assertEqual(payload["sourceCount"],26)
        self.assertEqual(len(payload["sources"]),16)
        self.assertFalse(payload.get("sourceCountIsMinimum",False))

    def test_latest_audit_result_by_ip_does_not_fall_back_after_failure(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        rows=[{**fixture()["state"]["pollingResults"][0],"id":"audit-old","filenameIp":"192.0.2.40","capturedAt":"2027-01-01"},
              {**fixture()["state"]["pollingResults"][0],"id":"audit-new","filenameIp":"192.0.2.40","capturedAt":"2027-01-02","pollStatus":"authorization_error"}]
        self.model.batch(self.workspace,token,"pollingResults",rows)
        self.revision=self.model.finish(self.workspace,token)["revision"]
        result=self.model.latest(self.workspace,self.revision,["192.0.2.40"])["rows"]
        self.assertEqual(result[0]["id"],"audit-new")
        self.assertEqual(result[0]["pollStatus"],"authorization_error")

    def test_paged_migration_resumes_without_restarting_completed_parts(self):
        header=fixture()
        header["state"]["pollingResults"]=[]
        header["log"]["indexes"]["te"]["events"]=[]
        token=self.store.begin_parts(self.workspace,1)["upload"]
        first=encode({"meta":header})
        self.store.write_part(self.workspace,token,0,sha256(first.encode()).hexdigest(),first)
        for part in range(8):
            rows=[{"id":f"migrated-{i}","deviceId":"te","ip":"192.0.2.40","kind":"confirmed_reboot",
                   "deviceLocalTime":f"2026-05-01 10:{i//60:02}:{i%60:02}"} for i in range(part*30,(part+1)*30)]
            body=encode({"key":"log/indexes/te/events","offset":part*30,"rows":rows})
            self.store.write_part(self.workspace,token,part+1,sha256(body.encode()).hexdigest(),body)
        self.store.finish_parts(self.workspace,token,9)
        progress=self.model.prepare(self.workspace)
        self.assertEqual(progress["processed"],4)
        self.assertFalse(progress["ready"])
        restarted=ReadModel(WorkspaceStore(self.store.locator_path,self.store.project_root))
        progress=restarted.prepare(self.workspace)
        self.assertEqual(progress["processed"],8)
        self.assertTrue(restarted.prepare(self.workspace)["ready"])
        self.model=restarted;self.revision=self.model.bootstrap(self.workspace)["revision"]
        self.assertEqual(self.view("summary")["groups"][0]["events"],240)

    def test_neighbor_batch_does_not_invent_a_missing_file_timestamp(self):
        token=self.model.begin(self.workspace,self.revision,"json")["token"]
        result={"id":"unknown-time","deviceId":"te","capturedAt":None,"parseStatus":"parsed"}
        seeds=self.model.neighbor_batch(self.workspace,token,[result])["seeds"]
        self.assertFalse(seeds[0]["duplicate"])
        self.assertEqual(seeds[0]["rows"],[])

    def test_inventory_advanced_filters_keep_history_status_changes_and_mac_search(self):
        token=self.model.begin(self.workspace,self.revision,"sr")["token"]
        rows=fixture()["state"]["inventoryDevices"]
        rows[0]["macNormalized"]="02:00:00:00:00:40"
        rows.append({**rows[0],"id":"old","nameRaw":"Historical","ipNormalized":"192.0.2.99","inCurrentSr":False})
        self.model.batch(self.workspace,token,"inventoryDevices",rows)
        self.model.batch(self.workspace,token,"locations",fixture()["state"]["locations"])
        self.revision=self.model.finish(self.workspace,token)["revision"]
        self.assertEqual([r["id"] for r in self.view("inventory",{"current":"no"})["rows"]],["old"])
        self.assertEqual([r["id"] for r in self.view("inventory",{"status":"authorization_error"})["rows"]],["te"])
        self.assertEqual([r["id"] for r in self.view("inventory",{"search":"00:40"})["rows"]],["te"])
        self.assertEqual(len(self.view("inventory",{"changed":"no"})["rows"]),3)
        self.assertFalse(self.view("inventory",{"changed":"yes"})["rows"])

    def test_read_transaction_does_not_mix_two_published_revisions(self):
        with closing(self.model.connect(self.workspace)) as reader:
            reader.execute("BEGIN")
            self.assertEqual(self.model.revision(reader),self.revision)
            token=self.model.begin(self.workspace,self.revision,"logs")["token"]
            self.model.batch(self.workspace,token,"events:te",[{"id":"new","deviceId":"te","ip":"192.0.2.40","kind":"confirmed_reboot","deviceLocalTime":"2026-06-01 10:00:00"}])
            published=self.model.finish(self.workspace,token,"a"*64)["revision"]
            old=self.model._view(reader,"summary",{},0,50)
            self.assertEqual(next(row for row in old["groups"] if row["kind"]=="confirmed_reboot")["events"],1)
        self.revision=published
        self.assertEqual(next(row for row in self.view("summary")["groups"] if row["kind"]=="confirmed_reboot")["events"],2)


if __name__ == "__main__":
    unittest.main()
