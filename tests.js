(function (global) {
  "use strict";

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
    assertEqual(api.STATE_VERSION, 1);
    assertEqual(api.STORAGE_KEY, "mvpSphereSrState.v1");
  });

  test("Demo state содержит все обязательные массивы", () => {
    const state = api.createDemoState();
    api.STATE_ARRAY_KEYS.forEach((key) => assert(Array.isArray(state[key]), `${key} должен быть массивом`));
    assert(api.validateState(state).ok, "Demo state должен проходить validation");
  });

  test("Demo state содержит две ожидаемые UI-роли", () => {
    const roles = api.createDemoState().users.map((user) => user.role).sort();
    assertEqual(roles.join(","), "administrator,av_engineer");
  });

  test("Migration принимает v1 и отклоняет неизвестную будущую версию", () => {
    const current = api.migrateState(api.createDemoState());
    assert(current.ok);
    const future = api.createDemoState();
    future.version = 99;
    const rejected = api.migrateState(future);
    assert(!rejected.ok);
    assert(rejected.errors.some((item) => item.includes("Неподдерживаемая версия")));
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

  test("Raw input guard не изменяет state при превышении 3 MiB", async () => {
    const state = api.createDemoState();
    const result = await api.ingestSnapshotText(state, {
      name: "too-large.json",
      text: "x".repeat(api.DEFAULT_MAX_RAW_INPUT_BYTES + 1),
      uploadedById: "user-av-engineer"
    });
    assertEqual(result.outcome, "quota_rejected");
    assertEqual(result.state.snapshots.length, 0);
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

  test("Demo role matrix ограничивает admin actions и публикует явное security notice", () => {
    const state = api.createDemoState();
    assert(api.canPerformAction(state, "user-av-engineer", "review_event"));
    assert(api.canPerformAction(state, "user-av-engineer", "export_backup"));
    assert(!api.canPerformAction(state, "user-av-engineer", "reset_state"));
    assert(!api.canPerformAction(state, "user-av-engineer", "manage_users"));
    assert(api.canPerformAction(state, "user-administrator", "reset_state"));
    assert(api.SECURITY_NOTICE.includes("не является настоящей авторизацией"));
    assert(api.SECURITY_NOTICE.includes("localStorage"));
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
