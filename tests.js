(function (global) {
  "use strict";

  if (typeof require === "function" && !global.XLSX) {
    global.XLSX = require("./vendor/xlsx.full.min.js");
  }
  if (typeof require === "function" && !global.MvpSphereSR) {
    require("./app.js");
  }
  if (typeof require === "function" && !global.MvpSphereSRFixtures) {
    require("./tests/fixtures/expectations.js");
  }
  if (typeof require === "function" && !global.MvpSphereSRTimelineExpectations) {
    require("./tests/fixtures/timeline-expectations.js");
  }
  if (typeof require === "function" && !global.MvpSphereSRBaselineExpectations) {
    require("./tests/fixtures/baseline-expectations.js");
  }

  const api = global.MvpSphereSR;
  const fixtures = global.MvpSphereSRFixtures;
  const timelineExpected = global.MvpSphereSRTimelineExpectations;
  const baselineExpected = global.MvpSphereSRBaselineExpectations;
  const tests = [];

  class MemoryStorage {
    constructor(initial) {
      this.values = new Map(Object.entries(initial || {}));
      this.failNextSet = false;
    }

    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
      if (this.failNextSet) {
        this.failNextSet = false;
        const error = new Error("Synthetic quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      this.values.set(key, String(value));
    }

    removeItem(key) {
      this.values.delete(key);
    }
  }

  function test(name, fn) {
    tests.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || "Values differ"}: expected ${String(expected)}, got ${String(actual)}`);
    }
  }

  async function createIpChangeState() {
    let result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    return api.ingestSnapshotText(result.state, {
      name: "ip-changed.json",
      text: JSON.stringify(fixtures.snapshots.variant("ip")),
      uploadedById: "user-av-engineer"
    });
  }

  async function createAmbiguousState() {
    let result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    const original = result.state.assets.find((asset) => asset.kind === "touch_panel");
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = `${original.id}-ambiguous`;
    result.state.assets.push(duplicate);
    result = await api.ingestSnapshotText(result.state, {
      name: "ip-changed.json",
      text: JSON.stringify(fixtures.snapshots.variant("ip")),
      uploadedById: "user-av-engineer"
    });
    return { result, original, duplicate };
  }

  test("API и state schema доступны", () => {
    assert(api, "MvpSphereSR API отсутствует");
    assertEqual(api.STATE_VERSION, 3);
    assertEqual(api.STORAGE_KEY, "mvpSphereSrState.v3");
    assertEqual(api.LEGACY_STORAGE_KEY, "mvpSphereSrState.v2");
    assertEqual(api.SESSION_KEY, "mvpSphereSrSession.v1");
  });

  test("Demo state содержит все обязательные массивы", () => {
    const state = api.createDemoState();
    api.STATE_ARRAY_KEYS.forEach((key) => assert(Array.isArray(state[key]), `${key} должен быть массивом`));
    assert(api.validateState(state).ok, "Demo state должен проходить validation");
  });

  test("State содержит только роль Администратор МЦТП", () => {
    const state = api.createDemoState();
    const roles = state.users.map((user) => user.role).sort();
    assertEqual(roles.join(","), "administrator");
    assertEqual(state.users.find((user) => user.role === "administrator").name, "Администратор МЦТП");
    assertEqual(state.users.filter((user) => user.active).length, 1);
  });

  test("Migration принимает v1 и отклоняет неизвестную будущую версию", () => {
    const current = api.migrateState(api.createDemoState());
    assert(current.ok);
    assert(!current.migrated);
    const legacy = api.deepClone(api.createDemoState());
    legacy.version = 1;
    ["srImports", "locations", "inventoryDevices", "pollingRuns", "pollingResults", "deviceChanges", "inventoryIssues"].forEach((key) => delete legacy[key]);
    delete legacy.settings.ignoredPollingPaths;
    legacy.users.push({ id: "user-av-engineer", name: "AV-инженер", login: "engineer", password: "engineer", role: "av_engineer", active: true });
    const migrated = api.migrateState(legacy);
    assert(migrated.ok, migrated.errors?.join("; "));
    assert(migrated.migrated);
    assertEqual(migrated.state.version, 3);
    assertEqual(migrated.state.users.length, 1);
    assertEqual(migrated.state.users[0].role, "administrator");
    const future = api.createDemoState();
    future.version = 99;
    const rejected = api.migrateState(future);
    assert(!rejected.ok);
    assert(rejected.errors.some((item) => item.includes("Неподдерживаемая версия")));
  });

  test("Load мигрирует legacy storage key в v3 atomically", () => {
    const legacy = api.deepClone(api.createDemoState());
    legacy.version = 1;
    ["srImports", "locations", "inventoryDevices", "pollingRuns", "pollingResults", "deviceChanges", "inventoryIssues"].forEach((key) => delete legacy[key]);
    delete legacy.settings.ignoredPollingPaths;
    const storage = new MemoryStorage({ [api.LEGACY_STORAGE_KEY]: JSON.stringify(legacy) });
    const loaded = api.loadState(storage);
    assertEqual(loaded.state.version, 3);
    assert(storage.getItem(api.STORAGE_KEY), "v3 state должен быть сохранён");
    assert(storage.getItem(api.LEGACY_STORAGE_KEY), "legacy evidence не удаляется автоматически");
  });

  test("SR normalization сохраняет raw и классифицирует три категории", () => {
    assertEqual(api.normalizeSrHeader("  Тип Модели "), "тип модели");
    assertEqual(api.normalizeManufacturer("Huawey"), "huawei");
    assertEqual(api.classifySrDevice({ "Тип модели": " Video Conference " }), "vcs");
    assertEqual(api.classifySrDevice({ "Тип оборудования": " CONTROLLER " }), "controller");
    assertEqual(api.classifySrDevice({ "Тип модели": "Панель управления" }), "panel");
  });

  test("Folder timestamp parser использует YYYY-MM-DD_HH-MM-SS", () => {
    const parsed = api.parseRunFolderTimestamp("2026-06-01_09-41-28");
    assert(parsed.ok, parsed.error);
    const date = new Date(parsed.capturedAt);
    assertEqual(date.getFullYear(), 2026);
    assertEqual(date.getMonth(), 5);
    assertEqual(date.getDate(), 1);
    assert(!api.parseRunFolderTimestamp("2026-02-30_09-41-28").ok);
  });

  test("Общая папка группирует JSON по ближайшим датированным родителям", () => {
    const grouped = api.groupPollingFilesByRunFolder([
      { name: "10.0.0.2.json", relativePath: "export/2026-06-02_10-15-00/vendor/10.0.0.2.json" },
      { name: "10.0.0.1.JSON", relativePath: "export/2026-06-01_09-41-28/10.0.0.1.JSON" },
      { name: "10.0.0.3.json", relativePath: "export/invalid-date/10.0.0.3.json" },
      { name: "note.txt", relativePath: "export/2026-06-01_09-41-28/note.txt" }
    ]);
    assertEqual(grouped.batches.length, 2);
    assertEqual(grouped.batches[0].folderName, "2026-06-01_09-41-28");
    assertEqual(grouped.batches[1].folderPath, "export/2026-06-02_10-15-00");
    assertEqual(grouped.batches[1].files[0].relativePath, "export/2026-06-02_10-15-00/vendor/10.0.0.2.json");
    assertEqual(grouped.rejected.length, 1);
    assertEqual(grouped.ignored.length, 1);
  });

  test("Одинаковые имена папок в разных ветвях не смешиваются", () => {
    const grouped = api.groupPollingFilesByRunFolder([
      { name: "10.0.0.1.json", relativePath: "export/a/2026-06-01_09-41-28/10.0.0.1.json" },
      { name: "10.0.0.2.json", relativePath: "export/b/2026-06-01_09-41-28/10.0.0.2.json" }
    ]);
    assertEqual(grouped.batches.length, 2);
    assert(grouped.batches[0].folderPath !== grouped.batches[1].folderPath);
  });

  test("Группировка 1000 JSON по 10 папкам выполняется без заметной задержки", () => {
    const files = Array.from({ length: 1000 }, (_, index) => {
      const day = String((index % 10) + 1).padStart(2, "0");
      return { name: `10.20.${Math.floor(index / 250)}.${(index % 250) + 1}.json`, relativePath: `export/2026-06-${day}_09-41-28/device-${index}.json` };
    });
    const started = Date.now();
    const grouped = api.groupPollingFilesByRunFolder(files);
    assertEqual(grouped.batches.length, 10);
    assertEqual(grouped.batches.reduce((sum, batch) => sum + batch.files.length, 0), 1000);
    assert(Date.now() - started < 1000, "Группировка должна укладываться в 1 секунду");
  });

  test("Polling filename parser нормализует IPv4 и не падает на invalid", () => {
    assertEqual(api.parsePollingFilenameIp(" 10.10.20.30.json ").ip, "10.10.20.30");
    assert(!api.parsePollingFilenameIp("controller.json").ok);
    assert(!api.parsePollingFilenameIp("999.1.1.1.json").ok);
  });

  test("Extron type и ping status определяются только по надёжным признакам", () => {
    const primary = { failedStage: "ping", Ping: { ok: false }, webBlocks: { "Project Info": { "Controller Type": "Primary Controller" } } };
    const panel = { webBlocks: { "Project Info": { "Controller Type": "TLP" } } };
    assertEqual(api.detectExtronJsonDeviceType(primary), "controller");
    assertEqual(api.detectExtronJsonDeviceType(panel), "panel");
    assertEqual(api.derivePollingStatus(primary).pingStatus, "failed");
    assertEqual(api.derivePollingStatus({ failedStage: "ping" }).pingStatus, "unknown");
  });

  test("Polling registry не содержит фиктивных transports", () => {
    const controller = api.resolvePollingCapability({ category: "controller", manufacturerNormalized: "extron" });
    const panel = api.resolvePollingCapability({ category: "panel", manufacturerNormalized: "extron" });
    assertEqual(controller.support, "not_implemented");
    assertEqual(panel.support, "not_implemented");
    assertEqual(controller.poll, undefined);
    assertEqual(panel.transport, null);
  });

  test("Первый load создаёт и сохраняет demo state", () => {
    const storage = new MemoryStorage();
    const loaded = api.loadState(storage);
    assert(loaded.created, "State должен быть помечен созданным");
    assert(storage.getItem(api.STORAGE_KEY), "State должен быть сохранён");
    assert(api.validateState(loaded.state).ok);
  });

  test("Повторный load восстанавливает сохранённый state", () => {
    const storage = new MemoryStorage();
    const state = api.createDemoState();
    state.settings.retentionDays = 365;
    assert(api.saveState(state, storage).ok);
    const loaded = api.loadState(storage);
    assertEqual(loaded.state.settings.retentionDays, 365);
    assertEqual(loaded.recovery, null);
  });

  test("Demo login session хранится отдельно в sessionStorage", () => {
    const state = api.createDemoState();
    const sessionStorage = new MemoryStorage();
    const saved = api.writeSessionUserId(state, "user-administrator", sessionStorage);
    assert(saved.ok, saved.errors?.join("; "));
    assertEqual(sessionStorage.getItem(api.SESSION_KEY), "user-administrator");
    assertEqual(api.readSessionUserId(state, sessionStorage), "user-administrator");
    assertEqual(state.currentUserId, null, "Persistent state не должен содержать session user");
  });

  test("Новая вкладка без sessionStorage всегда начинает с login screen", () => {
    const state = api.createDemoState();
    state.currentUserId = "user-administrator";
    const cleaned = api.clearPersistedUserSession(state);
    assertEqual(cleaned.currentUserId, null);
    assertEqual(state.currentUserId, "user-administrator", "Очистка должна быть immutable");
    assertEqual(api.readSessionUserId(cleaned, new MemoryStorage()), null);
  });

  test("Невалидная или завершённая session очищается", () => {
    const state = api.createDemoState();
    const sessionStorage = new MemoryStorage({ [api.SESSION_KEY]: "missing-user" });
    assertEqual(api.readSessionUserId(state, sessionStorage), null);
    assertEqual(sessionStorage.getItem(api.SESSION_KEY), null);
    assert(api.clearSessionUserId(sessionStorage));
  });

  test("Повреждённый JSON не перезаписывается", () => {
    const corrupt = "{not-json";
    const storage = new MemoryStorage({ [api.STORAGE_KEY]: corrupt });
    const loaded = api.loadState(storage);
    assertEqual(loaded.recovery.kind, "corrupt_state");
    assertEqual(storage.getItem(api.STORAGE_KEY), corrupt, "Corrupt raw должен сохраниться");
  });

  test("State validation отклоняет неверный currentUser reference", () => {
    const state = api.createDemoState();
    state.currentUserId = "missing-user";
    const result = api.validateState(state);
    assert(!result.ok);
    assert(result.errors.some((item) => item.includes("currentUserId")));
  });

  test("State validation отклоняет Snapshot с неизвестным Project", () => {
    const state = api.createDemoState();
    state.snapshots.push({ id: "snapshot-1", projectId: "missing-project" });
    const result = api.validateState(state);
    assert(!result.ok);
    assert(result.errors.some((item) => item.includes("projectId")));
  });

  test("Quota preflight сохраняет предыдущее state", () => {
    const storage = new MemoryStorage();
    const original = api.createDemoState();
    assert(api.saveState(original, storage).ok);
    const before = storage.getItem(api.STORAGE_KEY);
    const oversized = api.deepClone(original);
    oversized.history.push({ details: "x".repeat(2000) });
    const result = api.saveState(oversized, storage, { maxBytes: 500 });
    assertEqual(result.kind, "quota_preflight");
    assertEqual(storage.getItem(api.STORAGE_KEY), before);
  });

  test("Storage exception не повреждает предыдущее state", () => {
    const storage = new MemoryStorage();
    const original = api.createDemoState();
    assert(api.saveState(original, storage).ok);
    const before = storage.getItem(api.STORAGE_KEY);
    const changed = api.deepClone(original);
    changed.settings.retentionDays = 730;
    storage.failNextSet = true;
    const result = api.saveState(changed, storage);
    assert(!result.ok);
    assertEqual(storage.getItem(api.STORAGE_KEY), before);
  });

  test("Backup исключает активную login-сессию", () => {
    const state = api.createDemoState();
    state.currentUserId = state.users[0].id;
    const backup = api.createBackup(state);
    assertEqual(backup.schema, api.BACKUP_SCHEMA);
    assertEqual(backup.state.currentUserId, null);
    assert(api.validateBackup(backup).ok);
  });

  test("Backup round-trip восстанавливает валидный state", () => {
    const state = api.createDemoState();
    state.settings.retentionDays = 400;
    const backupText = JSON.stringify(api.createBackup(state));
    const storage = new MemoryStorage();
    const result = api.importBackupText(backupText, storage);
    assert(result.ok, result.errors?.join("; "));
    assertEqual(result.state.settings.retentionDays, 400);
    assertEqual(api.loadState(storage).state.settings.retentionDays, 400);
  });

  test("Backup transform и history сохраняются одной атомарной записью", () => {
    const source = api.createDemoState();
    const storage = new MemoryStorage();
    const result = api.importBackupText(JSON.stringify(api.createBackup(source)), storage, {
      transformState(imported) {
        return api.appendHistory(imported, {
          actorName: "System",
          action: "Synthetic import",
          entityType: "system"
        });
      }
    });
    assert(result.ok, result.errors?.join("; "));
    assertEqual(result.state.history.at(-1).action, "Synthetic import");
    assertEqual(api.loadState(storage).state.history.at(-1).action, "Synthetic import");
  });

  test("Malformed backup не заменяет current state", () => {
    const storage = new MemoryStorage();
    const state = api.createDemoState();
    assert(api.saveState(state, storage).ok);
    const before = storage.getItem(api.STORAGE_KEY);
    const result = api.importBackupText('{"schema":"wrong"}', storage);
    assert(!result.ok);
    assertEqual(storage.getItem(api.STORAGE_KEY), before);
  });

  test("Backup с нарушенной referential integrity отклоняется", () => {
    const state = api.createDemoState();
    state.assets.push({ id: "asset-1", projectId: "missing-project" });
    const payload = {
      schema: api.BACKUP_SCHEMA,
      version: api.STATE_VERSION,
      exportedAt: new Date().toISOString(),
      state
    };
    const result = api.validateBackup(payload);
    assert(!result.ok);
    assert(result.errors.some((item) => item.includes("assets")));
  });

  test("HTML escaping исключает разметку из dynamic values", () => {
    const escaped = api.escapeHtml('<img src=x onerror="alert(1)">');
    assert(!escaped.includes("<img"));
    assert(escaped.includes("&lt;img"));
  });

  test("Extron v1 contract распознаётся и проходит validation", () => {
    const payload = fixtures.snapshots.baseline();
    assertEqual(api.detectSnapshotProfile(payload), "extron-v1");
    const result = api.validateExtronV1(payload);
    assert(result.ok, result.errors.join("; "));
  });

  test("Extron v1 contract отклоняет отсутствующее required field и неверный completeness enum", () => {
    const missing = fixtures.snapshots.baseline();
    delete missing.collectorVersion;
    assert(!api.validateExtronV1(missing).ok);
    const invalidEnum = fixtures.snapshots.baseline();
    invalidEnum.completeness.devices = "maybe";
    assert(!api.validateExtronV1(invalidEnum).ok);
  });

  test("Неизвестная schemaVersion классифицируется unsupported", () => {
    const payload = fixtures.snapshots.baseline();
    payload.schemaVersion = "9.0";
    assertEqual(api.detectSnapshotProfile(payload), "unsupported");
  });

  test("Legacy Extron определяется детерминированно", () => {
    const payload = fixtures.snapshots.legacy();
    assertEqual(api.detectSnapshotProfile(payload), "extron-legacy-v1");
    const metadata = api.deriveLegacyMetadata(payload);
    assert(metadata.ok);
    assertEqual(metadata.capturedAt, "2026-06-01T06:41:28.000Z");
  });

  test("Formatting normalizers устраняют только незначимые различия", () => {
    assertEqual(api.normalizeMac("AA-BB-CC-DD-EE-01"), "aa:bb:cc:dd:ee:01");
    assertEqual(api.normalizeText(" Main   Panel "), "main panel");
    assertEqual(api.normalizeBoolean("Off"), false);
    assertEqual(api.normalizeBoolean("true"), true);
    assertEqual(api.normalizeUnordered(["b", "a", "a"]).join(","), "a,a,b");
  });

  test("Normalization объединяет доказанные source duplicates", () => {
    const result = api.normalizeSnapshot(fixtures.snapshots.baseline(), "extron-v1");
    assertEqual(result.assetObservations.length, 3, "Controller + 2 devices expected");
    assert(!result.qualityIssues.some((issue) => issue.code === "duplicate_source_conflict"));
  });

  test("Normalization отмечает конфликт доказанных source duplicates", () => {
    const payload = fixtures.snapshots.baseline();
    const duplicate = JSON.parse(JSON.stringify(payload.webBlocks["Project Info"]["Connected Devices"][0]));
    duplicate.name = "Conflicting panel name";
    payload.webBlocks["Project Info"]["TLP Project"].systemdevs.push(duplicate);
    const result = api.normalizeSnapshot(payload, "extron-v1");
    assert(result.qualityIssues.some((issue) => issue.code === "duplicate_source_conflict"));
  });

  test("Secret detection возвращает marker без raw secret", () => {
    const payload = fixtures.snapshots.baseline();
    payload.successfulCredential = { username: "synthetic", password: "SYNTHETIC-SECRET" };
    const issues = api.detectSecrets(payload);
    assertEqual(issues.length, 1);
    assertEqual(issues[0].code, "secret_detected");
    assert(!JSON.stringify(issues).includes("SYNTHETIC-SECRET"));
  });

  test("Первый supported snapshot создаёт Project/Assets без ChangeSet", async () => {
    const state = api.createDemoState();
    const result = await api.ingestSnapshotText(state, {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    assertEqual(result.outcome, "processed");
    assertEqual(result.state.projects.length, 1);
    assertEqual(result.state.snapshots.length, 1);
    assertEqual(result.state.assets.length, 3);
    assertEqual(result.state.changeSets.length, 0);
  });

  test("IP change остаётся тем же Asset и создаёт один event", async () => {
    let state = api.createDemoState();
    let result = await api.ingestSnapshotText(state, { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    state = result.state;
    result = await api.ingestSnapshotText(state, { name: "ip-changed.json", text: JSON.stringify(fixtures.snapshots.variant("ip")), uploadedById: "user-av-engineer" });
    assertEqual(result.outcome, "processed");
    const events = result.state.changeSets.at(-1).events;
    assertEqual(events.length, 1);
    assertEqual(events[0].eventType, "ip_changed");
    assertEqual(events[0].changeSetId, result.state.changeSets.at(-1).id);
    assertEqual(events[0].oldValue, "10.20.30.21");
    assertEqual(events[0].newValue, "10.20.30.31");
  });

  [
    ["mac", "mac_changed"],
    ["name", "name_changed"],
    ["added", "device_added"]
  ].forEach(([variant, expectedEvent]) => {
    test(`${variant} fixture создаёт ${expectedEvent}`, async () => {
      let result = await api.ingestSnapshotText(api.createDemoState(), {
        name: "baseline.json",
        text: JSON.stringify(fixtures.snapshots.baseline()),
        uploadedById: "user-av-engineer"
      });
      result = await api.ingestSnapshotText(result.state, {
        name: `${variant}.json`,
        text: JSON.stringify(fixtures.snapshots.variant(variant)),
        uploadedById: "user-av-engineer"
      });
      assert(result.state.changeSets.at(-1).events.some((event) => event.eventType === expectedEvent));
    });
  });

  test("Formatting-only snapshot не создаёт ChangeEvent", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "formatting-only.json", text: JSON.stringify(fixtures.snapshots.variant("formatting")), uploadedById: "user-av-engineer" });
    assertEqual(result.state.changeSets.at(-1).events.length, 0);
  });

  test("Повтор идентичных bytes не создаёт второй Snapshot", async () => {
    const text = JSON.stringify(fixtures.snapshots.baseline());
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text, uploadedById: "user-av-engineer" });
    const historyCount = result.state.history.length;
    result = await api.ingestSnapshotText(result.state, { name: "duplicate.json", text, uploadedById: "user-av-engineer" });
    assertEqual(result.outcome, "duplicate");
    assertEqual(result.state.snapshots.length, 1);
    assertEqual(result.state.history.length, historyCount);
  });

  test("Ambiguous stable identity блокирует definitive field change", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    const original = result.state.assets.find((asset) => asset.kind === "touch_panel");
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = `${original.id}-ambiguous`;
    result.state.assets.push(duplicate);
    result = await api.ingestSnapshotText(result.state, {
      name: "ip-changed.json",
      text: JSON.stringify(fixtures.snapshots.variant("ip")),
      uploadedById: "user-av-engineer"
    });
    const events = result.state.changeSets.at(-1).events;
    assert(events.some((event) => event.eventType === "match_review_required"));
    assert(!events.some((event) => event.eventType === "ip_changed"));
  });

  test("Complete section создаёт confirmed_removal", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "removed.json", text: JSON.stringify(fixtures.snapshots.variant("removed")), uploadedById: "user-av-engineer" });
    assert(result.state.changeSets.at(-1).events.some((event) => event.eventType === "confirmed_removal"));
  });

  test("Unknown completeness создаёт possible_removal", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "missing.json", text: JSON.stringify(fixtures.snapshots.variant("missing")), uploadedById: "user-av-engineer" });
    assert(result.state.changeSets.at(-1).events.some((event) => event.eventType === "possible_removal"));
  });

  test("Legacy snapshot ожидает manual project mapping", async () => {
    const result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "sample-a.json",
      text: JSON.stringify(fixtures.snapshots.legacy()),
      uploadedById: "user-av-engineer"
    });
    assertEqual(result.outcome, "needs_mapping");
    assertEqual(result.state.snapshots[0].status, "needs_project_mapping");
    const mapped = api.mapSnapshotToProject(result.state, result.snapshotId, {
      displayName: "Legacy Room",
      actorId: "user-av-engineer"
    });
    assert(mapped.ok, mapped.errors?.join("; "));
    assertEqual(mapped.state.snapshots[0].status, "partial");
    assertEqual(mapped.state.projects.length, 1);
  });

  test("End-to-end intake сохраняет previous comparison и восстанавливает его из storage", async () => {
    const storage = new MemoryStorage();
    let result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    assert(api.saveState(result.state, storage).ok);
    result = await api.ingestSnapshotText(api.loadState(storage).state, {
      name: "ip-changed.json",
      text: JSON.stringify(fixtures.snapshots.variant("ip")),
      uploadedById: "user-av-engineer"
    });
    assert(api.saveState(result.state, storage).ok);
    const restored = api.loadState(storage).state;
    assertEqual(restored.snapshots.length, 2);
    assertEqual(restored.changeSets.length, 1);
    assertEqual(restored.changeSets[0].events[0].eventType, "ip_changed");
  });

  test("Raw input больше прежних 3 MiB не отклоняется quota guard", async () => {
    const state = api.createDemoState();
    const result = await api.ingestSnapshotText(state, {
      name: "too-large.json",
      text: "x".repeat(4 * 1024 * 1024),
      uploadedById: "user-av-engineer"
    });
    assert(result.outcome !== "quota_rejected");
  });

  test("Timeline сортируется по capturedAt, сохраняя отдельный uploadedAt", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), {
      name: "baseline.json",
      text: JSON.stringify(fixtures.snapshots.baseline()),
      uploadedById: "user-av-engineer"
    });
    result = await api.ingestSnapshotText(result.state, {
      name: "ip-changed.json",
      text: JSON.stringify(fixtures.snapshots.variant("ip")),
      uploadedById: "user-av-engineer"
    });
    result = await api.ingestSnapshotText(result.state, {
      name: "late-snapshot.json",
      text: JSON.stringify(fixtures.snapshots.late()),
      uploadedById: "user-av-engineer"
    });
    const projectId = result.state.projects[0].id;
    const timeline = api.getProjectTimeline(result.state, projectId);
    assertEqual(timeline.map((item) => item.capturedAt).join("|"), timelineExpected.capturedOrder.join("|"));
    assert(timeline.every((item) => item.uploadedAt), "uploadedAt должен сохраняться отдельно");
    assertEqual(api.getProjectCurrentSnapshot(result.state, projectId).capturedAt, timelineExpected.capturedOrder.at(-1));
    const currentState = api.getProjectCurrentState(result.state, projectId);
    const mainPanel = currentState.assets.find(({ asset }) => asset.displayName === "Main Panel");
    assertEqual(mainPanel.observation.fields.ipAddress.rawValue, "10.20.30.31");
  });

  test("Timeline ties имеют стабильный порядок независимо от порядка массива state", async () => {
    const firstPayload = fixtures.snapshots.baseline();
    const secondPayload = fixtures.snapshots.variant("name");
    secondPayload.capturedAt = firstPayload.capturedAt;
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "a.json", text: JSON.stringify(firstPayload), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "b.json", text: JSON.stringify(secondPayload), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const forward = api.getProjectTimeline(result.state, projectId).map((item) => item.rawSha256).join("|");
    const reversedState = JSON.parse(JSON.stringify(result.state));
    reversedState.snapshots.reverse();
    const reversed = api.getProjectTimeline(reversedState, projectId).map((item) => item.rawSha256).join("|");
    assertEqual(reversed, forward);
  });

  test("Selected-date comparison идемпотентно сравнивает две даты одного Project", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "ip-changed.json", text: JSON.stringify(fixtures.snapshots.variant("ip")), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const timeline = api.getProjectTimeline(result.state, projectId);
    const first = api.createSelectedComparison(result.state, projectId, timeline[1].id, timeline[0].id);
    assert(first.ok, first.errors?.join("; "));
    const second = api.createSelectedComparison(first.state, projectId, timeline[0].id, timeline[1].id);
    assert(second.ok, second.errors?.join("; "));
    assertEqual(second.changeSetId, first.changeSetId);
    assertEqual(second.state.changeSets.filter((item) => item.mode === "selected").length, 1);
    assertEqual(second.state.changeSets.find((item) => item.id === second.changeSetId).events[0].eventType, "ip_changed");
    assert(api.validateState(second.state).ok);
  });

  test("Late snapshot перестраивает active previous graph без удаления старого ChangeSet", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "ip-changed.json", text: JSON.stringify(fixtures.snapshots.variant("ip")), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const oldChangeSetId = api.getActivePreviousChangeSets(result.state, projectId)[0].id;
    result = await api.ingestSnapshotText(result.state, { name: "late-snapshot.json", text: JSON.stringify(fixtures.snapshots.late()), uploadedById: "user-av-engineer" });
    const timeline = api.getProjectTimeline(result.state, projectId);
    const byId = new Map(timeline.map((item) => [item.id, item]));
    const activeEdges = api.getActivePreviousChangeSets(result.state, projectId).map((item) => [byId.get(item.fromSnapshotId).capturedAt, byId.get(item.toSnapshotId).capturedAt]);
    assertEqual(JSON.stringify(activeEdges), JSON.stringify(timelineExpected.activePreviousEdges));
    const superseded = result.state.changeSets.find((item) => item.id === oldChangeSetId);
    assertEqual(superseded.status, "superseded");
    assert(result.state.changeSets.some((item) => item.supersedesId === oldChangeSetId));
    assertEqual(result.state.changeSets.length, 3);
    assert(api.validateState(result.state).ok);
  });

  test("Baseline replacement сохраняет историю и единственный active assignment", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "ip-changed.json", text: JSON.stringify(fixtures.snapshots.variant("ip")), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const timeline = api.getProjectTimeline(result.state, projectId);
    const first = api.assignBaseline(result.state, projectId, timeline[0].id, { actorId: "user-av-engineer", reason: "Initial approval" });
    assert(first.ok, first.errors?.join("; "));
    const rejected = api.assignBaseline(first.state, projectId, timeline[1].id, { actorId: "user-av-engineer", reason: "Unconfirmed update" });
    assert(!rejected.ok);
    assertEqual(rejected.state.baselineAssignments.length, 1);
    const second = api.assignBaseline(rejected.state, projectId, timeline[1].id, { actorId: "user-av-engineer", reason: "Approved update", confirmReplace: true });
    assert(second.ok, second.errors?.join("; "));
    assertEqual(second.state.baselineAssignments.length, 2);
    assertEqual(second.state.baselineAssignments[0].status, baselineExpected.assignmentStatuses.replaced);
    assertEqual(second.state.baselineAssignments[1].status, baselineExpected.assignmentStatuses.active);
    assertEqual(second.state.baselineAssignments[1].supersedesId, second.state.baselineAssignments[0].id);
    assertEqual(second.state.baselineAssignments.filter((item) => item.status === "active").length, 1);
    assertEqual(api.getActiveBaselineAssignment(second.state, projectId).id, second.state.baselineAssignments[1].id);
  });

  test("Persistent baseline drift остаётся видимым при пустом latest previous diff", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const baselineSnapshotId = result.state.snapshots[0].id;
    const assigned = api.assignBaseline(result.state, projectId, baselineSnapshotId, { actorId: "user-av-engineer", reason: "Approved configuration" });
    assert(assigned.ok, assigned.errors?.join("; "));
    result = await api.ingestSnapshotText(assigned.state, { name: "ip-changed.json", text: JSON.stringify(fixtures.snapshots.variant("ip")), uploadedById: "user-av-engineer" });
    result = await api.ingestSnapshotText(result.state, { name: "persistent-drift.json", text: JSON.stringify(baselineExpected.persistentDrift()), uploadedById: "user-av-engineer" });
    const latestPrevious = api.getActivePreviousChangeSets(result.state, projectId).at(-1);
    assertEqual(latestPrevious.events.length, 0);
    const drift = api.getBaselineDrift(result.state, projectId);
    assert(drift.assignment);
    assertEqual(drift.currentSnapshot.id, api.getProjectCurrentSnapshot(result.state, projectId).id);
    assert(drift.events.some((event) => event.eventType === baselineExpected.driftEventType));
    assertEqual(result.state.changeSets.filter((item) => item.mode === "baseline" && item.status === "active").length, 1);
    assertEqual(result.state.changeSets.filter((item) => item.mode === "baseline" && item.status === "superseded").length, 2);
  });

  test("Expiration-pending baseline нельзя завершить без явного подтверждения", async () => {
    let result = await api.ingestSnapshotText(api.createDemoState(), { name: "baseline.json", text: JSON.stringify(fixtures.snapshots.baseline()), uploadedById: "user-av-engineer" });
    const projectId = result.state.projects[0].id;
    const assigned = api.assignBaseline(result.state, projectId, result.state.snapshots[0].id, { actorId: "user-av-engineer", reason: "Approved" });
    const pending = api.markBaselineExpirationPending(assigned.state, projectId, { actorId: "system", reason: "Retention candidate" });
    assert(pending.ok, pending.errors?.join("; "));
    assertEqual(api.getActiveBaselineAssignment(pending.state, projectId).status, baselineExpected.assignmentStatuses.pending);
    const rejected = api.endBaseline(pending.state, projectId, { actorId: "user-av-engineer", reason: "Cleanup", confirmExpiration: false });
    assert(!rejected.ok);
    assert(rejected.errors.some((item) => item.includes(baselineExpected.expirationGuardError)));
    const ended = api.endBaseline(pending.state, projectId, { actorId: "user-av-engineer", reason: "Explicit cleanup", confirmExpiration: true });
    assert(ended.ok, ended.errors?.join("; "));
    assertEqual(ended.state.baselineAssignments[0].status, baselineExpected.assignmentStatuses.ended);
    assertEqual(api.getActiveBaselineAssignment(ended.state, projectId), null);
    assertEqual(ended.state.changeSets.filter((item) => item.mode === "baseline" && item.status === "active").length, 0);
    assert(api.validateState(ended.state).ok);
  });

  test("Change Event contract содержит обязательные поля и безопасные evidence", async () => {
    const result = await createIpChangeState();
    const changeSet = result.state.changeSets.find((item) => item.mode === "previous" && item.status === "active");
    const event = changeSet.events[0];
    ["id", "changeSetId", "projectId", "entityType", "eventType", "category", "severity", "fromSnapshotId", "toSnapshotId", "matchConfidence", "ruleId", "rulesetVersion", "evidence", "reviewStatus", "createdAt"].forEach((field) => {
      assert(Object.prototype.hasOwnProperty.call(event, field), `Change Event должен содержать ${field}`);
    });
    assertEqual(event.changeSetId, changeSet.id);
    assert(event.evidence.every((item) => item.sourcePath && !JSON.stringify(item).includes("SYNTHETIC-SECRET")));
  });

  test("Event selector применяет project/period/entity/category/type/severity/confidence/review filters", async () => {
    const result = await createIpChangeState();
    const projectId = result.state.projects[0].id;
    const event = result.state.changeSets.find((item) => item.mode === "previous" && item.status === "active").events[0];
    const filters = {
      projectId,
      dateFrom: "2026-06-08T00:00:00Z",
      dateTo: "2026-06-08T23:59:59Z",
      entityType: event.entityType,
      category: event.category,
      eventType: event.eventType,
      severity: event.severity,
      matchConfidence: event.matchConfidence,
      reviewStatus: "unreviewed"
    };
    assertEqual(api.getChangeEvents(result.state, filters).length, 1);
    assertEqual(api.getChangeEvents(result.state, Object.assign({}, filters, { severity: "critical" })).length, 0);
  });

  test("ReviewDecision append-only и latest projection не меняют исходное событие", async () => {
    const result = await createIpChangeState();
    const originalState = JSON.stringify(result.state.snapshots);
    const event = result.state.changeSets.find((item) => item.mode === "previous" && item.status === "active").events[0];
    const first = api.addReviewDecision(result.state, event.id, { decision: "expected", comment: "Approved synthetic change", actorId: "user-av-engineer" });
    assert(first.ok, first.errors?.join("; "));
    const second = api.addReviewDecision(first.state, event.id, { decision: "needs_attention", comment: "Needs follow-up", actorId: "user-av-engineer" });
    assert(second.ok, second.errors?.join("; "));
    assertEqual(second.state.reviewDecisions.length, 2);
    assertEqual(second.state.reviewDecisions[1].supersedesId, second.state.reviewDecisions[0].id);
    assertEqual(api.getLatestReviewDecision(second.state, event.id).decision, "needs_attention");
    assertEqual(api.getChangeEvents(second.state, { reviewStatus: "needs_attention" }).length, 1);
    assertEqual(JSON.stringify(second.state.snapshots), originalState);
  });

  test("Единственная роль разрешает действия администратора, а режимы запуска выбираются fail-closed", () => {
    const state = api.createDemoState();
    assert(!api.canPerformAction(state, "user-av-engineer", "review_event"));
    assert(!api.canPerformAction(state, "user-av-engineer", "export_backup"));
    assert(!api.canPerformAction(state, "user-av-engineer", "reset_state"));
    assert(!api.canPerformAction(state, "user-av-engineer", "manage_users"));
    assert(api.canPerformAction(state, "user-administrator", "reset_state"));
    assertEqual(state.users.length, 1);
    assertEqual(api.resolveLaunchMode({ protocol: "file:", fileMarker: true }).kind, "file");
    assertEqual(api.resolveLaunchMode({ protocol: "http:", secureMarker: true }), null);
    assertEqual(api.resolveLaunchMode({ protocol: "http:" }), null);
    const first = api.createVolatileStorage();
    first.setItem("synthetic", "value");
    assertEqual(first.getItem("synthetic"), "value");
    assertEqual(api.createVolatileStorage().getItem("synthetic"), null);
  });

  test("MatchDecision choose пересчитывает зависимый diff и сохраняет старый ChangeSet", async () => {
    const setup = await createAmbiguousState();
    const projectId = setup.result.state.projects[0].id;
    const snapshot = api.getProjectCurrentSnapshot(setup.result.state, projectId);
    const observation = snapshot.assetObservations.find((item) => !item.assetId && item.matchCandidates.length);
    const oldChangeSet = api.getActivePreviousChangeSets(setup.result.state, projectId)[0];
    const rawSnapshotsBefore = setup.result.state.snapshots.map((item) => item.rawText).join("|");
    const resolved = api.resolveMatchDecision(setup.result.state, snapshot.id, observation.id, {
      action: "choose",
      selectedAssetId: setup.original.id,
      actorId: "user-av-engineer",
      reason: "Confirmed by synthetic inventory"
    });
    assert(resolved.ok, resolved.errors?.join("; "));
    assertEqual(resolved.state.matchDecisions.length, 1);
    assertEqual(resolved.state.changeSets.find((item) => item.id === oldChangeSet.id).status, "superseded");
    const active = api.getActivePreviousChangeSets(resolved.state, projectId)[0];
    assert(active.events.some((item) => item.eventType === "ip_changed"));
    assert(!active.events.some((item) => item.eventType === "match_review_required"));
    assertEqual(resolved.state.snapshots.map((item) => item.rawText).join("|"), rawSnapshotsBefore);
  });

  test("MatchDecision history append-only и unresolved selector отражает последнее решение", async () => {
    const setup = await createAmbiguousState();
    const projectId = setup.result.state.projects[0].id;
    const snapshot = api.getProjectCurrentSnapshot(setup.result.state, projectId);
    const observation = snapshot.assetObservations.find((item) => !item.assetId && item.matchCandidates.length);
    const chosen = api.resolveMatchDecision(setup.result.state, snapshot.id, observation.id, { action: "choose", selectedAssetId: setup.original.id, actorId: "user-av-engineer", reason: "First decision" });
    const unmatched = api.resolveMatchDecision(chosen.state, snapshot.id, observation.id, { action: "unmatched", actorId: "user-av-engineer", reason: "Reverted after review" });
    assert(unmatched.ok, unmatched.errors?.join("; "));
    assertEqual(unmatched.state.matchDecisions.length, 2);
    assertEqual(unmatched.state.matchDecisions[1].supersedesId, unmatched.state.matchDecisions[0].id);
    assert(api.getUnresolvedMatches(unmatched.state, projectId).some((item) => item.observation.id === observation.id));
    assert(api.validateState(unmatched.state).ok);
  });

  test("MatchDecision create_new и replace создают явную Asset identity", async () => {
    const createSetup = await createAmbiguousState();
    const createProjectId = createSetup.result.state.projects[0].id;
    const createSnapshot = api.getProjectCurrentSnapshot(createSetup.result.state, createProjectId);
    const createObservation = createSnapshot.assetObservations.find((item) => !item.assetId && item.matchCandidates.length);
    const created = api.resolveMatchDecision(createSetup.result.state, createSnapshot.id, createObservation.id, {
      action: "create_new",
      actorId: "user-av-engineer",
      reason: "Confirmed distinct hardware"
    });
    assert(created.ok, created.errors?.join("; "));
    assert(created.resolvedAssetId);
    assert(!api.getUnresolvedMatches(created.state, createProjectId).some((item) => item.observation.id === createObservation.id));

    const replaceSetup = await createAmbiguousState();
    const replaceProjectId = replaceSetup.result.state.projects[0].id;
    const replaceSnapshot = api.getProjectCurrentSnapshot(replaceSetup.result.state, replaceProjectId);
    const replaceObservation = replaceSnapshot.assetObservations.find((item) => !item.assetId && item.matchCandidates.length);
    const replaced = api.resolveMatchDecision(replaceSetup.result.state, replaceSnapshot.id, replaceObservation.id, {
      action: "replace",
      selectedAssetId: replaceSetup.original.id,
      actorId: "user-av-engineer",
      reason: "Hardware replacement confirmed"
    });
    assert(replaced.ok, replaced.errors?.join("; "));
    const oldAsset = replaced.state.assets.find((item) => item.id === replaceSetup.original.id);
    assertEqual(oldAsset.status, "replaced");
    assertEqual(oldAsset.replacementAssetId, replaced.resolvedAssetId);
    assert(replaced.state.assets.some((item) => item.id === replaced.resolvedAssetId));
  });

  test("Retention удаляет обычный expired snapshot, пишет audit и не создаёт ChangeEvent", async () => {
    const result = await createIpChangeState();
    const oldSnapshot = api.getProjectTimeline(result.state, result.state.projects[0].id)[0];
    const originalEventIds = result.state.changeSets.flatMap((item) => item.events || []).map((item) => item.id);
    result.state.settings.retentionDays = 3;

    const retained = api.applyRetention(result.state, {
      now: "2026-06-08T12:00:00Z",
      actorId: "user-administrator",
      reason: "Scheduled startup retention"
    });

    assert(retained.ok, retained.errors?.join("; "));
    assertEqual(retained.expiredCount, 1);
    assert(!retained.state.snapshots.some((item) => item.id === oldSnapshot.id));
    assertEqual(retained.state.retentionAudits.length, 1);
    assertEqual(retained.state.retentionAudits[0].formerSnapshotId, oldSnapshot.id);
    assertEqual(retained.state.retentionAudits[0].formerRawSha256, oldSnapshot.rawSha256);
    assert(retained.state.retentionAudits[0].removedCounts.changeSets >= 1);
    const remainingEvents = retained.state.changeSets.flatMap((item) => item.events || []);
    assert(remainingEvents.every((item) => originalEventIds.includes(item.id)));
    assert(!remainingEvents.some((item) => item.eventType.includes("retention")));
    assert(api.validateState(retained.state).ok);
  });

  test("Retention сохраняет expired active baseline и переводит его в expiration_pending", async () => {
    const result = await createIpChangeState();
    const projectId = result.state.projects[0].id;
    const oldest = api.getProjectTimeline(result.state, projectId)[0];
    const assigned = api.assignBaseline(result.state, projectId, oldest.id, {
      actorId: "user-av-engineer",
      reason: "Approved synthetic baseline"
    });
    assigned.state.settings.retentionDays = 3;

    const retained = api.applyRetention(assigned.state, {
      now: "2026-06-08T12:00:00Z",
      actorId: "system",
      reason: "Startup retention"
    });

    assert(retained.ok, retained.errors?.join("; "));
    assertEqual(retained.expiredCount, 0);
    assertEqual(retained.pendingBaselineCount, 1);
    assert(retained.state.snapshots.some((item) => item.id === oldest.id));
    assertEqual(api.getActiveBaselineAssignment(retained.state, projectId).status, "expiration_pending");
    assertEqual(retained.state.retentionAudits.length, 0);
    assert(api.validateState(retained.state).ok);
  });

  test("Retention идемпотентен и backup после очистки проходит round-trip", async () => {
    const result = await createIpChangeState();
    result.state.settings.retentionDays = 3;
    const first = api.applyRetention(result.state, { now: "2026-06-08T12:00:00Z", actorId: "user-administrator" });
    const second = api.applyRetention(first.state, { now: "2026-06-08T12:00:00Z", actorId: "user-administrator" });
    assert(first.ok && second.ok);
    assertEqual(second.changed, false);
    assertEqual(second.state.retentionAudits.length, first.state.retentionAudits.length);
    const storage = new MemoryStorage();
    const restored = api.importBackupText(JSON.stringify(api.createBackup(first.state)), storage);
    assert(restored.ok, restored.errors?.join("; "));
    assertEqual(restored.state.snapshots.length, first.state.snapshots.length);
    assertEqual(restored.state.retentionAudits.length, first.state.retentionAudits.length);
  });

  test("Quota failure при сохранении retention не меняет сохранённый state", async () => {
    const result = await createIpChangeState();
    result.state.settings.retentionDays = 3;
    const storage = new MemoryStorage();
    assert(api.saveState(result.state, storage).ok);
    const before = storage.getItem(api.STORAGE_KEY);
    const retained = api.applyRetention(result.state, { now: "2026-06-08T12:00:00Z", actorId: "system" });
    storage.failNextSet = true;
    const saved = api.saveState(retained.state, storage);
    assert(!saved.ok);
    assertEqual(storage.getItem(api.STORAGE_KEY), before);
  });

  test("Corrupt-state recovery блокирует startup retention и сохраняет диагностический raw", () => {
    const corrupt = "{synthetic-corrupt-state";
    const storage = new MemoryStorage({ [api.STORAGE_KEY]: corrupt });
    const loaded = api.loadState(storage);
    assertEqual(loaded.recovery.kind, "corrupt_state");
    assertEqual(storage.getItem(api.STORAGE_KEY), corrupt);
    assertEqual(loaded.state.snapshots.length, 0);
    assertEqual(loaded.state.retentionAudits.length, 0);
  });

  function srHeaders() {
    return [...api.SR_REQUIRED_HEADERS];
  }

  function srRow(overrides) {
    return {
      "Название комнаты": "Переговорная 101", "Адрес комнаты": "Москва", "VIP комната": "Да",
      "Тип оборудования": "endpoint", "Наименование": "ВКС", "Модель": "Room Kit",
      "Тип модели": "Video Conference", "Производитель": "Cisco", "IP": " 10.10.20.30 ",
      "MAC": "00-11-22-33-44-55", "SIP URI": "room@example.test", "Инвентарный номер": "INV-1",
      "Серийный номер": "SER-1", "VIP оборудование": "Нет", ...(overrides || {})
    };
  }

  test("SR import принимает optional Домен, классифицирует категории и сохраняет raw", () => {
    const result = api.importSrRows(api.createDemoState(), {
      filename: "sr.xlsx", headers: srHeaders(), rawSha256: "sr-1",
      rows: [srRow(), srRow({ "Инвентарный номер": "INV-2", "Серийный номер": "SER-2", "MAC": "00-11-22-33-44-56", "IP": "10.10.20.31", "Тип оборудования": "controller", "Тип модели": "Контроллер", "Производитель": "Extron" }), srRow({ "Инвентарный номер": "INV-3", "Серийный номер": "SER-3", "MAC": "00-11-22-33-44-57", "IP": "10.10.20.32", "Тип модели": "Панель управления", "Производитель": "Extron" })]
    });
    assert(result.ok, result.errors?.join("; "));
    assertEqual(result.state.inventoryDevices.length, 3);
    assertEqual(result.state.inventoryDevices.map((item) => item.category).sort().join(","), "controller,panel,vcs");
    assertEqual(result.state.inventoryDevices[0].domain, null);
    assertEqual(result.state.inventoryDevices[0].rawRow.IP, " 10.10.20.30 ");
  });

  test("Повторная SR сохраняет Device identity, IP history и флаг актуальности", () => {
    let result = api.importSrRows(api.createDemoState(), { filename: "one.xlsx", headers: srHeaders(), rawSha256: "one", rows: [srRow(), srRow({ "Инвентарный номер": "INV-OLD", "Серийный номер": "SER-OLD", "MAC": "00-11-22-33-44-99", "IP": "10.10.20.99" })] });
    const stableId = result.state.inventoryDevices.find((item) => item.inventoryNumber === "INV-1").id;
    result = api.importSrRows(result.state, { filename: "two.xlsx", headers: srHeaders(), rawSha256: "two", rows: [srRow({ IP: "10.10.20.40" })] });
    const current = result.state.inventoryDevices.find((item) => item.id === stableId);
    assertEqual(current.ipNormalized, "10.10.20.40");
    assert(current.ipHistory.includes("10.10.20.30"));
    assertEqual(result.state.inventoryDevices.find((item) => item.inventoryNumber === "INV-OLD").inCurrentSr, false);
  });

  test("XLSX parser читает локальный workbook без CDN", async () => {
    const sheet = global.XLSX.utils.aoa_to_sheet([srHeaders(), srHeaders().map((header) => srRow()[header])]);
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, sheet, "SR");
    const bytes = global.XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const result = await api.importSrWorkbook(api.createDemoState(), { filename: "local.xlsx", arrayBuffer: bytes, actorId: "user-administrator" });
    assert(result.ok, result.errors?.join("; "));
    assertEqual(result.state.inventoryDevices.length, 1);
  });

  test("Polling run связывает filename IP, классифицирует Extron и считает изменения", async () => {
    let sr = api.importSrRows(api.createDemoState(), { filename: "sr.xlsx", headers: srHeaders(), rawSha256: "poll-sr", rows: [srRow({ "Тип оборудования": "controller", "Тип модели": "Контроллер", "Производитель": "Extron" })] });
    const first = { ok: true, ping: { ok: true }, webBlocks: { "Project Info": { "Controller Type": "Primary Controller", Version: "1" }, Firmware: { version: "1.0" } } };
    let imported = await api.ingestPollingRunFiles(sr.state, { folderName: "2026-06-01_09-41-28", files: [{ name: "10.10.20.30.json", text: JSON.stringify(first) }] });
    const second = api.deepClone(first); second.webBlocks.Firmware.version = "1.1";
    imported = await api.ingestPollingRunFiles(imported.state, { folderName: "2026-06-02_09-41-28", files: [{ name: "10.10.20.30.json", text: JSON.stringify(second) }] });
    assertEqual(imported.state.pollingResults.length, 2);
    assertEqual(imported.state.pollingResults[0].matchStatus, "matched");
    assertEqual(imported.state.pollingResults[0].detectedCategory, "controller");
    assert(imported.state.deviceChanges.some((item) => item.path.includes("Firmware.version")));
  });

  test("Polling сохраняет malformed и unmatched как отдельные file-scoped issues", async () => {
    const result = await api.ingestPollingRunFiles(api.createDemoState(), { folderName: "2026-06-01_09-41-28", files: [{ name: "bad-name.json", text: "{" }, { name: "10.20.30.40.json", text: JSON.stringify({ ok: false, failedStage: "ping", ping: { ok: false } }) }] });
    assertEqual(result.state.pollingResults.length, 2);
    assertEqual(result.state.pollingResults[0].parseStatus, "malformed");
    assertEqual(result.state.pollingResults[1].pingStatus, "failed");
    assert(result.state.inventoryIssues.some((item) => item.kind === "malformed_json"));
    assert(result.state.inventoryIssues.some((item) => item.kind === "unmatched_ip"));
  });

  test("Пакетный импорт создаёт отдельные запуски и сохраняет provenance пути", async () => {
    const imported = await api.ingestPollingFolderTree(api.createDemoState(), {
      files: [
        { name: "10.0.0.2.json", relativePath: "export/2026-06-02_10-15-00/nested/10.0.0.2.json", text: JSON.stringify({ ok: true }) },
        { name: "10.0.0.1.json", relativePath: "export/2026-06-01_09-41-28/10.0.0.1.json", text: JSON.stringify({ ok: true }) },
        { name: "bad.json", relativePath: "export/2026-06-02_10-15-00/bad.json", text: "{" },
        { name: "unreadable.json", relativePath: "export/2026-06-02_10-15-00/unreadable.json", readError: "synthetic read failure" },
        { name: "outside.json", relativePath: "export/no-date/outside.json", text: "{}" },
        { name: "note.txt", relativePath: "export/note.txt" }
      ]
    });
    assert(imported.ok, imported.errors?.join("; "));
    assertEqual(imported.state.pollingRuns.length, 2);
    assert(new Date(imported.state.pollingRuns[0].capturedAt) < new Date(imported.state.pollingRuns[1].capturedAt));
    assertEqual(imported.state.pollingResults.length, 3);
    assertEqual(imported.state.pollingResults.find((item) => item.filename === "10.0.0.2.json").sourceRelativePath, "export/2026-06-02_10-15-00/nested/10.0.0.2.json");
    assertEqual(imported.rejected.length, 1);
    assertEqual(imported.ignored.length, 1);
    assertEqual(imported.readErrors.length, 1);
    assertEqual(imported.outcome, "partial");
  });

  test("Пакет без пригодных JSON не изменяет состояние", async () => {
    const initial = api.createDemoState();
    const imported = await api.ingestPollingFolderTree(initial, {
      files: [{ name: "outside.json", relativePath: "export/no-date/outside.json", text: "{}" }]
    });
    assert(!imported.ok);
    assertEqual(imported.state.pollingRuns.length, 0);
    assertEqual(imported.state.pollingResults.length, 0);
  });

  function scalablePollingFiles(count, options) {
    const settings = options || {};
    const devices = Math.max(1, settings.devices || count);
    return Array.from({ length: count }, (_, index) => {
      const deviceIndex = index % devices;
      const runIndex = Math.floor(index / devices);
      const day = String(runIndex + 1).padStart(2, "0");
      const ip = `10.40.${Math.floor(deviceIndex / 250)}.${(deviceIndex % 250) + 1}`;
      return {
        name: `${ip}.json`,
        relativePath: `root/2026-07-${day}_09-00-00/${ip}.json`,
        text: JSON.stringify({ ok: true, ping: { ok: true }, webBlocks: { Firmware: { version: `${runIndex}.${deviceIndex}` } } })
      };
    });
  }

  function scalablePollingState(deviceCount) {
    const state = api.createDemoState();
    state.inventoryDevices = Array.from({ length: deviceCount }, (_, index) => ({
      id: `scalable-device-${index}`,
      category: "controller",
      ipNormalized: `10.40.${Math.floor(index / 250)}.${(index % 250) + 1}`,
      ipHistory: [],
      inCurrentSr: true,
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      pollingCapability: { support: "not_implemented", transport: null }
    }));
    return state;
  }

  function pollingSemanticProjection(state) {
    return {
      runs: state.pollingRuns.map((run) => ({ identityKey: run.identityKey, fileCount: run.fileCount, successCount: run.successCount, errorCount: run.errorCount })),
      results: state.pollingResults.map((result) => ({ filename: result.filename, sourceRelativePath: result.sourceRelativePath, capturedAt: result.capturedAt, parseStatus: result.parseStatus, pollStatus: result.pollStatus, pingStatus: result.pingStatus, matchStatus: result.matchStatus, deviceId: result.deviceId, detectedCategory: result.detectedCategory, normalizedData: result.normalizedData })),
      issues: state.inventoryIssues.map((issue) => issue.kind).sort(),
      changes: state.deviceChanges.map((change) => ({ deviceId: change.deviceId, path: change.path, oldValue: change.oldValue, newValue: change.newValue })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    };
  }

  test("Индексированный пакетный импорт семантически совпадает с последовательным", async () => {
    const files = scalablePollingFiles(6, { devices: 2 });
    files.push({ name: "bad.json", relativePath: "root/2026-07-04_09-00-00/bad.json", text: "{" });
    const initial = scalablePollingState(2);
    const legacy = await api.ingestPollingFolderTree(api.deepClone(initial), { files, actorId: "system" });
    const optimized = await api.processPollingImportBatches(api.deepClone(initial), { files, actorId: "system", batchSize: 2, concurrency: 2, yieldControl: async () => {} });
    assert(optimized.ok, optimized.errors?.join("; "));
    assert(api.validateState(optimized.state).ok, api.validateState(optimized.state).errors?.join("; "));
    assertEqual(JSON.stringify(pollingSemanticProjection(optimized.state)), JSON.stringify(pollingSemanticProjection(legacy.state)));
  });

  test("Пакетный импорт ограничивает чтение, yield-ит и публикует согласованный прогресс", async () => {
    const files = scalablePollingFiles(12, { devices: 12 }).map((file) => ({ ...file, payload: file.text, text: undefined }));
    let activeReads = 0;
    let maxActiveReads = 0;
    let yields = 0;
    const progress = [];
    const result = await api.processPollingImportBatches(scalablePollingState(12), {
      files,
      batchSize: 4,
      concurrency: 3,
      readText: async (file) => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeReads -= 1;
        return file.payload;
      },
      yieldControl: async () => { yields += 1; },
      onProgress: (snapshot) => progress.push(snapshot)
    });
    assert(result.ok);
    assert(maxActiveReads <= 3, `Одновременно читалось ${maxActiveReads}`);
    assert(yields >= 3, `Yield выполнен только ${yields} раз`);
    assertEqual(result.summary.processed, 12);
    assertEqual(result.summary.processed, result.summary.succeeded + result.summary.errors + result.summary.duplicates);
    assert(progress.some((item) => item.stage === "Чтение файлов"));
    assert(progress.some((item) => item.stage === "Готово"));
  });

  test("Индексы дают линейный lookup, быстрые дубликаты и безопасную отмену", async () => {
    const files = scalablePollingFiles(20, { devices: 20 });
    const state = scalablePollingState(20);
    const first = await api.processPollingImportBatches(state, { files, batchSize: 5, yieldControl: async () => {} });
    assertEqual(first.metrics.srLookups, 20);
    assert(first.metrics.diffPairs <= 40);
    const repeated = await api.processPollingImportBatches(first.state, { files, context: first.context, batchSize: 5, yieldControl: async () => {} });
    assertEqual(repeated.summary.duplicates, 20);
    assertEqual(repeated.metrics.parses, 0);
    assertEqual(repeated.metrics.srLookups, 0);
    let stop = false;
    const cancelled = await api.processPollingImportBatches(scalablePollingState(20), {
      files,
      batchSize: 5,
      shouldCancel: () => stop,
      yieldControl: async () => { stop = true; }
    });
    assert(cancelled.cancelled);
    assert(cancelled.summary.processed > 0 && cancelled.summary.processed < files.length);
    assertEqual(cancelled.summary.processed, cancelled.state.pollingResults.length);
    assert(api.validateState(cancelled.state).ok, api.validateState(cancelled.state).errors?.join("; "));
  });

  test("Поздний результат заменяет только затронутую соседнюю пару изменений", async () => {
    const state = scalablePollingState(1);
    const payload = (version) => JSON.stringify({ ok: true, ping: { ok: true }, webBlocks: { Firmware: { version } } });
    const first = await api.processPollingImportBatches(state, { files: [
      { name: "10.40.0.1.json", relativePath: "root/2026-07-01_09-00-00/10.40.0.1.json", text: payload("1") },
      { name: "10.40.0.1.json", relativePath: "root/2026-07-03_09-00-00/10.40.0.1.json", text: payload("3") }
    ], yieldControl: async () => {} });
    assert(first.state.deviceChanges.some((change) => change.oldValue === "1" && change.newValue === "3"));
    const late = await api.processPollingImportBatches(first.state, { files: [
      { name: "10.40.0.1.json", relativePath: "root/2026-07-02_09-00-00/10.40.0.1.json", text: payload("2") }
    ], context: first.context, yieldControl: async () => {} });
    assert(!late.state.deviceChanges.some((change) => change.oldValue === "1" && change.newValue === "3"));
    assert(late.state.deviceChanges.some((change) => change.oldValue === "1" && change.newValue === "2"));
    assert(late.state.deviceChanges.some((change) => change.oldValue === "2" && change.newValue === "3"));
    assertEqual(late.metrics.diffPairs, 2);
  });

  test("Ежедневный импорт 1000 результатов переиспользует индекс истории 50000", async () => {
    const state = scalablePollingState(1000);
    for (let runIndex = 0; runIndex < 50; runIndex += 1) {
      const capturedAt = new Date(Date.UTC(2026, 0, runIndex + 1, 9, 0, 0)).toISOString();
      const runId = `daily-history-run-${runIndex}`;
      state.pollingRuns.push({ id: runId, identityKey: `${capturedAt}|history-${runIndex}`, capturedAt, fileCount: 1000, successCount: 1000, errorCount: 0 });
      for (let deviceIndex = 0; deviceIndex < 1000; deviceIndex += 1) {
        state.pollingResults.push({
          id: `daily-history-result-${runIndex}-${deviceIndex}`, runId, deviceId: `scalable-device-${deviceIndex}`,
          filename: `history-${deviceIndex}.json`, rawSha256: `history-${runIndex}-${deviceIndex}`, capturedAt,
          parseStatus: "parsed", normalizedData: { version: runIndex }, pollStatus: "success", pingStatus: "ok", matchStatus: "matched"
        });
      }
    }
    const context = api.createPollingImportContext(state);
    const files = Array.from({ length: 1000 }, (_, deviceIndex) => {
      const ip = `10.40.${Math.floor(deviceIndex / 250)}.${(deviceIndex % 250) + 1}`;
      return { name: `${ip}.json`, relativePath: `root/2026-09-01_09-00-00/${ip}.json`, text: JSON.stringify({ ok: true, ping: { ok: true }, version: 50 }) };
    });
    const result = await api.processPollingImportBatches(state, { files, context, yieldControl: async () => {} });
    assertEqual(result.metrics.srLookups, 1000);
    assertEqual(result.metrics.parses, 1000);
    assert(result.metrics.diffPairs <= 2000);
    assertEqual(result.state.pollingResults.length, 51000);
  });

  test("Polling adapter registry честно блокирует реальный опрос", () => {
    const capability = api.resolvePollingCapability({ category: "controller", manufacturerRaw: "Extron" });
    assertEqual(capability.support, "not_implemented");
    assertEqual(capability.transport, null);
    assert(!Object.prototype.hasOwnProperty.call(capability, "poll"));
  });

  test("SR import отклоняет файл без обязательной колонки атомарно", () => {
    const before = api.createDemoState();
    const result = api.importSrRows(before, { filename: "broken.xlsx", headers: srHeaders().filter((item) => item !== "IP"), rows: [srRow()] });
    assert(!result.ok);
    assertEqual(result.state.srImports.length, 0);
    assert(result.errors[0].includes("IP"));
  });

  test("Некорректный IP не блокирует строку с inventory identity", () => {
    const result = api.importSrRows(api.createDemoState(), { filename: "bad-ip.xlsx", headers: srHeaders(), rows: [srRow({ IP: "999.10.1.1" })] });
    assert(result.ok);
    assertEqual(result.state.inventoryDevices.length, 1);
    assertEqual(result.state.inventoryDevices[0].ipNormalized, null);
    assert(result.state.inventoryIssues.some((item) => item.kind === "invalid_ip"));
  });

  test("Одинаковый IP с разными strong IDs не сливает устройства", () => {
    const result = api.importSrRows(api.createDemoState(), { filename: "duplicate-ip.xlsx", headers: srHeaders(), rows: [srRow(), srRow({ "Инвентарный номер": "INV-2", "Серийный номер": "SER-2", "MAC": "00-11-22-33-44-66" })] });
    assertEqual(result.state.inventoryDevices.length, 2);
  });

  test("Повтор polling файла в одном run идемпотентен", async () => {
    const first = await api.ingestPollingRunFiles(api.createDemoState(), { folderName: "2026-06-01_09-41-28", files: [{ name: "10.10.20.30.json", text: "{}" }] });
    const runId = first.runId;
    const repeated = await api.ingestPollingResultText(first.state, { runId, capturedAt: "2026-06-01T06:41:28.000Z", name: "10.10.20.30.json", text: "{}" });
    assertEqual(repeated.outcome, "duplicate");
    assertEqual(repeated.state.pollingResults.length, 1);
  });

  test("Extron classification conflict фиксируется отдельно", async () => {
    const sr = api.importSrRows(api.createDemoState(), { filename: "sr.xlsx", headers: srHeaders(), rows: [srRow({ "Тип модели": "Панель управления", "Производитель": "Extron" })] });
    const payload = { ok: true, ping: { ok: true }, webBlocks: { "Project Info": { "Controller Type": "Primary Controller" } } };
    const result = await api.ingestPollingRunFiles(sr.state, { folderName: "2026-06-01_09-41-28", files: [{ name: "10.10.20.30.json", text: JSON.stringify(payload) }] });
    assertEqual(result.state.pollingResults[0].classificationConflict, true);
    assert(result.state.inventoryIssues.some((item) => item.kind === "classification_conflict"));
  });

  test("Polling plan сохраняет выборку и блокирует execution без credentials", () => {
    const sr = api.importSrRows(api.createDemoState(), { filename: "plan.xlsx", headers: srHeaders(), rows: [srRow({ "Тип оборудования": "controller", "Тип модели": "Контроллер", "Производитель": "Extron" }), srRow({ "Инвентарный номер": "INV-2", "Серийный номер": "SER-2", "MAC": "00-11-22-33-44-77", "IP": "10.10.20.77", "Тип оборудования": "controller", "Тип модели": "Контроллер", "Производитель": "Crestron" })] });
    const result = api.createPollingPlan(sr.state, { category: "controller", scheduledAt: "2026-06-10T10:00:00", actorId: "user-administrator" });
    assert(result.ok, result.errors?.join("; "));
    assertEqual(result.plan.selectionSummary.total, 2);
    assertEqual(result.plan.selectionSummary.implemented, 0);
    assertEqual(result.plan.status, "blocked_no_adapter");
    assert(!JSON.stringify(result.plan).toLowerCase().includes("password"));
  });

  function dashboardFixture() {
    const imported = api.importSrRows(api.createDemoState(), {
      filename: "dashboard-sr.xlsx", importedAt: "2026-08-10T08:00:00.000Z", headers: srHeaders(), rawSha256: "dashboard-sr",
      rows: [
        srRow({ "Название комнаты": "VIP Зал", "VIP комната": "Да", "VIP оборудование": "Да", "Инвентарный номер": "D-1", "Серийный номер": "DS-1", MAC: "02-00-00-00-00-01", IP: "10.20.0.1", "Производитель": "Cisco", "Модель": "Webex Room Kit" }),
        srRow({ "Название комнаты": "VIP Зал", "VIP комната": "Да", "Инвентарный номер": "D-2", "Серийный номер": "DS-2", MAC: "02-00-00-00-00-02", IP: "10.20.0.2", "Тип оборудования": "controller", "Тип модели": "Контроллер", "Производитель": "Extron", "Модель": "IPCP Pro 255" }),
        srRow({ "Название комнаты": "Обычный зал", "Адрес комнаты": "Казань", "VIP комната": "Нет", "Инвентарный номер": "D-3", "Серийный номер": "DS-3", MAC: "02-00-00-00-00-03", IP: "10.20.0.3", "Тип модели": "Панель управления", "Производитель": "Crestron", "Модель": "TS-1070" })
      ]
    });
    const state = imported.state;
    const [vcs, controller, panel] = state.inventoryDevices;
    vcs.pollingCapability = { support: "implemented", transport: "synthetic-test" };
    controller.pollingCapability = { support: "implemented", transport: "synthetic-test" };
    panel.pollingCapability = { support: "not_implemented", transport: null };
    state.pollingRuns.push({ id: "run-old", kind: "import", capturedAt: "2026-08-08T10:00:00.000Z", importedAt: "2026-08-08T10:05:00.000Z", deviceIds: [vcs.id], fileCount: 1, successCount: 1, errorCount: 0 });
    state.pollingRuns.push({ id: "run-latest", kind: "import", capturedAt: "2026-08-10T10:00:00.000Z", importedAt: "2026-08-10T10:05:00.000Z", deviceIds: [vcs.id, controller.id], fileCount: 3, successCount: 1, errorCount: 2 });
    state.pollingResults.push(
      { id: "r-old", runId: "run-old", deviceId: vcs.id, filename: "10.20.0.1.json", capturedAt: "2026-08-08T10:00:00.000Z", importedAt: "2026-08-08T10:05:00.000Z", pollStatus: "error", pingStatus: "failed", matchStatus: "matched", parseStatus: "parsed" },
      { id: "r-vcs", runId: "run-latest", deviceId: vcs.id, filename: "10.20.0.1.json", capturedAt: "2026-08-10T10:00:00.000Z", importedAt: "2026-08-10T10:05:00.000Z", pollStatus: "success", pingStatus: "ok", matchStatus: "matched", parseStatus: "parsed" },
      { id: "r-controller", runId: "run-latest", deviceId: controller.id, filename: "10.20.0.2.json", capturedAt: "2026-08-10T10:00:00.000Z", importedAt: "2026-08-10T10:05:00.000Z", pollStatus: "error", pingStatus: "failed", matchStatus: "matched", parseStatus: "parsed" },
      { id: "r-unmatched", runId: "run-latest", deviceId: null, filename: "10.20.9.9.json", filenameIp: "10.20.9.9", capturedAt: "2026-08-10T10:00:00.000Z", importedAt: "2026-08-10T10:05:00.000Z", pollStatus: "error", pingStatus: "unknown", matchStatus: "unmatched", parseStatus: "parsed" }
    );
    state.deviceChanges.push({ id: "change-1", deviceId: controller.id, fromPollingResultId: "r-old-controller", toPollingResultId: "r-controller", detectedAt: "2026-08-10T10:01:00.000Z", status: "active", path: "$.Firmware.version", oldValue: "1", newValue: "2" });
    state.inventoryIssues.push({ id: "issue-1", kind: "unmatched_ip", sourceType: "polling_result", sourceId: "r-unmatched", timestamp: "2026-08-10T10:02:00.000Z", createdAt: "2026-08-10T10:02:00.000Z", status: "open", message: "IP не сопоставлен" });
    return { state, vcs, controller, panel };
  }

  test("Dashboard summary корректно обрабатывает пустой inventory", () => {
    const summary = api.getDashboardSummary(api.createDemoState(), {}, { now: "2026-08-10T12:00:00.000Z" });
    assert(summary.valid);
    assertEqual(summary.inventory.total, 0);
    assertEqual(summary.context.sr, null);
    assertEqual(summary.emptyState, "no_sr");
  });

  test("Dashboard current state не дублирует device из-за нескольких snapshots", () => {
    const { state } = dashboardFixture();
    const summary = api.getDashboardSummary(state, { period: "7d" }, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.inventory.total, 3);
    assertEqual(summary.coverage.everPolled, 2);
    assertEqual(summary.coverage.success, 1);
    assertEqual(summary.coverage.failed, 1);
    assertEqual(summary.problems.currentPingFailures, 1);
    assertEqual(summary.periodMetrics.pingFailures, 2, "period включает старый и текущий ping failure");
  });

  test("Dashboard отличает unsupported от supported not-polled и failed", () => {
    const { state, vcs } = dashboardFixture();
    state.pollingResults = state.pollingResults.filter((result) => result.deviceId !== vcs.id);
    const summary = api.getDashboardSummary(state, {}, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.coverage.notPolled, 1);
    assertEqual(summary.coverage.unsupported, 1);
    assertEqual(summary.coverage.failed, 1);
  });

  test("Dashboard latest-state использует новый успешный snapshot, period сохраняет старую ошибку", () => {
    const { state } = dashboardFixture();
    const summary = api.getDashboardSummary(state, { period: "7d" }, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.coverage.success, 1);
    assertEqual(summary.problems.currentPingFailures, 1);
    assertEqual(summary.periodMetrics.failedResults, 3);
  });

  test("Dashboard фильтрует category, manufacturer, model, location, VIP и status", () => {
    const { state, controller } = dashboardFixture();
    const summary = api.getDashboardSummary(state, { category: "controller", manufacturer: "Extron", model: "IPCP Pro 255", locationId: controller.locationId, vip: "true", pollStatus: "failed" }, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.inventory.total, 1);
    assertEqual(summary.coverage.failed, 1);
  });

  test("Dashboard invalid custom range возвращает safe validation result", () => {
    const summary = api.getDashboardSummary(dashboardFixture().state, { period: "custom", dateFrom: "2026-08-11", dateTo: "2026-08-10" });
    assert(!summary.valid);
    assert(summary.errors[0].includes("диапазон"));
  });

  test("Dashboard агрегирует VIP и проблемные локации без двойного счёта", () => {
    const { state } = dashboardFixture();
    const summary = api.getDashboardSummary(state, {}, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.vip.locations, 1);
    assertEqual(summary.vip.devices, 2);
    assertEqual(summary.vip.problems, 1);
    assertEqual(summary.locations[0].name, "VIP Зал");
    assertEqual(summary.locations[0].problemDevices, 1);
  });

  test("Dashboard разделяет unmatched/data issues и equipment failures", () => {
    const summary = api.getDashboardSummary(dashboardFixture().state, {}, { now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.problems.currentFailures, 1);
    assertEqual(summary.problems.unmatched, 1);
    assert(summary.problems.dataErrors >= 1);
    assert(summary.latestProblems.some((item) => item.scope === "data"));
    assert(summary.latestProblems.some((item) => item.scope === "equipment"));
  });

  test("Dashboard changes различает устройства и записи", () => {
    const { state, controller } = dashboardFixture();
    state.deviceChanges.push({ id: "change-2", deviceId: controller.id, fromPollingResultId: "r-old-controller", toPollingResultId: "r-controller", detectedAt: "2026-08-10T10:03:00.000Z", status: "active", path: "$.Name", oldValue: "A", newValue: "B" });
    const summary = api.getDashboardSummary(state, {}, { limit: 1, now: "2026-08-10T12:00:00.000Z" });
    assertEqual(summary.changes.changedDevices, 1);
    assertEqual(summary.changes.total, 2);
    assertEqual(summary.recentChanges.length, 1);
  });

  test("Dashboard blocked analytics не подменяются нулями", () => {
    const blocked = api.getDashboardSummary(dashboardFixture().state, {}).blockedAnalytics;
    assertEqual(blocked.authorization, null);
    assertEqual(blocked.reboots, null);
    assertEqual(blocked.gcPlus, null);
    assertEqual(blocked.freshnessThreshold, null);
  });

  test("Inventory drill-down filters поддерживают ping/change/support/model/location", () => {
    const { state, controller, panel } = dashboardFixture();
    assertEqual(api.filterInventoryDevices(state, "controller", { ping: "failed", changed: "true", model: "IPCP Pro 255", locationId: controller.locationId }).length, 1);
    assertEqual(api.filterInventoryDevices(state, "panel", { support: "unsupported" }).length, 1);
    assertEqual(api.filterInventoryDevices(state, "panel", { support: "supported" }).length, 0);
    assert(panel);
  });

  test("Пользовательский словарь закрепляет обязательные названия категорий", () => {
    assertEqual(api.UI_TERMS.categories.vcs, "Терминалы ВКС");
    assertEqual(api.UI_TERMS.categories.controller, "Контроллеры");
    assertEqual(api.UI_TERMS.categories.panel, "Панели управления");
    assertEqual(api.formatCategoryLabel("vcs"), "Терминалы ВКС");
    assertEqual(api.formatCategoryLabel("unknown"), "Данные отсутствуют");
  });

  test("Внутренние статусы опроса преобразуются в русские подписи", () => {
    assertEqual(api.formatPollStatus("success"), "Успешно");
    assertEqual(api.formatPollStatus("FAILED"), "Ошибка");
    assertEqual(api.formatPollStatus("not_polled"), "Не опрашивалось");
    assertEqual(api.formatPollStatus("unsupported"), "Автоматический опрос не поддерживается");
    assertEqual(api.formatPollStatus("unexpected_internal_code"), "Данные отсутствуют");
    assertEqual(api.formatPingStatus("failed"), "Нет ответа по сети");
    assertEqual(api.formatCapabilityStatus("supported"), "Автоматический опрос поддерживается");
  });

  test("Справочник содержит десять пользовательских разделов и неопределённые термины", () => {
    assertEqual(api.HELP_SECTIONS.length, 10);
    const entries = api.HELP_SECTIONS.flatMap((section) => section.entries);
    assert(entries.length >= 35, `Ожидалось не менее 35 карточек, получено ${entries.length}`);
    assertEqual(entries.find((entry) => entry.id === "term-sr")?.status, "needs_clarification");
    assertEqual(entries.find((entry) => entry.id === "abbr-gcplus")?.status, "needs_clarification");
    assertEqual(entries.find((entry) => entry.id === "logic-reboots")?.status, "in_development");
  });

  test("Поиск Справочника находит термины, сокращения, определения и синонимы", () => {
    const ids = (query) => api.searchReferenceEntries(query).map((item) => item.id);
    assert(ids("ping").includes("status-no-network"));
    assert(ids("ВКС").includes("abbr-vks"));
    assert(ids("SR").includes("term-sr"));
    assert(ids("изменения").includes("term-change"));
    assert(ids("GCPlus").includes("abbr-gcplus"));
    assertEqual(api.searchReferenceEntries("   ").length, api.HELP_SECTIONS.flatMap((section) => section.entries).length);
    assertEqual(api.searchReferenceEntries("несуществующий-запрос").length, 0);
  });

  test("Контекстные подсказки используют единый русский источник", () => {
    assertEqual(api.UI_TERMS.tooltips.noNetwork, "Количество устройств, которые не ответили на проверку сетевой доступности.");
    assertEqual(api.UI_TERMS.tooltips.notPolled, "Устройство есть в выгрузке SR, но результаты его опросов отсутствуют.");
    assertEqual(api.UI_TERMS.tooltips.changedDevices, "Количество устройств, данные которых отличаются от предыдущего результата опроса.");
    assertEqual(api.HELP_TOPIC_BY_ROUTE.dashboard, "module-dashboard");
    assertEqual(api.HELP_TOPIC_BY_ROUTE.vcs, "module-vcs");
    assertEqual(api.HELP_TOPIC_BY_ROUTE.controllers, "module-controllers");
    assertEqual(api.HELP_TOPIC_BY_ROUTE.panels, "module-panels");
  });

  test("Русификация не изменяет исходные технические значения SR и JSON", async () => {
    const imported = api.importSrRows(api.createDemoState(), { filename: "raw-compatible.xlsx", headers: srHeaders(), rows: [srRow({ "Тип модели": "Video Conference" })] });
    assertEqual(imported.state.inventoryDevices[0].modelTypeRaw, "Video Conference");
    assertEqual(imported.state.inventoryDevices[0].category, "vcs");
    const polled = await api.ingestPollingResultText(imported.state, { folderName: "2026-08-10_12-00-00", name: "10.10.20.30.json", text: JSON.stringify({ ok: false, failedStage: "ping", ping: { ok: false }, "Controller Type": "TLP" }) });
    assertEqual(JSON.parse(polled.state.pollingResults[0].rawText)["Controller Type"], "TLP");
    assertEqual(polled.state.pollingResults[0].pingStatus, "failed");
  });

  test("Единый каталог синхронно добавляет, переименовывает и удаляет модуль", () => {
    const catalog = api.PRODUCT_CATALOG;
    const modules = api.deepClone(api.MODULE_CATALOG);
    const synthetic = {
      route: "synthetic-help", renderer: "reference", title: "Тестовый модуль", order: 80,
      helpId: "module-synthetic-help", contextHelp: false,
      summary: "Проверяет автоматическое обновление пользовательской навигации.",
      details: "Используется только как синтетическая запись модульного теста.",
      keywords: ["синтетический", "проверка"]
    };
    const added = [...modules, synthetic];
    assert(catalog.validateProductCatalog({ modules: added }).ok);
    assertEqual(catalog.buildNavigation(added).at(-1).title, "Тестовый модуль");
    assertEqual(catalog.buildModuleHelpSection(added).entries.at(-1).title, "Тестовый модуль");

    const renamed = added.map((item) => item.route === synthetic.route ? { ...item, title: "Обновлённый модуль" } : item);
    assertEqual(catalog.buildNavigation(renamed).at(-1).title, "Обновлённый модуль");
    assertEqual(catalog.buildModuleHelpSection(renamed).entries.at(-1).title, "Обновлённый модуль");

    const removed = renamed.filter((item) => item.route !== synthetic.route);
    assert(!catalog.buildNavigation(removed).some((item) => item.route === synthetic.route));
    assert(!catalog.buildModuleHelpSection(removed).entries.some((item) => item.id === synthetic.helpId));
  });

  test("Проверка каталога блокирует рассинхронизацию и статусы следуют словарю", () => {
    const catalog = api.PRODUCT_CATALOG;
    const modules = api.deepClone(api.MODULE_CATALOG);
    const duplicate = [...modules, { ...modules[0], order: 999 }];
    const missingRussian = modules.map((item, index) => index === 0 ? { ...item, title: "" } : item);
    const unknownRenderer = modules.map((item, index) => index === 0 ? { ...item, renderer: "missing-renderer" } : item);
    assert(!catalog.validateProductCatalog({ modules: duplicate }).ok);
    assert(!catalog.validateProductCatalog({ modules: missingRussian }).ok);
    assert(!catalog.validateProductCatalog({ modules: unknownRenderer }).ok);

    const terms = api.deepClone(api.UI_TERMS);
    terms.pingStatuses.failed = "Сеть недоступна";
    const statuses = catalog.buildStatusHelpSection(terms).entries;
    assertEqual(statuses.find((item) => item.id === "status-no-network").title, "Сеть недоступна");
    terms.pollStatuses.success = "";
    assert(!catalog.validateProductCatalog({ uiTerms: terms }).ok);
  });

  test("Dashboard selector обрабатывает 5000 devices и 25000 results быстрее 2 секунд", () => {
    const state = api.createDemoState();
    state.srImports.push({ id: "large-sr", importedAt: "2026-08-10T00:00:00.000Z", filename: "synthetic-large.xlsx" });
    state.locations.push({ id: "large-location", name: "Synthetic", address: "Test", vip: false, inCurrentSr: true });
    for (let index = 0; index < 5000; index += 1) {
      state.inventoryDevices.push({ id: `large-device-${index}`, category: ["vcs", "controller", "panel"][index % 3], manufacturerNormalized: `maker-${index % 20}`, manufacturerRaw: `Maker ${index % 20}`, modelRaw: `Model ${index % 100}`, locationId: "large-location", inCurrentSr: true, deviceVip: false, pollingCapability: { support: "implemented", transport: "synthetic-test" } });
      for (let resultIndex = 0; resultIndex < 5; resultIndex += 1) state.pollingResults.push({ id: `large-result-${index}-${resultIndex}`, runId: "large-run", deviceId: `large-device-${index}`, capturedAt: `2026-08-0${resultIndex + 1}T00:00:00.000Z`, pollStatus: resultIndex === 4 ? "success" : "error", pingStatus: resultIndex === 4 ? "ok" : "failed", matchStatus: "matched", parseStatus: "parsed" });
    }
    state.pollingRuns.push({ id: "large-run", kind: "import", capturedAt: "2026-08-05T00:00:00.000Z", fileCount: 25000, successCount: 5000, errorCount: 20000 });
    const started = Date.now();
    const summary = api.getDashboardSummary(state, { period: "30d" }, { now: "2026-08-10T00:00:00.000Z" });
    const elapsed = Date.now() - started;
    assertEqual(summary.inventory.total, 5000);
    assertEqual(summary.coverage.success, 5000);
    assert(elapsed < 2000, `Dashboard summary занял ${elapsed} ms`);
  });

  test("Dashboard analytics считает latest-result метрики без догадок", async () => {
    const sr = api.importSrRows(api.createDemoState(), { filename: "analytics.xlsx", headers: srHeaders(), rows: [srRow(), srRow({ "Инвентарный номер": "INV-2", "Серийный номер": "SER-2", "MAC": "00-11-22-33-44-88", "IP": "10.10.20.88" })] });
    const polled = await api.ingestPollingRunFiles(sr.state, { folderName: "2026-06-01_09-41-28", files: [{ name: "10.10.20.30.json", text: JSON.stringify({ ok: false, failedStage: "ping", ping: { ok: false } }) }] });
    const metrics = api.getInventoryAnalytics(polled.state, "vcs");
    assertEqual(metrics.total, 2);
    assertEqual(metrics.polled, 1);
    assertEqual(metrics.unpolled, 1);
    assertEqual(metrics.errors, 1);
    assertEqual(metrics.pingFailures, 1);
    assertEqual(metrics.authorizationFailures, null);
  });

  test("Inventory selector фильтрует SR context и не скрывает неопрошенные устройства", () => {
    const imported = api.importSrRows(api.createDemoState(), { filename: "filters.xlsx", headers: srHeaders(), rows: [srRow(), srRow({ "Название комнаты": "Зал 202", "Адрес комнаты": "Санкт-Петербург", "Инвентарный номер": "INV-2", "Серийный номер": "SER-2", "MAC": "00-11-22-33-44-89", "IP": "10.10.20.89", "Производитель": "Huawei" })] });
    assertEqual(api.filterInventoryDevices(imported.state, "vcs", {}).length, 2);
    assertEqual(api.filterInventoryDevices(imported.state, "vcs", { search: "Зал 202", manufacturer: "Huawei", pollStatus: "never" }).length, 1);
  });

  test("Performance control: 10 snapshots по 100 devices обрабатываются быстрее 10 секунд", async () => {
    let state = api.createDemoState();
    let combinedRawBytes = 0;
    const startedAt = Date.now();
    for (let snapshotIndex = 0; snapshotIndex < 10; snapshotIndex += 1) {
      const payload = fixtures.snapshots.baseline();
      payload.snapshotId = `90000000-0000-4000-8000-${String(snapshotIndex + 1).padStart(12, "0")}`;
      payload.capturedAt = `2026-05-${String(snapshotIndex + 1).padStart(2, "0")}T06:00:00Z`;
      payload.webBlocks["Project Info"].Version = `1.${snapshotIndex}`;
      const devices = Array.from({ length: 100 }, (_, deviceIndex) => ({
        inventoryId: `synthetic-device-${deviceIndex}`,
        serialNumber: `SYN-${String(deviceIndex).padStart(4, "0")}`,
        addr: `10.50.${Math.floor(deviceIndex / 250)}.${(deviceIndex % 250) + 1}`,
        macAddress: `02:00:00:${String(snapshotIndex).padStart(2, "0")}:${String(Math.floor(deviceIndex / 100)).padStart(2, "0")}:${String(deviceIndex % 100).padStart(2, "0")}`,
        modelname: "Synthetic Panel",
        name: `Synthetic Device ${deviceIndex}`,
        partnum: "SYNTHETIC-ONLY",
        vtlpweb: []
      }));
      payload.webBlocks["Project Info"]["Connected Devices"] = devices;
      payload.webBlocks["Project Info"]["TLP Project"].systemdevs = devices.map((item) => api.deepClone(item));
      const text = JSON.stringify(payload);
      combinedRawBytes += new TextEncoder().encode(text).byteLength;
      const ingested = await api.ingestSnapshotText(state, {
        name: `performance-${snapshotIndex + 1}.json`,
        text,
        uploadedById: "user-av-engineer"
      });
      assert(["processed", "partial"].includes(ingested.outcome), ingested.errors?.join("; "));
      state = ingested.state;
    }
    const elapsedMs = Date.now() - startedAt;
    assert(combinedRawBytes <= api.DEFAULT_MAX_RAW_INPUT_BYTES, `Combined raw input ${combinedRawBytes} превышает 3 MiB control`);
    assert(elapsedMs < 10000, `Обработка заняла ${elapsedMs} ms`);
    assertEqual(state.snapshots.length, 10);
    assertEqual(state.assets.length, 101);
  });

  async function run() {
    const results = [];
    for (const item of tests) {
      try {
        await item.fn();
        results.push({ name: item.name, ok: true });
      } catch (error) {
        results.push({ name: item.name, ok: false, error: String(error.stack || error.message || error) });
      }
    }

    const failed = results.filter((item) => !item.ok);
    if (typeof document !== "undefined") {
      const summary = document.getElementById("test-summary");
      const list = document.getElementById("test-results");
      if (summary) {
        summary.className = failed.length ? "error-panel" : "success-panel";
        summary.textContent = failed.length
          ? `FAIL: ${failed.length} из ${results.length} проверок`
          : `PASS: ${results.length} из ${results.length} проверок`;
      }
      if (list) {
        list.innerHTML = results
          .map((item) => `<li><span>${api.escapeHtml(item.name)}</span><strong class="badge ${item.ok ? "success" : "critical"}">${item.ok ? "PASS" : "FAIL"}</strong>${item.error ? `<pre>${api.escapeHtml(item.error)}</pre>` : ""}</li>`)
          .join("");
      }
    } else {
      results.forEach((item) => {
        const status = item.ok ? "PASS" : "FAIL";
        console.log(`${status} ${item.name}${item.error ? `\n${item.error}` : ""}`);
      });
      console.log(`\n${failed.length ? "FAIL" : "PASS"}: ${results.length - failed.length}/${results.length}`);
      if (failed.length && typeof process !== "undefined") process.exitCode = 1;
    }

    global.MvpSphereSRTestResults = results;
  }

  run();
})(globalThis);
