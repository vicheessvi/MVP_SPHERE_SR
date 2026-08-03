(function (global) {
  "use strict";

  global.MvpSphereSRTimelineExpectations = Object.freeze({
    capturedOrder: Object.freeze([
      "2026-06-01T06:00:00.000Z",
      "2026-06-04T06:00:00.000Z",
      "2026-06-08T06:00:00.000Z"
    ]),
    activePreviousEdges: Object.freeze([
      Object.freeze(["2026-06-01T06:00:00.000Z", "2026-06-04T06:00:00.000Z"]),
      Object.freeze(["2026-06-04T06:00:00.000Z", "2026-06-08T06:00:00.000Z"])
    ]),
    supersededEdge: Object.freeze(["2026-06-01T06:00:00.000Z", "2026-06-08T06:00:00.000Z"])
  });
})(globalThis);
