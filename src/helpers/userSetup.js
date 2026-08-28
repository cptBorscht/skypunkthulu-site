// Site-specific extensions. The template calls these from .eleventy.js after
// its own setup, so anything registered here wins - and survives pulling
// updates from upstream.

const fs = require("fs");
const path = require("path");

const NOTES_DIR = path.join(__dirname, "../site/notes");
const ATTITUDE_KEY = "attitude";

// 0 is red, 100 is green - the same mapping the vault's Attitude Colors plugin
// uses, so a number looks the same on the site as it does in Obsidian.
function attitudeColor(value) {
  return `hsl(${Math.round(value * 1.2)}, 75%, 45%)`;
}

function readAttitude(source) {
  if (!source || typeof source !== "object") return null;
  const key = Object.keys(source).find(k => k.toLowerCase() === ATTITUDE_KEY);
  if (key === undefined) return null;
  const value = Number(source[key]);
  return isNaN(value) ? null : Math.max(0, Math.min(100, value));
}

// ---------------------------------------------------------------------------
// ```attitude``` blocks
//
// In the vault, the Attitude Colors plugin turns these fences into a live
// slider bound to the note's Attitude property. A published page has no plugin
// and nothing to write back to, so it gets the read-only equivalent: a snapshot
// of where that NPC stood with the crew when the note was last published.
// ---------------------------------------------------------------------------

function attitudeOf(env) {
  for (const source of [env && env["dg-note-properties"], env]) {
    const value = readAttitude(source);
    if (value !== null) return value;
  }
  return null;
}

function attitudeLabel(value) {
  if (value >= 90) return "Devoted";
  if (value >= 70) return "Friendly";
  if (value >= 55) return "Warm";
  if (value >= 45) return "Neutral";
  if (value >= 30) return "Wary";
  if (value >= 10) return "Cold";
  return "Hostile";
}

function renderAttitude(value) {
  if (value === null) {
    return `<div class="attitude-snapshot attitude-snapshot--missing">No attitude recorded.</div>`;
  }
  const color = attitudeColor(value);
  return `<div class="attitude-snapshot" role="img" aria-label="Attitude ${value} of 100: ${attitudeLabel(value)}">
  <div class="attitude-snapshot__scale">
    <span class="attitude-snapshot__end">Hostile</span>
    <span class="attitude-snapshot__track">
      <span class="attitude-snapshot__marker" style="left: ${value}%; background: ${color};"></span>
    </span>
    <span class="attitude-snapshot__end">Ally</span>
  </div>
  <div class="attitude-snapshot__value" style="color: ${color};">${attitudeLabel(value)} &middot; ${value}</div>
</div>`;
}

function userMarkdownSetup(md) {
  const previous = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    if (tokens[idx].info.trim() === "attitude") {
      return renderAttitude(attitudeOf(env));
    }
    return previous(tokens, idx, options, env, slf);
  };
}

// ---------------------------------------------------------------------------
// Per-note styling driven by published frontmatter
//
// The vault plugin tints note titles in the File Explorer by attitude. The
// sidebar here is the same idea, so it gets the same treatment: one CSS rule
// per NPC, keyed on the permalink its link already carries. Doing it as
// generated CSS keeps the file tree template untouched. A completed quest is
// struck through wherever it is linked, which matters most on the home page:
// its "Threads Still Open" list is fixed text written at publish time and
// would otherwise keep advertising finished business. The !important is to
// beat the template rule that repaints the active note in the plain text
// colour - an NPC should read as their attitude on their own page too.
// ---------------------------------------------------------------------------

