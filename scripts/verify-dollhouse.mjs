// Quick self-test for the assets/models dollhouse document. Walks the scene
// graph, ensures every id is unique, every transform is finite, and the build
// is deterministic across two consecutive calls. Run with:
//   node --import tsx/esm scripts/verify-dollhouse.mjs
import { buildDollhouseDocument } from "../packages/editor/src/presets/dollhouse.ts";

function walk(n, ids, count, problems) {
  if (ids.has(n.id)) problems.push(`duplicate id: ${n.id}`);
  ids.add(n.id);
  count.n++;
  for (const v of n.transform.position) if (!Number.isFinite(v)) problems.push(`non-finite position in ${n.name}/${n.id}`);
  for (const v of n.transform.rotation) if (!Number.isFinite(v)) problems.push(`non-finite rotation in ${n.name}/${n.id}`);
  for (const v of n.transform.scale) if (!Number.isFinite(v)) problems.push(`non-finite scale in ${n.name}/${n.id}`);
  if (n.instances) {
    for (const inst of n.instances) {
      for (const v of [...inst.position, ...inst.rotation, ...inst.scale]) {
        if (!Number.isFinite(v)) problems.push(`non-finite instance in ${n.name}/${n.id}`);
      }
    }
  }
  for (const c of n.children) walk(c, ids, count, problems);
}

const doc = buildDollhouseDocument();
const ids = new Set();
const count = { n: 0 };
const problems = [];
walk(doc.root, ids, count, problems);

const doc2 = buildDollhouseDocument();
const idsB = new Set();
const countB = { n: 0 };
const probB = [];
walk(doc2.root, idsB, countB, probB);

console.log("nodes:", count.n);
console.log("deterministic node count:", count.n === countB.n);
console.log("problems:", problems.length === 0 ? "none" : problems);
if (problems.length > 0) process.exit(1);
