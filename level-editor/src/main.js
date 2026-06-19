// Bootstrap: create the editor (3D world + render loop), wire the UI, load the
// default catalog, optionally restore the last autosaved level.
import { Editor } from './editor.js';
import { UI } from './ui.js';

const editor = new Editor(document.getElementById('stage'));
const ui = new UI(editor);

const params = new URLSearchParams(location.search);
const demo = params.has('demo');

ui.start({ restore: !demo })
  .then(async () => {
    if (demo) { const { buildDemo } = await import('./demo.js'); await buildDemo(editor); }
  })
  .catch((e) => { console.error('[level-editor] start failed', e); });

// expose for debugging / programmatic checks
window.__LE = { editor, ui };
