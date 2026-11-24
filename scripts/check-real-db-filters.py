"""Isolated real Python/SQLite/browser test. Never reads the user's workspace/profile."""
import hashlib
import argparse
import http.client
import json
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
from contextlib import closing
from http.cookies import SimpleCookie

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from mvp_runtime.server import create_server
from mvp_runtime.read_model import ReadModel

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--baseline",action="store_true",help="Reproduce with the previous client from development Git history")
parser.add_argument("--offhours",action="store_true",help="Check VCS out-of-hours UI and Excel against real SQL")
parser.add_argument("--shutdown",action="store_true",help="Check a real interrupted shutdown-rules upgrade and resume")
args=parser.parse_args()

with tempfile.TemporaryDirectory(prefix="sphere-real-filters-") as directory:
    temp=Path(directory);(temp/"workspace").mkdir()
    server=create_server(ROOT,admin_verifier_path=temp/"admin.json",workspace_locator_path=temp/"workspace-path.json")
    store=server.state.workspace_store;workspace=store.select(temp/"workspace")["workspaceId"]
    model=ReadModel(store);model.prepare(workspace)
    token=model.begin(workspace,model.bootstrap(workspace)["revision"],"sr")["token"]
    for first in range(0,1 if args.shutdown else 5000,500):
        model.batch(workspace,token,"inventoryDevices",[{"id":f"synthetic-{i}","nameRaw":f"Synthetic terminal {i}","category":"vcs",
            "manufacturerRaw":"Huawei" if args.offhours or i%2==0 else "Polycom","modelRaw":"TE40" if args.offhours or i%2==0 else "RealPresence Group 310",
            "ipNormalized":f"198.18.{i//250}.{1+i%250}",
            "domain":f"Domain-{i%10}","locationId":f"loc-{i%100}","inCurrentSr":True,"equipmentOverallStatus":"Учёт",
            "rawRow":{"description":"x"*512}} for i in range(first,min(first+500,1 if args.shutdown else 5000))])
    model.batch(workspace,token,"locations",[{"id":f"loc-{i}","name":f"Synthetic room {i}","address":f"Synthetic address {i%10}"} for i in range(100)])
    model.batch(workspace,token,"srImports",[{"id":"synthetic-sr","rawSha256":"a"*64}])
    model.finish(workspace,token)
    if args.shutdown:
        sources=temp/"sources"
        token=model.begin(workspace,model.bootstrap(workspace)["revision"],"logs")["token"]
        for run,message,at in (("run-one","Controller command: Shut down","2026-11-01 18:01:00"),("run-two","System start","2026-11-02 07:00:00")):
            target=sources/run/"198.18.0.1.xml";target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(f"<?xml version='1.0'?><LogModule>\n[Info][Main] {at} LOG_MOD_{'CTL' if run=='run-one' else 'MC'} 7 {message}\n</LogModule>",encoding="utf-8")
            model.batch(workspace,token,"logRegistry",[{"path":f"sources/{run}/198.18.0.1.xml","format":"Huawei TE XML","deviceId":"synthetic-0","size":target.stat().st_size}])
        model.batch(workspace,token,"events:te",[{"id":"synthetic-0|start|2026-11-02 07:00:00","deviceId":"synthetic-0","ip":"198.18.0.1","kind":"unknown_start","deviceLocalTime":"2026-11-02 07:00:00","silenceGap":{"seconds":40000}}])
        model.finish(workspace,token,"a"*64)
    if args.offhours:
        token=model.begin(workspace,model.bootstrap(workspace)["revision"],"logs")["token"]
        for first in range(0,5000,500):
            events=[]
            for i in range(first,first+500):
                if i%5==4:continue
                event={"id":f"event-{i}","deviceId":f"synthetic-{i}","ip":f"198.18.{i//250}.{1+i%250}",
                       "kind":"confirmed_reboot" if i%5==0 else "unknown_start" if i%5==3 else "power_off",
                       "deviceLocalTime":"2026-11-02 18:00:00"}
                if i%5==3:event["silenceGap"]={"seconds":7200}
                events.append(event)
                if i%5==2:events.append({**event,"id":event["id"]+"-second","deviceLocalTime":"2026-11-04 12:00:00"})
            model.batch(workspace,token,"events:te",events)
        model.finish(workspace,token,"a"*64)
    def fingerprint():
        with closing(model.connect(workspace)) as c:
            return hashlib.sha256(json.dumps([tuple(r) for r in c.execute("SELECT label,key,checksum FROM rm_records ORDER BY label,key")]).encode()).hexdigest()
    before=fingerprint();revision=model.bootstrap(workspace)["revision"]
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    url=f"http://127.0.0.1:{server.server_port}"
    cookie_header=None;csrf=None
    def request(method,path,value=None):
        connection=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=10)
        headers={"Host":f"127.0.0.1:{server.server_port}"}
        if cookie_header:headers["Cookie"]=cookie_header
        if value is not None:headers.update({"Origin":url,"X-MVP-CSRF":csrf,"Content-Type":"application/json"})
        try:
            connection.request(method,path,json.dumps(value).encode() if value is not None else None,headers)
            response=connection.getresponse();body=response.read()
            return response.status,dict(response.getheaders()),body
        finally:connection.close()
    try:
        status,headers,_=request("GET",f"/launch?token={server.state.launch_token}")
        assert status==303,"Synthetic launch failed"
        cookies=SimpleCookie();cookies.load(headers["Set-Cookie"])
        cookie=cookies["mvp_sphere_session"].value;cookie_header="mvp_sphere_session="+cookie
        status,_,body=request("GET","/api/session");assert status==200
        csrf=json.loads(body)["csrfToken"]
        status,_,_=request("POST","/api/admin/setup",{"username":"synthetic-admin","password":secrets.token_urlsafe(24)})
        assert status==200,"Synthetic admin setup failed"
        config={"url":url,"cookie":cookie}
        if args.shutdown:config["sources"]=str(sources)
        if args.baseline:config["clientScript"]=subprocess.check_output(["git","show","9219d15:runtime/db-views.js"],cwd=ROOT,encoding="utf-8")
        result=subprocess.run(["node",str(ROOT/("scripts/check-shutdown-import-ui.js" if args.shutdown else "scripts/check-offhours-ui.js" if args.offhours else "scripts/check-real-db-filters.js"))],input=json.dumps(config),
                              cwd=ROOT,text=True,encoding="utf-8",capture_output=True,timeout=90)
        if result.returncode:
            print(result.stderr or "Real browser test failed",file=sys.stderr)
            raise SystemExit(result.returncode)
        assert (fingerprint()!=before) if args.shutdown else (fingerprint()==before),"Unexpected synthetic data changes"
        assert (model.bootstrap(workspace)["revision"]!=revision) if args.shutdown else (model.bootstrap(workspace)["revision"]==revision)
        print(result.stdout.strip())
        print(json.dumps({"syntheticDatabaseUnchanged":not args.shutdown,"devices":1 if args.shutdown else 5000}))
    finally:
        server.shutdown();server.server_close();thread.join(timeout=3)
