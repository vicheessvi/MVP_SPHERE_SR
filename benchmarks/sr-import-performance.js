"use strict";

const { performance } = require("node:perf_hooks");

global.XLSX = require("../vendor/xlsx.full.min.js");
require("../app.js");

const api = global.MvpSphereSR;

const HEADERS = [...api.SR_REQUIRED_HEADERS];

function syntheticIp(index) {
  const value = index + 1;
  return `10.${Math.floor(value / (254 * 254)) % 254}.${Math.floor(value / 254) % 254}.${(value % 254) + 1}`;
}

function createRows(rowCount) {
  const categories = [
    { modelType: "Video Conference", equipmentType: "Терминал ВКС" },
    { modelType: "Устройство", equipmentType: "controller" },
    { modelType: "Панель управления", equipmentType: "Устройство" },
    { modelType: "Коммутатор", equipmentType: "Устройство" },
    { modelType: "Матричный коммутатор", equipmentType: "Устройство" },
    { modelType: "Скалер", equipmentType: "Устройство" },
    { modelType: "Аудио процессор", equipmentType: "Устройство" }
  ];
  return Array.from({ length: rowCount }, (_, index) => {
    const category = categories[index % categories.length];
    return {
      "Название комнаты": `Помещение ${Math.floor(index / 8)}`,
      "Адрес комнаты": `Корпус ${Math.floor(index / 1000) + 1}`,
      "VIP комната": index % 97 === 0 ? "Да" : "Нет",
      "Тип оборудования": category.equipmentType,
      "Наименование": `Устройство ${index + 1}`,
      "Модель": `Модель ${index % 80}`,
      "Тип модели": category.modelType,
      "Производитель": index % 3 === 0 ? "Extron" : `Производитель ${index % 12}`,
      IP: syntheticIp(index),
      MAC: `02:00:${String((index >> 24) & 255).padStart(2, "0")}:${String((index >> 16) & 255).padStart(2, "0")}:${String((index >> 8) & 255).padStart(2, "0")}:${String(index & 255).padStart(2, "0")}`,
      "SIP URI": "",
      "Инвентарный номер": `ИНВ-${index + 1}`,
      "Серийный номер": `SN-${index + 1}`,
      "VIP оборудование": index % 113 === 0 ? "Да" : "Нет",
      Домен: "example.local"
    };
  });
}

function createWorkbookBytes(rows) {
  const matrix = [HEADERS, ...rows.map((row) => HEADERS.map((header) => row[header] ?? ""))];
  const sheet = global.XLSX.utils.aoa_to_sheet(matrix);
  const workbook = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(workbook, sheet, "SR");
  return global.XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
}

function emptyState() {
  const state = api.createDemoState();
  ["srImports", "locations", "inventoryDevices", "pollingRuns", "pollingResults", "deviceChanges", "inventoryIssues", "history"].forEach((key) => { state[key] = []; });
  return state;
}

function timed(fn) {
  const started = performance.now();
  const value = fn();
  return { value, elapsedMs: performance.now() - started };
}

async function timedAsync(fn) {
  const started = performance.now();
  const value = await fn();
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

async function run(rowCount, mode) {
  const rowsStage = timed(() => createRows(rowCount));
  const workbookStage = timed(() => createWorkbookBytes(rowsStage.value));
  const workbookReadStage = timed(() => global.XLSX.read(workbookStage.value, { type: "array", cellDates: false }));
  const sheetStage = timed(() => global.XLSX.utils.sheet_to_json(workbookReadStage.value.Sheets.SR, { header: 1, defval: "", raw: false }));
  const rowsFromWorkbookStage = timed(() => api.rowsFromWorkbook(workbookStage.value));
  if (!rowsFromWorkbookStage.value.ok) throw new Error(rowsFromWorkbookStage.value.errors.join("; "));
  const normalizationStage = timed(() => rowsFromWorkbookStage.value.rows.map(api.normalizedSrRow));
  normalizationStage.value.length = 0;

  const state = emptyState();
  const lagStage = await measureEventLoopLag(() => timedAsync(async () => {
    if (mode === "optimized" && typeof api.processSrImportRows === "function") {
      return api.processSrImportRows(state, {
        rows: rowsFromWorkbookStage.value.rows,
        headers: rowsFromWorkbookStage.value.headers,
        sheetName: "SR",
        filename: "synthetic-sr.xlsx",
        rawSha256: `synthetic-${rowCount}`,
        importedAt: "2026-08-12T09:00:00.000Z"
      });
    }
    return api.importSrRows(state, {
      rows: rowsFromWorkbookStage.value.rows,
      headers: rowsFromWorkbookStage.value.headers,
      sheetName: "SR",
      filename: "synthetic-sr.xlsx",
      rawSha256: `synthetic-${rowCount}`,
      importedAt: "2026-08-12T09:00:00.000Z"
    });
  }));
  if (!lagStage.value.value.ok) throw new Error(lagStage.value.value.errors.join("; "));
  const importedState = lagStage.value.value.state;
  const validationStage = timed(() => api.validateState(importedState));
  if (!validationStage.value.ok) throw new Error(validationStage.value.errors.join("; "));
  const serializationStage = timed(() => JSON.stringify(importedState));
  const cloneStage = timed(() => api.deepClone(importedState));
  const dashboardStage = timed(() => api.getDashboardSummary(importedState, { period: "all" }));

  const result = {
    benchmark: "sr-import",
    mode: mode === "optimized" && typeof api.processSrImportRows === "function" ? "indexed-batch" : "legacy-baseline",
    synthetic: true,
    rows: rowCount,
    devices: importedState.inventoryDevices.length,
    locations: importedState.locations.length,
    elapsedMs: Number(lagStage.value.elapsedMs.toFixed(2)),
    rowsPerSecond: Number((rowCount / (lagStage.value.elapsedMs / 1000)).toFixed(2)),
    maxEventLoopLagMs: Number(lagStage.maxLagMs.toFixed(2)),
    eventLoopTicksDuringImport: lagStage.ticks,
    stagesMs: {
      fixtureRows: Number(rowsStage.elapsedMs.toFixed(2)),
      fixtureWorkbookWrite: Number(workbookStage.elapsedMs.toFixed(2)),
      browserFileRead: null,
      workbookRead: Number(workbookReadStage.elapsedMs.toFixed(2)),
      sheetToRows: Number(sheetStage.elapsedMs.toFixed(2)),
      rowsFromWorkbookCombined: Number(rowsFromWorkbookStage.elapsedMs.toFixed(2)),
      normalizationIsolated: Number(normalizationStage.elapsedMs.toFixed(2)),
      importPipeline: Number(lagStage.value.elapsedMs.toFixed(2)),
      validation: Number(validationStage.elapsedMs.toFixed(2)),
      serialization: Number(serializationStage.elapsedMs.toFixed(2)),
      deepClone: Number(cloneStage.elapsedMs.toFixed(2)),
      dashboardAggregation: Number(dashboardStage.elapsedMs.toFixed(2))
    },
    stateBytes: Buffer.byteLength(serializationStage.value, "utf8"),
    notes: [
      "browserFileRead не измеряется в Node.js; FileReader профилируется отдельно в браузерном acceptance-тесте",
      "fixtureWorkbookWrite не является частью пользовательского импорта"
    ]
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const rowCount = Math.max(1, Number(process.argv[2] || 1000));
const mode = String(process.argv[3] || "legacy").toLowerCase();

run(rowCount, mode).catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
