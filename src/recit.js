/* ===== Module « Analyse progressive d'un récit » =====
   Données locales (localStorage + IndexedDB pour l'audio accepté). Analyse locale transparente :
   l'app propose, l'utilisateur confirme. Aucun score de mensonge ou de sincérité. */
const RECIT_KEY = 'soutien-recit-v1';
const R = (k) => (RECIT[lang] && RECIT[lang][k]) ?? RECIT.fr[k] ?? k;
const RL = (k, l) => (RECIT[l] && RECIT[l][k]) ?? RECIT.fr[k] ?? k;
const NATURES = ['obs', 'report', 'doc', 'interp', 'suspicion'];
const STATUSES = ['unverified', 'partial', 'corroborated', 'contradicted', 'unverifiable'];
const GAP_KINDS = ['newInfo', 'compatible', 'minor', 'central', 'transcription'];
const GAP_STATES = ['open', 'partial', 'resolved'];
const ANSWER_LANGS = ['fr', 'en', 'es', 'ht'];
let recitView = { mode: 'list', id: null, tab: 'interview' };
let recitRec = null;

/* ---------- stockage ---------- */
function recitLoad() {
  try { return JSON.parse(localStorage.getItem(RECIT_KEY)) || { dossiers: [] }; } catch { return { dossiers: [] }; }
}
function recitSave(db) {
  try { localStorage.setItem(RECIT_KEY, JSON.stringify(db)); return true; } catch { alert(R('saveFailed')); return false; }
}
function recitUid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function recitGet(db, id) { return db.dossiers.find((d) => d.id === id); }
function recitBump(d) { d.version = (d.version || 0) + 1; d.updated = new Date().toISOString(); }
function recitDate(iso) { try { return new Date(iso).toLocaleString(localeTags[lang]); } catch { return iso; } }

function recitIdb(fn) {
  return new Promise((ok, ko) => {
    try {
      const rq = indexedDB.open('soutien-recit-audio', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('audio');
      rq.onsuccess = () => { const tx = rq.result.transaction('audio', 'readwrite'); fn(tx.objectStore('audio'), ok); tx.onerror = () => ko(tx.error); };
      rq.onerror = () => ko(rq.error);
    } catch (e) { ko(e); }
  });
}
const recitAudioPut = (id, blob) => recitIdb((s, ok) => { s.put(blob, id); ok(); });
const recitAudioGet = (id) => recitIdb((s, ok) => { const r = s.get(id); r.onsuccess = () => ok(r.result); });
const recitAudioDel = (id) => recitIdb((s, ok) => { s.delete(id); ok(); });

/* ---------- moteur d'analyse locale (déterministe, multilingue) ---------- */
const LEX = {
  hedge: {
    fr: ['peut-être', 'peut etre', 'environ', 'je crois', 'je pense', 'il me semble', 'à peu près', 'vers', 'probablement', 'sans doute', 'je ne sais plus', 'je ne me souviens'],
    en: ['maybe', 'perhaps', 'about', 'around', 'i think', 'i believe', 'roughly', 'probably', "i'm not sure", 'i don\'t remember', 'kind of'],
    es: ['quizás', 'quizas', 'tal vez', 'más o menos', 'creo', 'pienso', 'alrededor', 'aproximadamente', 'probablemente', 'no recuerdo', 'no estoy seguro'],
    ht: ['petèt', 'petet', 'konsa', 'mwen kwè', 'mwen panse', 'anviwon', 'apeprè', 'apepre', 'mwen pa sonje', 'mwen pa twò sonje', 'sanble'],
  },
  hearsay: {
    fr: ["on m'a dit", 'il paraît', 'il parait', 'selon', "j'ai entendu dire", 'quelqu\'un m\'a dit', 'il m\'a raconté', 'elle m\'a raconté', 'd\'après'],
    en: ['someone told me', 'i heard', 'they say', 'apparently', 'according to', 'he told me', 'she told me', 'people say'],
    es: ['me dijeron', 'me dijo', 'dicen que', 'según', 'segun', 'oí que', 'escuché que', 'al parecer'],
    ht: ['yo di m', 'yo di mwen', 'li di m', 'li di mwen', 'mwen tande', 'sanble', 'selon', 'dapre', 'moun di'],
  },
  vagueTime: {
    fr: ['le soir', 'ce soir-là', 'plus tard', 'un jour', 'récemment', 'avant', 'après', 'tôt', 'tard', 'la nuit', 'le matin', 'l\'autre jour', 'dans la journée'],
    en: ['in the evening', 'that night', 'later', 'one day', 'recently', 'earlier', 'the other day', 'in the morning', 'at night', 'late', 'early'],
    es: ['por la noche', 'esa noche', 'más tarde', 'un día', 'recientemente', 'el otro día', 'por la mañana', 'tarde', 'temprano'],
    ht: ['aswè', 'aswe', 'pita', 'yon jou', 'dènyèman', 'lòt jou a', 'nan maten', 'lannwit', 'byen ta', 'bonè'],
  },
  vaguePerson: {
    fr: ['ils', 'elles', 'on', 'quelqu\'un', 'des gens', 'une personne', 'ce type', 'cette fille'],
    en: ['they', 'someone', 'somebody', 'people', 'this guy', 'that girl', 'some person'],
    es: ['ellos', 'ellas', 'alguien', 'la gente', 'una persona', 'ese tipo', 'esa chica'],
    ht: ['yo', 'yon moun', 'moun yo', 'nèg sa a', 'fi sa a', 'kèk moun'],
  },
  // P3 — vague objects or actions, and approximations worth clarifying
  vagueThing: {
    fr: ['un truc', 'une chose', 'quelque chose', 'des trucs', 'un machin', 'des affaires', 'sans détailler', 'sans préciser', 'vaguement', 'reste vague', 'je ne sais pas trop'],
    en: ['something', 'stuff', 'a thing', 'without details', 'without detail', 'vaguely', 'stays vague'],
    es: ['algo', 'una cosa', 'cosas', 'sin detallar', 'sin precisar', 'vagamente'],
    ht: ['yon bagay', 'kèk bagay', 'san detay', 'san presize'],
  },
  approx: {
    fr: ['environ', 'à peu près', 'plus ou moins'], en: ['about', 'roughly', 'more or less'],
    es: ['aproximadamente', 'más o menos'], ht: ['anviwon', 'apeprè', 'apepre'],
  },
  // P1 — a time introduced by these markers is the usual reference, not the time of the event
  habitual: ['au lieu de', 'habituellement', "d'habitude", 'normalement', 'instead of', 'usually', 'normally', 'en lugar de', 'en vez de', 'normalmente', 'habitualmente', 'olye', 'dabitid', 'abityèlman'],
  // P5 — "at/in/to + noun" marks a place that can be checked
  place: /\b(au|aux|a la|dans (?:un|une|le|la|les)|chez|at the|in the|to the|en el|en la|al|nan|lakay)\s+[a-z]/,
  stop: {
    fr: 'le la les un une des de du et ou à au aux en dans sur pour par avec ce cet cette ces je tu il elle nous vous ils elles on me te se mon ma mes ton ta tes son sa ses que qui quoi ne pas plus est était été suis a ai avait avoir être y lui leur très bien aussi mais donc alors puis',
    en: 'the a an and or of to in on at for by with this that these those i you he she we they it me him her my your his our their is was were be been am are have had has do did not no very also but then so',
    es: 'el la los las un una unos unas de del y o a al en sobre para por con este esta estos estas ese esa yo tú tu él ella nosotros ellos ellas me te se mi mis su sus que quien no más es era fue ser estar está estaba muy también pero entonces',
    ht: 'la a yo li m mwen ou nou yon de ak oswa nan sou pou pa avèk sa sila ki ke te ap se e men epi lè kounye konsa tou ankò gen te',
  },
};
const DAYS = {
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  en: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  ht: ['lendi', 'madi', 'mèkredi', 'jedi', 'vandredi', 'samdi', 'dimanch'],
};

function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
function hasTerm(text, term) {
  const t = norm(text), w = norm(term);
  return new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t);
}
function findTerms(text, list) {
  const found = (list || []).filter((w) => hasTerm(text, w));
  // keep the longest expression only (« plus tard » makes « tard » redundant)
  return found.filter((w) => !found.some((o) => o !== w && hasTerm(o, w)));
}

