// DOM glue: catalog dropdown, palette (categories + lazy thumbnails), toolbar,
// save/load, and reflecting editor state back into the chrome.
import { CATALOGS, loadManifest, label } from './catalog.js';
import { ThumbRenderer } from './thumbs.js';
import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(editor) {
    this.editor = editor;
    this.thumbs = null;
    this.tilesByModel = new Map();   // model -> tile element
    this._saveTimer = null;
    this._toastTimer = null;

    this._wireEditor();
    this._buildCatalogSelect();
    this._bindToolbar();
  }

  // ---- editor -> UI ----
  _wireEditor() {
    const ed = this.editor;
    ed.onChange = (state) => {
      this._setSave('Saving…');
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        storage.saveAuto(state);
        const n = state.objects.length;
        this._setSave(`Saved · ${n} object${n === 1 ? '' : 's'}`);
      }, 350);
    };
    ed.onStatus = (msg) => this.toast(msg);
    ed.onPlaceMode = (name) => this._reflectPlace(name);
    ed.onTool = (tool) => this._reflectTool(tool);
    ed.onRotation = (q) => { $('rotReadout').textContent = (q * 90) + '°'; };
    ed.onGrid = (cols, rows) => {
      $('colsInput').value = cols; $('rowsInput').value = rows;
      const gs = $('gridSize'); if (gs) gs.textContent = `${cols} × ${rows}`;
      const gb = $('gridBtnSize'); if (gb) gb.textContent = `${cols}×${rows}`;
    };
    ed.onSelect = (rec) => this._reflectSelection(rec);
  }

  _setSave(msg) { $('saveStatus').textContent = msg; }

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  _reflectPlace(name) {
    for (const [m, el] of this.tilesByModel) el.classList.toggle('active', m === name);
  }

  _reflectTool(tool) {
    $('toolSelect').classList.toggle('active', tool === 'select');
    $('toolErase').classList.toggle('active', tool === 'erase');
  }

  _reflectSelection(rec) {
    const el = $('selInfo');
    el.innerHTML = '';
    if (!rec) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const ed = this.editor;

    const kdiv = (txt) => { const d = document.createElement('div'); d.className = 'k'; d.textContent = txt; return d; };
    const title = document.createElement('div');
    title.innerHTML = `<b>${label(rec.model)}</b>`;
    el.append(title, kdiv(`cell ${rec.col},${rec.row}`));

    // a labelled X/Y/Z control group (− / type / +); native spinners hidden in CSS
    const section = (heading, get, set, nudge, step, suffix) => {
      const h = kdiv(heading); h.style.marginTop = '7px'; el.append(h);
      const box = document.createElement('div'); box.className = 'off';
      for (const ax of ['x', 'y', 'z']) {
        const row = document.createElement('div'); row.className = 'offrow';
        const name = document.createElement('label'); name.textContent = ax.toUpperCase() + suffix;
        const minus = document.createElement('button'); minus.textContent = '−';
        const inp = document.createElement('input'); inp.type = 'number'; inp.value = get(ax);
        const plus = document.createElement('button'); plus.textContent = '+';
        inp.oninput = () => { const v = parseFloat(inp.value); if (!isNaN(v)) set(ax, v); };
        minus.onclick = () => { nudge(ax, -step); inp.value = get(ax); };
        plus.onclick = () => { nudge(ax, step); inp.value = get(ax); };
        row.append(name, minus, inp, plus);
        box.append(row);
      }
      el.append(box);
    };

    section('Offset (world units)',
      (ax) => ((rec.off && rec.off[ax]) || 0).toFixed(2),
      (ax, v) => ed.setOffset(rec, ax, v),
      (ax, d) => ed.nudgeOffset(rec, ax, d),
      0.1, '');

    section('Rotation (°)  ·  Y = R key',
      (ax) => String(ax === 'y' ? rec.rot * 90 : (ax === 'x' ? (rec.rotX || 0) : (rec.rotZ || 0))),
      (ax, v) => ed.setRotation(rec, ax, v),
      (ax, d) => ed.nudgeRotation(rec, ax, d),
      90, '°');

    const reset = document.createElement('button');
    reset.className = 'resetOff'; reset.textContent = 'Reset offset + rotation';
    reset.onclick = () => { ed.resetOffset(rec); ed.resetRotation(rec); this._reflectSelection(rec); };
    el.append(reset, kdiv('R rotate · Del delete'));
  }

  // ---- catalog dropdown ----
  _buildCatalogSelect() {
    const sel = $('catalogSelect');
    sel.innerHTML = '';
    for (const c of CATALOGS) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      sel.appendChild(opt);
    }
    sel.onchange = () => this._loadCatalog(sel.value);
  }

  // Switch the ACTIVE pack (what new placements use). Packs combine — switching
  // keeps everything already placed, so a level can mix objects from several.
  async _loadCatalog(id) {
    const entry = CATALOGS.find((c) => c.id === id) || CATALOGS[0];
    this._setSave('Loading catalog…');
    let manifest;
    try { manifest = await loadManifest(entry); }
    catch (e) { this.toast('Catalog failed to load'); this._setSave('—'); console.error(e); return; }

    await this.editor.setCatalog(manifest);
    this.thumbs = new ThumbRenderer(this.editor.pack);
    this._buildPalette(manifest);
    $('catMeta').textContent = `${manifest.count} objects · ${manifest.categories.length} categories`;
    this._setSave('Ready');
    return manifest;
  }

  // ---- palette ----
  _buildPalette(manifest) {
    const root = $('palette');
    root.innerHTML = '';
    this.tilesByModel.clear();

    // one observer renders thumbnails as tiles scroll into view
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        this._renderThumb(en.target);
      }
    }, { root, rootMargin: '120px' });

    for (const cat of manifest.categories) {
      const wrap = document.createElement('div');
      wrap.className = 'cat';
      const head = document.createElement('button');
      head.className = 'cat-h';
      head.innerHTML = `<span class="chev">▼</span><span style="flex:1">${cat.name}</span><span class="count">${cat.models.length}</span>`;
      head.onclick = () => wrap.classList.toggle('collapsed');
      wrap.appendChild(head);

      const tiles = document.createElement('div');
      tiles.className = 'tiles';
      for (const model of cat.models) {
        const tile = this._makeTile(model);
        tiles.appendChild(tile);
        this.tilesByModel.set(model, tile);
        io.observe(tile);
      }
      wrap.appendChild(tiles);
      root.appendChild(wrap);
    }
  }

  _makeTile(model) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.model = model;
    tile.dataset.search = (model + ' ' + label(model)).toLowerCase();
    tile.title = model;
    tile.innerHTML = `<div class="thumb"><span class="ph">…</span></div><div class="name">${label(model)}</div>`;
    tile.onclick = () => {
      if (this.editor.placeModel === model) this.editor.clearPlaceMode();
      else this.editor.selectModel(model);
    };
    return tile;
  }

  async _renderThumb(tile) {
    if (!this.thumbs) return;
    const model = tile.dataset.model;
    try {
      const url = await this.thumbs.render(model);
      const box = tile.querySelector('.thumb');
      if (url && box) { box.innerHTML = `<img alt="${model}" src="${url}" />`; }
    } catch (e) { /* leave placeholder */ }
  }

  // ---- toolbar ----
  _bindToolbar() {
    const ed = this.editor;

    $('toolSelect').onclick = () => { ed.clearPlaceMode(); ed.setTool('select'); };
    $('toolErase').onclick = () => ed.setTool('erase');

    // Change-Grid popover: one button toggles a compass that adds/removes a
    // row/column on any of the four sides; the exact-size inputs still apply.
    const gp = $('gridPanel');
    $('btnChangeGrid').onclick = () => { gp.hidden = !gp.hidden; };
    gp.querySelectorAll('button[data-side]').forEach((b) => {
      b.onclick = () => ed.growGrid(b.dataset.side, b.dataset.add === '1');
    });
    // click anywhere outside the popover (incl. the 3D stage) closes it
    document.addEventListener('pointerdown', (e) => {
      if (gp.hidden) return;
      if (gp.contains(e.target) || $('btnChangeGrid').contains(e.target)) return;
      gp.hidden = true;
    });

    $('applyGrid').onclick = () => {
      const c = parseInt($('colsInput').value, 10);
      const r = parseInt($('rowsInput').value, 10);
      if (c > 0 && r > 0) ed.resize(c, r);
    };

    $('btnReset').onclick = () => ed.resetView();

    $('btnNew').onclick = () => {
      if (ed.state.objects.length && !confirm('Clear the level and start over?')) return;
      ed.newLevel();
      this.toast('New level');
    };

    $('btnExport').onclick = () => {
      const name = prompt('Export as…', 'level.json');
      if (!name) return;
      storage.exportFile(ed.getState(), name.endsWith('.json') ? name : name + '.json');
      this.toast('Exported');
    };

    $('btnImport').onclick = async () => {
      let data;
      try { data = await storage.importFile(); } catch (e) { this.toast('Bad JSON'); return; }
      if (!data) return;
      if (ed.state.objects.length && !confirm('Replace the current level with the imported file?')) return;
      try { await ed.loadState(data); this.toast('Imported'); }
      catch (e) { this.toast(e.message || 'Import failed'); console.error(e); }
    };

    // live search filter
    $('search').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const [, tile] of this.tilesByModel) {
        tile.style.display = (!q || tile.dataset.search.includes(q)) ? '' : 'none';
      }
    };
  }

  // ---- boot ----
  async start(opts = {}) {
    const restore = opts.restore !== false;
    const restored = storage.loadAuto();
    const startId = (restored && restored.catalog) || CATALOGS[0].id;
    await this._loadCatalog(startId);

    if (restore && restored && restored.objects && restored.objects.length &&
        confirm(`Restore your last level (${restored.objects.length} objects)?`)) {
      try { await this.editor.loadState(restored); }
      catch (e) { console.error(e); }
    }
    this._reflectTool('select');
  }
}
