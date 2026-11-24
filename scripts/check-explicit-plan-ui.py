"""Real loopback API + browser; synthetic inventory, credentials and adapter only."""
import http.client
import json
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
from http.cookies import SimpleCookie
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from mvp_runtime.server import create_server
from mvp_runtime.polling_job import create_polling_job
from mvp_runtime.read_model import ReadModel

with tempfile.TemporaryDirectory(prefix="sphere-explicit-plan-") as folder:
    temp=Path(folder);(temp/"workspace").mkdir()
    server=create_server(ROOT,admin_verifier_path=temp/"admin.json",workspace_locator_path=temp/"locator.json")
    workspace=server.state.workspace_store.select(temp/"workspace")["workspaceId"]
    ReadModel(server.state.workspace_store).prepare(workspace)
    calls=[];plans=[]
    def adapter(device,credentials,options):
        calls.append({"ip":device["ipNormalized"],"json":options["collect_json"],"logs":options["collect_logs"],"tasks":options["management_tasks"][:]})
        return {"ok":True,"managementActions":[{"id":action,"status":"applied","changed":True,"writeAttempted":True,"before":"automatic","after":"manual"} for action in options["management_tasks"]]}
    def factory(settings):
        plans.append(settings["plan"])
        return create_polling_job({**settings,"ping":lambda *_:{"ok":True},"adapters":{"huawei_te20_web_cgi_v1":adapter}})
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    url=f"http://127.0.0.1:{server.server_port}"
    def request(method,path,value=None,cookie=None,csrf=None):
        connection=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=10)
        headers={"Host":f"127.0.0.1:{server.server_port}"}
        if cookie:headers["Cookie"]="mvp_sphere_session="+cookie
        if value is not None:headers.update({"Origin":url,"X-MVP-CSRF":csrf,"Content-Type":"application/json"})
        try:
            connection.request(method,path,json.dumps(value).encode() if value is not None else None,headers)
            response=connection.getresponse();return response.status,dict(response.getheaders()),response.read()
        finally:connection.close()
    try:
        status,headers,_=request("GET","/launch?token="+server.state.launch_token);assert status==303
        cookies=SimpleCookie();cookies.load(headers["Set-Cookie"]);cookie=cookies["mvp_sphere_session"].value
        status,_,body=request("GET","/api/session",cookie=cookie);csrf=json.loads(body)["csrfToken"]
        status,_,_=request("POST","/api/admin/setup",{"username":"synthetic-admin","password":secrets.token_urlsafe(24)},cookie,csrf);assert status==200
        with patch("mvp_runtime.server.create_polling_job",factory):
            preview=str(temp.parent/("sphere-plan-"+secrets.token_hex(4)+".png"))
            result=subprocess.run(["node",str(ROOT/"scripts/check-explicit-plan-ui.js")],input=json.dumps({"url":url,"cookie":cookie,"temp":str(temp),"preview":preview}),cwd=ROOT,text=True,encoding="utf-8",capture_output=True,timeout=90)
        if result.returncode:
            print(result.stderr,file=sys.stderr);raise SystemExit(result.returncode)
        assert len(plans)==1 and plans[0]["targetSourceSheets"]==["Первый","Второй"]
        assert len(calls)==2 and {call["ip"] for call in calls}=={"192.0.2.20","192.0.2.21"}
        assert all(not call["json"] and not call["logs"] and call["tasks"]==["set_te20_auto_answer_manual"] for call in calls)
        print(result.stdout.strip());print("PASS: real authenticated job executed only selected writes on selected-sheet targets; no vendor network");print(preview)
    finally:
        server.shutdown();server.server_close();thread.join(timeout=3)
