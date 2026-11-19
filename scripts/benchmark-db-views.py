"""Synthetic DB-first scale check; never opens a user's working database."""
import argparse
import json
import sys
import tempfile
import time
from hashlib import sha256
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mvp_runtime.read_model import ReadModel, encode
from mvp_runtime.workspace import WorkspaceStore

parser = argparse.ArgumentParser()
parser.add_argument("--events", type=int, default=1_000_000)
parser.add_argument("--snapshot",action="store_true")
args=parser.parse_args()
count = args.events
synthetic_ip=lambda index:f"10.249.{index//250}.{1+index%250}"
if not 1 <= count <= 5_000_000:
    raise SystemExit("Use 1..5000000 synthetic events for this benchmark.")
with tempfile.TemporaryDirectory(prefix="sphere-db-benchmark-") as folder:
    root = Path(folder)
    (root / "project").mkdir(); (root / "workspace").mkdir()
    store = WorkspaceStore(root / "profile.json", root / "project")
    workspace = store.select(root / "workspace")["workspaceId"]
    model = ReadModel(store); model.prepare(workspace)
    with closing(model.connect(workspace)) as c, c:
        model.put(c, "inventoryDevices", [{"id": f"te-{i}", "nameRaw": f"Synthetic TE {i}",
            "ipNormalized": synthetic_ip(i), "category": "vcs", "manufacturerRaw": "Huawei",
            "modelRaw": "TE40", "equipmentOverallStatus": "Учёт", "domain": "Synthetic", "locationId": "loc"}
            for i in range(5000)])
        model.put(c, "locations", [{"id": "loc", "name": "Synthetic room", "address": "Synthetic address"}])
        model.put(c, "srImports", [{"id": "sr", "rawSha256": "a"*64}])
        c.execute("INSERT OR REPLACE INTO rm_meta VALUES('header',?)",
                  (encode({"log": {"indexes": {"te": {"sourceSrSha256": "a"*64}}}}),))
    transfer=None
    if args.snapshot:
        devices=model.context(workspace,model.bootstrap(workspace)["revision"],"inventoryDevices")["rows"]
        # Supply the same full synthetic inventory as the native benchmark.
        devices=[{"id":f"te-{i}","nameRaw":f"Synthetic TE {i}","ipNormalized":synthetic_ip(i),
                  "category":"vcs","manufacturerRaw":"Huawei","modelRaw":"TE40","equipmentOverallStatus":"Учёт",
                  "domain":"Synthetic","locationId":"loc"} for i in range(5000)]
        header={"schemaVersion":1,"state":{"version":3,"inventoryDevices":devices,"locations":[{"id":"loc","name":"Synthetic room","address":"Synthetic address"}],
                "srImports":[{"id":"sr","rawSha256":"a"*64}],"pollingResults":[]},
                "log":{"rows":[],"registry":[],"indexes":{"te":{"sourceSrSha256":"a"*64,"events":[]}}}}
        transfer=store.begin_parts(workspace,0)["upload"]
        body=encode({"meta":header})
        store.write_part(workspace,transfer,0,sha256(body.encode()).hexdigest(),body)
    started = time.monotonic()
    for first in range(0, count, 1000):
        events = [{"id": f"synthetic-{i:09}", "deviceId": f"te-{i%5000}", "ip": synthetic_ip(i%5000),
                   "kind": "power_off" if i%20==0 else "unknown_start" if i%5==0 else "confirmed_reboot",
                   "deviceLocalTime": (datetime(2023,1,1)+timedelta(minutes=i)).strftime("%Y-%m-%d %H:%M:%S"),
                   "silenceGap": {"seconds": 7200} if i%5==0 and i%20 else None}
                  for i in range(first,min(count,first+1000))]
        if args.snapshot:
            body=encode({"key":"log/indexes/te/events","offset":first,"rows":events})
            store.write_part(workspace,transfer,1+first//1000,sha256(body.encode()).hexdigest(),body)
        else:
            with closing(model.connect(workspace)) as c, c:
                model.put(c,"events:te",events)
        if (first+1000)%100000==0:
            print(json.dumps({"inserted":first+1000,"elapsedSeconds":round(time.monotonic()-started,2)}),flush=True)
    if args.snapshot:
        store.finish_parts(workspace,transfer,1+(count+999)//1000)
        migration=time.monotonic()
        while True:
            progress=model.prepare(workspace)
            if progress["processed"]%100==0:print(json.dumps({"migration":progress,"seconds":round(time.monotonic()-migration,2)}),flush=True)
            if progress["ready"]:break
        print(json.dumps({"migrationSeconds":round(time.monotonic()-migration,2)}),flush=True)
    revision=model.bootstrap(workspace)["revision"]
    for name in ("events","summary","accounted","heatmap","tops","duration","duration-rows","export-devices"):
        start=time.monotonic()
        result=model.view(workspace,revision,name,{},0,50)
        size=len(encode(result).encode())
        assert size<256*1024
        if name=="events": assert len(result["rows"])<=50
        if name=="summary": assert sum(row["events"] for row in result["groups"])==count
        print(json.dumps({"view":name,"seconds":round(time.monotonic()-start,3),"responseBytes":size}),flush=True)
    start=time.monotonic()
    result=model.view(workspace,revision,"events",{},min(10000,max(0,count//100-1)),50)
    print(json.dumps({"latePageSeconds":round(time.monotonic()-start,3),"rows":len(result["rows"])}),flush=True)
