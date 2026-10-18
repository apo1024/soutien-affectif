// Tests d'acceptation des fiches enrichies « Doutes de tromperie » : node src/check_fiches_ui.cjs (après python build.py)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync('_test_full.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const saved = {}, els = {};
const el = (x) => els[x] ??= { innerHTML: '', value: '', checked: false, textContent: '', querySelectorAll: () => [], classList: { toggle() {}, add() {} }, scrollIntoView() {}, click() {}, focus() {}, setRangeText() {} };
const ctx = {
  document: { documentElement: {}, querySelector: el, querySelectorAll: () => [], createElement: () => ({ click() {} }), body: { scrollHeight: 0 } },
  window: { scrollTo() {} }, navigator: {}, localStorage: { getItem: (k) => saved[k] || null, setItem: (k, v) => { saved[k] = v; }, removeItem: (k) => { delete saved[k]; } },
  console, confirm: () => true, alert() {}, prompt: () => null, setTimeout, clearInterval, setInterval, Blob, URL,
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const run = (s) => vm.runInContext(s, ctx);
const T = (k) => run(`t(${JSON.stringify(k)})`);
const app = () => el('#app').innerHTML, res = () => el('#pathResult').innerHTML;
const decode = (h) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

run("changeLanguage('fr')");
// Étape 1 — fiche 02 (doute) : toutes les rubriques, sans les rubriques d'aveu
run('start(1)');
for (const k of ['conclusionLabel', 'explanationsLabel', 'clarifyLabel', 'avoidLabel', 'firstHoursLabel', 'linksTitle']) assert(app().includes(T(k)), 'fiche 02 sans ' + k);
assert(!app().includes(T('shockLabel')), 'fiche 02 : rubrique d’aveu affichée à tort');
// Étape 1 — fiche 20 (aveu) : rubriques d'aveu, bandeau de sécurité, recherche
run('start(19)');
for (const k of ['shockLabel', 'healthLabel', 'decideLabel', 'supportLabel', 'safetyBanner', 'researchSays']) assert(app().includes(T(k)), 'fiche 20 sans ' + k);
assert(app().includes('McDaniel'), 'fiche 20 : étude McDaniel absente');
// Étape 1 du parcours : ouverture adaptée aux aveux (le partenaire vient d'avouer), ouverture d'origine pour les doutes
run('start(19)'); assert(decode(app()).includes(T('openingAveu')) && !decode(app()).includes(T('opening')), 'fiche 20 : ouverture « aveu » attendue');
run('start(1)'); assert(decode(app()).includes(T('opening')), 'fiche 02 : ouverture d’origine attendue');
for (const n of [8, 20]) assert(run(`fiche(${n - 1}).answers.some((a) => /colère/.test(a.label))`), `fiche ${n} : réponse « colère » attendue`);
// Étape 2 — réponses propres : « De la colère » dans 02 (conseil sur la surveillance), absente de 20
run('start(1);next()');
assert(/De la colère/.test(decode(app())), 'fiche 02 : réponse « De la colère » absente');
const k02 = run("fiche(1).answers.findIndex((a) => /colère/.test(a.label))");
run(`ficheAnswer(${k02})`);
assert(/surveill/.test(decode(res())) && res().includes(T('youCanSay')), 'fiche 02 : conseil « colère » sans surveillance ou sans « Vous pouvez dire »');
run('start(19);next()');
assert(!/De la colère \(/.test(decode(app())), 'fiche 20 : la réponse « De la colère » de la fiche 02 ne doit pas y être');
run('next();next()');
assert(app().includes(T('decideTitle')), 'fiche 20 : étape 3 « Décider à votre rythme » absente');
// Étape 3 — liens internes
run('start(1)');
run("ficheGo('recit')");
const db = JSON.parse(saved['soutien-recit-v1']);
assert.equal(db.dossiers[0].title, run('fiche(1).title'), 'dossier pré-rempli avec le titre de la fiche');
assert.equal(db.dossiers[0].items[0].nature, 'obs');
assert.equal(run('current'), 'recit');
run('start(1)'); run("ficheGo('journal')");
assert(el('#fact').value.startsWith(run('fiche(1).title')), 'journal pré-rempli avec le titre');
run('start(1)'); run("ficheGo('pause')"); assert.equal(run('current'), 'calm');
run('start(19)'); run("ficheGo('danger')"); assert.equal(run('current'), 'safety');
// Toutes les fiches, toutes les réponses, dans chaque langue qui a des fiches : rien d'indéfini
for (const l of ['fr', 'en', 'es', 'ht']) {
  run(`changeLanguage('${l}')`);
  const n = run('content().scenarios.length');
  for (let i = 0; i < n; i++) {
    run(`start(${i})`); assert(!app().includes('undefined'), `${l} fiche ${i + 1} étape 1`);
    run('next()');
    const answers = run(`fiche(${i}) ? fiche(${i}).answers.length : 0`);
    for (let k = 0; k < answers; k++) { run(`ficheAnswer(${k})`); assert(!res().includes('undefined') && res().length > 20, `${l} fiche ${i + 1} réponse ${k + 1}`); }
    run('next()'); assert(!app().includes('undefined'), `${l} fiche ${i + 1} étape 3`);
  }
}
// Repli : sans fiche enrichie, l'affichage d'origine (question d'origine, 4 réponses génériques) revient
run("changeLanguage('fr'); CONTENT.fr.fiches = []; start(1); next()");
assert(app().includes(T('answerExplanation')) && decode(app()).includes(run('content().scenarios[1][2]')), 'repli sur l’affichage d’origine');
console.log('PASS fiches: rubriques 02/20, parcours propres (colère 02 ≠ 20), étape 3 aveu, liens récit/journal/pause/danger, 4 langues × 24 fiches × toutes les réponses, repli.');
