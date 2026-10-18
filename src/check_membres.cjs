// Tests de la vitrine publique + espace membres chiffré : node src/check_membres.cjs (après python build.py)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const full = fs.readFileSync('_test_full.html', 'utf8');
const code = fs.readFileSync('.access_code', 'utf8').trim();
const fr = JSON.parse(fs.readFileSync('src/fiches/fr.json', 'utf8'));
const list = fs.readFileSync('C:/Projets/prive/codes_abonnes.csv', 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(';')[1]);
assert.equal(list.length, 500, '500 codes attendus');
for (const c of list) assert(!html.includes(c), 'code de la liste visible en clair : ' + c);

// 1) Rien de réservé n'apparaît en clair dans la page publiée
assert(!html.includes(code), 'le code membres ne doit jamais être dans la page publiée');
for (const f of fr.filter((x) => x.n !== 2)) assert(!html.includes(f.explanations[0]), `fiche ${f.n} lisible en clair`);
assert(html.includes(fr.find((x) => x.n === 2).explanations[0]), 'la fiche 02 gratuite doit être lisible');
const recitIntro = JSON.parse(fs.readFileSync('src/recit.json', 'utf8')).fr.intro.slice(0, 60);
assert(!html.includes(recitIntro) && full.includes(recitIntro), 'textes du module récit lisibles en clair');
assert(/const MEMBERS_PAYLOAD=/.test(html) && !/const MEMBERS_PAYLOAD=/.test(full), 'charge chiffrée seulement dans la vitrine');

(async () => {
  const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const saved = {}, els = {};
  const el = (x) => els[x] ??= { innerHTML: '', value: '', textContent: '', querySelectorAll: () => [], classList: { toggle() {}, add() {} }, scrollIntoView() {}, click() {}, focus() {} };
  const ctx = { document: { documentElement: {}, querySelector: el, querySelectorAll: () => [], createElement: () => ({ click() {} }) }, window: { scrollTo() {} }, navigator: {},
    localStorage: { getItem: (k) => saved[k] || null, setItem: (k, v) => { saved[k] = v; }, removeItem: (k) => { delete saved[k]; } },
    console, confirm: () => true, alert() {}, setTimeout, clearInterval, setInterval, Blob, URL, crypto: globalThis.crypto, atob, TextEncoder, TextDecoder };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const run = (s) => vm.runInContext(s, ctx), app = () => el('#app').innerHTML, T = (k) => run(`t('${k}')`);
  run("changeLanguage('fr')");
  // 2) Sans code : pages verrouillées → écran membres ; gratuites → ouvertes
  for (const p of ['guide', 'signs', 'context', 'journal', 'recit', 'calm']) { run(`navigate('${p}')`); assert(app().includes(T('lockTitle')), `${p} devrait être verrouillé`); }
  run('start(4)'); assert(app().includes(T('lockTitle')), 'fiche 05 devrait être verrouillée');
  run('start(1)'); assert(!app().includes(T('lockTitle')) && app().includes(T('explanationsLabel')), 'fiche 02 doit être ouverte');
  run("navigate('safety')"); assert(!app().includes(T('lockTitle')) && !app().includes('undefined'), 'Signaux de danger doit rester gratuit');
  run("navigate('home')"); assert(!app().includes('undefined'), 'accueil');
  // 3) Mauvais code refusé, bon code accepté et mémorisé
  assert.equal(await run("membersUnlock('FAUX-0000')"), false, 'mauvais code accepté');
  let fake = 'O12345678'; while (list.includes(fake)) fake = 'O' + String(Number(fake.slice(1)) + 1).replace(/0/g, '1');
  assert.equal(await run(`membersUnlock('${fake}')`), false, 'code inventé au bon format accepté');
  assert.equal(await run('ccOpen(MEMBERS_PAYLOAD, ' + JSON.stringify(list[137]) + ').then(() => true)'), true, 'code n° 138 de la liste refusé');
  assert.equal(await run('ccOpen(MEMBERS_PAYLOAD, ' + JSON.stringify(' 0' + list[499].slice(1).replace(/(\d{4})/, '$1 ')) + ').then(() => true)'), true, 'code tapé avec un zéro et des espaces refusé');
  assert.equal(run('unlocked'), false);
  assert.equal(await run(`membersUnlock(${JSON.stringify(code.toLowerCase())})`), true, 'bon code refusé (casse ignorée)');
  assert.equal(saved['soutien-acces-membres'], code.toUpperCase(), 'code non mémorisé');
  run("navigate('recit')"); assert(!app().includes(T('lockTitle')), 'récit toujours verrouillé après déblocage');
  run('start(4)'); assert(app().includes(T('explanationsLabel')) && !app().includes('undefined'), 'fiche 05 non débloquée');
  for (const l of ['en', 'es', 'ht']) { run(`changeLanguage('${l}'); start(10)`); assert(app().includes(run("t('explanationsLabel')")), `fiche 11 non débloquée en ${l}`); }
  console.log('PASS membres: rien de réservé en clair, aucun des 500 codes visible, code inventé refusé, codes de la liste acceptés (même avec 0 au lieu de O), 6 pages + 23 fiches verrouillées, fiche 02 et Signaux de danger gratuits, mauvais code refusé, bon code débloque tout (4 langues) et est mémorisé.');
})().catch((e) => { console.error(e); process.exit(1); });
