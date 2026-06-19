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
