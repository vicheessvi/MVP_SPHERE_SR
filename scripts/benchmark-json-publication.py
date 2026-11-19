"""Synthetic JSON publication/recovery measurement. Never opens a user database."""
import argparse
import hashlib
import json
import sqlite3
import sys
import tempfile
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from mvp_runtime.read_model import ReadModel, JSON_BOOT_OBSERVATIONS_SQL
from mvp_runtime.workspace import WorkspaceStore

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--polls",type=int,default=25614)
args=parser.parse_args()
if args.polls<1:parser.error("--polls must be positive (this is not a production database limit)")

def output(**values):print(json.dumps(values),flush=True)
def ip(index):return f'{"192.0.2" if index<250 else "198.51.100"}.{1+index%250}'

with tempfile.TemporaryDirectory(prefix="sphere-json-publication-") as folder:
    root=Path(folder);(root/"project").mkdir();(root/"workspace").mkdir()
    store=WorkspaceStore(root/"profile.json",root/"project")
    workspace=store.select(root/"workspace")["workspaceId"]
    model=ReadModel(store);model.prepare(workspace)
    devices=min(500,args.polls)
    with closing(model.connect(workspace)) as c,c:
        model.put(c,"inventoryDevices",[{"id":f"synthetic-{i}","nameRaw":f"Synthetic terminal {i}","manufacturerRaw":"Huawei",
            "modelRaw":"TE40","category":"vcs","inCurrentSr":True,"ipNormalized":ip(i)} for i in range(devices)])
        model.put(c,"srImports",[{"id":"synthetic-sr","rawSha256":"a"*64}])
    revision=model.bootstrap(workspace)["revision"]
    token=model.begin(workspace,revision,"json")["token"]
    epoch=datetime(2026,1,1,tzinfo=timezone.utc)
    seed_started=time.perf_counter();sample_files=[]
    for first in range(0,args.polls,500):
        rows=[];changes=[]
        for i in range(first,min(first+500,args.polls)):
            path=f"synthetic/run-{i//devices:04d}/{ip(i%devices)}.json"
            rows.append({"id":f"poll-{i:09}","deviceId":f"synthetic-{i%devices}","parseStatus":"parsed","matchStatus":"matched","pollStatus":"success",
                "capturedAt":(epoch+timedelta(seconds=i*2)).isoformat(),"rawSha256":hashlib.sha256(f"synthetic-{i}".encode()).hexdigest(),
                "runId":f"synthetic-run-{i//devices}","filename":ip(i%devices)+".json","sourceRelativePath":path,
                "sourceFileSize":4096,"sourceFileLastModified":i,"sourcePrefixSha256":"b"*64,
                "normalizedData":{"webBlocks":{"Device Status":{"Uptime Seconds":100+i%37},"Firmware":{"Version":"2"},"Device Info":{"Model":"TE40"}},"syntheticPadding":"x"*2048}})
            changes.append({"id":f"change-{i:09}","deviceId":f"synthetic-{i%devices}","fromPollingResultId":f"poll-{max(0,i-devices):09}",
                "toPollingResultId":f"poll-{i:09}","path":"Firmware.Version","oldValue":"1","newValue":"2"})
            if i in (0,args.polls//2,args.polls-1):sample_files.append({"path":path,"size":4096,"mtime":i,"prefix":"b"*64})
        model.batch(workspace,token,"pollingResults",rows);model.batch(workspace,token,"deviceChanges",changes)
        if (first+500)%10000==0:output(staged=first+500,seconds=round(time.perf_counter()-seed_started,3))
    output(stagingSeconds=round(time.perf_counter()-seed_started,3),polls=args.polls)

    def interrupt(progress):
        if progress["stage"]=="records":raise RuntimeError("synthetic interruption before commit")
    try:model.finish(workspace,token,on_progress=interrupt)
    except RuntimeError:pass
    reopened=ReadModel(WorkspaceStore(store.locator_path,store.project_root))
    assert reopened.bootstrap(workspace)["revision"]==revision
    assert reopened.begin(workspace,revision,"json")["token"]==token
    assert all(reopened.files(workspace,sample_files))
    output(reopenedStaging=True,sampledFilesReusableWithoutBodyRead=len(sample_files))
    started=time.perf_counter();progress=[]
    reopened.finish(workspace,token,on_progress=lambda value:progress.append(value))
    publication_seconds=time.perf_counter()-started
    counts=reopened.bootstrap(workspace)["counts"]
    assert counts["pollingResults"]==args.polls and counts["deviceChanges"]==args.polls and counts["events:json"]==args.polls
    assert progress[-1]["percent"]==100
    output(publicationSeconds=round(publication_seconds,3),publishedPolls=counts["pollingResults"],publishedChanges=counts["deviceChanges"],calculatedEvents=counts["events:json"],progressUpdates=len(progress))

    with closing(reopened.connect(workspace)) as c:
        legacy=JSON_BOOT_OBSERVATIONS_SQL.replace(" INDEXED BY rm_idx_observation","")
        for name,query in (("legacyLookup",legacy),("indexedLookup",JSON_BOOT_OBSERVATIONS_SQL)):
            started=time.perf_counter();c.set_progress_handler(lambda:int(time.perf_counter()-started>3),10000)
            count=0;interrupted=False
            try:
                for _ in c.execute(query):count+=1
            except sqlite3.OperationalError as error:
                if error.sqlite_errorcode!=sqlite3.SQLITE_INTERRUPT:raise
                interrupted=True
            finally:c.set_progress_handler(None,0)
            if not interrupted:assert count==args.polls
            output(query=name,seconds=round(time.perf_counter()-started,3),safetyDeadlineReached=interrupted,
                   rows=None if interrupted else count,plan=[r["detail"] for r in c.execute("EXPLAIN QUERY PLAN "+query)])
