(function (global) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function persistentDrift() {
    const value = clone(global.MvpSphereSRFixtures.snapshots.variant("ip"));
    value.snapshotId = "40000000-0000-4000-8000-000000000003";
    value.capturedAt = "2026-06-15T06:00:00Z";
    return value;
  }

  global.MvpSphereSRBaselineExpectations = Object.freeze({
    persistentDrift,
    driftEventType: "ip_changed",
    assignmentStatuses: Object.freeze({ active: "active", replaced: "replaced", pending: "expiration_pending", ended: "ended" }),
    expirationGuardError: "требует явного подтверждения"
  });
})(globalThis);
