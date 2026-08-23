#!/usr/bin/env node
/**
 * Inject a graph.json payload into template.html (same contract as
 * `swarm-memory graph --html`). For video stills and local file:// demos.
 *
 *   node web/inject-graph.mjs
 *   node web/inject-graph.mjs --in web/mock-graph.json --out graph.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function flag(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

const input = path.resolve(flag("in", path.join(ROOT, "mock-graph.json")));
const output = path.resolve(flag("out", path.join(ROOT, "graph.html")));
const template = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");
if (!template.includes("/*__GRAPH_DATA__*/")) {
  throw new Error("web/template.html is missing /*__GRAPH_DATA__*/");
}
const data = fs.readFileSync(input, "utf8").trim();
JSON.parse(data);
fs.writeFileSync(output, template.replace("/*__GRAPH_DATA__*/", data));
console.log("Wrote " + output);