function collectNoteState(dir, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNoteState(full, found);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;

    // published notes carry a single line of JSON as their frontmatter
    const match = fs.readFileSync(full, "utf8").match(/^---\r?\n(.*?)\r?\n---/s);
    if (!match) continue;

    let data;
    try {
      data = JSON.parse(match[1]);
    } catch (e) {
      continue;
    }
    if (!data.permalink) continue;

    const props = data["dg-note-properties"];

    // the garden entry is served at the root, not at its own permalink
    const isEntry = Array.isArray(data.tags) && data.tags.includes("gardenEntry");

    found.push({
      permalink: data.permalink,
      url: isEntry ? "/" : data.permalink,
      attitude: readAttitude(props),
      completed: !!(props && props.completed === true),
      hideInSearch: !!(props && props.hideInSearch === true),
    });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Keeping notes out of search
//
// The template's own notHidden filter feeds both the search index and the RSS
// feed, so using it would quietly drop the note from the feed as well. Pruning
// the finished index instead keeps the change to the one thing that was asked
// for. Flag a note with hideInSearch in its frontmatter to use it.
// ---------------------------------------------------------------------------

function searchHiddenUrls() {
  return new Set(
    collectNoteState(NOTES_DIR)
      .filter(n => n.hideInSearch)
      .map(n => n.url)
  );
}

let noteStyleCache = null;

function noteStyleTag() {
  if (noteStyleCache !== null) return noteStyleCache;

  const rules = [];
  for (const { permalink, attitude, completed } of collectNoteState(NOTES_DIR)) {
    if (attitude !== null) {
      rules.push(
        `.filetree-sidebar a.filename[href="${permalink}"] { color: ${attitudeColor(attitude)} !important; }`
      );
    }
    if (completed) {
      // the file tree writes text-decoration:none inline, hence !important
      rules.push(
        `a[href="${permalink}"] { text-decoration: line-through !important; opacity: 0.55; }`
      );
    }
  }

  noteStyleCache = rules.length ? `<style>\n${rules.join("\n")}\n</style>` : "";
  return noteStyleCache;
}

// ---------------------------------------------------------------------------
// Item shop filter box
//
// The shop tables are rendered by dataviewjs in Obsidian and published as a
// static HTML snapshot, so the filter <input> arrives intact but its event
// listener does not. This re-binds it against the rows already in the page -
// no data fetch, the whole catalog is right there in the DOM.
// ---------------------------------------------------------------------------

const FILTER_SCRIPT = `<script>
(function () {
  function bind(input) {
    var table = input.nextElementSibling;
    if (!table || table.tagName !== 'TABLE') {
      table = input.parentElement && input.parentElement.querySelector('table');
    }
    if (!table) return;

    var rows = Array.prototype.slice.call(table.rows);
    var isHeading = function (row) {
      return row.cells.length === 1 && row.cells[0].tagName === 'TH';
    };

    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      var heading = null;
      var shown = 0;

      rows.forEach(function (row) {
        if (isHeading(row)) {
          // a category heading is only worth showing if something under it survived
          if (heading) heading.hidden = shown === 0;
          heading = row;
          shown = 0;
          return;
        }
        var match = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
        row.hidden = !match;
        if (match) shown++;
      });
      if (heading) heading.hidden = shown === 0;
    });
  }

  var inputs = document.querySelectorAll('input.js-itemshop-filter');
  Array.prototype.forEach.call(inputs, bind);
})();
</script>`;

function userEleventySetup(eleventyConfig) {
  // notes change between builds in --watch; the colours must follow
  eleventyConfig.on("eleventy.before", () => {
    noteStyleCache = null;
  });

  eleventyConfig.addTransform("note-state-styles", function (content) {
    const outputPath = this.page && this.page.outputPath;
    if (!outputPath || !outputPath.endsWith(".html")) return content;

    const style = noteStyleTag();
    return style ? content.replace("</head>", style + "</head>") : content;
  });

  eleventyConfig.addTransform("search-index-prune", function (content) {
    const outputPath = this.page && this.page.outputPath;
    if (!outputPath || !outputPath.endsWith("searchIndex.json")) return content;

    const hidden = searchHiddenUrls();
    if (hidden.size === 0) return content;

    try {
      const entries = JSON.parse(content);
      return JSON.stringify(entries.filter(entry => !hidden.has(entry.url)));
    } catch (e) {
      // a malformed index is the template's business, not ours - leave it be
      return content;
    }
  });

  eleventyConfig.addTransform("itemshop-filter", function (content) {
    const outputPath = this.page && this.page.outputPath;
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    if (!content.includes('placeholder="Filter')) return content;

    const tagged = content.replace(
      /<input([^>]*?placeholder="Filter[^>]*?)>/g,
      '<input class="js-itemshop-filter"$1>'
    );
    return tagged.replace("</body>", FILTER_SCRIPT + "</body>");
  });
}

exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
