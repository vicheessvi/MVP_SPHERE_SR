"""Bounded SQLite read models. No device network access or source-log parsing."""
from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import time
import threading
from collections import OrderedDict
import uuid
from contextlib import closing, nullcontext
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from .workspace import WorkspaceError, _hex, _inspect_safe

VERSION = 1
LABELS = {"users", "projects", "snapshots", "assets", "matchDecisions", "changeSets", "baselineAssignments",
          "reviewDecisions", "retentionAudits", "history", "srImports", "locations", "inventoryDevices",
          "pollingRuns", "pollingResults", "deviceChanges", "inventoryIssues", "logRows", "logRegistry",
          "events:te", "events:huawei310", "events:huawei300Bar", "events:huawei300Box", "events:json"}
COLS = ("label", "key", "device", "stamp", "kind", "category", "maker", "model", "loc", "domain", "vip",
        "overall", "ip", "name", "address", "fw", "project", "site", "status", "gap", "known", "anomaly",
        "validation", "source", "payload", "checksum")
MARKS = ",".join("?" for _ in COLS)


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def text(value: Any) -> str:
    return str(value).strip() if isinstance(value, (str, int, float)) and not isinstance(value, bool) else ""


def norm(value: Any) -> str:
    return " ".join(text(value).casefold().replace("ё", "е").split())


def field(value: Any, key: str, default: Any = None) -> Any:
    if not isinstance(value, dict):
        return default
    return next((v for k, v in value.items() if k.casefold() == key.casefold()), default)


def version(data: dict, section: str) -> str:
    value = field(field(field(data, "webBlocks"), section), "Version")
    rendered=text(value)
    if type(value) in (int,float):
        try:
            if not math.isfinite(value):return ""
        except OverflowError:return ""
        absolute=abs(value)
        if not value:rendered="0"
        elif 0.000001<=absolute<1e21:
            rendered=format(Decimal(str(value)),"f")
            if "." in rendered:rendered=rendered.rstrip("0").rstrip(".")
        else:
            mantissa,exponent=str(float(value)).split("e")
            mantissa=mantissa.rstrip("0").rstrip(".")
            exponent=int(exponent)
            rendered=mantissa+"e"+("+" if exponent>=0 else "")+str(exponent)
    return rendered if len(rendered)<=160 else ""


def site_name(data: dict, device: dict | None = None) -> str:
    site = field(data, "siteName")
    if site is not None:
        value = field(site, "value") if norm(field(site,"status")) == "read" else None
    else:
        info = field(field(data,"webBlocks"),"Device Info")
        value = field(info,"Site Name")
        if not value and device and norm(device.get("manufacturerNormalized") or device.get("manufacturerRaw"))=="polycom":
            planned = norm(device.get("modelNormalized") or device.get("modelRaw")).removeprefix("polycom ")
            observed = norm(field(info,"Model")).removeprefix("polycom ")
            if planned == observed and re.fullmatch(r"realpresence group (300|310|500|700)",planned):
                value = field(info,"System Name")
    return value.strip() if isinstance(value,str) and 0<len(value.strip())<=1024 and not re.search(r"[\x00-\x1f]",value) else ""


def boot_observation(value: dict) -> dict | None:
    if value.get("parseStatus") != "parsed" or not value.get("deviceId") or value.get("matchStatus") in ("ambiguous","category_conflict","ip_conflict","historical_only"):
        return None
    status = field(field(value.get("normalizedData"), "webBlocks"), "Device Status")
    if not isinstance(status, dict):
        return None
    numeric = field(status, "Uptime Seconds")
    if numeric is not None and (type(numeric) is not int or not 0 <= numeric < 2**53):
        return None
    formatted = field(status, "Uptime")
    total = None
    if formatted not in (None, ""):
        match = re.fullmatch(r"(?:(\d+)d )?(\d+)h (\d+)m (\d+)s", str(formatted))
        if not match:
            return None
        d,h,m,s = (int(item or 0) for item in match.groups())
        if h>23 or m>59 or s>59:
            return None
        total = d*86400+h*3600+m*60+s
    if numeric is not None and total is not None and numeric != total:
        return None
    uptime = numeric if numeric is not None else total
    if uptime is None or uptime >= 2**53:
        return None
    raw_date = field(status, "Date")
    try:
        if raw_date not in (None, ""):
            observed = datetime.strptime(raw_date, "%a, %d %b %Y %H:%M:%S").replace(tzinfo=timezone.utc)
            if observed.strftime("%a, %d %b %Y %H:%M:%S") != raw_date:
                return None
            basis, confidence = "device_local_unknown_timezone", "confirmed"
        else:
            observed = datetime.fromisoformat(value.get("observationAt") or value.get("capturedAt"))
            if observed.tzinfo is None: observed=observed.replace(tzinfo=timezone.utc)
            basis = "utc"
            confidence = value.get("observationConfidence") or ("confirmed" if value.get("observationAtSource") in ("payload_uptime_observed_at","payload_captured_at") else "limited")
        boot_ms = observed.timestamp()*1000 - uptime*1000
        datetime.fromtimestamp(boot_ms/1000, timezone.utc)
    except (TypeError,ValueError,OverflowError,OSError):
        return None
    return {"bootMs":boot_ms,"observedAt":observed.isoformat(),"uptime":uptime,"confidence":confidence,"timeBasis":basis,
            "signature":encode([uptime,value.get("rawSha256") or ""])}


def label_for(path: str) -> str | None:
    if path.startswith("state/"):
        name = path[6:]
    elif path == "log/rows":
        name = "logRows"
    elif path == "log/registry":
        name = "logRegistry"
    elif path.startswith("log/indexes/") and path.endswith("/events"):
        name = "events:" + path.split("/")[2]
    else:
        return None
    return name if name in LABELS else None


def record(label: str, value: dict) -> tuple:
    if label not in LABELS or not isinstance(value, dict):
        raise WorkspaceError("db_record_invalid")
    observation = boot_observation(value) if label=="pollingResults" else None
    if observation is not None: value={**value,"_dbBoot":observation}
    payload = encode(value)
    digest = hashlib.sha256(payload.encode()).hexdigest()
    key = text(value.get("id") or value.get("path") or value.get("rawSha256")) or digest
    status = text(value.get("operationalStatus") or value.get("pollStatus"))
    if label == "pollingResults":
        if value.get("parseStatus") != "parsed":status="processing_error"
        elif value.get("matchStatus") != "matched":status="unmatched"
    data = value.get("normalizedData") or {}
    gap = value.get("silenceGap") or {}
    stamp=text(value.get("capturedAt")) if label=="pollingResults" else text(value.get("deviceLocalTime") or value.get("capturedAt") or value.get("importedAt") or value.get("estimatedAt"))
    return (label, key, text(value.get("deviceId")), stamp,
            "boot_observation" if observation else text(value.get("kind")), text(value.get("category")), norm(value.get("manufacturerNormalized") or value.get("manufacturerRaw") or value.get("manufacturer")),
            text(value.get("modelRaw") or value.get("model")), text(value.get("locationId")), text(value.get("domain")),
            int(bool(value.get("deviceVip") or value.get("vip"))), norm(value.get("equipmentOverallStatus")),
            text(value.get("filenameIp") if label=="pollingResults" else value.get("ipNormalized") or value.get("ipRaw") or value.get("ip")), text(value.get("nameRaw") or value.get("deviceName") or value.get("name")),
            text(value.get("address")), version(data, "Firmware"), version(data, "Project Info"), site_name(data),
            status, observation["bootMs"] if observation else float(gap.get("seconds") or 0), int(gap.get("knownAction") is True), int(gap.get("clockAnomalyOrLongGap") is True),
            text(value.get("validationStatus")),
            (hashlib.sha256(encode([value["runId"], value["filename"], value["rawSha256"]]).encode()).hexdigest()
             if all(value.get(key) for key in ("runId","filename","rawSha256")) else digest)
            if label == "pollingResults" else text(value.get("sourceSrSha256")), payload, digest)


