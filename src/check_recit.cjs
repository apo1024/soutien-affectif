// Tests du module « Analyse progressive d'un récit » : node src/check_recit.cjs (après python build.py)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const saved = {}, els = {};
const el = (x) => els[x] ??= { innerHTML: '', value: '', checked: false, textContent: '', querySelectorAll: () => [], classList: { toggle() {} }, scrollIntoView() {}, click() {}, focus() {}, setRangeText() {} };
const ctx = {
  document: { documentElement: {}, querySelector: el, querySelectorAll: () => [], createElement: () => ({ click() {}, innerText: '', set innerHTML(v) { this.innerText = v.replace(/<[^>]+>/g, ' '); } }), body: { scrollHeight: 0 } },
  window: { scrollTo() {} }, navigator: {}, localStorage: { getItem: (k) => saved[k] || null, setItem: (k, v) => { saved[k] = v; }, removeItem: (k) => { delete saved[k]; } },
  console, confirm: () => true, alert() {}, prompt: () => null, setTimeout, clearInterval, setInterval, Blob, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const run = (s) => vm.runInContext(s, ctx);
const db = () => JSON.parse(saved['soutien-recit-v1']);

// 1) Détection : moments vagues, ouï-dire, nuances, heures contradictoires, passage incertain — dans les 4 langues
const samples = {
  fr: ['Il est rentré à 21h, je crois. Ils étaient au restaurant le soir.', "On m'a dit qu'il est rentré à 23h.", 'Il est parti [? vers chez ?] Marc.'],
  en: ['He came home at 9 pm, I think. They were at the restaurant in the evening.', 'Someone told me he came home at 11 pm.', 'He left [? to ?] Marc.'],
  es: ['Volvió a casa a las 21h, creo. Ellos estaban en el restaurante por la noche.', 'Me dijeron que volvió a casa a las 23h.', 'Se fue [? a ?] lo de Marc.'],
  ht: ['Li te rantre a 9è, mwen kwè. Yo te nan restoran an aswè.', 'Yo di m li te rantre a 11è.', 'Li te ale [? kote ?] Marc.'],
};
for (const [l, [a1, a2, a3]] of Object.entries(samples)) {
  run(`changeLanguage('${l}');navigate('recit');recitNew()`);
  const id = db().dossiers[0].id;
  run(`(() => { const d0 = recitLoad(); const d = recitGet(d0, '${id}'); d.title = 'Test ${l}'; d.analysisLang = '${l}';
    d.questions = [{ id: 'q1', text: 'Q1' }, { id: 'q2', text: 'Q2' }];
    d.answers = [
      { id: 'r1', qid: 'q1', lang: '${l}', original: ${JSON.stringify(a1)}, validated: ${JSON.stringify(a1)}, active: true, created: '2026-10-17T10:00:00Z', versions: [] },
      { id: 'r2', qid: 'q2', lang: '${l}', original: ${JSON.stringify(a2)}, validated: ${JSON.stringify(a2)}, active: true, created: '2026-10-17T10:05:00Z', versions: [] },
      { id: 'r3', qid: 'q2', lang: '${l}', original: ${JSON.stringify(a3)}, validated: ${JSON.stringify(a3)}, active: true, created: '2026-10-17T10:06:00Z', versions: [] }];
    recitAnalyse(d); recitSave(d0); })()`);
  const d = db().dossiers[0];
  const kinds = new Set(d.ambiguities.map((a) => a.kind));
  assert(kinds.has('time'), l + ': moment vague non détecté');
  assert(kinds.has('person'), l + ': pronom flou non détecté');
  assert(kinds.has('source'), l + ': ouï-dire non détecté');
  assert(kinds.has('uncertain'), l + ': passage incertain non signalé');
  assert(d.claims.some((c) => c.hedges.length), l + ': nuance non conservée');
  assert(d.claims.some((c) => c.nature === 'report'), l + ': information rapportée non qualifiée');
  assert(d.gaps.length >= 1 && /21:00|09:00/.test(d.gaps[0].what + ''), l + ': écart d\'heure non détecté ' + JSON.stringify(d.gaps.map((g) => g.what)));
  assert(!d.gaps.some((g) => /\[\?/.test(g.aText + g.bText)), l + ': passage incertain utilisé pour un écart');
  assert.equal(run(`detectLang(${JSON.stringify(a1 + ' ' + a2)})`), l, l + ': langue mal détectée');
  // 2) Indicateurs : jamais 100 % sur un dénominateur nul ; numérateur / dénominateur exposés
  const ind = run(`recitIndicators(recitGet(recitLoad(), '${id}'))`);
  assert.equal(ind.length, 5);
  assert(ind.every((x) => (x.den === 0 ? x.pct === null : x.pct === Math.round((100 * x.num) / x.den))), l + ': calcul des indicateurs');
  // 3) Questions suggérées : au plus 3, non vides
  const sugg = run(`recitSuggest(recitGet(recitLoad(), '${id}'))`);
  assert(sugg.length >= 1 && sugg.length <= 3, l + ': nombre de questions suggérées');
  assert(sugg.every((q) => q.text && q.why && q.target && !/undefined/.test(q.text)), l + ': question incomplète');
  // 4) Rendu de toutes les vues sans « undefined »
  for (const tab of ['interview', 'pieces', 'analysis', 'conclusion']) {
    run(`recitView = { mode: 'work', id: '${id}', tab: '${tab}' }; recitWork()`);
    assert(!el('#app').innerHTML.includes('undefined'), `${l} ${tab} contient undefined`);
  }
  run(`recitView = { mode: 'edit', id: '${id}', tab: 'interview' }; recitPage()`);
  assert(!el('#app').innerHTML.includes('undefined'), l + ' edit');
  run(`recitBack()`);
  assert(el('#app').innerHTML.includes('Test ' + l), l + ' liste');
  // 5) Conclusion : formulations prudentes, jamais de verdict
  run(`recitView = { mode: 'work', id: '${id}', tab: 'conclusion' }; recitWork()`);
  const html = el('#app').innerHTML.toLowerCase();
  assert(!/ment à|is lying|está mintiendo|ap bay manti \d|coupable|guilty|culpable|manipulat/.test(html.replace(/ne dit jamais[^.]*\.|never says[^.]*\.|nunca dice[^.]*\.|pa janm di[^.]*\./g, '')), l + ': verdict interdit dans la conclusion');
}

// 6) Versions et retrait : une correction garde l'ancienne version ; un retrait sort la réponse de l'analyse
run(`(() => { const d0 = recitLoad(); const d = d0.dossiers[0]; const a = d.answers[0];
  a.versions = [{ validated: a.validated, at: a.created }]; a.validated = 'corrigé'; d.answers[1].active = false; recitAnalyse(d); recitSave(d0); })()`);
const d = db().dossiers[0];
assert(d.answers[0].versions.length === 1, 'version précédente perdue');
assert(!d.claims.some((c) => c.ref === 'r2'), 'réponse retirée encore analysée');

// 7) Échappement HTML : une réponse contenant du HTML ne s'injecte pas
run(`(() => { const d0 = recitLoad(); const d = d0.dossiers[0]; d.answers[0].validated = '<img src=x onerror=alert(1)>'; recitSave(d0); recitView = { mode: 'work', id: d.id, tab: 'interview' }; recitWork(); })()`);
assert(!el('#app').innerHTML.includes('<img src=x'), 'HTML non échappé');

console.log('PASS recit: 4 langues — détection (moments, personnes, ouï-dire, nuances, passages incertains, écarts d\'heure), langue, 5 indicateurs, ≤3 questions, 4 vues + édition + liste, conclusion sans verdict, versions, retrait, échappement HTML.');
