(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MVP_CREDENTIAL_POOL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeHeader(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  }

  function firstNonEmptyRow(rows) {
    return rows.findIndex((row) => Array.isArray(row) && row.some((value) => String(value ?? "").trim()));
  }

  function parseCredentialRows(rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const headerIndex = firstNonEmptyRow(sourceRows);
    if (headerIndex < 0) throw new Error("Файл учётных данных не содержит таблицу");
    const headers = sourceRows[headerIndex].map(normalizeHeader);
    const loginIndex = headers.indexOf("логин");
    const passwordIndex = headers.indexOf("пароль");
    const missing = [loginIndex < 0 ? "Логин" : null, passwordIndex < 0 ? "Пароль" : null].filter(Boolean);
    if (missing.length) throw new Error(`Отсутствуют обязательные колонки: ${missing.join(", ")}`);

    const credentials = [];
    const rejectedRows = [];
    const seen = new Set();
    let duplicateCount = 0;
    let emptyRowCount = 0;
    sourceRows.slice(headerIndex + 1).forEach((row, offset) => {
      const rowNumber = headerIndex + offset + 2;
      const values = Array.isArray(row) ? row : [];
      const username = String(values[loginIndex] ?? "").trim();
      const password = String(values[passwordIndex] ?? "");
      if (!username && !password.trim()) { emptyRowCount += 1; return; }
      if (!username || !password) {
        rejectedRows.push({ rowNumber, reason: !username ? "empty_login" : "empty_password" });
        return;
      }
      const exactKey = `${username}\u0000${password}`;
      if (seen.has(exactKey)) { duplicateCount += 1; return; }
      seen.add(exactKey);
      credentials.push(Object.freeze({ username, password }));
    });
    if (!credentials.length) throw new Error("Файл учётных данных не содержит допустимых пар");
    return Object.freeze({
      credentials: Object.freeze(credentials),
      summary: Object.freeze({
        acceptedCount: credentials.length,
        rejectedCount: rejectedRows.length,
        duplicateCount,
        emptyRowCount,
        rejectedRows: Object.freeze(rejectedRows)
      })
    });
  }

  function parseCredentialWorkbook(arrayBuffer, XLSX) {
    if (!XLSX || typeof XLSX.read !== "function") throw new Error("Средство чтения XLSX недоступно");
    const workbook = XLSX.read(arrayBuffer, { type: arrayBuffer instanceof ArrayBuffer ? "array" : "buffer", cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false });
    const firstSheetName = workbook.SheetNames && workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("Файл учётных данных не содержит листов");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: "", raw: true, blankrows: true });
    return parseCredentialRows(rows);
  }

  return Object.freeze({ normalizeHeader, parseCredentialRows, parseCredentialWorkbook });
});