class ReadModel:
    _cache = OrderedDict()
    _cache_lock = threading.Lock()
    def __init__(self, store):
        self.store = store

    def connect(self, workspace: str) -> sqlite3.Connection:
        connection = self.store._parts_connection(workspace)
        connection.row_factory = sqlite3.Row
        connection.create_function("norm", 1, norm, deterministic=True)
        connection.execute("PRAGMA temp_store=FILE")
        return connection

    @staticmethod
    def init(connection: sqlite3.Connection) -> None:
        connection.execute("CREATE TABLE IF NOT EXISTS rm_control(id INTEGER PRIMARY KEY CHECK(id=1),source_revision INTEGER NOT NULL,next_part INTEGER NOT NULL,ready INTEGER NOT NULL,data_revision INTEGER NOT NULL,native INTEGER NOT NULL)")
        connection.execute("INSERT OR IGNORE INTO rm_control VALUES(1,-1,0,0,0,0)")
        definitions = ",".join(f"{col} {'REAL' if col == 'gap' else 'INTEGER' if col in ('vip','known','anomaly') else 'TEXT'} NOT NULL" for col in COLS)
        connection.execute(f"CREATE TABLE IF NOT EXISTS rm_records({definitions},PRIMARY KEY(label,key)) WITHOUT ROWID")
        connection.execute(f"CREATE TABLE IF NOT EXISTS rm_staging(batch TEXT NOT NULL,{definitions},PRIMARY KEY(batch,label,key)) WITHOUT ROWID")
        connection.execute("CREATE TABLE IF NOT EXISTS rm_imports(token TEXT PRIMARY KEY,base_revision TEXT NOT NULL,mode TEXT NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS rm_pair_removals(batch TEXT NOT NULL,device TEXT NOT NULL,from_id TEXT NOT NULL,to_id TEXT NOT NULL,PRIMARY KEY(batch,device,from_id,to_id)) WITHOUT ROWID")
        connection.execute("CREATE TABLE IF NOT EXISTS rm_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        connection.execute("""CREATE TABLE IF NOT EXISTS rm_evidence(batch TEXT NOT NULL,label TEXT NOT NULL,event_key TEXT NOT NULL,
            path TEXT NOT NULL,line INTEGER NOT NULL,PRIMARY KEY(batch,label,event_key,path,line)) WITHOUT ROWID""")
        for name, fields in (("device", "label,device,stamp DESC,key"), ("time", "label,stamp DESC,key"),
                             ("kind", "label,kind,stamp DESC,key"), ("sr", "label,category,maker,model,loc"),
                             ("ip", "label,ip,stamp DESC,key"), ("checksum", "label,checksum"), ("source", "label,source")):
            connection.execute(f"CREATE INDEX IF NOT EXISTS rm_idx_{name} ON rm_records({fields})")
        connection.execute("""CREATE INDEX IF NOT EXISTS rm_idx_file ON rm_records(label,
            json_extract(payload,'$.sourceRelativePath'),json_extract(payload,'$.sourceFileSize'),
            json_extract(payload,'$.sourceFileLastModified'),json_extract(payload,'$.sourcePrefixSha256'))""")
        connection.execute("""CREATE INDEX IF NOT EXISTS rm_idx_observation ON rm_records(label,device,
            json_extract(payload,'$._dbBoot.observedAt'),json_extract(payload,'$._dbBoot.signature'),key)
            WHERE label='pollingResults' AND kind='boot_observation'""")
        connection.execute("""CREATE INDEX IF NOT EXISTS rm_idx_staged_file ON rm_staging(
            json_extract(payload,'$.sourceRelativePath'),json_extract(payload,'$.sourceFileSize'),
            json_extract(payload,'$.sourceFileLastModified'),json_extract(payload,'$.sourcePrefixSha256'),batch)
            WHERE label='pollingResults'""")
        connection.execute("CREATE INDEX IF NOT EXISTS rm_idx_staged_source ON rm_staging(batch,source) WHERE label='pollingResults'")
        connection.execute("CREATE INDEX IF NOT EXISTS rm_idx_staged_device ON rm_staging(batch,device,stamp DESC,key) WHERE label='pollingResults'")
        for table in ("rm_records","rm_staging"):
            connection.execute(f"""CREATE INDEX IF NOT EXISTS {table}_change_pair ON {table}(device,
                json_extract(payload,'$.fromPollingResultId'),json_extract(payload,'$.toPollingResultId'))
                WHERE label='deviceChanges'""")

    @staticmethod
    def revision(connection) -> str:
        row = connection.execute("SELECT * FROM rm_control WHERE id=1").fetchone()
        if row is None or not row["ready"]:
            raise WorkspaceError("db_preparation_required")
        source=connection.execute("SELECT revision FROM workspace_snapshot WHERE id=1").fetchone()
        if not source or source[0]!=row["source_revision"]:
            raise WorkspaceError("db_preparation_required")
        return f'{row["source_revision"]}:{row["data_revision"]}'

    @staticmethod
    def put(connection, label: str, rows: list, batch: str | None = None) -> None:
        if label.startswith("events:") and label!="events:json" and not batch:
            prepared=[]
            for row in rows:
                sources={(text(item.get("path")),int(item.get("line") or 0)) for item in row.get("sources",[])}
                if sources:
                    connection.executemany("INSERT OR IGNORE INTO rm_evidence VALUES('',?,?,?,?)",((label,text(row.get("id")),path,line) for path,line in sources))
                if int(row.get("sourceCount") or 0)>len(sources):
                    row={**row,"sourceCountIsMinimum":True}
                prepared.append(row)
            rows=prepared
        if batch:
            connection.executemany(f"INSERT OR REPLACE INTO rm_staging VALUES(?,{MARKS})",
                                   ((batch, *record(label, row)) for row in rows))
        else:
            connection.executemany(f"INSERT OR REPLACE INTO rm_records VALUES({MARKS})", (record(label, row) for row in rows))

    @staticmethod
    def apply_meta(connection, meta: dict) -> None:
        # Legacy snapshots include all arrays in the header; never retain/reparse them for queries.
        compact={"schemaVersion":meta.get("schemaVersion",1),
            "state":{key:[] if isinstance(value,list) else value for key,value in meta.get("state",{}).items()},
            "log":{"summary":meta.get("log",{}).get("summary") or {},
                   "indexes":{family:{key:value for key,value in item.items() if key!="events"}
                              for family,item in (meta.get("log",{}).get("indexes") or {}).items()}}}
        connection.execute("INSERT OR REPLACE INTO rm_meta VALUES('header',?)", (encode(compact),))
        for key, values in meta.get("state", {}).items():
            if key in LABELS and isinstance(values, list):
                ReadModel.put(connection, key, values)
        log = meta.get("log", {})
        for key, target in (("rows", "logRows"), ("registry", "logRegistry")):
            ReadModel.put(connection, target, log.get(key) or [])
        for family, index in (log.get("indexes") or {}).items():
            if "events:" + family in LABELS:
                ReadModel.put(connection, "events:" + family, [
                    {**row,"validationStatus":row.get("validationStatus") or index.get("validationStatus") or ""}
                    for row in index.get("events") or []])

    def prepare(self, workspace: str) -> dict:
        with closing(self.connect(workspace)) as c, c:
            self.init(c)
            current = c.execute("SELECT revision,payload,digest FROM workspace_snapshot WHERE id=1").fetchone()
            control = c.execute("SELECT * FROM rm_control WHERE id=1").fetchone()
            if control["native"] and control["source_revision"] != current["revision"]:
                raise WorkspaceError("workspace_revision_conflict")
            if control["native"] and not control["ready"]:
                raise WorkspaceError("workspace_corrupt")
            if control["source_revision"] != current["revision"]:
                c.execute("DELETE FROM rm_records")
                c.execute("DELETE FROM rm_meta")
                c.execute("UPDATE rm_control SET source_revision=?,next_part=0,ready=0,data_revision=0 WHERE id=1", (current["revision"],))
                control = c.execute("SELECT * FROM rm_control WHERE id=1").fetchone()
            total = c.execute("SELECT count(*) FROM workspace_part_links WHERE revision=?", (current["revision"],)).fetchone()[0]
            if not control["ready"]:
                pages = c.execute("SELECT l.position,d.body,d.digest FROM workspace_part_links l JOIN workspace_part_data d USING(digest) WHERE l.revision=? AND l.position>=? ORDER BY l.position LIMIT 4",
                                  (current["revision"], control["next_part"])).fetchall()
                if not total:
                    if current["payload"] is not None:
                        if hashlib.sha256(current["payload"]).hexdigest() != current["digest"]:
                            raise WorkspaceError("workspace_corrupt")
                        self.apply_meta(c, json.loads(current["payload"]))
                    c.execute("UPDATE rm_control SET ready=1 WHERE id=1")
                for page in pages:
                    if hashlib.sha256(page["body"]).hexdigest() != page["digest"]:
                        raise WorkspaceError("workspace_corrupt")
                    part = json.loads(page["body"])
                    if "meta" in part:
                        self.apply_meta(c, part["meta"])
                    elif (label := label_for(part["key"])):
                        rows=part["rows"]
                        if label.startswith("events:"):
                            inherited=self.header(c).get("log",{}).get("indexes",{}).get(label[7:],{}).get("validationStatus")
                            if inherited:
                                rows=[{**row,"validationStatus":row.get("validationStatus") or inherited} for row in rows]
                        self.put(c, label, rows)
                    c.execute("UPDATE rm_control SET next_part=? WHERE id=1", (page["position"] + 1,))
                control = c.execute("SELECT * FROM rm_control WHERE id=1").fetchone()
                if control["next_part"] >= total:
                    self.rebuild_json_events(c)
                    c.execute("UPDATE rm_control SET ready=1 WHERE id=1")
                    c.execute("PRAGMA optimize")
            state = dict(c.execute("SELECT * FROM rm_control WHERE id=1").fetchone())
            return {"ready": bool(state["ready"]), "processed": state["next_part"], "total": total,
                    "revision": f'{state["source_revision"]}:{state["data_revision"]}'}

    @staticmethod
    def rebuild_json_events(c) -> None:
        c.execute("DELETE FROM rm_records WHERE label='events:json'")
        devices={row["key"]:json.loads(row["payload"]) for row in c.execute("SELECT key,payload FROM rm_records WHERE label='inventoryDevices'")}
        current_device=None; cluster=None
        pending=[]
        def flush():
            nonlocal cluster
            if not cluster: return
            at=math.floor(cluster["sum"]/cluster["n"]+.5)
            device=devices[cluster["device"]]
            iso=datetime.fromtimestamp(at/1000,timezone.utc).isoformat().replace("+00:00","Z")
            pending.append({"id":f'{cluster["device"]}@{math.floor(at/1000+.5)}',"deviceId":cluster["device"],"kind":"confirmed_reboot",
                "deviceLocalTime":iso[:19].replace("T"," "),"estimatedAt":iso,"timeBasis":cluster["basis"],
                "ruleVersion":"extron-reboot-v2","confidence":cluster["confidence"],"ip":device.get("ipNormalized") or device.get("ipRaw") or "",
                "category":device.get("category"),"model":device.get("modelRaw"),"sourceCount":cluster["n"],
                "evidenceResultIds":cluster["ids"],"sources":[],"basis":"date_minus_uptime"})
            cluster=None
        query="""SELECT r.key,r.device,r.gap,json_extract(r.payload,'$._dbBoot') observation
            FROM rm_records r JOIN rm_records d ON d.label='inventoryDevices' AND d.key=r.device
            WHERE r.label='pollingResults' AND r.kind='boot_observation'
            AND coalesce(json_extract(d.payload,'$.inCurrentSr'),1)!=0
            AND NOT EXISTS (SELECT 1 FROM rm_records conflicting WHERE conflicting.label='pollingResults'
                AND conflicting.device=r.device AND conflicting.kind='boot_observation'
                AND json_extract(conflicting.payload,'$._dbBoot.observedAt')=json_extract(r.payload,'$._dbBoot.observedAt')
                AND (json_extract(conflicting.payload,'$._dbBoot.signature')!=json_extract(r.payload,'$._dbBoot.signature')
                     OR conflicting.key<r.key))
            ORDER BY r.device,r.gap,r.stamp,r.key"""
        for row in c.execute(query):
            observation=json.loads(row["observation"])
            if cluster and (row["device"]!=current_device or abs(row["gap"]-math.floor(cluster["sum"]/cluster["n"]+.5))>5000):
                flush()
            if cluster is None:
                current_device=row["device"]
                cluster={"device":current_device,"sum":0,"n":0,"ids":[],"basis":observation["timeBasis"],"confidence":"confirmed"}
            cluster["sum"]+=row["gap"];cluster["n"]+=1
            if observation["confidence"]!="confirmed":cluster["confidence"]="limited"
            if len(cluster["ids"])<16:cluster["ids"].append(row["key"])
            if len(pending)>=500:
                ReadModel.put(c,"events:json",pending);pending=[]
        flush()
        ReadModel.put(c,"events:json",pending)

    @staticmethod
    def header(c) -> dict:
        found = c.execute("SELECT value FROM rm_meta WHERE key='header'").fetchone()
        return json.loads(found[0]) if found else {"state": {}, "log": {}}

    def bootstrap(self, workspace: str) -> dict:
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            revision = self.revision(c)
            counts = {row["label"]: row["n"] for row in c.execute("SELECT label,count(*) n FROM rm_records GROUP BY label")}
            sr = c.execute("SELECT payload FROM rm_records WHERE label='srImports' ORDER BY stamp DESC,key DESC LIMIT 1").fetchone()
            return {"revision": revision, "counts": counts, "sr": json.loads(sr[0]) if sr else None,
                    "logSourceSha": self.header(c).get("log", {}).get("indexes", {}).get("te", {}).get("sourceSrSha256"),
                    "settings": self.header(c).get("state", {}).get("settings") or {}}

    def context(self, workspace: str, revision: str, label: str, after: str = "") -> dict:
        if label not in {"inventoryDevices", "locations", "pollingRuns", "srImports", "logRows", "logRegistry"}:
            raise WorkspaceError("db_query_invalid")
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            if self.revision(c) != revision:
                raise WorkspaceError("workspace_revision_conflict")
            if label=="pollingRuns":
                rows=c.execute("""SELECT key,payload FROM rm_staging WHERE label=? AND key>? AND batch IN (
                    SELECT token FROM rm_imports WHERE mode='json' AND base_revision=?)
                    UNION ALL SELECT r.key,r.payload FROM rm_records r WHERE r.label=? AND r.key>? AND NOT EXISTS(
                    SELECT 1 FROM rm_staging s JOIN rm_imports i ON i.token=s.batch WHERE s.label=? AND s.key=r.key AND i.mode='json' AND i.base_revision=?)
                    ORDER BY key LIMIT 201""",(label,after,revision,label,after,label,revision)).fetchall()
            else:
                rows = c.execute("SELECT key,payload FROM rm_records WHERE label=? AND key>? ORDER BY key LIMIT 201", (label, after)).fetchall()
            return {"revision": revision, "rows": [json.loads(row["payload"]) for row in rows[:200]],
                    "next": rows[199]["key"] if len(rows) > 200 else None}

    def begin(self, workspace: str, revision: str, mode: str) -> dict:
        if mode not in {"sr", "json", "logs", "logs-replace"}:
            raise WorkspaceError("db_import_invalid")
        token = uuid.uuid4().hex
        with closing(self.connect(workspace)) as c, c:
            c.execute("BEGIN IMMEDIATE")
            if self.revision(c) != revision:
                raise WorkspaceError("workspace_revision_conflict")
            if mode=="json":
                previous=c.execute("SELECT token FROM rm_imports WHERE base_revision=? AND mode='json' LIMIT 1",(revision,)).fetchone()
                if previous:return {"token":previous[0]}
            c.execute("INSERT INTO rm_imports VALUES(?,?,?)", (token, revision, mode))
        return {"token": token}

    @staticmethod
    def require_import(c, token: str):
        if not _hex(token, 32):
            raise WorkspaceError("db_import_invalid")
        found = c.execute("SELECT * FROM rm_imports WHERE token=?", (token,)).fetchone()
        if not found or found["base_revision"] != ReadModel.revision(c):
            raise WorkspaceError("workspace_revision_conflict")
        return found

    def batch(self, workspace: str, token: str, label: str, rows: list) -> dict:
        if not isinstance(rows, list) or len(rows) > 1024 or label not in LABELS:
            raise WorkspaceError("db_import_invalid")
        _inspect_safe(rows)
        with closing(self.connect(workspace)) as c, c:
            c.execute("BEGIN IMMEDIATE")
            imp = self.require_import(c, token)
            allowed = {"sr": {"inventoryDevices", "locations", "srImports", "inventoryIssues"},
                       "json": {"pollingResults", "pollingRuns", "deviceChanges", "inventoryIssues", "history"},
                       "logs": {"logRows", "logRegistry", *(name for name in LABELS if name.startswith("events:") and name!="events:json")},
                       "logs-replace": {"logRows", "logRegistry", *(name for name in LABELS if name.startswith("events:") and name!="events:json")}}[imp["mode"]]
            if label not in allowed:
                raise WorkspaceError("db_import_invalid")
            if label.startswith("events:"):
                merged = []
                for row in rows:
                    key = record(label, row)[1]
                    sources_in={(text(item.get("path")),int(item.get("line") or 0)) for item in row.get("sources",[])}
                    if int(row.get("sourceCount") or 0)>len(sources_in):row={**row,"sourceCountIsMinimum":True}
                    additions=0
                    for path,line in sources_in:
                        if not c.execute("SELECT 1 FROM rm_evidence WHERE (batch=? OR batch='' AND ?) AND label=? AND event_key=? AND path=? AND line=? LIMIT 1",
                                         (token,int(imp["mode"]!="logs-replace"),label,key,path,line)).fetchone():additions+=1
                        c.execute("INSERT OR IGNORE INTO rm_evidence VALUES(?,?,?,?,?)",(token,label,key,path,line))
                    old = c.execute("SELECT payload FROM rm_staging WHERE batch=? AND label=? AND key=?", (token, label, key)).fetchone()
                    if old is None and imp["mode"] == "logs":
                        old = c.execute("SELECT payload FROM rm_records WHERE label=? AND key=?", (label, key)).fetchone()
                    if old:
                        prior = json.loads(old[0])
                        sources = {(item["path"], item["line"]): item for item in prior.get("sources", [])}
                        sources.update({(item["path"], item["line"]): item for item in row.get("sources", [])})
                        result = {**prior}
                        priority={"unknown_start":0,"start_after_shutdown":1,"confirmed_reboot":2,"power_off":2}
                        if priority.get(row.get("kind"),0)>priority.get(prior.get("kind"),0):
                            result.update(row)
                        for method in ("shutdownMethod","actionMethod"):
                            if not result.get(method) and row.get(method):result[method]=row[method]
                        gaps = [item for item in (prior.get("silenceGap"), row.get("silenceGap")) if isinstance(item, dict)]
                        if gaps and result.get("kind") == "unknown_start":
                            result["silenceGap"] = {**min(gaps, key=lambda item: item["seconds"]),
                                "knownAction": any(item.get("knownAction") for item in gaps),
                                "clockAnomalyOrLongGap": any(item.get("clockAnomalyOrLongGap") for item in gaps)}
                        result["sources"] = list(sources.values())[:16]
                        if prior.get("sourceCountIsMinimum") or row.get("sourceCountIsMinimum"):
                            known=c.execute("SELECT count(*) FROM (SELECT path,line FROM rm_evidence WHERE (batch=? OR batch='' AND ?) AND label=? AND event_key=? GROUP BY path,line)",(token,int(imp["mode"]!="logs-replace"),label,key)).fetchone()[0]
                            result["sourceCount"]=max(prior.get("sourceCount",0),row.get("sourceCount",0),known)
                            result["sourceCountIsMinimum"]=True
                        else:
                            result["sourceCount"] = max(prior.get("sourceCount",0)+additions,row.get("sourceCount",0))
                        row = result
                    self.put(c, label, [row], token)
            else:
                self.put(c, label, rows, token)
        return {"stored": len(rows)}

    def finish(self, workspace: str, token: str, source_sr: str | None = None) -> dict:
        with closing(self.connect(workspace)) as c, c:
            c.execute("BEGIN IMMEDIATE")
            imp = self.require_import(c, token)
            if imp["mode"] == "sr":
                c.execute("DELETE FROM rm_records WHERE label IN ('inventoryDevices','locations')")
            elif imp["mode"] == "logs-replace":
                c.execute("DELETE FROM rm_records WHERE label LIKE 'events:%' AND label!='events:json' OR label IN ('logRows','logRegistry')")
                c.execute("DELETE FROM rm_evidence WHERE batch=''")
            if imp["mode"] == "json":
                c.executemany("""DELETE FROM rm_records WHERE label='deviceChanges' AND device=?
                    AND json_extract(payload,'$.fromPollingResultId')=? AND json_extract(payload,'$.toPollingResultId')=?""",
                    c.execute("SELECT device,from_id,to_id FROM rm_pair_removals WHERE batch=?",(token,)))
                # Exact same content from an already indexed run is not re-added.
                c.execute("""DELETE FROM rm_staging WHERE batch=? AND label='pollingResults' AND EXISTS
                  (SELECT 1 FROM rm_records r WHERE r.label='pollingResults'
                   AND r.source=rm_staging.source)""", (token,))
            c.execute(f"INSERT OR REPLACE INTO rm_records SELECT {','.join(COLS)} FROM rm_staging WHERE batch=?", (token,))
            if imp["mode"] in ("json","sr"):
                self.rebuild_json_events(c)
            if imp["mode"].startswith("logs"):
                header = self.header(c)
                for family in ("te", "huawei310", "huawei300Bar", "huawei300Box"):
                    header.setdefault("log", {}).setdefault("indexes", {})[family] = {"sourceSrSha256": source_sr}
                c.execute("INSERT OR REPLACE INTO rm_meta VALUES('header',?)", (encode(header),))
            c.execute("DELETE FROM rm_staging WHERE batch=?", (token,))
            c.execute("INSERT OR IGNORE INTO rm_evidence SELECT '',label,event_key,path,line FROM rm_evidence WHERE batch=?",(token,))
            c.execute("DELETE FROM rm_evidence WHERE batch=?",(token,))
            c.execute("DELETE FROM rm_imports WHERE token=?", (token,))
            c.execute("DELETE FROM rm_pair_removals WHERE batch=?",(token,))
            c.execute("UPDATE rm_control SET data_revision=data_revision+1,native=1 WHERE id=1")
            c.execute("DELETE FROM rm_staging WHERE batch IN (SELECT token FROM rm_imports WHERE base_revision!=?)",(self.revision(c),))
            c.execute("DELETE FROM rm_imports WHERE base_revision!=?",(self.revision(c),))
            c.execute("DELETE FROM rm_evidence WHERE batch!='' AND batch NOT IN (SELECT token FROM rm_imports)")
            c.execute("DELETE FROM rm_pair_removals WHERE batch NOT IN (SELECT token FROM rm_imports)")
            return {"revision": self.revision(c)}

    def clear_checkpoints(self, workspace: str, revision: str, scope: str, keys: list) -> dict:
        if not _hex(scope) or not isinstance(keys,list) or len(keys)>512 or not all(_hex(key) for key in keys):
            raise WorkspaceError("workspace_checkpoint_invalid")
        with closing(self.connect(workspace)) as c,c:
            c.execute("BEGIN IMMEDIATE")
            if self.revision(c)!=revision:raise WorkspaceError("workspace_revision_conflict")
            c.executemany("DELETE FROM workspace_log_checkpoints WHERE scope=? AND file_key=?",((scope,key) for key in keys))
            return {"pending":c.execute("SELECT count(*) FROM workspace_log_checkpoints").fetchone()[0]}

    def neighbors(self, workspace: str, token: str, result: dict, _connection=None) -> dict:
        if not isinstance(result,dict) or set(result)-{"id","deviceId","capturedAt","runId","filename","rawSha256","parseStatus"}:
            raise WorkspaceError("db_import_invalid")
        with (nullcontext(_connection) if _connection is not None else closing(self.connect(workspace))) as c:
            if not c.in_transaction:c.execute("BEGIN")
            imp=self.require_import(c,token)
            if imp["mode"]!="json":raise WorkspaceError("db_import_invalid")
            if all(result.get(key) for key in ("runId","filename","rawSha256")):
                fingerprint=hashlib.sha256(encode([result[key] for key in ("runId","filename","rawSha256")]).encode()).hexdigest()
                if c.execute("SELECT 1 FROM rm_records WHERE label='pollingResults' AND source=? LIMIT 1",(fingerprint,)).fetchone() or c.execute(
                    "SELECT 1 FROM rm_staging WHERE batch=? AND label='pollingResults' AND source=? LIMIT 1",(token,fingerprint)).fetchone():
                    return {"duplicate":True,"rows":[]}
            device,at,key=result.get("deviceId"),result.get("capturedAt"),result.get("id")
            if not device or result.get("parseStatus")!="parsed" or at in (None,""):return {"duplicate":False,"rows":[]}
            if not all(isinstance(value,str) and 0<len(value)<=256 for value in (device,at,key)):
                raise WorkspaceError("db_import_invalid")
            rows=[]
            for operator,order in (("<","DESC"),(">","ASC")):
                matches=[]
                old=c.execute(f"""SELECT r.key,r.stamp,r.payload FROM rm_records r WHERE r.label='pollingResults' AND r.device=?
                    AND json_extract(r.payload,'$.parseStatus')='parsed' AND r.stamp!=''
                    AND (r.stamp,r.key) {operator} (?,?)
                    AND NOT EXISTS (SELECT 1 FROM rm_staging s WHERE s.batch=? AND s.label='pollingResults' AND s.key=r.key)
                    ORDER BY r.stamp {order},r.key {order} LIMIT 1""",(device,at,key,token)).fetchone()
                staged=c.execute(f"""SELECT key,stamp,payload FROM rm_staging WHERE batch=? AND label='pollingResults' AND device=?
                    AND json_extract(payload,'$.parseStatus')='parsed' AND stamp!=''
                    AND (stamp,key) {operator} (?,?) ORDER BY stamp {order},key {order} LIMIT 1""",
                    (token,device,at,key)).fetchone()
                if old:matches.append(old)
                if staged:matches.append(staged)
                if matches:
                    chosen=sorted(matches,key=lambda row:(row["stamp"],row["key"]),reverse=order=="DESC")[0]
                    rows.append(json.loads(chosen["payload"]))
            return {"duplicate":False,"rows":rows}

    def neighbor_batch(self,workspace: str,token: str,results: list)->dict:
        if not isinstance(results,list) or len(results)>128:raise WorkspaceError("db_import_invalid")
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            self.require_import(c,token)
            return {"seeds":[{"id":result.get("id"),**self.neighbors(workspace,token,result,c)} for result in results]}

    def remove_pairs(self, workspace: str, token: str, pairs: list) -> dict:
        if not isinstance(pairs,list) or len(pairs)>500:raise WorkspaceError("db_import_invalid")
        validated=[]
        for pair in pairs:
            if not isinstance(pair,list) or len(pair)!=3 or not all(isinstance(value,str) and 0<len(value)<=256 for value in pair):
                raise WorkspaceError("db_import_invalid")
            validated.append(tuple(pair))
        with closing(self.connect(workspace)) as c,c:
            c.execute("BEGIN IMMEDIATE")
            imp=self.require_import(c,token)
            if imp["mode"]!="json":raise WorkspaceError("db_import_invalid")
            c.executemany("INSERT OR IGNORE INTO rm_pair_removals VALUES(?,?,?,?)",((token,*pair) for pair in validated))
            c.executemany("""DELETE FROM rm_staging WHERE batch=? AND label='deviceChanges' AND device=?
                AND json_extract(payload,'$.fromPollingResultId')=? AND json_extract(payload,'$.toPollingResultId')=?""",
                ((token,*pair) for pair in validated))
        return {"removedPairs":len(validated)}

    def files(self, workspace: str, descriptors: list) -> list[bool]:
        if not isinstance(descriptors, list) or len(descriptors) > 256:
            raise WorkspaceError("db_query_invalid")
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            self.revision(c)
            result = []
            for file in descriptors:
                if not isinstance(file, dict):
                    raise WorkspaceError("db_query_invalid")
                args=(file.get("path"), file.get("size"), file.get("mtime"), file.get("prefix"))
                found=c.execute("""SELECT 1 FROM rm_records WHERE label='pollingResults'
                    AND json_extract(payload,'$.sourceRelativePath')=?
                    AND json_extract(payload,'$.sourceFileSize')=?
                    AND json_extract(payload,'$.sourceFileLastModified')=?
                    AND json_extract(payload,'$.sourcePrefixSha256')=? LIMIT 1""",
                    args).fetchone()
                if found is None:
                    found=c.execute("""SELECT 1 FROM rm_staging s JOIN rm_imports i ON i.token=s.batch
                        WHERE s.label='pollingResults' AND json_extract(s.payload,'$.sourceRelativePath')=?
                        AND json_extract(s.payload,'$.sourceFileSize')=? AND json_extract(s.payload,'$.sourceFileLastModified')=?
                        AND json_extract(s.payload,'$.sourcePrefixSha256')=? AND i.mode='json' AND i.base_revision=? LIMIT 1""",
                        (*args,self.revision(c))).fetchone()
                result.append(found is not None)
            return result

    def latest(self, workspace: str, revision: str, ips: list) -> dict:
        if not isinstance(ips,list) or len(ips)>50 or not all(isinstance(ip,str) and re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}",ip) for ip in ips):
            raise WorkspaceError("db_query_invalid")
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            if self.revision(c)!=revision:raise WorkspaceError("workspace_revision_conflict")
            rows=[]
            for ip in ips:
                row=c.execute("SELECT payload FROM rm_records WHERE label='pollingResults' AND ip=? AND stamp!='' ORDER BY stamp DESC,key DESC LIMIT 1",(ip,)).fetchone()
                if row is None:
                    row=c.execute("SELECT payload FROM rm_records WHERE label='pollingResults' AND ip=? ORDER BY json_extract(payload,'$.importedAt') DESC,key DESC LIMIT 1",(ip,)).fetchone()
                if row:rows.append(json.loads(row[0]))
            return {"rows":rows,"revision":revision}

    @staticmethod
    def _filters(filters: Any) -> tuple[str, list]:
        if not isinstance(filters, dict) or len(filters) > 24:
            raise WorkspaceError("db_query_invalid")
        where = ["1=1"]
        scope=filters.get("current") or "yes"
        if scope not in ("yes","no","all"):raise WorkspaceError("db_filter_invalid")
        if scope!="all":where.append("coalesce(json_extract(d.payload,'$.inCurrentSr'),1)"+("!=0" if scope=="yes" else "=0"))
        values = []
        mapping = {"category": "d.category", "manufacturer": "d.maker", "model": "d.model", "locationId": "d.loc",
                   "locationName":"l.name", "domain": "d.domain", "address": "l.address", "deviceId": "d.key"}
        for key, column in mapping.items():
            value = filters.get(key)
            if value:
                if not isinstance(value, str) or len(value) > 512:
                    raise WorkspaceError("db_query_invalid")
                where.append(f"norm({column})=?"); values.append(norm(value))
        if filters.get("vip") in ("yes", "no"):
            where.append("(d.vip OR coalesce(l.vip,0))=?"); values.append(int(filters["vip"] == "yes"))
        if filters.get("accounted"):
            where.extend(["d.category='vcs'", "d.overall='учет'"])
        search = text(filters.get("search"))
        if search:
            where.append("""(instr(norm(d.name||' '||d.ip||' '||d.model||' '||d.maker||' '||d.domain||' '||
                coalesce(l.name,'')||' '||coalesce(l.address,'')||' '||coalesce(json_extract(d.payload,'$.macNormalized'),'')||' '||
                coalesce(json_extract(d.payload,'$.macRaw'),'')||' '||coalesce(json_extract(d.payload,'$.serialNumber'),'')||' '||
                coalesce(json_extract(d.payload,'$.inventoryNumber'),'')),?)>0)""")
            values.append(norm(search))
        return " AND ".join(where), values

    def cte(self, c, filters: dict, events: bool = False) -> tuple[str, list]:
        where, values = self._filters({**filters,"current":"yes"} if events else filters)
        sql = f"""WITH devices AS (SELECT d.*,l.name location_name,l.address location_address,
                 (d.vip OR coalesce(l.vip,0)) is_vip FROM rm_records d
                 LEFT JOIN rm_records l ON l.label='locations' AND l.key=d.loc
                 WHERE d.label='inventoryDevices' AND {where})"""
        if not events:
            return sql, values
        silence = filters.get("logSilenceMinutes", "60")
        try:
            silence = int(silence)
            if not 15 <= silence <= 10080:
                raise ValueError
        except (ValueError, TypeError):
            raise WorkspaceError("db_filter_invalid") from None
        sr = c.execute("SELECT payload FROM rm_records WHERE label='srImports' ORDER BY stamp DESC,key DESC LIMIT 1").fetchone()
        current = json.loads(sr[0]).get("rawSha256") if sr else None
        indexes = self.header(c).get("log", {}).get("indexes") or {}
        labels = ["events:" + family for family, item in indexes.items()
                  if family in ("te", "huawei310", "huawei300Bar", "huawei300Box")
                  and item.get("validationStatus") != "provisional_user_validation"
                  and not (current and item.get("sourceSrSha256") and current != item["sourceSrSha256"])]
        source=filters.get("source","logs")
        if source not in ("all","logs","json"):raise WorkspaceError("db_filter_invalid")
        if source=="json":labels=[]
        if source in ("all","json"):labels+=["events:json"]
        event_where = ["e.label IN (" + ",".join("?" for _ in labels) + ")", "(e.ip=d.ip OR e.label='events:json')",
                       "e.validation!='provisional_user_validation'"]
        args = values + [silence * 60] + labels
        period = filters.get("period", "all")
        today = datetime.now()
        timed_bound="CASE WHEN e.label='events:json' AND json_extract(e.payload,'$.timeBasis')!='device_local_unknown_timezone' THEN ? ELSE ? END"
        if period == "custom":
            try:
                start = datetime.strptime(filters["dateFrom"], "%Y-%m-%d")
                end = datetime.strptime(filters["dateTo"], "%Y-%m-%d") + timedelta(days=1)
                if start >= end:
                    raise ValueError
            except (ValueError, TypeError, KeyError):
                raise WorkspaceError("db_filter_invalid") from None
            event_where += [f"e.stamp>={timed_bound}", f"e.stamp<{timed_bound}"]
            args += [start.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),start.strftime("%Y-%m-%d %H:%M:%S"),
                     end.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),end.strftime("%Y-%m-%d %H:%M:%S")]
        elif period in ("today", "7d", "30d"):
            start = today.replace(hour=0, minute=0, second=0, microsecond=0) if period == "today" else today - timedelta(days=int(period[:-1]))
            event_where += [f"e.stamp>={timed_bound}",f"e.stamp<={timed_bound}"]
            args += [start.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),start.strftime("%Y-%m-%d %H:%M:%S"),
                     today.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),today.strftime("%Y-%m-%d %H:%M:%S")]
        elif period != "all":
            raise WorkspaceError("db_filter_invalid")
        if filters.get("date"):
            if not isinstance(filters["date"],str) or not re.fullmatch(r"\d{4}-\d\d-\d\d",filters["date"]):
                raise WorkspaceError("db_filter_invalid")
            event_where.append("substr(e.stamp,1,10)=?");args.append(filters["date"])
        sql += """, events AS (SELECT e.*,d.name device_name,d.model device_model,d.domain device_domain,d.ip device_ip,
                  d.loc device_location,d.location_name,d.location_address,d.is_vip,
                  CASE WHEN e.kind='unknown_start' AND e.gap>=? AND e.known=0 AND e.anomaly=0
                  THEN 'suspected_power_loss' ELSE e.kind END event_kind
                  FROM rm_records e JOIN devices d ON d.key=e.device WHERE """ + " AND ".join(event_where) + ")"
        return sql, args

    def view(self, workspace: str, revision: str, name: str, filters: dict, page: int = 0, size: int = 50) -> dict:
        if type(page) is not int or not 0 <= page < 2**53//100 or type(size) is not int or not 1 <= size <= 100:
            raise WorkspaceError("db_query_invalid")
        started = time.monotonic()
        with closing(self.connect(workspace)) as c:
            c.execute("BEGIN")
            if self.revision(c) != revision:
                raise WorkspaceError("workspace_revision_conflict")
            clock=int(time.time()//60) if filters.get("period") in ("today","7d","30d") else 0
            cache_key = encode([str(self.store.database_path().resolve()),workspace,revision,name,filters,page,size,clock])
            with self._cache_lock:
                cached = self._cache.get(cache_key)
                if cached is not None:
                    self._cache.move_to_end(cache_key)
                    return {**cached,"cached":True}
            c.set_progress_handler(lambda: int(time.monotonic() - started > 45), 10000)
            try:
                result = self._view(c, name, filters, page, size)
            except sqlite3.OperationalError as error:
                raise WorkspaceError("db_query_timeout" if getattr(error,"sqlite_errorcode",None)==sqlite3.SQLITE_INTERRUPT else "db_query_failed") from error
            result.update(revision=revision, page=page, pageSize=size, elapsedMs=round((time.monotonic() - started) * 1000))
            with self._cache_lock:
                self._cache[cache_key] = result
                while len(self._cache)>32:
                    self._cache.popitem(last=False)
            return result

    @staticmethod
    def rows(c, sql, args, page, size):
        found = c.execute(sql + " LIMIT ? OFFSET ?", [*args, size + 1, page * size]).fetchall()
        return {"rows": [dict(row) for row in found[:size]], "hasNext": len(found) > size}

    def _view(self, c, name, filters, page, size):
        if name=="facets":
            return self.filter_options(c,filters)
        if name in {"events", "summary", "heatmap", "duration", "duration-rows", "tops", "accounted", "event-devices", "export-devices"}:
            sql, args = self.cte(c, {**filters,"source":"logs"} if name in ("accounted","duration","duration-rows","export-devices") else filters, True)
            kind = filters.get("kind") or "confirmed_reboot"
            if kind not in {"confirmed_reboot", "power_off", "suspected_power_loss", "unknown_start", "start_after_shutdown"}:
                raise WorkspaceError("db_filter_invalid")
            if name == "events":
                clauses, extra = ["event_kind=?"], [kind]
                if filters.get("day") is not None:
                    clauses.append("((cast(strftime('%w',stamp) AS INTEGER)+6)%7)=?"); extra.append(int(filters["day"]))
                if filters.get("hour") is not None:
                    clauses.append("cast(substr(stamp,12,2) AS INTEGER)=?"); extra.append(int(filters["hour"]))
                return self.rows(c, sql + """ SELECT key,device,stamp,event_kind,device_name name,device_model model,device_ip ip,
                    location_name locationName,location_address address,is_vip vip,gap,payload FROM events WHERE """ +
                    " AND ".join(clauses) + " ORDER BY stamp DESC,key DESC", args + extra, page, size)
            if name == "summary":
                groups = [dict(row) for row in c.execute(sql + " SELECT event_kind kind,count(*) events,count(DISTINCT device) devices FROM events GROUP BY event_kind", args)]
                denominator = c.execute(sql + " SELECT count(*) FROM devices", args).fetchone()[0]
                return {"groups": groups, "denominator": denominator}
            if name == "heatmap":
                return {"cells": [dict(row) for row in c.execute(sql + """ SELECT ((cast(strftime('%w',stamp) AS INTEGER)+6)%7) day,
                    cast(substr(stamp,12,2) AS INTEGER) hour,count(*) events,count(DISTINCT device) devices
                    FROM events WHERE event_kind=? GROUP BY day,hour""", args + [kind])]}
            if name == "tops":
                result = {}
                # One eligibility/join pass, not five full joins over the history.
                c.execute("CREATE TEMP TABLE rm_top_scope AS "+sql+""" SELECT device,device_name,device_location,
                    location_name,location_address,stamp FROM events WHERE event_kind=?""",args+[kind])
                for key, column, grouping in (("devices","max(device_name)","device"),("locations","max(location_name)","device_location"),
                                              ("addresses","location_address","location_address"),("dates","substr(stamp,1,10)","substr(stamp,1,10)"),
                                              ("hours","substr(stamp,12,2)","substr(stamp,12,2)")):
                    order="devices DESC,events DESC" if key in ("locations","addresses") else "events DESC"
                    result[key] = [dict(row) for row in c.execute(f"SELECT {column} label,{grouping} groupKey,count(*) events,count(DISTINCT device) devices,min(device) deviceId,max(location_address) address FROM rm_top_scope GROUP BY {grouping} ORDER BY {order},label LIMIT 5")]
                return result
            if name == "accounted":
                return {"counts": dict(c.execute(sql + """, flags AS (SELECT device,
                    max(event_kind='confirmed_reboot') reboots,max(event_kind='power_off') confirmed,
                    max(event_kind='suspected_power_loss') suspected FROM events GROUP BY device)
                    SELECT count(*) denominator,coalesce(sum(f.reboots),0) reboots,coalesce(sum(f.confirmed),0) confirmed,
                    coalesce(sum(f.suspected),0) suspected,coalesce(sum(f.suspected AND NOT f.confirmed),0) suspectedOnly
                    FROM devices d LEFT JOIN flags f ON f.device=d.key WHERE d.category='vcs' AND d.overall='учет'""", args).fetchone())}
            if name == "event-devices":
                return self.rows(c, sql + """ SELECT device,device_name name,device_model model,device_ip ip,location_name locationName,
                    location_address address,count(*) events,min(stamp) firstAt,max(stamp) lastAt
                    FROM events WHERE event_kind=? GROUP BY device ORDER BY events DESC,device""", args + [kind], page, size)
            if name == "export-devices":
                detail=[]
                if filters.get("day") is not None:
                    detail.append("((cast(strftime('%w',stamp) AS INTEGER)+6)%7)=?");args.append(int(filters["day"]))
                if filters.get("hour") is not None:
                    detail.append("cast(substr(stamp,12,2) AS INTEGER)=?");args.append(int(filters["hour"]))
                source_table="events"
                if detail:
                    sql+=", export_events AS (SELECT * FROM events WHERE "+" AND ".join(detail)+")"
                    source_table="export_events"
                sql += """, per_device AS (SELECT device,sum(event_kind='confirmed_reboot') reboots,
                    sum(event_kind='power_off') confirmed,sum(event_kind='suspected_power_loss') suspected,
                    min(CASE WHEN event_kind='confirmed_reboot' THEN stamp END) firstReboot,
                    max(CASE WHEN event_kind='confirmed_reboot' THEN stamp END) lastReboot,
                    min(CASE WHEN event_kind='power_off' THEN stamp END) firstPower,
                    max(CASE WHEN event_kind='power_off' THEN stamp END) lastPower,
                    min(CASE WHEN event_kind='suspected_power_loss' THEN stamp END) firstSuspected,
                    max(CASE WHEN event_kind='suspected_power_loss' THEN stamp END) lastSuspected
                    FROM """+source_table+" GROUP BY device)"
                eligible="p.reboots>0" if kind=="confirmed_reboot" else "(p.confirmed>0 OR p.suspected>0)"
                return self.rows(c,sql+""" SELECT d.name,d.ip,coalesce(json_extract(d.payload,'$.macNormalized'),json_extract(d.payload,'$.macRaw'),'') mac,
                    d.model,d.domain,d.is_vip vip,d.location_name locationName,d.location_address address,p.*
                    FROM per_device p JOIN devices d ON d.key=p.device WHERE """+eligible+" ORDER BY p.reboots DESC,p.confirmed DESC,p.suspected DESC,d.key",args,page,size)
            if name in ("duration","duration-rows"):
                sql += """, timeline AS (SELECT device,stamp,event_kind,gap, min(CASE WHEN event_kind IN ('confirmed_reboot','unknown_start','start_after_shutdown','suspected_power_loss') THEN stamp END)
                    OVER(PARTITION BY device ORDER BY julianday(stamp) RANGE BETWEEN 0.000000001 FOLLOWING AND UNBOUNDED FOLLOWING) nextStart FROM events),
                    intervals AS (SELECT device,CASE WHEN event_kind='suspected_power_loss' THEN gap
                    WHEN event_kind='power_off' AND nextStart IS NOT NULL THEN round((julianday(nextStart)-julianday(stamp))*86400) END seconds,
                    CASE WHEN event_kind='power_off' THEN 'confirmed' ELSE 'suspected' END basis FROM timeline),
                    measured AS (SELECT *,row_number() OVER(PARTITION BY device ORDER BY seconds DESC,basis='confirmed' DESC) rank
                    FROM intervals WHERE seconds>0 AND seconds<=315360000),
                    buckets AS (SELECT *, CASE WHEN seconds<=3600 THEN 0 WHEN seconds<=86400 THEN 1 WHEN seconds<=604800 THEN 2
                    WHEN seconds<=2592000 THEN 3 WHEN seconds<=7776000 THEN 4 WHEN seconds<=15552000 THEN 5 WHEN seconds<=31536000 THEN 6 ELSE 7 END bucket
                    FROM measured WHERE rank=1)"""
                if name=="duration-rows":
                    bucket=filters.get("durationBucket",7)
                    if type(bucket) is not int or not 0<=bucket<=7:raise WorkspaceError("db_filter_invalid")
                    return self.rows(c,sql+""" SELECT d.key device,d.name,d.model,d.ip,d.location_name locationName,
                        d.location_address address,b.seconds,b.bucket,b.basis FROM buckets b JOIN devices d ON d.key=b.device
                        WHERE b.bucket=? ORDER BY b.seconds DESC,d.key""",args+[bucket],page,size)
                return {"buckets": [dict(row) for row in c.execute(sql + " SELECT bucket,count(*) devices FROM buckets GROUP BY bucket", args)],
                        "denominator": c.execute(sql + " SELECT count(*) FROM devices", args).fetchone()[0]}
        sql, args = self.cte(c,filters if name in ("inventory","site-name","polls") else {**filters,"current":"yes"})
        if name in {"inventory", "site-name"}:
            sql += """, chosen AS (SELECT d.*,r.payload result,r.site site_name,r.status result_status,r.stamp result_at,
                json_extract(r.payload,'$.pingStatus') result_ping
                FROM devices d LEFT JOIN rm_records r ON r.label='pollingResults' AND r.key=coalesce((
                  SELECT p.key FROM rm_records p WHERE p.label='pollingResults' AND p.device=d.key AND p.stamp!='' ORDER BY p.stamp DESC,p.key DESC LIMIT 1),(
                  SELECT p.key FROM rm_records p WHERE p.label='pollingResults' AND p.device=d.key ORDER BY json_extract(p.payload,'$.importedAt') DESC,p.key DESC LIMIT 1)))"""
            where=["1=1"]
            for key,column,default in (("status","result_status","never"),("ping","result_ping","unknown")):
                if filters.get(key):
                    if not isinstance(filters[key],str) or len(filters[key])>128:raise WorkspaceError("db_filter_invalid")
                    where.append(f"coalesce({column},?)=?");args.extend([default,filters[key]])
            if filters.get("support"):
                where.append("json_extract(payload,'$.pollingCapability.support')=?");args.append(text(filters["support"]))
            if filters.get("changed") in ("yes","no","true","false"):
                where.append(("NOT " if filters["changed"] in ("no","false") else "")+"EXISTS(SELECT 1 FROM rm_records ch WHERE ch.label='deviceChanges' AND ch.device=chosen.key)")
            result=self.rows(c, sql + """ SELECT key id,name,model,ip,domain,location_name locationName,location_address address,is_vip vip,
                CASE WHEN result_status='success' THEN site_name ELSE '' END siteName,
                coalesce(result_status,'never') status,result_at lastAt,payload,result FROM chosen WHERE """+" AND ".join(where)+" ORDER BY name,key", args, page, size)
            for row in result["rows"]:
                if row["status"]=="success" and row["result"]:
                    row["siteName"]=site_name(json.loads(row["result"]).get("normalizedData") or {},json.loads(row["payload"]))
                row.pop("result",None)
            return result
        if name == "polls":
            return self.rows(c, sql + """ SELECT r.key,r.device,d.name,d.model,d.ip,r.stamp,r.status,r.fw firmware,r.project project
                FROM rm_records r JOIN devices d ON d.key=r.device WHERE r.label='pollingResults' ORDER BY r.stamp DESC,r.key DESC""", args, page, size)
        if name in {"project-versions", "firmware-versions"}:
            col = "project" if name == "project-versions" else "fw"
            sql += f""", versions AS (SELECT r.key,r.device,r.stamp,r.{col} value,d.name,d.model,d.ip,
                lag(r.{col}) OVER(PARTITION BY r.device ORDER BY r.stamp,r.key) previous
                FROM rm_records r JOIN devices d ON d.key=r.device WHERE r.label='pollingResults' AND r.status='success' AND r.stamp!='' AND r.{col}!='')"""
            return self.rows(c, sql + " SELECT *,CASE WHEN previous IS NULL THEN 'first' WHEN previous=value THEN 'unchanged' ELSE 'changed' END change FROM versions ORDER BY stamp DESC,key DESC", args, page, size)
        if name == "connection-errors":
            return self.rows(c, sql + """ SELECT r.device,d.name,d.ip,d.model,r.status,count(*) cases,max(r.stamp) lastAt
                FROM rm_records r JOIN devices d ON d.key=r.device WHERE r.label='pollingResults'
                AND r.status IN ('authorization_error','network_unreachable') GROUP BY r.device,r.status ORDER BY cases DESC,r.device""", args, page, size)
        if name == "logs":
            return self.rows(c, "SELECT key,device,stamp,payload FROM rm_records WHERE label='logRows' ORDER BY key", [], page, size)
        if name == "dashboard":
            counts = {row["label"]: row["n"] for row in c.execute("SELECT label,count(*) n FROM rm_records GROUP BY label")}
            categories = [dict(row) for row in c.execute(sql + " SELECT category label,count(*) devices FROM devices GROUP BY category", args)]
            return {"counts": counts, "categories": categories,
                    "devices": c.execute(sql + " SELECT count(*) FROM devices", args).fetchone()[0]}
        raise WorkspaceError("db_query_invalid")

    def filter_options(self,c,filters):
        if not isinstance(filters,dict):raise WorkspaceError("db_filter_invalid")
        base={key:filters[key] for key in ("current","vip","search","accounted") if filters.get(key)}
        scope=filters.get("scopeCategory")
        if scope:
            base["category"]=scope
        selected={}
        result={}
        chain=[("domain","domains","domain"),("category","categories","category"),("manufacturer","manufacturers","maker"),
               ("model","models","model"),("locationId","locations","loc"),("address","addresses","location_address")]
        for field_name,list_name,column in chain:
            sql,args=self.cte(c,base)
            if field_name=="locationId":
                rows=[dict(row) for row in c.execute(sql+""" SELECT loc value,min(coalesce(location_name,'')) label,
                    min(coalesce(location_address,'')) address FROM devices WHERE loc!='' GROUP BY loc ORDER BY label,loc""",args)]
            elif field_name=="manufacturer":
                rows=[dict(row) for row in c.execute(sql+""" SELECT maker value,min(coalesce(nullif(json_extract(payload,'$.manufacturerRaw'),''),maker)) label
                    FROM devices WHERE maker!='' GROUP BY maker ORDER BY label""",args)]
            else:
                rows=[dict(row) for row in c.execute(sql+f" SELECT norm({column}) value,min({column}) label FROM devices WHERE coalesce({column},'')!='' GROUP BY norm({column}) ORDER BY label",args)]
            result[list_name]=rows
            chosen=scope if field_name=="category" and scope else filters.get(field_name)
            match=next((row for row in rows if norm(row["value"])==norm(chosen)),None) if chosen else None
            if match:
                selected[field_name]=match["value"];base[field_name]=match["value"]
            elif field_name=="category" and scope:
                selected[field_name]=scope;base[field_name]=scope
        return {**result,"selected":selected}
