// Curated irregular-verb subset (from content/irregular-verbs.json, tier 1
// + kitchen-flavored tier 2). Shape: v=base, past, pp, wp/wpp = catalogue
// distractors for past / participle.
export const VERBS = [
  { v: 'be', past: 'was', pp: 'been', wp: ['beed', 'is', 'been'], wpp: ['beed', 'was', 'being'] },
  { v: 'come', past: 'came', pp: 'come', wp: ['comed', 'come', 'camed'], wpp: ['comed', 'came', 'comen'] },
  { v: 'do', past: 'did', pp: 'done', wp: ['doed', 'done', 'didd'], wpp: ['doed', 'did', 'doen'] },
  { v: 'draw', past: 'drew', pp: 'drawn', wp: ['drawed', 'drawn', 'drow'], wpp: ['drawed', 'drew', 'drawen'] },
  { v: 'drink', past: 'drank', pp: 'drunk', wp: ['drinked', 'drunk', 'drunken'], wpp: ['drinked', 'drank', 'dronk'] },
  { v: 'drive', past: 'drove', pp: 'driven', wp: ['drived', 'driven', 'droven'], wpp: ['drived', 'drove', 'droven'] },
  { v: 'eat', past: 'ate', pp: 'eaten', wp: ['eated', 'eaten', 'et'], wpp: ['eated', 'ate', 'eat'] },
  { v: 'feel', past: 'felt', pp: 'felt', wp: ['feeled', 'fell', 'feelt'], wpp: ['feeled', 'fell', 'feelt'] },
  { v: 'find', past: 'found', pp: 'found', wp: ['finded', 'fund', 'findd'], wpp: ['finded', 'fund', 'founden'] },
  { v: 'fly', past: 'flew', pp: 'flown', wp: ['flied', 'flown', 'flowed'], wpp: ['flied', 'flew', 'flying'] },
  { v: 'forget', past: 'forgot', pp: 'forgotten', wp: ['forgetted', 'forgotten', 'forgat'], wpp: ['forgetted', 'forgot', 'forgeted'] },
  { v: 'get', past: 'got', pp: 'got', wp: ['getted', 'gat', 'gotten'], wpp: ['getted', 'gat', 'geted'] },
  { v: 'give', past: 'gave', pp: 'given', wp: ['gived', 'given', 'gaved'], wpp: ['gived', 'gave', 'givven'] },
  { v: 'go', past: 'went', pp: 'gone', wp: ['goed', 'gone', 'wented'], wpp: ['goed', 'went', 'goen'] },
  { v: 'have', past: 'had', pp: 'had', wp: ['haved', 'hade', 'haves'], wpp: ['haved', 'hadded', 'haveen'] },
  { v: 'hear', past: 'heard', pp: 'heard', wp: ['heared', 'hore', 'hurd'], wpp: ['heared', 'hore', 'hearen'] },
  { v: 'know', past: 'knew', pp: 'known', wp: ['knowed', 'known', 'knewed'], wpp: ['knowed', 'knew', 'knowen'] },
  { v: 'leave', past: 'left', pp: 'left', wp: ['leaved', 'lefted', 'lave'], wpp: ['leaved', 'lefted', 'leaven'] },
  { v: 'make', past: 'made', pp: 'made', wp: ['maked', 'mode', 'makt'], wpp: ['maked', 'mode', 'maken'] },
  { v: 'meet', past: 'met', pp: 'met', wp: ['meeted', 'meat', 'meeten'], wpp: ['meeted', 'meat', 'meeten'] },
  { v: 'pay', past: 'paid', pp: 'paid', wp: ['payed', 'payd', 'paied'], wpp: ['payed', 'payd', 'payen'] },
  { v: 'put', past: 'put', pp: 'put', wp: ['putted', 'puts', 'putten'], wpp: ['putted', 'putten', 'puting'] },
  { v: 'read', past: 'read', pp: 'read', wp: ['readed', 'red', 'reads'], wpp: ['readed', 'red', 'reading'] },
  { v: 'run', past: 'ran', pp: 'run', wp: ['runned', 'run', 'ranned'], wpp: ['runned', 'ran', 'ronnen'] },
  { v: 'say', past: 'said', pp: 'said', wp: ['sayed', 'sed', 'sayd'], wpp: ['sayed', 'sed', 'sayen'] },
  { v: 'see', past: 'saw', pp: 'seen', wp: ['seed', 'seen', 'sawed'], wpp: ['seed', 'saw', 'seeen'] },
  { v: 'send', past: 'sent', pp: 'sent', wp: ['sended', 'sented', 'sant'], wpp: ['sended', 'sented', 'sant'] },
  { v: 'show', past: 'showed', pp: 'shown', wp: ['shew', 'shown', 'showd'], wpp: ['showded', 'shewn', 'showen'] },
  { v: 'sing', past: 'sang', pp: 'sung', wp: ['singed', 'sung', 'songed'], wpp: ['singed', 'sang', 'singen'] },
  { v: 'sit', past: 'sat', pp: 'sat', wp: ['sitted', 'set', 'saten'], wpp: ['sitted', 'set', 'sitten'] },
  { v: 'sleep', past: 'slept', pp: 'slept', wp: ['sleeped', 'slep', 'sleped'], wpp: ['sleeped', 'slep', 'sleeppen'] },
  { v: 'speak', past: 'spoke', pp: 'spoken', wp: ['speaked', 'spoken', 'spake'], wpp: ['speaked', 'spoke', 'spaken'] },
  { v: 'swim', past: 'swam', pp: 'swum', wp: ['swimmed', 'swum', 'swimd'], wpp: ['swimmed', 'swam', 'swimen'] },
  { v: 'take', past: 'took', pp: 'taken', wp: ['taked', 'taken', 'tooked'], wpp: ['taked', 'took', 'takeen'] },
  { v: 'teach', past: 'taught', pp: 'taught', wp: ['teached', 'tought', 'tach'], wpp: ['teached', 'tought', 'teachen'] },
  { v: 'tell', past: 'told', pp: 'told', wp: ['telled', 'telt', 'tald'], wpp: ['telled', 'telt', 'tellen'] },
  { v: 'think', past: 'thought', pp: 'thought', wp: ['thinked', 'thunk', 'thinkt'], wpp: ['thinked', 'thunk', 'thinken'] },
  { v: 'understand', past: 'understood', pp: 'understood', wp: ['understanded', 'understud', 'understands'], wpp: ['understanded', 'understud', 'understooden'] },
  { v: 'wear', past: 'wore', pp: 'worn', wp: ['weared', 'worn', 'ware'], wpp: ['weared', 'wore', 'weren'] },
  { v: 'write', past: 'wrote', pp: 'written', wp: ['writed', 'written', 'wroten'], wpp: ['writed', 'wrote', 'writen'] },
  // kitchen flavor (tier 2)
  { v: 'cut', past: 'cut', pp: 'cut', wp: ['cutted', 'cuts', 'cuten'], wpp: ['cutted', 'cuts', 'cutten'] },
  { v: 'burn', past: 'burnt', pp: 'burnt', wp: ['burnded', 'born', 'burnen'], wpp: ['burnded', 'born', 'burnen'] },
  { v: 'break', past: 'broke', pp: 'broken', wp: ['breaked', 'broken', 'broked'], wpp: ['breaked', 'broke', 'broaken'] },
  { v: 'catch', past: 'caught', pp: 'caught', wp: ['catched', 'cought', 'catchen'], wpp: ['catched', 'cought', 'catchen'] },
  { v: 'bring', past: 'brought', pp: 'brought', wp: ['bringed', 'brung', 'brang'], wpp: ['bringed', 'brung', 'brangen'] },
  { v: 'hold', past: 'held', pp: 'held', wp: ['holded', 'hild', 'houlded'], wpp: ['holded', 'hild', 'holden'] },
];

