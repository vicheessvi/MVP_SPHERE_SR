#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { runPlan } = require("../runtime/polling");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const planPath = argument("--plan");
  const outputPath = argument("--out");
  if (!planPath || !outputPath) throw new Error("Usage: node scripts/poll-devices.js --plan <plan.json> --out <directory>");
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
  const outputDir = path.resolve(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  const results = await runPlan(plan, { timeoutMs: Number(argument("--timeout")) || 3000 });
  for (const result of results) {
    const target = path.join(outputDir, `${result.ip}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(result, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
  }
  process.stdout.write(JSON.stringify({ outputDir, total: results.length, pingFailed: results.filter((result) => result.failedStage === "ping").length, protocolRequired: results.filter((result) => result.vendorPolling.status === "protocol_required").length }) + "\n");
}

main().catch((error) => {
  process.stderr.write(`Polling failed: ${error.message || "unknown_error"}\n`);
  process.exitCode = 1;
});