/** Détection simple de langue (mots fréquents) — toujours confirmée par l'utilisateur. */
function detectLang(text) {
  const words = norm(text).split(/[^a-z']+/).filter(Boolean);
  if (words.length < 3) return null;
  let best = null, bestScore = 0;
  for (const l of ANSWER_LANGS) {
    const set = new Set(norm(LEX.stop[l]).split(' '));
    const score = words.filter((w) => set.has(w)).length / words.length;
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return bestScore >= 0.12 ? best : null;
}

/** Repères factuels extraits d'une phrase : heures, dates, jours, nombres. */
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOUR_TXT = '\\d{1,2}\\s*(?:h|:|heures?|hours?|horas?|e)?\\s*(?:\\d{2})?(?:\\s*(?:am|pm))?';
function facts(text, l, raw) {
  const out = { times: [], dates: [], days: [], numbers: [] };
  let t = norm(text);
  if (!raw) for (const m of LEX.habitual.map(norm)) {
    t = t.replace(new RegExp(reEsc(m) + '\\s*(?:a|vers|at|a las|nan)?\\s*' + HOUR_TXT, 'g'), ' ');
    t = t.replace(new RegExp(HOUR_TXT + '\\s*' + reEsc(m), 'g'), ' ');
  }
  // Haitian Creole writes hours as « 9è » (norm() removes the accent → « 9e »); elsewhere « 9e » would be an ordinal
  const hour = l === 'ht' ? /\b(\d{1,2})\s*(?:h|:|heures?|hours?|horas?|e)\s*(\d{2})?\b/g : /\b(\d{1,2})\s*(?:h|:|heures?|hours?|horas?)\s*(\d{2})?\b/g;
  for (const m of t.matchAll(hour)) out.times.push(m[1].padStart(2, '0') + ':' + (m[2] || '00'));
  for (const m of t.matchAll(/\b(\d{1,2})\s*(am|pm)\b/g)) { let h = +m[1] % 12; if (m[2] === 'pm') h += 12; out.times.push(String(h).padStart(2, '0') + ':00'); }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g)) out.dates.push(m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0'));
  for (const l of ANSWER_LANGS) for (const d of DAYS[l]) if (hasTerm(text, d)) out.days.push(DAYS.fr[DAYS[l].indexOf(d)]);
  for (const m of t.matchAll(/\b(\d+)\b/g)) out.numbers.push(m[1]);
  return out;
}
const DAY_WORDS = new Set(Object.values(DAYS).flat().map(norm));
// approximation / time words never show that two claims describe the same action (« vers 18 h » / « vers 20 h »)
['vers', 'environ', 'pres', 'heure', 'heures', 'soir', 'matin', 'nuit', 'around', 'about', 'hour', 'hours', 'evening', 'morning', 'night',
 'hacia', 'hora', 'horas', 'noche', 'tarde', 'manana', 'anviwon', 'apepre', 'lannwit', 'aswe', 'maten'].forEach((w) => DAY_WORDS.add(w));
function contentWords(text, l, exclude) {
  const stop = new Set(norm(LEX.stop[l] || LEX.stop.fr).split(' '));
  return new Set(norm(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !/^\d+$/.test(w) && !stop.has(w) && !DAY_WORDS.has(w) && !(exclude && exclude.has(w))));
}
/** Names of the people in the case (« Personnes concernées ») never show that two claims share a topic. */
function personWords(d) {
  return new Set(norm(d.persons || '').split(/[^a-z]+/).filter((w) => w.length > 2));
}
function splitSentences(text) {
  // the "[? … ?]" markers contain "?" + space: hide them while splitting so they never end a sentence
  return String(text || '').replace(/\[\?([\s\S]*?)\?\]/g, (m, inner) => '⁅' + inner.replace(/[.!?]/g, '·') + '⁆')
    .split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim().replace(/⁅/g, '[?').replace(/⁆/g, '?]')).filter((s) => s.length > 2);
}
/** Quote without its final punctuation, so « … » never ends with « . ». */
const bare = (s) => String(s || '').replace(/[\s.!?…:;,]+$/, '');
function hasUncertain(text) { return /\[\?[\s\S]*?\?\]/.test(text || ''); }

/** Rassemble toutes les sources actives : éléments initiaux, réponses validées, pièces. */
function recitSources(d) {
  const src = [];
  if ((d.desc || '').trim()) src.push({ ref: 'desc', label: R('refDescription'), text: d.desc, nature: 'interp', lang: d.analysisLang || lang, kind: 'initial' });
  (d.items || []).forEach((it, i) => src.push({ ref: it.id, label: R('refInitial') + ' ' + (i + 1), text: it.text, nature: it.nature, lang: d.analysisLang || lang, kind: 'initial' }));
  (d.answers || []).filter((a) => a.active !== false).forEach((a, i) => {
    const q = (d.questions || []).find((x) => x.id === a.qid);
    src.push({ ref: a.id, label: R('refAnswer') + ' ' + (i + 1), text: a.validated, lang: a.lang, kind: 'answer', question: q ? q.text : '' });
  });
  (d.pieces || []).filter((p) => p.active !== false).forEach((p, i) => src.push({ ref: p.id, label: R('refPiece') + ' ' + (i + 1) + ' — ' + p.title, text: p.content || p.description || '', nature: 'doc', lang: d.analysisLang || lang, kind: 'piece', date: p.date, independent: p.independent }));
  return src;
}

/** Étapes 1 à 4 : propose affirmations, ambiguïtés, écarts — en conservant les choix déjà faits. */
function recitAnalyse(d) {
  const sources = recitSources(d);
  const keepClaims = new Map((d.claims || []).map((c) => [c.key, c]));
  const keepAmb = new Map((d.ambiguities || []).map((a) => [a.key, a]));
  const keepGaps = new Map((d.gaps || []).map((g) => [g.key, g]));
  const claims = [], amb = [], gaps = [];
  for (const s of sources) {
    splitSentences(s.text).forEach((sentence, i) => {
      const key = s.ref + '#' + i;
      const l = s.lang || lang;
      const hedges = findTerms(sentence, LEX.hedge[l]), hearsay = findTerms(sentence, LEX.hearsay[l]);
      const prev = keepClaims.get(key);
      const auto = hearsay.length ? 'report' : (s.kind === 'piece' ? 'doc' : (s.nature || 'obs'));
      const fx = facts(sentence, l);
      const checkable = auto !== 'interp' && auto !== 'suspicion' && (fx.times.length + fx.dates.length + fx.days.length > 0 || LEX.place.test(norm(sentence)));
      const c = Object.assign({
        key, id: 'A' + (claims.length + 1), ref: s.ref, label: s.label, text: sentence, lang: l,
        nature: auto, central: false, described: false, verifiable: checkable, status: 'unverified',
        verifySource: '', verifyNote: '', uncertain: hasUncertain(sentence),
      }, prev || {}, { id: 'A' + (claims.length + 1), text: sentence, label: s.label, hedges, hearsay, facts: fx, uncertain: hasUncertain(sentence) });
      claims.push(c);
      const mk = (kind, term, qKey) => {
        const k = key + '|' + kind + '|' + norm(term);
        const p = keepAmb.get(k);
        amb.push(Object.assign({ key: k, claim: c.id, ref: s.ref, label: s.label, kind, term, text: sentence, resolved: false, resolution: '' }, p || {}, { claim: c.id, question: RL(qKey, d.analysisLang || lang).replace('{x}', term) }));
      };
      findTerms(sentence, LEX.vagueTime[l]).forEach((term) => mk('time', term, 'qVagueTime'));
      findTerms(sentence, LEX.vaguePerson[l]).forEach((term) => mk('person', term, 'qVaguePerson'));
      findTerms(sentence, LEX.vagueThing[l]).forEach((term) => mk('thing', term, 'qVagueThing'));
      findTerms(sentence, LEX.approx[l]).forEach((term) => mk('approx', term, 'qApprox'));
      if (hearsay.length) mk('source', hearsay[0], 'qHearsay');
      if (c.uncertain) mk('uncertain', '[? ?]', 'qUncertain');
    });
  }
  // Écarts (P1). Two claims are compared only when they describe the same action of the same event:
  // - names of the people and day words never count as a shared topic, nor words found in most claims;
  // - different days → two distinct events → no discrepancy;
  // - different times → discrepancy only for the same action: same day + ≥1 shared action word,
  //   or ≥2 shared action words when a day is missing on one side.
  const exclude = personWords(d);
  const wordsOf = claims.map((c) => contentWords(c.text, c.lang, exclude));
  if (claims.length >= 4) {
    const df = new Map();
    wordsOf.forEach((ws) => ws.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
    df.forEach((n, w) => { if (n / claims.length > 0.5) exclude.add(w); });
  }
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i], b = claims[j];
      if (a.ref === b.ref || a.uncertain || b.uncertain) continue;
      const wb = new Set([...wordsOf[j]].filter((w) => !exclude.has(w)));
      const shared = [...wordsOf[i]].filter((w) => !exclude.has(w) && wb.has(w));
      const dayA = a.facts.days, dayB = b.facts.days;
      if (dayA.length && dayB.length && !dayA.some((x) => dayB.includes(x))) continue; // two different days: two events
      const sameDay = dayA.length > 0 && dayB.length > 0, noDay = !dayA.length && !dayB.length;
      if (!(shared.length >= 2 || ((sameDay || noDay) && shared.length >= 1))) continue; // not the same action
      const diff = [];
      for (const f of ['times', 'dates']) {
        if (a.facts[f].length && b.facts[f].length && !a.facts[f].some((x) => b.facts[f].includes(x))) diff.push([f, a.facts[f].join(', '), b.facts[f].join(', ')]);
      }
      if (!diff.length) continue;
      const key = a.key + '~' + b.key;
      const p = keepGaps.get(key);
      gaps.push(Object.assign({ key, a: a.id, b: b.id, aText: a.text, bText: b.text, aLabel: a.label, bLabel: b.label, kind: 'central', explanation: '', state: 'open', evidence: false },
        p || {}, { a: a.id, b: b.id, aText: a.text, bText: b.text, aLabel: a.label, bLabel: b.label, what: diff.map((x) => R('f_' + x[0]) + ' : ' + x[1] + ' / ' + x[2]).join(' ; '), shared: shared.slice(0, 4).join(', ') }));
    }
  }
  // Écarts ajoutés manuellement par l'utilisateur
  (d.gaps || []).filter((g) => g.manual).forEach((g) => gaps.push(g));
  d.claims = claims; d.ambiguities = amb; d.gaps = gaps.map((g, i) => Object.assign(g, { id: 'E' + (i + 1) }));
  d.lastAnalysis = { at: new Date().toISOString(), version: d.version || 0, answers: (d.answers || []).filter((a) => a.active !== false).length };
  d.analyses = (d.analyses || []).concat([{ at: d.lastAnalysis.at, version: d.lastAnalysis.version, indicators: recitIndicators(d) }]).slice(-30);
  return d;
}

