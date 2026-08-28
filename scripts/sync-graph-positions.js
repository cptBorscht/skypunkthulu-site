// Copies hand-placed node positions out of the vault's persistent-graph plugin
// into src/site/_data/graphPositions.json, which the graph reads at build time.
//
// Run after rearranging the graph in Obsidian:
//   node scripts/sync-graph-positions.js [path/to/vault]
//
// Entries that aren't real notes (tags like #SideQuest, unresolved links like
// "Izel") are dropped - the site graph only ever has nodes for published notes.

const fs = require("fs");
const path = require("path");

const vault = process.argv[2] || "E:/obsidian/vaults/Skypunkthulu";
const source = path.join(vault, ".obsidian/plugins/persistent-graph/data.json");
const target = path.join(__dirname, "../src/site/_data/graphPositions.json");

if (!fs.existsSync(source)) {
  console.error(`No persistent-graph data at ${source}`);
  process.exit(1);
}

const { nodePositions = [] } = JSON.parse(fs.readFileSync(source, "utf8"));

const positions = {};
let dropped = 0;
for (const { id, x, y } of nodePositions) {
  if (!id.endsWith(".md")) { dropped++; continue; }
  // key by vault path without extension - matches the filePathStem the site
  // builds its note URLs from
  positions[id.slice(0, -3)] = { x, y };
}

fs.writeFileSync(target, JSON.stringify(positions, null, 2) + "\n");
console.log(`${Object.keys(positions).length} positions written to ${path.relative(process.cwd(), target)}`);
if (dropped) console.log(`${dropped} non-note entries skipped (tags, unresolved links)`);
