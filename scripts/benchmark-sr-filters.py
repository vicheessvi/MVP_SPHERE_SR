"""Development-only heavy SR facet check; no real workspace or source files."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from mvp_runtime.read_model import ReadModel,norm
from mvp_runtime.workspace import WorkspaceError

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--devices",type=int,default=5000)
parser.add_argument("--padding",type=int,default=32768)
parser.add_argument("--compare-previous",action="store_true",help="Requires development Git history e5a6b47")
args=parser.parse_args()
if args.devices<1 or args.padding<0:parser.error("Use positive device count and non-negative synthetic padding")
legacy=None
if args.compare_previous:
    source=subprocess.check_output(["git","show","e5a6b47:mvp_runtime/read_model.py"],cwd=ROOT,encoding="utf-8")
    cls=next(node for node in ast.parse(source).body if isinstance(node,ast.ClassDef) and node.name=="ReadModel")
    method=next(node for node in cls.body if isinstance(node,ast.FunctionDef) and node.name=="filter_options")
    namespace={"norm":norm,"WorkspaceError":WorkspaceError}
    exec(compile(ast.Module(body=[method],type_ignores=[]),"synthetic_legacy_filter_reference","exec"),namespace)
    legacy=namespace["filter_options"]

with sqlite3.connect(":memory:") as c:
    c.row_factory=sqlite3.Row;c.create_function("norm",1,norm,deterministic=True)
    c.execute("PRAGMA temp_store=FILE");ReadModel.init(c)
    ReadModel.put(c,"locations",[{"id":f"loc-{i}","name":f"Synthetic room {i}","address":f"Synthetic address {i%100}"} for i in range(min(args.devices,1000))])
    for start in range(0,args.devices,250):
        ReadModel.put(c,"inventoryDevices",[{"id":f"device-{i}","nameRaw":f"Synthetic terminal {i}","category":"vcs","domain":f"Domain-{i%10}",
            "manufacturerRaw":"Huawei" if i%2==0 else "Polycom","modelRaw":"TE40" if i%2==0 else "RealPresence Group 310",
            "locationId":f"loc-{i%1000}","inCurrentSr":i%31!=0,"rawRow":{"description":"x"*args.padding}}
            for i in range(start,min(start+250,args.devices))])
    c.commit();model=ReadModel(None)
    for filters in ({},{"domain":"domain-0","category":"vcs","manufacturer":"huawei"}):
        signatures=[]
        for name,method in (("previous",legacy),("compact",ReadModel.filter_options)):
            if method is None:continue
            started=time.perf_counter();result=method(model,c,filters);elapsed=time.perf_counter()-started
            signature=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=False).encode()).hexdigest();signatures.append(signature)
            print(json.dumps({"implementation":name,"devices":args.devices,"syntheticPaddingPerDevice":args.padding,"filtered":bool(filters),
                              "seconds":round(elapsed,4),"choices":{key:len(value) for key,value in result.items() if isinstance(value,list)}},ensure_ascii=False),flush=True)
        assert len(set(signatures))==1,"Cascade results must remain identical"