/** Étape 9 : cinq indicateurs de documentation (jamais un score de mensonge). */
function recitIndicators(d) {
  const claims = d.claims || [], amb = d.ambiguities || [], gaps = d.gaps || [];
  const central = claims.filter((c) => c.central);
  const verifiable = claims.filter((c) => c.verifiable);
  const checked = verifiable.filter((c) => c.status !== 'unverified');
  const ind = [
    { key: 'ind1', num: central.filter((c) => c.described).length, den: central.length, empty: 'noCentral' },
    { key: 'ind2', num: amb.filter((a) => a.resolved).length, den: amb.length, empty: 'noAmbiguity' },
    { key: 'ind3', num: checked.length, den: verifiable.length, empty: 'noVerifiable',
      detail: ['corroborated', 'partial', 'contradicted', 'unverifiable'].map((s) => [s, checked.filter((c) => c.status === s).length]) },
    { key: 'ind4', num: gaps.filter((g) => g.state === 'resolved' && g.evidence).length, den: gaps.length, empty: 'noGap',
      detail: [['explainedOnly', gaps.filter((g) => g.state !== 'open' && !g.evidence).length]] },
    { key: 'ind5', num: central.filter((c) => c.status === 'corroborated' || c.status === 'contradicted').length, den: central.length, empty: 'noCentral' },
  ];
  ind.forEach((x) => { x.pct = x.den ? Math.round((100 * x.num) / x.den) : null; });
  return ind;
}

/** Étape 8 : au maximum trois questions neutres, par priorité. */
function recitSuggest(d) {
  const L = d.analysisLang || lang, out = [], seen = new Set((d.questions || []).map((q) => norm(q.text)));
  const push = (q) => { if (out.length < 3 && !seen.has(norm(q.text))) { seen.add(norm(q.text)); out.push(q); } };
  (d.gaps || []).filter((g) => g.state !== 'resolved' && g.kind === 'central').forEach((g) => push({
    text: RL('qGap', L).replace('{a}', bare(g.aText)).replace('{b}', bare(g.bText)), point: g.id + ' — ' + (g.what || ''), why: RL('whyGap', L), target: RL('targetGap', L) }));
  (d.claims || []).filter((c) => c.central && c.verifiable && c.status === 'unverified').forEach((c) => push({
    text: RL('qVerify', L).replace('{x}', bare(c.text)), point: c.id, why: RL('whyVerify', L), target: RL('targetVerify', L) }));
  (d.ambiguities || []).filter((a) => !a.resolved).forEach((a) => push({ text: a.question, point: a.claim + ' — « ' + a.term + ' »', why: RL('whyAmb', L), target: RL('targetAmb', L) }));
  if (!(d.answers || []).length) push({ text: RL('firstQuestion', L), point: '—', why: RL('whyFree', L), target: RL('targetFree', L) });
  return out;
}

/** Hypothèses alternatives à examiner pour les écarts non résolus (jamais un verdict). */
function recitHypotheses(d) {
  const open = (d.gaps || []).filter((g) => g.state !== 'resolved');
  if (!open.length) return [];
  return ['hMemory', 'hMisunderstanding', 'hIncomplete', 'hDocError', 'hTranscription', 'hIncompatible', 'hConcealment'].map((k) => R(k));
}

