const { getGraph } = require("../../helpers/linkUtils");
const { getFileTree } = require("../../helpers/filetreeUtils");
const { userComputed } = require("../../helpers/userUtils");
const graphPositions = require("./graphPositions.json");

// ---------------------------------------------------------------------------
// The graph is deliberately not a map of the whole site. It shows the campaign:
// the people and the open threads, plus the two quest tags that group them.
// Shop catalogs are reference material - they would swamp the picture without
// saying anything about how anything connects - so they are hidden from it.
//
// This mirrors the arrangement in the vault, where the same set of nodes is
// laid out by hand and read back in from graphPositions.json.
// ---------------------------------------------------------------------------

const GRAPH_FOLDERS = ["NPCs/", "Active/"];
const QUEST_TAGS = ["#MainQuest", "#SideQuest"];

const stemOf = (note) => note.filePathStem.replace("/notes/", "");

function inGraph(stem) {
  return GRAPH_FOLDERS.some((folder) => stem.startsWith(folder));
}

// A quest tag becomes a node of its own, linked to every note carrying it -
// the same hub the vault's graph shows. Tags are written inline in the body
// rather than in frontmatter, so this reads the published content.
async function addQuestTagNodes(graph, notes) {
  let nextId = Math.max(-1, ...Object.values(graph.nodes).map((n) => n.id)) + 1;

  for (const tag of QUEST_TAGS) {
    const tagged = [];
    for (const note of notes) {
      if (!inGraph(stemOf(note))) continue;
      const content = (await note.template.read())?.content || "";
      // word boundary so #MainQuest never swallows a longer tag
      if (new RegExp(tag + "(?![\w/-])").test(content)) tagged.push(note.url);
    }
    if (tagged.length === 0) continue;

    const id = nextId++;
    graph.nodes[tag] = {
      id,
      title: tag,
      url: "",
      group: "tag",
      home: false,
      outBound: [],
      neighbors: tagged,
      backLinks: tagged,
      noteIcon: "",
      hide: false,
      private: false,
      size: tagged.length,
      isTag: true,
    };

    for (const url of tagged) {
      const node = graph.nodes[url];
      if (node) graph.links.push({ source: id, target: node.id });
    }
  }
}

// The vault's persistent-graph plugin stores hand-placed coordinates keyed by
// vault path (and by tag name for tag nodes); graph nodes are keyed by URL.
// Notes keep their original vault path as their filePathStem, so that is the
// join. Nodes with no saved position are placed by the force simulation.
function applySavedPositions(graph, notes) {
  const keyByStem = {};
  for (const note of notes) keyByStem[stemOf(note)] = note.url;

  for (const [stem, { x, y }] of Object.entries(graphPositions)) {
    const node = graph.nodes[stem.startsWith("#") ? stem : keyByStem[stem]];
    if (node) {
      node.savedX = x;
      node.savedY = y;
    }
  }
}


// ---------------------------------------------------------------------------
// Completed quests
//
// A quest is marked done by ticking the "completed" property in Obsidian,
// which renders as a checkbox in the note properties. The file itself stays
// in Active/ - only its place in the file tree moves - so permalinks, inbound
// links and saved graph positions all survive being completed and uncompleted.
// ---------------------------------------------------------------------------

function isCompleted(data) {
  const props = data["dg-note-properties"];
  return !!(props && props.completed === true);
}

// getFileTree honours dg-path over the real folder, so this is all it takes to
// shelve a quest under Completed and, when unticked, bring it back.
function completedPath(data) {
  if (!isCompleted(data)) return data["dg-path"];
  return "Completed/" + (data.title || data.fileSlug) + ".md";
}

async function buildGraph(data) {
  const graph = await getGraph(data);
  const notes = (data.collections && data.collections.note) || [];

  for (const note of notes) {
    const node = graph.nodes[note.url];
    if (node && !inGraph(stemOf(note))) node.hide = true;
  }

  await addQuestTagNodes(graph, notes);
  applySavedPositions(graph, notes);
  return graph;
}

module.exports = {
  graph: async (data) => await buildGraph(data),
  filetree: (data) => getFileTree(data),
  userComputed: (data) => userComputed(data),
  noteProps: (data) => data["dg-note-properties"],
  completed: (data) => isCompleted(data),
  "dg-path": (data) => completedPath(data)
};
