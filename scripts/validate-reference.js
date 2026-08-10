"use strict";

const catalog = require("../product-catalog");

const report = catalog.validateProductCatalog();
if (!report.ok) {
  report.errors.forEach((error) => process.stderr.write(`ОШИБКА: ${error}\n`));
  process.stderr.write(`Справочник и каталог продукта не согласованы: ${report.errors.length} ошибок.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${report.counts.modules} модулей, ${report.counts.moduleHelpEntries} карточек модулей, ${report.counts.statusEntries} карточек статусов.\n`);
}