/* ---------- rendu ---------- */
function recitPage() {
  if (recitView.mode === 'list') return recitList();
  if (recitView.mode === 'edit') return recitEdit();
  return recitWork();
}
function recitList() {
  const db = recitLoad();
  app.innerHTML = `<div class="eyebrow">${R('eyebrow')}</div><h1>${R('title')}</h1><p>${R('intro')}</p>
  <div class="note">${R('noScore')}</div>
  <div class="actions">${btn(R('newDossier'), "recitNew()", true)}</div>
  <h2>${R('myDossiers')}</h2>
  ${db.dossiers.length ? `<div class="grid">${db.dossiers.map((d) => `<article class="card"><h3>${esc(d.title || R('untitled'))}</h3>
    <p><small>${R('version')} ${d.version || 0} · ${recitDate(d.updated || d.created)}</small></p>
    <p><small>${(d.answers || []).filter((a) => a.active !== false).length} ${R('answersCount')}</small></p>
    <div class="actions">${btn(R('open'), `recitOpen('${d.id}')`, true)}${btn(R('delete'), `recitDelete('${d.id}')`)}</div></article>`).join('')}</div>` : `<p>${R('noDossier')}</p>`}
  <p><small>${R('privacy')}</small></p>`;
}
function recitNew() {
  const db = recitLoad();
  const d = { id: recitUid('d'), title: '', desc: '', event: '', period: '', persons: '', sources: '', doubts: '', analysisLang: lang,
    items: [], questions: [], answers: [], pieces: [], claims: [], ambiguities: [], gaps: [], version: 0, created: new Date().toISOString() };
  db.dossiers.unshift(d); recitSave(db);
  recitView = { mode: 'edit', id: d.id, tab: 'interview' }; recitPage();
}
function recitOpen(id) { recitView = { mode: 'work', id, tab: 'interview' }; recitPage(); window.scrollTo(0, 0); }
function recitBack() { recitStopRec(); recitView = { mode: 'list', id: null, tab: 'interview' }; recitPage(); }
function recitDelete(id) {
  if (!confirm(R('confirmDelete'))) return;
  const db = recitLoad(), d = recitGet(db, id);
  (d && d.answers || []).forEach((a) => { if (a.audio) recitAudioDel(a.id).catch(() => {}); });
  db.dossiers = db.dossiers.filter((x) => x.id !== id); recitSave(db); recitPage();
}
function natureSelect(id, v) { return `<select id="${id}">${NATURES.map((n) => `<option value="${n}" ${n === v ? 'selected' : ''}>${R('n_' + n)}</option>`).join('')}</select>`; }
function langSelect(id, v, auto) {
  return `<select id="${id}">${auto ? `<option value="auto">${R('autoDetect')}</option>` : ''}${ANSWER_LANGS.map((l) => `<option value="${l}" ${l === v ? 'selected' : ''}>${R('lang_' + l)}</option>`).join('')}</select>`;
}
function recitEdit() {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  if (!d) return recitBack();
  const f = (id, key, val, input) => `<label for="${id}">${R(key)}</label>` + (input ? `<input id="${id}" value="${esc(val)}" maxlength="200">` : `<textarea id="${id}" maxlength="3000">${esc(val)}</textarea>`);
  app.innerHTML = `<div class="eyebrow">${R('eyebrow')}</div><h1>${R('createTitle')}</h1>
  <form id="recitForm" class="card">
    ${f('rTitle', 'fTitle', d.title, true)}${f('rDesc', 'fDesc', d.desc)}${f('rEvent', 'fEvent', d.event)}${f('rPeriod', 'fPeriod', d.period, true)}
    ${f('rPersons', 'fPersons', d.persons)}${f('rSources', 'fSources', d.sources)}${f('rDoubts', 'fDoubts', d.doubts)}
    <label for="rLang">${R('fAnalysisLang')}</label>${langSelect('rLang', d.analysisLang || lang)}
    <h3 style="margin-top:22px">${R('knownFacts')}</h3><p><small>${R('knownFactsHint')}</small></p>
    <div id="rItems">${(d.items || []).map((it, i) => recitItemRow(i, it)).join('')}</div>
    <div class="actions">${btn(R('addFact'), 'recitAddItem()')}</div>
    <div class="note">${R('notTruth')}</div>
    <div class="actions"><button class="primary" type="submit">${R('startInterview')}</button>${btn(R('back'), 'recitBack()')}</div>
  </form>`;
  document.querySelector('#recitForm').onsubmit = (e) => { e.preventDefault(); recitSaveEdit(true); };
}
function recitItemRow(i, it) {
  return `<div class="recit-item"><textarea id="rItem${i}" maxlength="1500" placeholder="${esc(R('factPlaceholder'))}">${esc(it.text)}</textarea>${natureSelect('rItemN' + i, it.nature)}</div>`;
}
function recitCollectEdit(d) {
  const v = (id) => (document.querySelector('#' + id) || {}).value || '';
  Object.assign(d, { title: v('rTitle').trim(), desc: v('rDesc'), event: v('rEvent'), period: v('rPeriod'), persons: v('rPersons'), sources: v('rSources'), doubts: v('rDoubts'), analysisLang: v('rLang') || lang });
  const items = [];
  for (let i = 0; document.querySelector('#rItem' + i); i++) {
    const text = v('rItem' + i).trim();
    if (text) items.push({ id: (d.items[i] && d.items[i].id) || recitUid('i'), text, nature: v('rItemN' + i) || 'obs' });
  }
  d.items = items;
}
function recitAddItem() {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  recitCollectEdit(d); d.items.push({ id: recitUid('i'), text: '', nature: 'obs' });
  recitSave(db); recitEdit();
}
function recitSaveEdit(start) {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  recitCollectEdit(d); if (!d.title) d.title = R('untitled');
  if (start && !(d.questions || []).length) d.questions = [{ id: recitUid('q'), text: RL('firstQuestion', d.analysisLang || lang), created: new Date().toISOString() }];
  recitBump(d); recitSave(db);
  recitView = { mode: 'work', id: d.id, tab: 'interview' }; recitPage(); window.scrollTo(0, 0);
}

function recitTabs(d) {
  const since = (d.answers || []).filter((a) => a.active !== false && (!d.lastAnalysis || a.created > d.lastAnalysis.at)).length;
  return `<div class="recit-head"><div><div class="eyebrow">${R('eyebrow')}</div><h1>${esc(d.title)}</h1>
    <p><small>${R('version')} ${d.version || 0} · ${R('analysisLangShort')} : ${R('lang_' + (d.analysisLang || lang))}${d.lastAnalysis ? ' · ' + R('lastAnalysis') + ' ' + recitDate(d.lastAnalysis.at) : ''}</small></p>
    ${since ? `<p class="recit-badge">${since} ${R('sinceAnalysis')}</p>` : ''}</div>
    <div class="actions">${btn(R('editDossier'), `recitView.mode='edit';recitPage()`)}${btn(R('back'), 'recitBack()')}</div></div>
  <nav class="recit-tabs">${['interview', 'pieces', 'analysis', 'conclusion'].map((tb) => `<button class="${recitView.tab === tb ? 'active' : ''}" onclick="recitTab('${tb}')">${R('tab_' + tb)}</button>`).join('')}</nav>`;
}
function recitTab(tb) { recitStopRec(); recitView.tab = tb; if (tb === 'analysis' || tb === 'conclusion') { const db = recitLoad(); const d = recitGet(db, recitView.id); recitAnalyse(d); recitSave(db); } recitWork(); }
function recitWork() {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  if (!d) return recitBack();
  let body = '';
  if (recitView.tab === 'interview') body = recitInterview(d);
  else if (recitView.tab === 'pieces') body = recitPieces(d);
  else if (recitView.tab === 'analysis') body = recitAnalysisView(d);
  else body = recitConclusionView(d);
  app.innerHTML = recitTabs(d) + body;
  if (recitView.tab === 'interview') recitBindInterview(d);
  if (recitView.tab === 'analysis') recitAiRenderProgress();
}

