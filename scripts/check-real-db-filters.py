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
args=parser.parse_args()

with tempfile.TemporaryDirectory(prefix="sphere-real-filters-") as directory:
    temp=Path(directory);(temp/"workspace").mkdir()
    server=create_server(ROOT,admin_verifier_path=temp/"admin.json",workspace_locator_path=temp/"workspace-path.json")
    store=server.state.workspace_store;workspace=store.select(temp/"workspace")["workspaceId"]
    model=ReadModel(store);model.prepare(workspace)
    token=model.begin(workspace,model.bootstrap(workspace)["revision"],"sr")["token"]
    for first in range(0,5000,500):
        model.batch(workspace,token,"inventoryDevices",[{"id":f"synthetic-{i}","nameRaw":f"Synthetic terminal {i}","category":"vcs",
            "manufacturerRaw":"Huawei" if i%2==0 else "Polycom","modelRaw":"TE40" if i%2==0 else "RealPresence Group 310",
            "domain":f"Domain-{i%10}","locationId":f"loc-{i%100}","inCurrentSr":True,"equipmentOverallStatus":"Учёт",
            "rawRow":{"description":"x"*512}} for i in range(first,first+500)])
    model.batch(workspace,token,"locations",[{"id":f"loc-{i}","name":f"Synthetic room {i}","address":f"Synthetic address {i%10}"} for i in range(100)])
    model.batch(workspace,token,"srImports",[{"id":"synthetic-sr","rawSha256":"a"*64}])
    model.finish(workspace,token)
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
        if args.baseline:config["clientScript"]=subprocess.check_output(["git","show","9219d15:runtime/db-views.js"],cwd=ROOT,encoding="utf-8")
        result=subprocess.run(["node",str(ROOT/"scripts/check-real-db-filters.js")],input=json.dumps(config),
                              cwd=ROOT,text=True,encoding="utf-8",capture_output=True,timeout=90)
        if result.returncode:
            print(result.stderr or "Real browser test failed",file=sys.stderr)
            raise SystemExit(result.returncode)
        assert fingerprint()==before,"Browser query changed synthetic records"
        assert model.bootstrap(workspace)["revision"]==revision
        print(result.stdout.strip())
        print(json.dumps({"syntheticDatabaseUnchanged":True,"devices":5000}))
    finally:
        server.shutdown();server.server_close();thread.join(timeout=3)
