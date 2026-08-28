// Site-specific extensions. The template calls these from .eleventy.js after
// its own setup, so anything registered here wins - and survives pulling
// updates from upstream.

// ---------------------------------------------------------------------------
// ```attitude``` blocks
//
// In the vault, the Attitude Colors plugin turns these fences into a live
// slider bound to the note's Attitude property. A published page has no plugin
// and nothing to write back to, so it gets the read-only equivalent: a snapshot
// of where that NPC stood with the crew when the note was last published.
//
// The hue matches the plugin exactly - 0 is red, 100 is green - so the site and
// the vault's file explorer agree on what "80" looks like.
// ---------------------------------------------------------------------------

const ATTITUDE_KEY = "attitude";

function attitudeOf(env) {
  const sources = [env && env["dg-note-properties"], env];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const key = Object.keys(source).find(k => k.toLowerCase() === ATTITUDE_KEY);
    if (key === undefined) continue;
    const value = Number(source[key]);
    if (!isNaN(value)) return Math.max(0, Math.min(100, value));
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
  const hue = Math.round(value * 1.2);
  const color = `hsl(${hue}, 75%, 45%)`;
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