/* ---------- entretien ---------- */
function recitInterview(d) {
  const qs = d.questions || [], cur = qs[qs.length - 1];
  const hist = qs.map((q, qi) => {
    const ans = (d.answers || []).filter((a) => a.qid === q.id);
    return `<article class="card recit-qa"><h3>${R('question')} ${qi + 1}</h3>${quote(q.text)}
      ${ans.map((a) => recitAnswerCard(d, a)).join('') || `<p><small>${R('noAnswerYet')}</small></p>`}</article>`;
  }).join('');
  return `<section><h2>${R('history')}</h2>${hist || `<p>${R('noQuestion')}</p>`}</section>
  <section class="card recit-ask"><h2>${R('askTitle')}</h2>
    <label for="qText">${R('currentQuestion')}</label><textarea id="qText" maxlength="800">${esc(cur ? cur.text : RL('firstQuestion', d.analysisLang || lang))}</textarea>
    <div class="actions">${btn(R('addQuestion'), 'recitAddQuestion()')}</div>
    <label for="aLang">${R('answerLang')}</label>${langSelect('aLang', 'auto', true)} <small id="aDetect"></small>
    <label for="aText">${R('answerText')}</label><textarea id="aText" maxlength="8000" placeholder="${esc(R('answerPlaceholder'))}"></textarea>
    <p><small>${R('uncertainHint')}</small></p>
    <div class="actions">${btn(R('markUncertain'), 'recitMarkUncertain()')}</div>
    <div class="recit-audio">
      <label class="recit-consent"><input type="checkbox" id="aConsent"> ${R('consent')}</label>
      <label class="recit-consent"><input type="checkbox" id="aKeep"> ${R('keepAudio')}</label>
      <p><small>${R('speechNotice')}</small></p>
      <div class="actions">${btn('🎙 ' + R('recStart'), 'recitRecStart()')}${btn(R('recPause'), 'recitRecPause()')}${btn(R('recResume'), 'recitRecResume()')}${btn(R('recStop'), 'recitStopRec(true)')}</div>
      <p id="aRecState" role="status" class="recit-rec"></p><audio id="aPlayer" controls hidden></audio>
    </div>
    <label for="aTrans">${R('translationField')}</label><textarea id="aTrans" maxlength="8000" placeholder="${esc(R('translationHint'))}"></textarea>
    <div class="actions"><button class="primary" onclick="recitAddAnswer()">${R('addAnswer')}</button>${btn(R('analyse'), "recitTab('analysis')")}${btn(R('conclusion'), "recitTab('conclusion')")}${btn(R('addPiece'), "recitTab('pieces')")}</div>
    <p id="aStatus" role="status"></p>
  </section>`;
}
function recitAnswerCard(d, a) {
  const off = a.active === false;
  return `<div class="recit-answer ${off ? 'off' : ''}"><p><strong>${R('answer')}</strong> · ${R('lang_' + a.lang)} · ${recitDate(a.created)}${(a.versions || []).length ? ' · ' + R('version') + ' ' + (a.versions.length + 1) : ''}${off ? ' · <em>' + R('removed') + '</em>' : ''}</p>
    <p>${esc(a.validated).replace(/\[\?([\s\S]*?)\?\]/g, `<mark title="${esc(R('toConfirm'))}">$1</mark>`)}</p>
    ${a.original && a.original !== a.validated ? `<details><summary>${R('originalTranscript')}</summary><p>${esc(a.original)}</p></details>` : ''}
    ${a.translation ? `<details><summary>${R('translation')}</summary><p>${esc(a.translation)}</p></details>` : ''}
    ${(a.versions || []).length ? `<details><summary>${R('previousVersions')}</summary>${a.versions.map((v) => `<p><small>${recitDate(v.at)}</small><br>${esc(v.validated)}</p>`).join('')}</details>` : ''}
    ${a.audio ? `<button onclick="recitPlay('${a.id}')">▶ ${R('listen')}</button>` : ''}
    ${off ? '' : `<div class="actions">${btn(R('edit'), `recitEditAnswer('${a.id}')`)}${btn(R('remove'), `recitRemoveAnswer('${a.id}')`)}</div>`}</div>`;
}
function recitBindInterview(d) {
  const ta = document.querySelector('#aText'), info = document.querySelector('#aDetect');
  if (ta && info) ta.oninput = () => { const l = detectLang(ta.value); info.textContent = l ? R('detected') + ' ' + R('lang_' + l) + ' — ' + R('confirmLang') : ''; };
}
function recitAddQuestion() {
  const db = recitLoad(), d = recitGet(db, recitView.id), text = (document.querySelector('#qText').value || '').trim();
  if (!text) return;
  d.questions.push({ id: recitUid('q'), text, created: new Date().toISOString() });
  recitBump(d); recitSave(db); recitWork();
}
function recitMarkUncertain() {
  const ta = document.querySelector('#aText'); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  if (s === e) { ta.setRangeText('[? ' + R('inaudible') + ' ?]', s, e, 'end'); } else { ta.setRangeText('[?' + ta.value.slice(s, e) + '?]', s, e, 'end'); }
  ta.focus();
}
async function recitAddAnswer() {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  const text = (document.querySelector('#aText').value || '').trim(), status = document.querySelector('#aStatus');
  if (!text) { status.textContent = R('emptyAnswer'); return; }
  const consent = document.querySelector('#aConsent');
  if (consent && !consent.checked) {
    status.textContent = R('consentNeeded');
    const box = consent.closest('label'); if (box) box.classList.add('recit-need');
    consent.focus(); return;
  }
  let q = d.questions[d.questions.length - 1];
  const qText = (document.querySelector('#qText').value || '').trim();
  if (!q || (qText && norm(qText) !== norm(q.text))) { q = { id: recitUid('q'), text: qText || RL('firstQuestion', d.analysisLang || lang), created: new Date().toISOString() }; d.questions.push(q); }
  let l = document.querySelector('#aLang').value;
  if (l === 'auto') l = detectLang(text) || lang;
  const a = { id: recitUid('r'), qid: q.id, lang: l, original: (recitRec && recitRec.transcript) || text, validated: text,
    translation: (document.querySelector('#aTrans').value || '').trim(), uncertain: [...text.matchAll(/\[\?([\s\S]*?)\?\]/g)].map((m) => m[1].trim()),
    created: new Date().toISOString(), active: true, versions: [], audio: false };
  if (recitRec && recitRec.blob && document.querySelector('#aKeep').checked) { try { await recitAudioPut(a.id, recitRec.blob); a.audio = true; } catch { /* stockage refusé : on garde la transcription */ } }
  recitRec = null;
  d.answers.push(a); recitBump(d); recitSave(db);
  recitWork(); const st = document.querySelector('#aStatus'); if (st) st.textContent = R('answerAdded');
}
function recitEditAnswer(id) {
  const db = recitLoad(), d = recitGet(db, recitView.id), a = d.answers.find((x) => x.id === id);
  const next = prompt(R('editPrompt'), a.validated);
  if (next == null || !next.trim() || next.trim() === a.validated) return;
  a.versions = (a.versions || []).concat([{ validated: a.validated, at: a.updated || a.created }]);
  a.validated = next.trim(); a.updated = new Date().toISOString();
  recitBump(d); recitSave(db); recitWork();
}
function recitRemoveAnswer(id) {
  if (!confirm(R('confirmRemove'))) return;
  const db = recitLoad(), d = recitGet(db, recitView.id), a = d.answers.find((x) => x.id === id);
  a.active = false; a.removed = new Date().toISOString();
  if (a.audio) { recitAudioDel(a.id).catch(() => {}); a.audio = false; }
  (d.analyses || []).forEach((x) => { x.obsolete = true; });
  recitBump(d); recitSave(db); recitWork();
}
async function recitPlay(id) {
  try { const blob = await recitAudioGet(id); if (!blob) return; const url = URL.createObjectURL(blob); const au = new Audio(url); au.onended = () => URL.revokeObjectURL(url); au.play(); } catch { alert(R('audioMissing')); }
}

