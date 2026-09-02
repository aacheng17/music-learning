const fs = require('fs');
const path = require('path');
const { makeZip } = require('./zip');

const SITE_ROOT = path.join(__dirname, '..');
const SOURCES_DIR = path.join(SITE_ROOT, 'sources');

const MAJOR_SCALE_ONE_OCTAVE_SVG = path.join(SOURCES_DIR, 'major-scale-one-octave.svg');
const KEYBOARD_SVG = path.join(SOURCES_DIR, 'keyboard.svg');
const FREQUENCIES_SVG = path.join(SOURCES_DIR, 'frequencies.svg');
const SHARPS_SVG = path.join(SOURCES_DIR, 'sharps.svg');
const INTERVALS_CHROMATIC_SVG = path.join(SOURCES_DIR, 'intervals-chromatic.svg');
const SOLFEGE_CHROMATIC_SVG = path.join(SOURCES_DIR, 'solfege-chromatic.svg');
const WHOLE_HALF_STEPS_SVG = path.join(SOURCES_DIR, 'whole-half-steps.svg');
const MAJOR_SCALE_MAJOR_MINOR_CHORD_SVG = path.join(SOURCES_DIR, 'major-scale-major-and-minor-chord.svg');
const MODES_AND_CHORDS_SVG = path.join(SOURCES_DIR, 'modes-and-chords.svg');
const MODES_AND_CHORDS_ITEMS_DIR = path.join(SOURCES_DIR, 'modes-and-chords-items');

function svgTitle(svgMarkup) {
  const m = /<title>([^<]*)<\/title>/.exec(svgMarkup);
  return m ? m[1] : '';
}

const KINDS = ['relative', 'absolute', 'chart'];
function assertKind(kind, label) {
  if (!KINDS.includes(kind)) throw new Error(`Missing/invalid kind "${kind}" for "${label}" (must be one of ${KINDS.join(', ')})`);
}

const MODES_DIR = path.join(MODES_AND_CHORDS_ITEMS_DIR, 'modes');
const MODES_FROM_I_DIR = path.join(MODES_AND_CHORDS_ITEMS_DIR, 'modes-from-i');
const CHORDS_DIR = path.join(MODES_AND_CHORDS_ITEMS_DIR, 'chords');

function loadItemPath(fullPath, kind, titleOverride) {
  assertKind(kind, titleOverride || fullPath);
  const markup = fs.readFileSync(fullPath, 'utf8').trim();
  return { title: titleOverride || svgTitle(markup), markup, kind };
}

function loadItemFile(dir, filename, kind, titleOverride) {
  return loadItemPath(path.join(dir, filename), kind, titleOverride);
}

const LIBRARY_ITEMS = [
  { title: 'Solfege', srcPath: SOLFEGE_CHROMATIC_SVG, x: 792, kind: 'relative' },
  { title: 'Intervals', srcPath: INTERVALS_CHROMATIC_SVG, x: 792, kind: 'relative' },
  { title: 'Whole/Half Steps', srcPath: WHOLE_HALF_STEPS_SVG, x: 792, kind: 'relative' },
  { title: 'Major Scale', srcPath: path.join(MODES_DIR, '01-ionian-major-scale.svg'), kind: 'relative', x: 66, repeatRight: 6 },
  { title: 'Note Names', srcPath: SHARPS_SVG, gapBefore: true, kind: 'absolute' },
  { title: 'Frequencies', srcPath: FREQUENCIES_SVG, kind: 'absolute' },
  { title: 'Keyboard', srcPath: KEYBOARD_SVG, kind: 'absolute' },
];

const STARTER_ORDER = ['Frequencies', 'Note Names', 'Keyboard', 'Intervals', 'Solfege', 'Whole/Half Steps'];
const STARTER_GROUP = {
  title: 'Starter',
  items: STARTER_ORDER.map((title) => {
    const it = LIBRARY_ITEMS.find((li) => li.title === title);
    if (!it) throw new Error(`Starter group: no library item titled "${title}"`);
    return loadItemPath(it.srcPath, it.kind, it.title);
  }),
};

