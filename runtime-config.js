(function (global) {
  "use strict";

  if (global.location && global.location.protocol === "file:") {
    global.__MVP_FILE_RUNTIME__ = true;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