/* ---------- audio : MediaRecorder (réécoute locale) + reconnaissance vocale du navigateur ---------- */
async function recitRecStart() {
  const st = document.querySelector('#aRecState');
  if (!document.querySelector('#aConsent').checked) { st.textContent = R('needConsent'); return; }
  recitStopRec();
  let l = document.querySelector('#aLang').value; if (l === 'auto') l = lang;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = SR && l !== 'ht';
  recitRec = { chunks: [], transcript: '', lang: l, paused: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recitRec.stream = stream;
    const mr = new MediaRecorder(stream); recitRec.mr = mr;
    mr.ondataavailable = (e) => { if (e.data.size) recitRec && recitRec.chunks.push(e.data); };
    mr.onstop = () => { if (!recitRec) return; recitRec.blob = new Blob(recitRec.chunks, { type: mr.mimeType || 'audio/webm' }); const p = document.querySelector('#aPlayer'); if (p) { p.src = URL.createObjectURL(recitRec.blob); p.hidden = false; } };
    mr.start();
  } catch { st.textContent = R('micDenied'); recitRec = null; return; }
  if (supported) {
    const rec = new SR(); recitRec.sr = rec;
    rec.lang = localeTags[l]; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev) => {
      let fin = '';
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { const txt = r[0].transcript.trim(); fin += (r[0].confidence && r[0].confidence < 0.6 ? '[?' + txt + '?]' : txt) + ' '; }
      }
      recitRec.transcript = fin.trim();
      const ta = document.querySelector('#aText'); if (ta) ta.value = recitRec.transcript;
    };
    rec.onend = () => { if (recitRec && recitRec.sr === rec && !recitRec.paused && !recitRec.stopped) { try { rec.start(); } catch { /* fin */ } } };
    try { rec.start(); } catch { /* déjà actif */ }
    st.textContent = '● ' + R('recording');
  } else {
    st.textContent = '● ' + R('recordingNoTranscript');
  }
}
function recitRecPause() { if (!recitRec) return; recitRec.paused = true; try { recitRec.mr && recitRec.mr.state === 'recording' && recitRec.mr.pause(); recitRec.sr && recitRec.sr.stop(); } catch { /* */ } const st = document.querySelector('#aRecState'); if (st) st.textContent = '❚❚ ' + R('paused'); }
function recitRecResume() { if (!recitRec) return; recitRec.paused = false; try { recitRec.mr && recitRec.mr.state === 'paused' && recitRec.mr.resume(); recitRec.sr && recitRec.sr.start(); } catch { /* */ } const st = document.querySelector('#aRecState'); if (st) st.textContent = '● ' + R('recording'); }
function recitStopRec(keep) {
  if (!recitRec) return;
  recitRec.stopped = true;
  try { recitRec.sr && recitRec.sr.stop(); } catch { /* */ }
  try { recitRec.mr && recitRec.mr.state !== 'inactive' && recitRec.mr.stop(); } catch { /* */ }
  try { recitRec.stream && recitRec.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  const st = document.querySelector('#aRecState'); if (st) st.textContent = keep ? R('recStopped') : '';
  if (!keep) recitRec = null;
}

/* ---------- pièces ---------- */
function recitPieces(d) {
  return `<section><h2>${R('piecesTitle')}</h2><p>${R('piecesIntro')}</p>
  ${(d.pieces || []).filter((p) => p.active !== false).map((p) => `<article class="card"><h3>${esc(p.title)}</h3><p><small>${R('n_doc')} · ${esc(p.date || '')} · ${p.independent ? R('independent') : R('notIndependent')}</small></p><p>${esc(p.description)}</p>${p.content ? `<details><summary>${R('pieceContent')}</summary><p>${esc(p.content)}</p></details>` : ''}<div class="actions">${btn(R('remove'), `recitRemovePiece('${p.id}')`)}</div></article>`).join('') || `<p>${R('noPiece')}</p>`}
  <form id="pieceForm" class="card"><h3>${R('addPiece')}</h3>
    <label for="pTitle">${R('pTitle')}</label><input id="pTitle" maxlength="200" required>
    <label for="pDate">${R('pDate')}</label><input id="pDate" maxlength="60" placeholder="${esc(R('pDateHint'))}">
    <label for="pDesc">${R('pDesc')}</label><textarea id="pDesc" maxlength="2000"></textarea>
    <label for="pContent">${R('pContent')}</label><textarea id="pContent" maxlength="6000" placeholder="${esc(R('pContentHint'))}"></textarea>
    <label class="recit-consent"><input type="checkbox" id="pIndep"> ${R('pIndependent')}</label>
    <p><small>${R('noIntrusion')}</small></p>
    <div class="actions"><button class="primary" type="submit">${R('addPiece')}</button></div></form></section>`;
}
document.addEventListener && document.addEventListener('submit', (e) => {
  if (!e.target || e.target.id !== 'pieceForm') return;
  e.preventDefault();
  const db = recitLoad(), d = recitGet(db, recitView.id), v = (id) => (document.querySelector('#' + id).value || '').trim();
  if (!v('pTitle')) return;
  d.pieces = d.pieces || [];
  d.pieces.push({ id: recitUid('p'), title: v('pTitle'), date: v('pDate'), description: v('pDesc'), content: v('pContent'), independent: document.querySelector('#pIndep').checked, created: new Date().toISOString(), active: true });
  recitBump(d); recitSave(db); recitWork();
});
function recitRemovePiece(id) {
  if (!confirm(R('confirmRemove'))) return;
  const db = recitLoad(), d = recitGet(db, recitView.id), p = d.pieces.find((x) => x.id === id);
  p.active = false; (d.analyses || []).forEach((x) => { x.obsolete = true; });
  recitBump(d); recitSave(db); recitWork();
}

/* ---------- vue analyse ---------- */
function recitSet(kind, id, field, value) {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  const list = kind === 'claim' ? d.claims : kind === 'amb' ? d.ambiguities : d.gaps;
  const it = list.find((x) => x.id === id || x.key === id); if (!it) return;
  it[field] = value; recitSave(db);
  const box = document.querySelector('#recitIndicators'); if (box) box.innerHTML = recitIndicatorsHtml(d);
}
function recitIndicatorsHtml(d) {
  const link = (k) => ` <a href="#" onclick="event.preventDefault();recitGoStep1()">${R(k)}</a>`;
  return `<p><small>${R('indNote')}</small></p>` + recitIndicators(d).map((x) => `<div class="recit-ind"><strong>${R(x.key)}</strong> : ${x.den ? `${x.pct} % — ${x.num} / ${x.den}` : R(x.empty) + (x.empty === 'noCentral' ? link('markCentralLink') : x.empty === 'noVerifiable' ? link('markVerifiableLink') : '')}
    ${x.detail ? `<br><small>${x.detail.map(([k, n]) => R('s_' + k) + ' : ' + n).join(' · ')}</small>` : ''}</div>`).join('');
}
function sel(kind, id, field, values, cur, prefix) {
  return `<select onchange="recitSet('${kind}','${id}','${field}',this.value)">${values.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${R(prefix + v)}</option>`).join('')}</select>`;
}
function chk(kind, id, field, cur, label) {
  return `<label class="recit-chk"><input type="checkbox" ${cur ? 'checked' : ''} onchange="recitSet('${kind}','${id}','${field}',this.checked)"> ${R(label)}</label>`;
}
function txt(kind, id, field, cur, ph) {
  return `<input class="recit-in" value="${esc(cur || '')}" placeholder="${esc(R(ph))}" onchange="recitSet('${kind}','${id}','${field}',this.value)">`;
}
function recitAnalysisView(d) {
  const sugg = recitSuggest(d), hyp = recitHypotheses(d);
  const pieces = (d.pieces || []).filter((p) => p.active !== false);
  const claimRow = (c) => `<tr class="${c.uncertain ? 'recit-unc' : ''}"><td>${c.id}<br><small>${esc(c.label)}</small></td><td>${esc(c.text)}${c.hedges.length ? `<br><small>${R('nuances')} : ${esc(c.hedges.join(', '))}</small>` : ''}${c.uncertain ? `<br><small>${R('toConfirm')}</small>` : ''}</td>
    <td>${sel('claim', c.id, 'nature', NATURES, c.nature, 'n_')}${chk('claim', c.id, 'central', c.central, 'central')}${chk('claim', c.id, 'described', c.described, 'described')}${chk('claim', c.id, 'verifiable', c.verifiable, 'verifiable')}</td>
    <td>${sel('claim', c.id, 'status', STATUSES, c.status, 's_')}<select onchange="recitSet('claim','${c.id}','verifySource',this.value)"><option value="">${R('chooseSource')}</option>${pieces.map((p) => `<option value="${p.id}" ${p.id === c.verifySource ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>${txt('claim', c.id, 'verifyNote', c.verifyNote, 'verifyNote')}</td></tr>`;
  return `<section class="card"><h2>${R('analysisTitle')}</h2><p>${R('analysisIntro')}</p>
    <div class="actions">${btn(R('reanalyse'), "recitTab('analysis')", true)}${btn(R('conclusion'), "recitTab('conclusion')")}${recitAiButton()}</div><div id="recitAi"></div></section>
  <section id="recitStep1"><h2>1 · ${R('step1')}</h2><p><small>${R('step1Help')}</small></p>
    ${d.claims.length ? `<div class="recit-table"><table><thead><tr><th>#</th><th>${R('claim')}</th><th>${R('qualify')}</th><th>${R('step3')}</th></tr></thead><tbody>${d.claims.map(claimRow).join('')}</tbody></table></div>` : `<p>${R('noData')}</p>`}</section>
  <section><h2>2 · ${R('step2')}</h2>${d.ambiguities.length ? d.ambiguities.map((a) => `<article class="card recit-amb"><p><strong>${a.claim}</strong> · ${R('amb_' + a.kind)} « ${esc(a.term)} »</p>${quote(a.text)}<p>${R('suggestedQ')} : <em>${esc(a.question)}</em></p>${chk('amb', a.key, 'resolved', a.resolved, 'resolved')}${txt('amb', a.key, 'resolution', a.resolution, 'resolutionPh')}</article>`).join('') : `<p>${R('noAmbiguity')}</p>`}</section>
  <section><h2>3 · ${R('step3')}</h2><p><small>${R('step3Help')}</small></p></section>
  <section><h2>4 · ${R('step4')}</h2>${d.gaps.length ? d.gaps.map((g) => `<article class="card"><p><strong>${g.id}</strong> · ${R('sameEvent')} · ${esc(g.what || '')}</p><p>${esc(g.aLabel)} : ${quote(g.aText)}${esc(g.bLabel)} : ${quote(g.bText)}</p>
      <p>${R('suggestedQ')} : <em>${esc(RL('qGap', d.analysisLang || lang).replace('{a}', bare(g.aText)).replace('{b}', bare(g.bText)))}</em></p>
      ${sel('gap', g.key, 'kind', GAP_KINDS, g.kind, 'g_')}${sel('gap', g.key, 'state', GAP_STATES, g.state, 'st_')}${chk('gap', g.key, 'evidence', g.evidence, 'evidence')}${txt('gap', g.key, 'explanation', g.explanation, 'explanationPh')}</article>`).join('') : `<p>${R('noGap')}</p>`}
    <p><small>${R('gapNote')}</small></p></section>
  <section><h2>5 · ${R('step5')}</h2>${hyp.length ? `<ul>${hyp.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><p><small>${R('hypNote')}</small></p>` : `<p>${R('noOpenGap')}</p>`}</section>
  <section><h2>6 · ${R('step6')}</h2>${recitLeads(d).map((l) => `<article class="card"><p><strong>${esc(l.point)}</strong></p><p>${R('leadWhy')} : ${esc(l.why)}</p><p>${R('leadHow')} : ${esc(l.how)}</p><p>${R('leadResult')} : ${esc(l.result)}</p></article>`).join('') || `<p>${R('noLead')}</p>`}
    <p><small>${R('noIntrusion')}</small></p></section>
  <section><h2>${R('suggestedTitle')}</h2>${sugg.length ? sugg.map((q, i) => `<article class="card"><p><strong>${esc(q.text)}</strong></p><p><small>${R('point')} : ${esc(q.point)} · ${R('why')} : ${esc(q.why)} · ${R('target')} : ${esc(q.target)}</small></p><div class="actions">${btn(R('useQuestion'), `recitUseQuestion(${i})`)}</div></article>`).join('') : `<p>${R('noSuggestion')}</p>`}</section>
  <section class="card"><h2>${R('indicatorsTitle')}</h2><div id="recitIndicators">${recitIndicatorsHtml(d)}</div></section>`;
}
function recitGoStep1() {
  if (recitView.tab !== 'analysis') recitTab('analysis');
  const s = document.querySelector('#recitStep1'); if (s) s.scrollIntoView({ behavior: 'smooth' });
}
function recitLeads(d) {
  const L = d.analysisLang || lang;
  const out = [];
  (d.gaps || []).filter((g) => g.state !== 'resolved').forEach((g) => out.push({ point: g.id + ' — ' + (g.what || ''), why: RL('leadGapWhy', L), how: RL('leadGapHow', L), result: RL('leadGapResult', L) }));
  (d.claims || []).filter((c) => c.central && c.verifiable && c.status === 'unverified').forEach((c) => out.push({ point: c.id + ' — ' + c.text, why: RL('leadClaimWhy', L), how: RL('leadClaimHow', L), result: RL('leadClaimResult', L) }));
  return out.slice(0, 8);
}
function recitUseQuestion(i) {
  const db = recitLoad(), d = recitGet(db, recitView.id), q = recitSuggest(d)[i];
  if (!q) return;
  d.questions.push({ id: recitUid('q'), text: q.text, created: new Date().toISOString(), suggested: true });
  recitBump(d); recitSave(db); recitView.tab = 'interview'; recitWork(); window.scrollTo(0, document.body.scrollHeight);
}

/* ---------- conclusion ---------- */
function recitConclusionData(d) {
  const L = d.analysisLang || lang, C = d.claims || [];
  const by = (s) => C.filter((c) => c.status === s);
  const src = (c) => { const p = (d.pieces || []).find((x) => x.id === c.verifySource); return p ? p.title : RL('noSourceCited', L); };
  const lines = [];
  C.filter((c) => c.central).forEach((c) => {
    if (c.status === 'corroborated') lines.push(RL('cSupports', L).replace('{x}', bare(c.text)).replace('{s}', src(c)));
    else if (c.status === 'contradicted') lines.push(RL('cContradicts', L).replace('{x}', bare(c.text)).replace('{s}', src(c)));
    else lines.push(RL('cCannot', L).replace('{x}', bare(c.text)));
  });
  (d.gaps || []).filter((g) => g.state !== 'resolved').forEach((g) => lines.push(RL('cGapOpen', L).replace('{g}', g.id + ' (' + (g.what || '') + ')')));
  const leads = recitLeads(d);
  if (leads.length) lines.push(RL('cNext', L).replace('{x}', leads[0].point));
  return { L, by, src, lines, leads };
}
function recitConclusionView(d) {
  const { by, src, lines, leads } = recitConclusionData(d);
  const ind = recitIndicators(d);
  const ans = (d.answers || []).filter((a) => a.active !== false);
  const list = (arr, f) => arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : `<p>${R('none')}</p>`;
  return `<section class="card recit-concl"><h2>${R('conclusionTitle')}</h2><p><small>${R('dossierVersion')} ${d.version || 0} · ${recitDate(new Date().toISOString())} · ${ans.length} ${R('answersCount')}</small></p>
  <h3>A · ${R('cA')}</h3><p>${esc(d.desc || '')}</p><p>${esc(d.event || '')}</p>${list(ans, (a) => esc(a.validated))}
  <h3>B · ${R('cB')}</h3>${list(by('corroborated').concat(by('partial')), (c) => `${esc(c.text)} — <small>${R('s_' + c.status)} · ${esc(src(c))}</small>`)}
  <h3>C · ${R('cC')}</h3>${list(by('contradicted'), (c) => `${esc(c.text)} — <small>${esc(src(c))}</small>`)}
  <h3>D · ${R('cD')}</h3>${list(by('unverified').concat(by('unverifiable')), (c) => esc(c.text))}
  <h3>E · ${R('cE')}</h3>${list(d.gaps || [], (g) => `${g.id} · ${esc(g.what || '')} — ${R('st_' + g.state)}${g.explanation ? ' · ' + esc(g.explanation) : ''}`)}
  <h3>F · ${R('cF')}</h3>${list(recitHypotheses(d), (h) => esc(h))}
  <h3>G · ${R('cG')}</h3>${recitIndicatorsHtml(d)}
  <h3>H · ${R('cH')}</h3>${list(lines, (x) => esc(x))}
  <h3>I · ${R('cI')}</h3>${list(leads, (l) => `${esc(l.point)} — ${esc(l.how)}`)}
  <h3>J · ${R('cJ')}</h3><p>${R('limits')}</p>
  <div class="note">${R('revisable')}</div>
  <div class="actions">${btn(R('exportText'), 'recitExport("txt")', true)}${btn(R('exportJson'), 'recitExport("json")')}${btn(R('printPdf'), 'window.print()')}</div></section>`;
}
function recitExport(kind) {
  const db = recitLoad(), d = recitGet(db, recitView.id);
  let blob, name = 'soutien-affectif-recit-' + (d.title || 'dossier').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  if (kind === 'json') blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  else { const tmp = document.createElement('div'); tmp.innerHTML = recitConclusionView(d); blob = new Blob([(tmp.innerText || tmp.textContent || '').replace(/\n{3,}/g, '\n\n')], { type: 'text/plain;charset=utf-8' }); }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name + '.' + kind; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Suggestion IA optionnelle (WebLLM, dans le navigateur, sur ordinateur compatible) ----------
   P6: one shared loading promise, progress kept across re-renders, button disabled while loading.
   P2: strict prompt + JSON output + temperature 0, computed discrepancies given to the model,
       and an anti-invention check on everything it returns. Nothing is added without the user. */
const RECIT_AI_MODELS = { big: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', small: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' };
let recitAi = null, recitAiLoading = null, recitAiModel = null, recitAiLast = '', recitAiQuestions = [];
let recitAiProgress = { pct: 0, text: '' };
const ROLE_WORDS = {
  fr: ['voisin', 'voisine', 'collègue', 'ami', 'amie', 'frère', 'sœur', 'soeur', 'mère', 'père', 'patron', 'patronne', 'cousin', 'cousine', 'mari', 'femme', 'copain', 'copine', 'chef', 'amant', 'maîtresse', 'ex'],
  en: ['neighbor', 'neighbour', 'colleague', 'friend', 'brother', 'sister', 'mother', 'father', 'boss', 'cousin', 'husband', 'wife', 'boyfriend', 'girlfriend', 'lover', 'ex'],
  es: ['vecino', 'vecina', 'colega', 'compañero', 'compañera', 'amigo', 'amiga', 'hermano', 'hermana', 'madre', 'padre', 'jefe', 'jefa', 'primo', 'prima', 'esposo', 'esposa', 'novio', 'novia', 'amante'],
  ht: ['vwazen', 'vwazin', 'kolèg', 'zanmi', 'frè', 'sè', 'manman', 'papa', 'patwon', 'kouzen', 'kouzin', 'mari', 'madanm', 'mennaj', 'chèf'],
};
const LEADING = /^\s*(pourquoi|why|por ?qu[eé]|poukisa)\b|\b(si tard|so late|tan tarde|ta konsa|pourquoi ne|why didn'?t|why don'?t)\b/i;

function recitAiPick() { return (navigator.deviceMemory || 4) >= 8 ? 'big' : 'small'; }
function recitAiButton() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return `<small>${R('aiUnavailable')}</small>`;
  const busy = recitAiLoading && !recitAi;
  return `<button ${busy ? 'disabled' : ''} onclick="recitAiRun()">✦ ${R('aiButton')}</button>`;
}
function recitAiRenderProgress() {
  const box = document.querySelector('#recitAi'); if (!box) return;
  if (recitAiLoading && !recitAi) box.innerHTML = `<p>${R('aiLoading')} <strong>${recitAiProgress.pct} %</strong><br><small>${esc(recitAiProgress.text)}</small></p>`;
  else box.innerHTML = recitAiLast;
}
function recitAiEngine() {
  recitAiLoading ??= (async () => {
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    const cb = { initProgressCallback: (p) => { recitAiProgress = { pct: Math.round((p.progress || 0) * 100), text: p.text || '' }; recitAiRenderProgress(); } };
    const pick = recitAiPick();
    try { recitAiModel = RECIT_AI_MODELS[pick]; return await webllm.CreateMLCEngine(recitAiModel, cb); } catch (e) {
      if (pick !== 'big') throw e;
      recitAiModel = RECIT_AI_MODELS.small; return await webllm.CreateMLCEngine(recitAiModel, cb);
    }
  })();
  return recitAiLoading;
}
async function recitAiRun() {
  if (recitAiLoading && !recitAi) return; // already loading: never start a second download
  if (!recitAi && !confirm(R('aiConfirm').replace('{size}', R(recitAiPick() === 'big' ? 'aiSizeBig' : 'aiSizeSmall')))) return;
  const db = recitLoad(), d = recitGet(db, recitView.id), L = d.analysisLang || lang;
  try {
    if (!recitAi) { const p = recitAiEngine(); recitWork(); recitAi = await p; }
    recitAiLast = `<p>${R('aiThinking')}</p>`; recitWork();
    recitAnalyse(d); recitSave(db);
    const material = [RL('aiTextLabel', L) + ':', ...recitSources(d).map((s) => `[${s.label}] ${s.text}`), '',
      RL('aiGapsLabel', L) + ':', ...(d.gaps.length ? d.gaps.map((g) => `- ${g.id}: « ${g.aText} » / « ${g.bText} » (${g.what})`) : ['- ' + RL('aiNoneLabel', L)]), '',
      RL('aiAmbLabel', L) + ':', ...(d.ambiguities.length ? d.ambiguities.map((a) => `- « ${a.term} » (${a.claim})`) : ['- ' + RL('aiNoneLabel', L)])].join('\n').slice(0, 7000);
    const res = await recitAi.chat.completions.create({
      messages: [{ role: 'system', content: RL('aiSystem', L) }, { role: 'user', content: material }],
      temperature: 0, max_tokens: 900, response_format: { type: 'json_object' } });
    recitAiShow(res.choices[0].message.content || '', d);
  } catch (e) {
    if (!recitAi) recitAiLoading = null; // a failed download can be retried
    recitAiLast = `<p>${R('aiError')}</p>`;
  }
  recitWork();
}
/** Words or numbers in an AI sentence that do not appear anywhere in the case (anti-invention, P2). */
function recitAiUnknown(text, d, L) {
  const srcText = recitSources(d).map((s) => s.text).join(' ') + ' ' + (d.persons || '');
  const nSrc = norm(srcText), out = [];
  for (const w of (ROLE_WORDS[L] || []).concat(ROLE_WORDS.fr)) if (hasTerm(text, w) && !hasTerm(srcText, w)) out.push(w);
  for (const m of String(text).matchAll(/(?:^|[^\p{L}])(\p{Lu}[\p{Ll}]{2,})/gu)) {
    const w = norm(m[1]);
    if (!nSrc.includes(w) && !norm(R('refDescription') + ' ' + R('refAnswer') + ' ' + R('refInitial') + ' ' + R('refPiece')).includes(w) && !norm(text).startsWith(w)) out.push(m[1]);
  }
  const f = facts(text, L, true), fs = facts(srcText, L, true);
  f.times.filter((x) => !fs.times.includes(x)).forEach((x) => out.push(x.replace(':', ' h ')));
  f.days.filter((x) => !fs.days.includes(x)).forEach((x) => out.push(x));
  return [...new Set(out)];
}
function recitAiShow(raw, d) {
  const L = d.analysisLang || lang;
  let obj = null;
  try { obj = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); try { obj = m && JSON.parse(m[0]); } catch { obj = null; } }
  const keys = ['centrales', 'ambiguites', 'ecarts', 'questions'];
  if (!obj || typeof obj !== 'object' || !keys.some((k) => Array.isArray(obj[k]))) {
    recitAiLast = `<article class="card recit-ai"><p><strong>${R('aiBadJson')}</strong></p><details><summary>${R('aiRaw')}</summary><pre>${esc(raw)}</pre></details></article>`;
    return;
  }
  recitAiQuestions = [];
  const item = (txt, isQuestion) => {
    const t = String(typeof txt === 'object' ? (txt.texte || txt.text || txt.question || JSON.stringify(txt)) : txt);
    const unknown = recitAiUnknown(t, d, L), leading = isQuestion && LEADING.test(t);
    const warn = (unknown.length ? `<span class="recit-warn">⚠ ${R('aiAbsent')} : ${esc(unknown.join(', '))}</span>` : '') + (leading ? `<span class="recit-warn">⚠ ${R('aiLeading')}</span>` : '');
    const ok = !unknown.length && !leading;
    let use = '';
    if (isQuestion && ok) { recitAiQuestions.push(t); use = ` <button onclick="recitAiUse(${recitAiQuestions.length - 1})">${R('useQuestion')}</button>`; }
    return `<li>${ok ? esc(t) : `<del>${esc(t)}</del>`} ${warn}${use}</li>`;
  };
  const sect = (k, title, q) => `<h4>${R(title)}</h4>${Array.isArray(obj[k]) && obj[k].length ? `<ul>${obj[k].slice(0, q ? 3 : 12).map((x) => item(x, q)).join('')}</ul>` : `<p><small>${R('none')}</small></p>`}`;
  recitAiLast = `<article class="card recit-ai"><p><strong>${R('aiTitle')}</strong> <small>(${esc(recitAiModel || '')}) ${R('aiWarning')}</small></p>
    ${sect('centrales', 'aiCentral')}${sect('ambiguites', 'aiAmbiguities')}${sect('ecarts', 'aiGaps')}${sect('questions', 'aiQuestions', true)}</article>`;
}
function recitAiUse(i) {
  const q = recitAiQuestions[i]; if (!q) return;
  recitView.tab = 'interview'; recitWork();
  const ta = document.querySelector('#qText'); if (ta) { ta.value = q; ta.focus(); }
}
