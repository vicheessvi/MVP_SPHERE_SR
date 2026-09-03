"use strict";

const source = require("./device-catalog.json");

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

const CATALOG = Object.freeze(source.entries.map((item) => Object.freeze({
  ...item,
  aliases: Object.freeze([...(item.aliases || [])]),
  models: Object.freeze([...(item.models || [])])
})));

function itemHasModel(manifest, normalizedModel) {
  return manifest.models.some((model) => normalize(model) === normalizedModel);
}

function resolveManifest(device) {
  const category = normalize(device && device.category);
  const manufacturer = normalize(device && (device.manufacturerNormalized || device.manufacturerRaw || device.manufacturer));
  const model = normalize(device && (device.modelNormalized || device.modelRaw || device.model));
  const candidates = CATALOG.filter((item) => item.category === category && [item.manufacturer, ...item.aliases].map(normalize).includes(manufacturer));
  const manifest = candidates.find((item) => itemHasModel(item, model))
    || candidates.find((item) => item.protocolStatus !== "supported")
    || candidates[0];
  if (!manifest) return { key: `${category || "unknown"}/${manufacturer || "unknown"}`, category, manufacturer, model, knownModel: false, protocolStatus: "unsupported", transport: null, credentialMode: "none" };
  return { ...manifest, model, knownModel: itemHasModel(manifest, model) };
}

module.exports = { CATALOG, normalize, resolveManifest };
