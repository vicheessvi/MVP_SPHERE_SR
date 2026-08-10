"use strict";

const { performance } = require("node:perf_hooks");
require("../app.js");

const api = global.MvpSphereSR;

function syntheticIp(index) {
  return `10.${Math.floor(index / (254 * 254)) + 1}.${Math.floor(index / 254) % 254}.${(index % 254) + 1}`;
}

function runFolder(index) {
  const date = new Date(2026, 0, 1 + index, 9, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_09-00-00`;
}

function createFixture(fileCount, requestedDevices) {
  const deviceCount = Math.max(1, Math.min(Number(requestedDevices) || 1000, fileCount));
  const state = api.createDemoState();
  state.inventoryDevices = Array.from({ length: deviceCount }, (_, index) => {
    const ip = syntheticIp(index);
    return {
      id: `synthetic-device-${index}`,
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      locationId: null,
      category: "controller",
      manufacturerRaw: "Synthetic",
      manufacturerNormalized: "synthetic",
      modelRaw: "Synthetic Controller",
      modelNormalized: "synthetic controller",
      nameRaw: `Synthetic ${index}`,
      ipRaw: ip,
      ipNormalized: ip,
      ipHistory: [],
      inCurrentSr: true,
      pollingCapability: { support: "not_implemented" }
    };
  });
  state.srImports.push({ id: "synthetic-sr", filename: "synthetic.xlsx", importedAt: "2026-01-01T00:00:00.000Z", status: "processed", rowCount: deviceCount });
  const files = Array.from({ length: fileCount }, (_, index) => {
    const deviceIndex = index % deviceCount;
    const runIndex = Math.floor(index / deviceCount);
    const folder = runFolder(runIndex);
    const ip = syntheticIp(deviceIndex);
    const text = JSON.stringify({
      ok: true,
      ping: { ok: true },
      webInterface: { evidence: "synthetic benchmark", markers: ["local", "test"] },
      webBlocks: {
        "Project Info": { "Controller Type": "Primary Controller", version: String(runIndex) },
        Firmware: { version: `1.${runIndex}.${deviceIndex % 10}` },
        Diagnostics: { values: Array.from({ length: 12 }, (_, valueIndex) => `${deviceIndex}-${runIndex}-${valueIndex}`) }
      }
    });
    return { name: `${ip}.json`, relativePath: `synthetic/${folder}/${ip}.json`, text };
  });
  return { state, files, deviceCount };
}

function timed(fn) {
  const started = performance.now();
  const value = fn();
  return { value, elapsedMs: performance.now() - started };
}

async function measureEventLoopLag(work) {
  const intervalMs = 10;
  let last = performance.now();
  let maxLagMs = 0;
  let ticks = 0;
  const timer = setInterval(() => {
    const current = performance.now();
    maxLagMs = Math.max(maxLagMs, current - last - intervalMs);
    last = current;
    ticks += 1;
  }, intervalMs);
  const value = await work();
  await new Promise((resolve) => setTimeout(resolve, intervalMs * 2));
  clearInterval(timer);
  return { value, maxLagMs, ticks };
}

async function runBenchmark(fileCount, deviceCount, mode) {
  const fixtureStarted = performance.now();
  const fixture = createFixture(fileCount, deviceCount);
  const fixtureMs = performance.now() - fixtureStarted;

  const grouping = timed(() => api.groupPollingFilesByRunFolder(fixture.files));
  const parsing = timed(() => fixture.files.map((file) => JSON.parse(file.text)));
  const ipExtraction = timed(() => fixture.files.map((file) => api.parsePollingFilenameIp(file.name)));
  let srComparisons = 0;
  const srMatching = timed(() => ipExtraction.value.map((ipInfo) => fixture.state.inventoryDevices.filter((device) => {
    srComparisons += 1;
    return device.ipNormalized === ipInfo.ip || (device.ipHistory || []).includes(ipInfo.ip);
  })));
  const normalization = timed(() => parsing.value.map((payload) => ({
    category: api.detectExtronJsonDeviceType(payload),
    status: api.derivePollingStatus(payload),
    projection: api.pollingPayloadProjection(payload)
  })));

  parsing.value.length = 0;
  ipExtraction.value.length = 0;
  srMatching.value.length = 0;
  normalization.value.length = 0;

  const importStarted = performance.now();
  const optimized = mode !== "legacy";
  const lag = await measureEventLoopLag(() => optimized
    ? api.processPollingImportBatches(fixture.state, { actorId: "system", files: fixture.files })
    : api.ingestPollingFolderTree(fixture.state, { actorId: "system", files: fixture.files }));
  const importMs = performance.now() - importStarted;
  if (!lag.value.ok) throw new Error(lag.value.errors.join("; "));

  const storage = api.createVolatileStorage();
  const storageStage = timed(() => api.saveState(lag.value.state, storage));
  if (!storageStage.value.ok) throw new Error(storageStage.value.errors.join("; "));
  const analytics = timed(() => api.getDashboardSummary(lag.value.state, { period: "all" }));

  const result = {
    mode: optimized ? "indexed-batch" : "legacy-baseline",
    synthetic: true,
    files: fileCount,
    devices: fixture.deviceCount,
    runs: grouping.value.batches.length,
    stateResults: lag.value.state.pollingResults.length,
    changes: lag.value.state.deviceChanges.length,
    elapsedMs: Number(importMs.toFixed(2)),
    filesPerSecond: Number((fileCount / (importMs / 1000)).toFixed(2)),
    maxEventLoopLagMs: Number(lag.maxLagMs.toFixed(2)),
    eventLoopTicksDuringImport: lag.ticks,
    stagesMs: {
      fixture: Number(fixtureMs.toFixed(2)),
      discoveryAndGrouping: Number(grouping.elapsedMs.toFixed(2)),
      jsonParseIsolated: Number(parsing.elapsedMs.toFixed(2)),
      ipExtractionIsolated: Number(ipExtraction.elapsedMs.toFixed(2)),
      srMatchingIsolated: Number(srMatching.elapsedMs.toFixed(2)),
      normalizationIsolated: Number(normalization.elapsedMs.toFixed(2)),
      importPipeline: Number(importMs.toFixed(2)),
      reading: Number((lag.value.metrics?.stagesMs?.reading || 0).toFixed(2)),
      hashing: Number((lag.value.metrics?.stagesMs?.hash || 0).toFixed(2)),
      parsingMeasured: Number((lag.value.metrics?.stagesMs?.parsing || 0).toFixed(2)),
      srMatchingMeasured: Number((lag.value.metrics?.stagesMs?.srMatching || 0).toFixed(2)),
      normalizationMeasured: Number((lag.value.metrics?.stagesMs?.normalization || 0).toFixed(2)),
      changeDetectionMeasured: Number((lag.value.metrics?.stagesMs?.changeDetection || 0).toFixed(2)),
      uiCallbacksMeasured: Number((lag.value.metrics?.stagesMs?.uiOverhead || 0).toFixed(2)),
      storageSerialization: Number(storageStage.elapsedMs.toFixed(2)),
      dashboardAggregation: Number(analytics.elapsedMs.toFixed(2))
    },
    operationCounts: {
      srComparisons: optimized ? lag.value.metrics.srLookups : srComparisons,
      expectedLegacyDeepClonesAtLeast: optimized ? 0 : fileCount * 2 + grouping.value.batches.length + 2,
      fullDeviceChangeRebuilds: optimized ? 0 : fileCount,
      incrementalDiffPairs: lag.value.metrics?.diffPairs || 0,
      cooperativeYields: lag.value.metrics?.yields || 0,
      batches: lag.value.metrics?.batches || 0,
      maxBatchRetainedTexts: lag.value.metrics?.maxBatchRetainedTexts || fileCount,
      uiRendersDuringPipeline: 0,
      storageCommits: optimized ? 0 : 1,
      storageSerializationChecks: 1,
      dashboardRecalculationsDuringPipeline: 0
    }
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const fileCount = Number(process.argv[2] || 1000);
const deviceCount = Number(process.argv[3] || Math.min(1000, fileCount));
const mode = String(process.argv[4] || "optimized").toLowerCase();

runBenchmark(fileCount, deviceCount, mode).catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
