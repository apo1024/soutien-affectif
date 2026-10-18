/* ===== Espace membres =====
   Le lien public (vidéo) ouvre une vitrine : l'accueil, la fiche 02 et « Signaux de danger ».
   Tout le reste est chiffré (AES-GCM) dans MEMBERS_PAYLOAD ; chaque code abonné de la liste (C:\Projets\prive\codes_abonnes.csv) l'ouvre :
   sans le code donné aux abonnés de la chaîne, ce contenu est illisible, même en lisant le code de la page.
   La version complète utilisée par les tests n'a pas de MEMBERS_PAYLOAD : tout y est ouvert. */
const MEMBERS_KEY = 'soutien-acces-membres';
const MEMBERS_JOIN = 'https://www.youtube.com/channel/UCUJ-ay76QvkmdlkiXcAhcVw?sub_confirmation=1'; // ouvre directement la fenêtre d'abonnement YouTube
const FREE_FICHE = 1; // fiche 02 — l'hôtel
const FREE_PAGES = ['home', 'safety', 'lock'];
let unlocked = typeof MEMBERS_PAYLOAD === 'undefined';
let lockedFrom = null;

function isLocked(p, i) {
  if (unlocked) return false;
  if (p === 'path') return i !== FREE_FICHE;
  return !FREE_PAGES.includes(p);
}
async function membersDecrypt(code) {
  return JSON.parse(await ccOpen(MEMBERS_PAYLOAD, code)); // ccOpen : trousseau des codes abonnés (keyring.py)
}
function membersApply(data) {
  for (const l of Object.keys(data.CONTENT)) Object.assign(CONTENT[l], data.CONTENT[l]);
  for (const l of Object.keys(data.RECIT)) RECIT[l] = Object.assign(RECIT[l] || {}, data.RECIT[l]);
  unlocked = true;
}
async function membersUnlock(code, silent) {
  const msg = document.querySelector('#lockMsg');
  if (msg && !silent) msg.textContent = t('lockChecking');
  try {
    membersApply(await membersDecrypt(code));
    try { const c = String(code).trim().toUpperCase(); localStorage.setItem(MEMBERS_KEY, c); localStorage.setItem('compumaster-code', c); } catch { /* private mode */ }
    const target = lockedFrom; lockedFrom = null;
    if (target && target.p === 'path') start(target.i); else navigate(target ? target.p : 'home');
    return true;
  } catch {
    if (!silent) { try { localStorage.removeItem(MEMBERS_KEY); } catch { /* */ } if (msg) msg.textContent = t('lockWrong'); }
    return false;
  }
}
function lockPage() {
  app.innerHTML = `<section class="lock card">
    <div class="eyebrow">${t('lockEyebrow')}</div><h1>🔒 ${t('lockTitle')}</h1><p>${t('lockText')}</p>
    <div class="actions"><a class="primary-link" href="${MEMBERS_JOIN}" target="_blank" rel="noopener">▶ ${t('lockJoin')}</a></div>
    <form id="lockForm" class="lock-form"><label for="lockCode">${t('lockCodeLabel')}</label>
      <input id="lockCode" autocomplete="off" autocapitalize="characters" placeholder="${t('lockCodePh')}" maxlength="40">
      <div class="actions"><button class="primary" type="submit">${t('lockUnlock')}</button>${btn(t('back'), "navigate('home')")}</div>
      <p id="lockMsg" role="status"></p></form>
    <div class="note">${t('lockFree')} ${btn(t('lockFreeFiche'), `start(${FREE_FICHE})`)} ${btn(t('navSafety'), "navigate('safety')")}</div>
  </section>`;
  const f = document.querySelector('#lockForm');
  if (f) f.onsubmit = (e) => { e.preventDefault(); membersUnlock(document.querySelector('#lockCode').value); };
}

// Gate every way in: menu, situations, re-render (language change)
const _navigate = navigate, _start = start, _render = render, _cards = cards;
navigate = function (p) {
  if (isLocked(p, p === 'path' ? chosen : undefined)) { lockedFrom = { p }; current = 'lock'; shell(); lockPage(); window.scrollTo(0, 0); return; }
  _navigate(p);
};
start = function (i) {
  if (isLocked('path', i)) { lockedFrom = { p: 'path', i }; current = 'lock'; shell(); lockPage(); window.scrollTo(0, 0); return; }
  _start(i);
};
render = function () { if (current === 'lock') return lockPage(); _render(); };
cards = function (q) {
  _cards(q);
  if (unlocked) return;
  document.querySelectorAll('#cards article').forEach((a, k) => {
    const btn = a.querySelector('button[onclick^="start("]');
    const i = btn ? +btn.getAttribute('onclick').match(/\d+/)[0] : -1;
    if (i === FREE_FICHE) { a.insertAdjacentHTML('afterbegin', `<div class="tag free-tag">${t('lockFreeTag')}</div>`); return; }
    a.classList.add('locked-card');
    a.querySelectorAll('details').forEach((d) => d.remove());
    if (btn) btn.textContent = '🔒 ' + t('lockMembers');
  });
};
// A member who already entered the code is let in again silently
try { const saved = localStorage.getItem(MEMBERS_KEY) || localStorage.getItem('compumaster-code'); /* même code pour tous les sites apo1024.github.io */ if (saved && !unlocked) membersUnlock(saved, true).then((ok) => { if (ok) { current = 'home'; shell(); render(); } }); } catch { /* */ }
if (!unlocked && current === 'home') render();
