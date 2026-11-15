// Checks game/data/rules.json against its schema and writes game/js/rules.generated.js.
//
//   node game/tools/build_rules.js           build
//   node game/tools/build_rules.js --check   only check; exit 1 if the data is wrong
//                                            or the generated file is out of date
//
// Designers edit rules.json (task cards, starting values, crisis table). The
// game cannot read a .json file when opened by double-click, so this turns it
// into a script the page loads. No packages needed.
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data", "rules.json");
const SCHEMA = path.join(__dirname, "..", "data", "rules.schema.json");
const OUT = path.join(__dirname, "..", "js", "rules.generated.js");

// ---------------------------------------------------------------- a small JSON Schema checker
// Covers what rules.schema.json uses: type, enum, const, required, properties,
// additionalProperties, items, minItems, maxItems, minimum, maximum, minLength,
// pattern, oneOf and $ref to #/$defs/...
function validate(schema, value, root, where, errors) {
  if (schema.$ref) return validate(root.$defs[schema.$ref.split("/").pop()], value, root, where, errors);
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => {
      const e = [];
      validate(s, value, root, where, e);
      return !e.length;
    }).length;
    if (ok !== 1) errors.push(`${where}: does not match exactly one of the allowed forms`);
    return;
  }
  if ("const" in schema && value !== schema.const) return errors.push(`${where}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) return errors.push(`${where}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.includes(kind) && !(kind === "integer" && types.includes("number"))) return errors.push(`${where}: expected ${types.join(" or ")}, found ${kind}`);
  }
  if (kind === "integer" || kind === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${where}: ${value} is below the minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${where}: ${value} is above the maximum ${schema.maximum}`);
  }
  if (kind === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${where}: text is too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${where}: "${value}" does not look like ${schema.pattern}`);
  }
  if (kind === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${where}: needs at least ${schema.minItems} entries`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${where}: at most ${schema.maxItems} entries allowed`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, root, `${where}[${i}]`, errors));
  }
  if (kind === "object") {
    (schema.required || []).forEach((k) => !(k in value) && errors.push(`${where}: "${k}" is missing`));
    Object.keys(value).forEach((k) => {
      if (schema.properties && schema.properties[k]) validate(schema.properties[k], value[k], root, `${where}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${where}: unknown field "${k}" (typo?)`);
    });
  }
}

// ---------------------------------------------------------------- checks a schema cannot express
function crossChecks(d, errors) {
  d.tasks.forEach((t, i) => {
    const where = `tasks[${i}] (${t.name})`;
    if (t.num !== i + 1) errors.push(`${where}: card numbers must run 1, 2, 3… in order; found ${t.num} at position ${i + 1}`);
    if (t.id !== `task_${String(t.num).padStart(2, "0")}`) errors.push(`${where}: id should be task_${String(t.num).padStart(2, "0")}`);
    ["chooseOne", "optional"].forEach((list) => {
      const keys = (t[list] || []).map((p) => p.key);
      if (new Set(keys).size !== keys.length) errors.push(`${where}: two ${list} entries share a key`);
    });
    if (t.points > 0 && !t.capabilities.length && !(t.chooseOne || []).some((p) => (p.capabilities || []).length)) errors.push(`${where}: needs ${t.points} capability points but lists no capability type`);
    if (t.mode === "E" && t.staff !== "ALL" && t.staff.length) errors.push(`${where}: an execute-only task lists staff`);
  });
  if (new Set(d.tasks.map((t) => t.id)).size !== d.tasks.length) errors.push("tasks: two cards share an id");
  d.crisisTable.forEach((r, i) => {
    const where = `crisisTable[${i}]`;
    if (!(r.statusQuoUpTo <= r.showOfForceUpTo && r.showOfForceUpTo <= r.limitedOperationUpTo)) errors.push(`${where}: the three "up to" numbers must not decrease`);
    const next = d.crisisTable[i + 1];
    if (next && r.instabilityTo + 1 !== next.instabilityFrom) errors.push(`${where}: the next row must start at Instability ${r.instabilityTo + 1}`);
    if (!next && r.instabilityTo !== null) errors.push(`${where}: the last row needs "instabilityTo": null`);
  });
  if (d.crisisTable[0].instabilityFrom !== 0) errors.push("crisisTable: the first row must start at Instability 0");
  const keys = d.crisisTypes.map((c) => c.key).sort().join();
  if (keys !== "LIM,LSCO,SOF,SQ") errors.push("crisisTypes: need exactly SQ, SOF, LIM and LSCO");
}

// ---------------------------------------------------------------- the shape the engine uses
function toEngine(d) {
  const part = (p) => {
    const q = { key: p.key, label: p.label };
    if (p.commands) q.commands = p.commands;
    if (p.capabilities) q.caps = p.capabilities;
    if (p.effects) q.effects = p.effects;
    if (p.opponentEffects) q.oppEffects = p.opponentEffects;
    return q;
  };
  return {
    start: d.start,
    crisisRows: d.crisisTable.map((r) => ({ min: r.instabilityFrom, max: r.instabilityTo, sq: r.statusQuoUpTo, sof: r.showOfForceUpTo, lim: r.limitedOperationUpTo })),
    crisisTypes: Object.fromEntries(d.crisisTypes.map((c) => [c.key, { key: c.key, name: c.name, victor: c.winnerPoints, bonus: c.objectiveZoneBonus, deterrence: c.higherDeterrencePoints, violent: c.violent }])),
    tasks: d.tasks.map((t) => {
      const o = { id: t.id, num: t.num, name: t.name, fn: t.function };
      if (t.mode) o.mode = t.mode;
      if (t.blockedByHighAssurance) o.blocked = true;
      if (t.special) o.special = t.special;
      Object.assign(o, { staff: t.staff, commands: t.commands, caps: t.capabilities, points: t.points });
      if (t.cost) o.cost = t.cost;
      o.effects = t.effects;
      if (t.chooseOne) o.branches = t.chooseOne.map(part);
      if (t.optional) o.options = t.optional.map(part);
      return o;
    }),
  };
}

function build() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
  const errors = [];
  validate(schema, data, schema, "rules", errors);
  if (!errors.length) crossChecks(data, errors);
  const text = errors.length ? null : `// GENERATED from game/data/rules.json by game/tools/build_rules.js. Do not edit: change rules.json and rebuild.\n(globalThis.TC = globalThis.TC || {}).RULES_DATA = ${JSON.stringify(toEngine(data), null, 1)};\n`;
  return { errors, text, tasks: data.tasks ? data.tasks.length : 0 };
}

if (require.main === module) {
  const { errors, text, tasks } = build();
  if (errors.length) {
    console.error(`rules.json has ${errors.length} problem${errors.length > 1 ? "s" : ""}:`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  const norm = (s) => s.replace(/\r\n/g, "\n");
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? norm(fs.readFileSync(OUT, "utf8")) : "";
    if (current !== text) {
      console.error("game/js/rules.generated.js is out of date: run node game/tools/build_rules.js");
      process.exit(1);
    }
    console.log(`rules.json is valid (${tasks} task cards) and rules.generated.js is up to date.`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`rules.json is valid. Wrote game/js/rules.generated.js (${tasks} task cards).`);
  }
}
module.exports = { build, validate };