function loadGroupItems(dir, kind, titleTransform) {
  assertKind(kind, dir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  return files.map((f) => {
    const markup = fs.readFileSync(path.join(dir, f), 'utf8').trim();
    const rawTitle = svgTitle(markup);
    return { title: titleTransform ? titleTransform(rawTitle) : rawTitle, markup, kind };
  });
}

const COMMON_GROUP = {
  title: 'Common',
  items: [
    loadItemFile(MODES_DIR, '01-ionian-major-scale.svg', 'relative', 'Major Scale'),
    loadItemFile(CHORDS_DIR, '02-major-triad.svg', 'relative', 'Major Triad'),
    loadItemFile(CHORDS_DIR, '03-minor-triad.svg', 'relative', 'Minor Triad'),
  ],
};

const CHORDS_BY_NOTE_COUNT = [
  { title: '2 Notes', files: ['01-power-chord.svg'] },
  { title: '3 Notes', files: ['02-major-triad.svg', '03-minor-triad.svg', '04-diminished-triad.svg', '05-augmented-triad.svg', '06-sus2-chord.svg', '07-sus4-chord.svg'] },
  { title: '4 Notes', files: ['08-6-chord.svg', '09-minor-6-chord.svg', '10-add9-chord.svg', '11-major-7-chord.svg', '12-7-chord.svg', '13-7sus4-chord.svg', '14-augmented-7-chord.svg', '15-minor-7-chord.svg', '16-minor-major-7-chord.svg', '17-half-diminished-7-chord.svg', '18-diminished-7-chord.svg'] },
  { title: '5 Notes', files: ['19-6-9-chord.svg', '20-major-9-chord.svg', '21-9-chord.svg', '22-minor-9-chord.svg'] },
];

const CHORDS_GROUP = {
  title: 'Chords',
  subgroups: CHORDS_BY_NOTE_COUNT.map((sg) => ({
    title: sg.title,
    items: sg.files.map((f) => loadItemFile(CHORDS_DIR, f, 'relative')),
  })),
};

const MODES_GROUP = { title: 'Modes', items: loadGroupItems(MODES_DIR, 'relative') };

const MODES_FROM_I_GROUP = {
  title: 'Modes (from I)',
  items: loadGroupItems(MODES_FROM_I_DIR, 'relative', (t) => t.replace(/ \((?:Major|Minor) Scale\)/, '')),
};

const MODES_AND_CHORDS_SIDEBAR = [STARTER_GROUP, COMMON_GROUP, CHORDS_GROUP, MODES_GROUP, MODES_FROM_I_GROUP];

const MANIFEST = [
  {
    name: 'the-shapes-of-music-theory',
    title: 'The Shapes of Music Theory',
    preview: MAJOR_SCALE_ONE_OCTAVE_SVG,
    entries: [
      {
        slug: 'the-library-of-musical-notes',
        title: 'The Library of Musical Notes',
        sidebarGroups: MODES_AND_CHORDS_SIDEBAR,
        items: LIBRARY_ITEMS,
      },
      { slug: 'major-scale-major-and-minor-chord', title: 'Major Scale, Major and Minor Chord', srcPath: MAJOR_SCALE_MAJOR_MINOR_CHORD_SVG, kind: 'chart' },
      { slug: 'modes-and-chords', title: 'Modes and Chords', srcPath: MODES_AND_CHORDS_SVG, kind: 'chart' },
    ],
  },
];

function titleize(slug) {
  return slug
    .split('-')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const categories = MANIFEST.map((cat) => {
  const entries = cat.entries.map((e, i) => {
    const num = String(i + 1).padStart(3, '0');
    return {
      num,
      slug: e.slug,
      dirName: `${num}-${e.slug}`,
      title: e.title,
      items: e.items || [{ title: e.title, srcPath: e.srcPath, kind: e.kind }],
      sidebarGroups: e.sidebarGroups,
    };
  });
  return { name: cat.name, title: cat.title || titleize(cat.name), preview: cat.preview, entries };
});

const PROTECTED_DIRS = ['assets', 'scripts', 'sources', '.github', '.git'];
for (const entry of fs.readdirSync(SITE_ROOT, { withFileTypes: true })) {
  if (entry.isDirectory() && !PROTECTED_DIRS.includes(entry.name)) {
    rimraf(path.join(SITE_ROOT, entry.name));
  }
}

function pageShell({ title, bodyClass, extraHead, body, scripts }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${extraHead || ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
${scripts || ''}
</body>
</html>
`;
}

function renderRootIndex(categories) {
  const cards = categories
    .map((cat) => {
      const previewEntry = cat.entries.find((e) => e.slug === 'the-library-of-musical-notes') || cat.entries[0];
      const thumbSrc = cat.preview
        ? `${cat.name}/preview.svg`
        : previewEntry && `${cat.name}/${previewEntry.dirName}/${previewEntry.slug}.svg`;
      const thumb = thumbSrc ? `<div class="thumb"><img src="${thumbSrc}" alt=""></div>` : '';
      return `      <a class="card folder" href="${cat.name}/index.html">
        ${thumb}
        <span class="label">${cat.title}</span>
        <span class="index">${cat.entries.length} diagram${cat.entries.length === 1 ? '' : 's'}</span>
      </a>`;
    })
    .join('\n');

  const body = `  <header class="bar">
    <span class="crumbs">Home</span>
  </header>
  <main class="listing">
    <div class="grid tiles">
${cards}
    </div>
  </main>`;

  return pageShell({
    title: 'Home',
    extraHead: `<link rel="stylesheet" href="assets/style.css">`,
    body,
  });
}

function renderCategoryIndex(cat) {
  const cards = cat.entries
    .map(
      (e) => `      <div class="card file">
        <a class="card-link" href="${e.dirName}/index.html">
          <div class="thumb"><img src="${e.dirName}/${e.slug}.svg" alt=""></div>
          <span class="label">${e.title}</span>
        </a>
        <a class="download" href="${e.dirName}/${e.slug}.zip" download="${e.slug}.zip" title="Download SVGs (.zip)" aria-label="Download SVGs (.zip)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>
        </a>
      </div>`
    )
    .join('\n');

  const body = `  <header class="bar">
    <span class="crumbs"><a href="../index.html">Home</a> / ${cat.title}</span>
  </header>
  <main class="listing">
    <div class="grid tiles">
${cards}
    </div>
  </main>`;

  return pageShell({
    title: `${cat.title} — Home`,
    extraHead: `<link rel="stylesheet" href="../assets/style.css">`,
    body,
  });
}

function renderItem(it) {
  assertKind(it.kind, it.title);
  const svgMarkup = fs.readFileSync(it.srcPath, 'utf8').trim();
  const dataAttrs = [
    it.x != null ? ` data-x="${it.x}"` : '',
    it.gapBefore ? ' data-gap-before="true"' : '',
    ` data-kind="${it.kind}"`,
    it.repeatLeft ? ` data-repeat-left="${it.repeatLeft}"` : '',
    it.repeatRight ? ` data-repeat-right="${it.repeatRight}"` : '',
  ].join('');
  return `      <div class="pz-item"${dataAttrs}>
${svgMarkup}
      </div>`;
}

function renderSidebarItem(it) {
  assertKind(it.kind, it.title);
  return `          <div class="pz-sidebar-item" tabindex="0" data-kind="${it.kind}">
            <span>${it.title}</span>
            <template>${it.markup}</template>
          </div>`;
}

function renderSidebarSubgroup(sg) {
  return `          <div class="pz-sidebar-subgroup">
            <h4>${sg.title}</h4>
${sg.items.map(renderSidebarItem).join('\n')}
          </div>`;
}

function renderSidebarGroup(g) {
  const inner = g.subgroups
    ? g.subgroups.map(renderSidebarSubgroup).join('\n')
    : g.items.map(renderSidebarItem).join('\n');
  return `        <div class="pz-sidebar-group">
          <h3>
            <button class="pz-sidebar-group-toggle" type="button" aria-expanded="true">
              <span>${g.title}</span>
              <span class="pz-sidebar-group-caret" aria-hidden="true">&#9662;</span>
            </button>
          </h3>
          <div class="pz-sidebar-group-body">
${inner}
          </div>
        </div>`;
}

function renderSidebar(groups) {
  const body = groups.map(renderSidebarGroup).join('\n');

  return `    <button class="sidebar-toggle" type="button" aria-expanded="false" aria-label="Modes and Chords">+</button>
    <aside class="pz-sidebar collapsed">
      <div class="pz-sidebar-body">
${body}
      </div>
    </aside>`;
}

function renderLeaf(cat, entry) {
  const items = entry.items.map((it) => renderItem(it)).join('\n');
  const hasSidebar = !!entry.sidebarGroups;
  const dragHint = [
    entry.items.length > 1 ? 'drag an image to move it' : null,
    hasSidebar ? 'drag a structure from the sidebar to add it' : null,
    'middle-drag or arrow keys to pan',
  ].filter(Boolean).join(' &middot; ');

  const body = `  <header class="bar">
    <span class="crumbs"><a href="../../index.html">Home</a> / <a href="../index.html">${cat.title}</a> / ${entry.title}</span>
  </header>
  <div class="pz-viewer">
    <div class="pz-viewport">
      <div class="pz-stage">
${items}
        <div class="pz-highlight"></div>
      </div>
    </div>
${hasSidebar ? renderSidebar(entry.sidebarGroups) : ''}
${hasSidebar ? '    <div class="pz-collapsed-drop-zone"></div>' : ''}
${hasSidebar ? '    <div class="pz-drag-ghost pz-floating"></div>' : ''}
${hasSidebar ? '    <div class="pz-sidebar-tooltip pz-floating"></div>' : ''}
    <div class="hint">
      <span>scroll to zoom &middot; ${dragHint}</span>
    </div>
    <div class="controls">
      <button class="reset reset-zoom-pan" type="button">Reset zoom/pan</button>
      <button class="reset reset-images" type="button">Reset images</button>
      <button class="reset clear-images" type="button">Clear images</button>
    </div>
  </div>`;

  return pageShell({
    title: `${entry.title} — Home`,
    bodyClass: 'viewer-page',
    extraHead: `<link rel="stylesheet" href="../../assets/style.css">`,
    body,
    scripts: `  <script src="../../assets/pan-zoom.js"></script>`,
  });
}

for (const cat of categories) {
  const catDir = path.join(SITE_ROOT, cat.name);
  ensureDir(catDir);

  if (cat.preview) fs.copyFileSync(cat.preview, path.join(catDir, 'preview.svg'));

  fs.writeFileSync(path.join(catDir, 'index.html'), renderCategoryIndex(cat));

  for (const entry of cat.entries) {
    const leafDir = path.join(catDir, entry.dirName);
    ensureDir(leafDir);
    fs.copyFileSync(entry.items[0].srcPath, path.join(leafDir, `${entry.slug}.svg`));
    fs.writeFileSync(path.join(leafDir, 'index.html'), renderLeaf(cat, entry));

    const zipFiles = entry.items.map((it) => ({ name: path.basename(it.srcPath), data: fs.readFileSync(it.srcPath) }));
    fs.writeFileSync(path.join(leafDir, `${entry.slug}.zip`), makeZip(zipFiles));
  }
}

fs.writeFileSync(path.join(SITE_ROOT, 'index.html'), renderRootIndex(categories));
fs.writeFileSync(path.join(SITE_ROOT, '.nojekyll'), '');

const total = categories.reduce((n, c) => n + c.entries.length, 0);
console.log(`Built ${total} diagram pages across ${categories.length} categories`);
for (const cat of categories) {
  console.log(`  ${cat.name}/ (${cat.entries.length})`);
  for (const e of cat.entries) console.log(`    ${cat.name}/${e.dirName}/`);
}