// Deterministic RNG hook (QA mode swaps this for a seeded generator).
export const rng = { next: Math.random };
export function seedRng(seed) {
  let a = seed >>> 0;
  rng.next = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; }

/**
 * Start-of-round practice: verbs missed in EARLIER rounds (the persisted
 * save.missed list) come back as the first sink questions of the next round.
 * Returns up to n question keys ("go|past"); verbs no longer in the current
 * subset are skipped. Consumes no rng draws when the list is empty (QA seeds).
 */
export function seedPractice(missedList = [], n = 3) {
  const known = missedList.filter((v) => VERBS.some((x) => x.v === v));
  return shuffle(known.slice()).slice(0, n)
    .map((v) => `${v}|${rng.next() < 0.5 ? 'past' : 'pp'}`);
}

/**
 * Build one sink question.
 * missed: array of verb keys ("go|past") queued for re-asking — takes priority.
 * recentlyAsked: Set of verb base forms to avoid immediate repeats.
 */
export function makeQuestion(missed = [], recentlyAsked = new Set()) {
  let verb = null, form = null, fromMissed = false;
  if (missed.length) {
    const key = missed.shift();
    const [base, f] = key.split('|');
    verb = VERBS.find((x) => x.v === base);
    form = f;
    fromMissed = true;
  }
  if (!verb) {
    const fresh = VERBS.filter((x) => !recentlyAsked.has(x.v));
    verb = pick(fresh.length ? fresh : VERBS);
    form = rng.next() < 0.5 ? 'past' : 'pp';
  }
  const answer = form === 'past' ? verb.past : verb.pp;
  const wrongPool = (form === 'past' ? verb.wp : verb.wpp).filter((w) => w !== answer);
  const wrong = shuffle(wrongPool.slice()).slice(0, 2);
  const chips = shuffle([answer, ...wrong]);
  const prompt = form === 'past'
    ? `<span class="form-base">${verb.v}</span> → <span class="form-past">___</span>`
    : `<span class="form-base">${verb.v}</span> → <span class="form-past">${verb.past}</span> → <span class="form-pp">___</span>`;
  const chain = `<span class="form-base">${verb.v}</span> → <span class="form-past">${verb.past}</span> → <span class="form-pp">${verb.pp}</span>`;
  return {
    verb: verb.v, form, answer, chips, prompt, chain, fromMissed,
    key: `${verb.v}|${form}`,
    sub: form === 'past' ? 'simple past' : 'past participle',
  };
}
