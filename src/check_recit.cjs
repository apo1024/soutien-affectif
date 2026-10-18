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

// 8) Rapport de test « Absences répétées de Marc » — tests d'acceptation P1, P3, P4, P5, P2 (contrôle), P7
run(`changeLanguage('fr');navigate('recit');recitNew()`);
const mid = db().dossiers[0].id;
const setMarc = (extra) => run(`(() => { const d0 = recitLoad(); const d = recitGet(d0, '${mid}');
  Object.assign(d, { title: 'Test – Absences répétées de Marc', analysisLang: 'fr', persons: 'Marc (partenaire), Sophie (collègue de Marc), moi-même',
    desc: "Depuis environ deux mois, mon partenaire (pseudonyme : Marc) rentre plus tard le mardi et le jeudi. Il dit faire des heures supplémentaires, mais il reste vague quand je pose des questions. Il garde aussi son téléphone face cachée.",
    items: [{ id: 'i1', text: 'Marc est rentré à 22 h mardi dernier, au lieu de 18 h 30 habituellement.', nature: 'obs' },
            { id: 'i2', text: "Une amie m'a dit avoir vu Marc dans un café du centre-ville un jeudi soir.", nature: 'report' }],
    questions: [{ id: 'q1', text: 'Peux-tu raconter ce qui s’est passé ?' }],
    answers: [{ id: 'r1', qid: 'q1', lang: 'fr', validated: "Mardi, Marc m'a écrit vers 18 h qu'il restait au bureau pour finir un dossier. Il est rentré vers 22 h, fatigué. Je lui ai demandé sur quel dossier il travaillait, il a répondu « un truc pour Sophie » sans détailler. Il est allé directement prendre sa douche.", active: true, created: '2026-10-17T10:00:00Z', versions: [] }]
      .concat(${JSON.stringify(extra || [])}.map((t, i) => ({ id: 'rx' + i, qid: 'q1', lang: 'fr', validated: t, active: true, created: '2026-10-17T11:0' + i + ':00Z', versions: [] }))) });
  recitAnalyse(d); recitSave(d0); })()`);
setMarc();
let m = db().dossiers[0];
assert.equal(m.gaps.length, 0, 'P1: faux écarts ' + JSON.stringify(m.gaps.map((g) => g.what)));
assert.equal(run(`recitIndicators(recitGet(recitLoad(), '${mid}'))`)[3].pct, null, 'P1: indicateur écarts doit être « Aucun écart relevé »');
const ambTerms = m.ambiguities.map((a) => a.term);
['un truc', 'sans détailler', 'environ', 'reste vague'].forEach((t) => assert(ambTerms.includes(t), 'P3: « ' + t + ' » non relevé : ' + ambTerms.join(' | ')));
assert(m.claims.some((c) => c.ref === 'desc' && /face cachée/.test(c.text) && c.nature === 'interp'), 'P4: description initiale non analysée');
const verif = m.claims.filter((c) => c.verifiable);
assert.equal(verif.length, 4, 'P5: 4 affirmations vérifiables attendues : ' + verif.map((c) => c.text).join(' | '));
const ind3 = run(`recitIndicators(recitGet(recitLoad(), '${mid}'))`)[2];
assert(ind3.num === 0 && ind3.den === 4, 'P5: indicateur 3 doit être 0 / 4');
setMarc(['Mardi, il est rentré vers 20 h.']);
m = db().dossiers[0];
assert.equal(m.gaps.length, 1, 'P1: 1 écart attendu ' + JSON.stringify(m.gaps.map((g) => [g.aText, g.bText])));
assert(/22 h mardi/.test(m.gaps[0].aText) && /20 h/.test(m.gaps[0].bText), 'P1: mauvais écart');
setMarc(['Mardi, il est rentré vers 20 h.', 'Jeudi il est rentré à 23 h.']);
assert.equal(db().dossiers[0].gaps.length, 1, 'P1: un autre jour ne doit pas créer d’écart');
// P2 — contrôle anti-invention et questions orientées (sans charger de modèle)
run(`recitView = { mode: 'work', id: '${mid}', tab: 'analysis' }; recitAiShow(JSON.stringify({ centrales: ['Marc est rentré à 22 h, au lieu de 18 h 30.', 'La voisine a vu Marc.'], ambiguites: ['un truc'], ecarts: [], questions: ['Pourquoi Marc est-il rentré si tard ?', 'Peux-tu préciser de quel dossier il s’agissait ?'] }), recitGet(recitLoad(), '${mid}'))`);
const ai = run('recitAiLast');
assert(/<del>La voisine a vu Marc\.<\/del>/.test(ai) && /voisine/.test(ai), 'P2: « voisine » doit être marquée absente du dossier');
assert(!/<del>Marc est rentré à 22 h, au lieu de 18 h 30\.<\/del>/.test(ai), 'P2: « 18 h 30 » recopié à l’identique ne doit pas être signalé');
assert(/<del>Pourquoi Marc est-il rentré si tard \?<\/del>/.test(ai), 'P2: question orientée non signalée');
assert.equal(run('recitAiQuestions.length'), 1, 'P2: seule la question neutre est réutilisable');
run(`recitAiShow('pas du JSON', recitGet(recitLoad(), '${mid}'))`);
assert(run('recitAiLast').includes(run("R('aiBadJson')")), 'P2: JSON invalide non signalé');
// P7 — pas de consentement : message visible et rien n'est enregistré
run(`recitView = { mode: 'work', id: '${mid}', tab: 'interview' }; recitWork()`);
el('#aText').value = 'Réponse test'; el('#qText').value = 'Q'; el('#aConsent').checked = false; el('#aConsent').closest = () => ({ classList: { add() {} } });
run('recitAddAnswer()');
assert.equal(el('#aStatus').textContent, run("R('consentNeeded')"), 'P7: message de consentement absent');

console.log('PASS recit (rapport Marc P1–P7 compris): 4 langues — détection (moments, personnes, ouï-dire, nuances, passages incertains, écarts d\'heure), langue, 5 indicateurs, ≤3 questions, 4 vues + édition + liste, conclusion sans verdict, versions, retrait, échappement HTML.');
