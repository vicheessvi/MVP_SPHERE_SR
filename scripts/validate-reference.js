"use strict";

const fs = require("fs");
const path = require("path");
const catalog = require("../product-catalog");

const report = catalog.validateProductCatalog();
const errors = [...report.errors];
const projectRoot = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const userFacingSource = `${appSource}\n${JSON.stringify(catalog)}`;
if (!userFacingSource.includes("START_MVP_SPHERE_SR.py")) errors.push("В интерфейсе и Справочнике отсутствует актуальный Python launcher");
["start.ps1", "START_MVP_SPHERE_SR.cmd"].forEach((legacy) => {
  if (userFacingSource.includes(legacy)) errors.push(`В пользовательском тексте осталась устаревшая точка запуска: ${legacy}`);
});
const deviceCatalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "runtime", "device-catalog.json"), "utf8"));
if (deviceCatalog.schemaVersion !== 1 || !Array.isArray(deviceCatalog.entries) || !Array.isArray(deviceCatalog.adapters)) errors.push("Некорректен общий каталог устройств");
const keys = (deviceCatalog.entries || []).map((entry) => entry.key);
if (new Set(keys).size !== keys.length) errors.push("В общем каталоге устройств повторяется key");
if (!(deviceCatalog.adapters || []).includes("extron_web_dynamic_resources_v1")) errors.push("В общем каталоге отсутствует подтверждённый Extron transport");

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ОШИБКА: ${error}\n`));
  process.stderr.write(`Справочник и каталоги продукта не согласованы: ${errors.length} ошибок.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${report.counts.modules} модулей, ${report.counts.moduleHelpEntries} карточек модулей, ${report.counts.statusEntries} карточек статусов, ${report.counts.pollingHelpEntries} карточки локального опроса; Python launcher и общий device catalog согласованы.\n`);
}
