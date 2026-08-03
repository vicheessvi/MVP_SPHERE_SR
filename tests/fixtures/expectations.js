(function (global) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function baseline() {
    return {
      schemaVersion: "1.0",
      snapshotId: "10000000-0000-4000-8000-000000000001",
      capturedAt: "2026-06-01T06:00:00Z",
      collectorVersion: "1.0.0-test",
      sourceSystem: "synthetic-fixture",
      projectId: "room-101",
      completeness: {
        project: "complete",
        controller: "complete",
        devices: "complete",
        network: "complete",
        firmware: "complete",
        gui: "complete",
        runtime: "partial",
        diagnostics: "partial"
      },
      ip: "10.20.30.10",
      ok: true,
      webBlocks: {
        Firmware: { Version: "3.2.1" },
        "Project Info": {
          Project: "Meeting Room 101.gcp",
          Version: "1.4",
          "Connected Devices": [
            {
              inventoryId: "panel-main",
              serialNumber: "TP-0001",
              addr: "10.20.30.21",
              macAddress: "00:11:22:33:44:55",
              modelname: "TLP Pro 725T",
              name: "Main Panel",
              partnum: "60-1563-02",
              vtlpweb: [{ default: true, type: "touchlink", url: "/gui/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", version: 7 }]
            },
            {
              inventoryId: "panel-wall",
              serialNumber: "TP-0002",
              addr: "10.20.30.22",
              macAddress: "00:11:22:33:44:66",
              modelname: "TLP Pro 525T",
              name: "Wall Panel",
              partnum: "60-1564-02",
              vtlpweb: []
            }
          ],
          "TLP Project": {
            modelname: "IPCP Pro 350",
            partnumber: "60-1384-01",
            serialNumber: "CTRL-0001",
            systemdevs: []
          }
        },
        "LAN Settings": {
          DHCP: false,
          "Host Name": "room-101-controller",
          "IP Address": "10.20.30.10",
          "Subnet Mask": "255.255.255.0",
          Gateway: "10.20.30.1",
          "DNS Server": ["10.20.0.2", "10.20.0.3"],
          "MAC Address": "AA:BB:CC:DD:EE:01"
        },
        GUI: []
      }
    };
  }

  function variant(kind) {
    const value = clone(baseline());
    const main = value.webBlocks["Project Info"]["Connected Devices"][0];
    if (kind === "ip") {
      value.snapshotId = "10000000-0000-4000-8000-000000000002";
      value.capturedAt = "2026-06-08T06:00:00Z";
      main.addr = "10.20.30.31";
    } else if (kind === "mac") {
      value.snapshotId = "10000000-0000-4000-8000-000000000003";
      value.capturedAt = "2026-06-15T06:00:00Z";
      main.macAddress = "00:11:22:33:44:99";
    } else if (kind === "name") {
      value.snapshotId = "10000000-0000-4000-8000-000000000004";
      value.capturedAt = "2026-06-22T06:00:00Z";
      main.name = "Presenter Panel";
    } else if (kind === "formatting") {
      value.snapshotId = "10000000-0000-4000-8000-000000000005";
      value.capturedAt = "2026-06-29T06:00:00Z";
      value.webBlocks.Firmware.Version = " 3.2.1 ";
      value.webBlocks["Project Info"].Project = " Meeting   Room 101.gcp ";
      value.webBlocks["Project Info"]["Connected Devices"].reverse();
      value.webBlocks["Project Info"]["Connected Devices"].forEach((item) => {
        item.name = ` ${item.name.replace(" ", "   ")} `;
        item.macAddress = item.macAddress.replaceAll(":", "-").toLowerCase();
      });
      value.webBlocks["LAN Settings"].DHCP = "false";
      value.webBlocks["LAN Settings"]["Host Name"] = " ROOM-101-CONTROLLER ";
      value.webBlocks["LAN Settings"]["DNS Server"].reverse();
      value.webBlocks["LAN Settings"]["MAC Address"] = "aa-bb-cc-dd-ee-01";
    } else if (kind === "added") {
      value.snapshotId = "20000000-0000-4000-8000-000000000001";
      value.capturedAt = "2026-07-06T06:00:00Z";
      value.webBlocks["Project Info"]["Connected Devices"].push({
        inventoryId: "panel-door",
        serialNumber: "TP-0003",
        addr: "10.20.30.23",
        macAddress: "00:11:22:33:44:77",
        modelname: "TLP Pro 525T",
        name: "Door Panel",
        partnum: "60-1564-02",
        vtlpweb: []
      });
    } else if (kind === "removed" || kind === "missing") {
      value.snapshotId = kind === "removed" ? "20000000-0000-4000-8000-000000000002" : "20000000-0000-4000-8000-000000000003";
      value.capturedAt = kind === "removed" ? "2026-07-13T06:00:00Z" : "2026-07-20T06:00:00Z";
      value.webBlocks["Project Info"]["Connected Devices"] = [main];
      if (kind === "missing") value.completeness.devices = "unknown";
    }
    return value;
  }

  function late() {
    const value = variant("ip");
    value.snapshotId = "30000000-0000-4000-8000-000000000002";
    value.capturedAt = "2026-06-04T06:00:00Z";
    value.webBlocks["Project Info"]["Connected Devices"][0].addr = "10.20.30.25";
    return value;
  }

  function legacy() {
    return {
      ip: "10.22.187.2",
      ok: true,
      outputFile: "2026-06-01_09-41-28/10.22.187.2.json",
      webInterface: { ok: true, evidence: "Extron control processor", markers: ["Extron"] },
      webBlocks: {
        Firmware: { Version: "2.7.0" },
        "Project Info": {
          Project: "Legacy Room.gcp",
          Version: "4.2",
          "Connected Devices": [{
            addr: "10.22.187.5",
            macAddress: "11:22:33:44:55:66",
            modelname: "TLP Pro 725T",
            name: "Legacy Panel",
            partnum: "60-1563-02",
            vtlpweb: [{ default: true, type: "touchlink", url: "/gui/11111111-2222-4333-8444-555555555555", version: 3 }]
          }],
          "TLP Project": { modelname: "IPCP Pro 350", partnumber: "60-1384-01", systemdevs: [] }
        },
        "LAN Settings": { DHCP: "Off", "Host Name": "legacy-controller", "IP Address": "10.22.187.2", "Subnet Mask": "255.255.255.0", Gateway: "10.22.187.1", "DNS Server": "10.22.0.2", "MAC Address": "AA-BB-CC-DD-EE-10" },
        GUI: []
      }
    };
  }

  global.MvpSphereSRFixtures = Object.freeze({
    version: 1,
    foundational: Object.freeze({
      stateArrays: Object.freeze(["users", "projects", "snapshots", "assets", "matchDecisions", "changeSets", "baselineAssignments", "reviewDecisions", "retentionAudits", "history"]),
      roles: Object.freeze(["administrator", "av_engineer"]),
      backupSchema: "mvp-sphere-sr-backup"
    }),
    snapshots: Object.freeze({ baseline, variant, late, legacy }),
    expectedEvents: Object.freeze({
      ip: "ip_changed",
      mac: "mac_changed",
      name: "name_changed",
      added: "device_added",
      removed: "confirmed_removal",
      missing: "possible_removal"
    })
  });
})(globalThis);
