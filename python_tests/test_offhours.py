"""Synthetic out-of-hours cohorts; no real inventory or device requests."""
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path

from mvp_runtime.read_model import ReadModel
from mvp_runtime.workspace import WorkspaceError, WorkspaceStore
from mvp_runtime.rf_calendar import day_kind, period_bounds
from python_tests.test_read_model import fixture


class CalendarTests(unittest.TestCase):
    def test_holidays_weekends_and_transferred_workdays(self):
        for stamp, expected in [("2026-11-04", "holiday"), ("2026-11-07", "weekend"),
                                ("2026-11-02", "workday"), ("2025-11-01", "workday"),
                                ("2025-11-03", "holiday"), ("2026-03-09", "holiday"),
                                ("2027-02-20", "workday"), ("2027-02-22", "holiday")]:
            self.assertEqual(day_kind(datetime.fromisoformat(stamp).date()), expected)
        with self.assertRaises(WorkspaceError):
            day_kind(datetime(2028, 1, 1).date())

    def test_two_calendar_months_clamp_and_custom_future_cutoff(self):
        start, end = period_bounds({}, datetime(2026, 4, 30, 12, 30))
        self.assertEqual(start, datetime(2026, 2, 28))
        self.assertEqual(end, datetime(2026, 4, 30, 12, 30))
        start, end = period_bounds({"period":"custom", "dateFrom":"2026-11-01", "dateTo":"2026-12-01"}, datetime(2026, 11, 23, 10))
        self.assertEqual(end, datetime(2026, 11, 23, 10))
        for filters in [{"period":"all"}, {"period":"custom","dateFrom":"2026-11-31","dateTo":"2026-12-01"}]:
            with self.assertRaises(WorkspaceError): period_bounds(filters, datetime(2026, 11, 23))
        fixed={"period":"2m","offhoursUntil":"2026-11-23 10:00:00"}
        self.assertEqual(period_bounds(fixed,datetime(2026,11,24)),(datetime(2026,9,23),datetime(2026,11,23,10)))

    def test_verified_year_totals_and_exclusive_new_year_boundary(self):
        for year,working in ((2024,248),(2025,247),(2026,247),(2027,247)):
            at=datetime(year,1,1).date();total=0
            while at.year==year:
                total+=day_kind(at)=="workday";at+=timedelta(days=1)
            self.assertEqual(total,working)
        start,end=period_bounds({"period":"custom","dateFrom":"2027-12-01","dateTo":"2027-12-31"},datetime(2028,1,1))
        self.assertEqual(end,datetime(2028,1,1))


class OffhoursTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name);(root/"project").mkdir();(root/"workspace").mkdir()
        self.store=WorkspaceStore(root/"profile"/"path.json",root/"project")
        self.workspace=self.store.select(root/"workspace")["workspaceId"]
        data=fixture(); base=data["state"]["inventoryDevices"][0]
        names=["zero","once","many","suspected","unknown","normal","historical","controller","wrong-ip","provisional"]
        devices=[{**base,"id":name,"nameRaw":name,"ipNormalized":f"192.0.2.{i+1}"} for i,name in enumerate(names)]
        devices[5]["equipmentOverallStatus"]="Норма";devices[6]["inCurrentSr"]=False;devices[7]["category"]="controller"
        data["state"]["inventoryDevices"]=devices
        data["state"]["pollingResults"]=[]
        def event(device, kind, stamp="2026-11-02 18:00:00", **extra):
            return {"id":f"{device}-{kind}-{stamp}","deviceId":device,"kind":kind,"deviceLocalTime":stamp,
                    "ip":next(row["ipNormalized"] for row in devices if row["id"]==device),**extra}
        events=[event("zero","confirmed_reboot"),event("once","power_off"),
                event("many","power_off"),event("many","power_off","2026-11-04 12:00:00"),
                event("suspected","unknown_start",silenceGap={"seconds":7200}),
                event("wrong-ip","power_off",ip="192.0.2.254"),
                event("provisional","power_off",validationStatus="provisional_user_validation")]
        events += [event(name,"power_off") for name in ("normal","historical","controller")]
        data["log"]["indexes"]["te"]["events"]=events
        self.store.commit(0,data);self.model=ReadModel(self.store);self.model.prepare(self.workspace)
        self.revision=self.model.bootstrap(self.workspace)["revision"]

    def view(self, **filters):
        return self.model.view(self.workspace,self.revision,"offhours",{"period":"custom","dateFrom":"2026-11-01","dateTo":"2026-11-08",**filters})

    def test_disjoint_zero_once_many_suspected_and_unknown_status_gates(self):
        result=self.view(); groups={row["group"]:row["devices"] for row in result["groups"]}
        self.assertEqual(result["denominator"],7)
        self.assertEqual(groups,{"none":1,"once":1,"repeated":1,"suspected":1,"unknown":3})
        self.assertEqual(sum(groups.values()),7)
        rows={row["device"]:row for row in result["rows"]}
        self.assertEqual(rows["zero"]["confirmed"],0);self.assertEqual(rows["zero"]["reboots"],1)
        self.assertEqual(rows["once"]["confirmed"],1);self.assertEqual(rows["many"]["confirmed"],2)
        self.assertEqual(rows["suspected"]["suspected"],1);self.assertEqual(rows["unknown"]["observedEvents"],0)
        self.assertNotIn("payload",rows["once"])

    def test_group_day_hour_and_calendar_filters_do_not_reclassify_one_event(self):
        result=self.view(offhoursGroup="once")
        self.assertEqual([row["device"] for row in result["rows"]],["once"])
        self.assertEqual(result["matchedDevices"],1)
        self.assertEqual(len(result["cells"]),1)
        self.assertEqual(result["cells"][0]["hour"],18)
        self.assertEqual(self.view(offhoursGroup="once",day=0,hour=18)["rows"][0]["confirmed"],1)
        self.assertFalse(self.view(offhoursGroup="once",day=0,hour=19)["rows"])
        self.assertEqual(self.view(offhoursTime="holiday",offhoursGroup="once")["rows"][0]["device"],"many")
        self.assertEqual(self.view(domain="not-present")["denominator"],0)
        self.assertFalse(self.view(source="json")["rows"]==[]) # caller cannot replace logs with JSON

    def test_time_boundaries_future_and_unconfirmed_gaps(self):
        stamps=["2026-11-02 06:59:59","2026-11-02 07:00:00","2026-11-02 17:59:59","2026-11-02 18:00:00",
                "2026-11-04 12:00:00","2026-11-07 12:00:00","2026-11-09 00:00:00"]
        with closing(self.model.connect(self.workspace)) as c,c:
            c.execute("DELETE FROM rm_records WHERE label GLOB 'events:*'")
            self.model.put(c,"events:te",[{"id":str(i),"deviceId":"zero","ip":"192.0.2.1","kind":"power_off","deviceLocalTime":stamp} for i,stamp in enumerate(stamps)])
        result=self.view(deviceId="zero")
        self.assertEqual(result["rows"][0]["confirmed"],4)
        self.assertEqual(self.view(deviceId="zero",offhoursTime="night")["rows"][0]["confirmed"],2)
        for invalid in ({"offhoursGroup":"bogus"},{"offhoursTime":"bogus"},{"hour":24},{"day":7},{"offhoursMetric":"bogus"}):
            with self.assertRaises(WorkspaceError):self.view(**invalid)

    def test_read_only_paging_and_unknown_calendar_year(self):
        before=self.model.bootstrap(self.workspace)["revision"]
        page=self.model.view(self.workspace,self.revision,"offhours",{"period":"custom","dateFrom":"2026-11-01","dateTo":"2026-11-08"},size=1)
        self.assertEqual(len(page["rows"]),1);self.assertTrue(page["hasNext"])
        self.assertEqual(before,self.model.bootstrap(self.workspace)["revision"])
        with self.assertRaises(WorkspaceError):self.view(dateFrom="2023-01-01",dateTo="2023-01-02")

    def test_fixed_period_pages_reuse_compact_totals_not_source_events(self):
        first=self.view()
        filters={"period":"custom","dateFrom":"2026-11-01","dateTo":"2026-11-08","offhoursUntil":first["period"]["toExclusive"]}
        with closing(self.model.connect(self.workspace)) as c:
            trace=[];c.set_trace_callback(trace.append)
            page=self.model.offhours(c,filters,1,2)
            self.assertEqual(len(page["rows"]),2)
            self.assertFalse(any("CREATE TEMP TABLE rm_offhours_events" in query for query in trace))

    def test_local_log_period_uses_covering_index_without_event_payload(self):
        with closing(self.model.connect(self.workspace)) as c:
            sql,args=self.model.cte(c,{"source":"logs","period":"custom","dateFrom":"2026-11-01","dateTo":"2026-11-08"},True)
            plan=[row["detail"] for row in c.execute("EXPLAIN QUERY PLAN "+sql+" SELECT stamp,event_kind,device FROM events",args)]
            self.assertTrue(any("COVERING INDEX rm_idx_event_scope" in step for step in plan),plan)
            mixed,mixed_args=self.model.cte(c,{"source":"all","period":"custom","dateFrom":"2026-11-01","dateTo":"2026-11-08"},True)
            new=[tuple(row) for row in c.execute(sql+" SELECT device,stamp,event_kind FROM events ORDER BY device,stamp,event_kind",args)]
            old=[tuple(row) for row in c.execute(mixed+" SELECT device,stamp,event_kind FROM events WHERE label!='events:json' ORDER BY device,stamp,event_kind",mixed_args)]
            self.assertEqual(new,old)


if __name__=="__main__":unittest.main()
