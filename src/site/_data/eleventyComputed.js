const { getGraph } = require("../../helpers/linkUtils");
const { getFileTree } = require("../../helpers/filetreeUtils");
const { userComputed } = require("../../helpers/userUtils");
const graphPositions = require("./graphPositions.json");

// The vault's persistent-graph plugin stores hand-placed coordinates keyed by
// vault path; graph nodes are keyed by URL. Notes keep their original vault
// path as their filePathStem, so that's the join. Nodes with no saved position
// are left alone and get placed by the force simulation as usual.
function withSavedPositions(graph, data) {
  const notes = (data.collections && data.collections.note) || [];
  const urlByStem = {};
  for (const note of notes) {
    urlByStem[note.filePathStem.replace("/notes/", "")] = note.url;
  }

  for (const [stem, { x, y }] of Object.entries(graphPositions)) {
    const node = graph.nodes[urlByStem[stem]];
    if (node) {
      node.savedX = x;
      node.savedY = y;
    }
  }
  return graph;
}

module.exports = {
  graph: async (data) => withSavedPositions(await getGraph(data), data),
  filetree: (data) => getFileTree(data),
  userComputed: (data) => userComputed(data),
  noteProps: (data) => data["dg-note-properties"]
};
