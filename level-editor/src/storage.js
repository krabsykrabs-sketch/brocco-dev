// Persistence: localStorage autosave + JSON file export/import.
const KEY = 'krabsy_leveleditor_autosave';

export function saveAuto(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}
export function loadAuto() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
  catch (_) { return null; }
}
export function clearAuto() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

export function exportFile(state, filename = 'level.json') {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importFile() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) { resolve(null); return; }
      const r = new FileReader();
      r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(e); } };
      r.onerror = reject;
      r.readAsText(f);
    };
    inp.click();
  });
}

// ---- levels API (only present when served by serve.py; absent on the static
// dev host, where the Library UI hides and Export/Import remain) ----
const API = '/api';

/** True if the local server's levels API is reachable. */
export async function apiAvailable() {
  try { const r = await fetch(API + '/dirs', { cache: 'no-store' }); return r.ok; }
  catch (_) { return false; }
}
/** Candidate level folders in the repo (games/<name>/levels). */
export async function listDirs() {
  const r = await fetch(API + '/dirs', { cache: 'no-store' });
  return r.ok ? r.json() : [];
}
/** Rooms in a folder: [{name, objects}]. */
export async function listLevels(dir) {
  const r = await fetch(API + '/levels?dir=' + encodeURIComponent(dir), { cache: 'no-store' });
  if (!r.ok) throw new Error('list failed'); return r.json();
}
/** Read one room's JSON straight from the repo file. */
export async function readLevel(dir, name) {
  const r = await fetch(API + '/level?dir=' + encodeURIComponent(dir) + '&name=' + encodeURIComponent(name), { cache: 'no-store' });
  if (!r.ok) throw new Error('read failed (' + r.status + ')'); return r.json();
}
/** Write a room's JSON back to its repo file (creates the folder if needed). */
export async function writeLevel(dir, name, state) {
  const r = await fetch(API + '/level?dir=' + encodeURIComponent(dir) + '&name=' + encodeURIComponent(name),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || ('write failed (' + r.status + ')'));
  return out;
}
