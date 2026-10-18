/* ===== Fiches enrichies « Doutes de tromperie » =====
   CONTENT[lang].fiches[i] (même index que CONTENT[lang].scenarios) : rubriques, réponses propres à la fiche,
   liens internes, études. Une fiche absente ou incomplète garde l'affichage d'origine. */
const STUDY_IDX = { apostolou2022: 0, mazzini2025: 1, mcdaniel2017: 2, dew2022: 3 };
const FICHE_LABEL = { doute: 'contextualLabel', communication: 'communicationLabel', aveu: 'confirmedLabel' };

function fiche(i) {
  const f = (content().fiches || [])[i];
  return f && f.type && Array.isArray(f.answers) && f.answers.length ? f : null;
}
function ficheLabel(i) {
  const f = fiche(i);
  return f ? FICHE_LABEL[f.type] : i >= 16 ? 'newLabel' : i === 11 ? 'confirmedLabel' : [8, 12, 13, 14, 15].includes(i) ? 'communicationLabel' : 'contextualLabel';
}
function ficheList(arr) { return arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''; }
function ficheBlock(key, arr) { return arr && arr.length ? `<h3>${t(key)}</h3>${ficheList(arr)}` : ''; }

/** Opens « Mon journal » with a note that starts with the title of the situation. */
function openJournal(title) {
  navigate('journal');
  const el = document.querySelector('#fact');
  if (el) { el.value = title + ' — '; if (el.focus) el.focus(); }
}
function ficheGo(kind) {
  const s = content().scenarios[chosen], f = fiche(chosen), title = (f && f.title) || s[0];
  if (kind === 'recit') recitNewFrom(title);
  else if (kind === 'journal') openJournal(title);
  else if (kind === 'danger') navigate('safety');
  else if (kind === 'pause') navigate('calm');
  else if (kind === 'contexte') navigate('context');
}
function ficheLinks(f) {
  const label = { recit: 'linkRecit', journal: 'linkJournal', danger: 'navSafety', pause: 'navCalm', contexte: 'navContext' };
  const links = (f.links || []).filter((k) => label[k]);
  return links.length ? `<h3>${t('linksTitle')}</h3><div class="actions">${links.map((k) => btn(t(label[k]), `ficheGo('${k}')`)).join('')}</div>` : '';
}
function ficheStudies(f) {
  const ids = (f.studies || []).filter((k) => k in STUDY_IDX);
  if (!ids.length) return '';
  return `<section class="card fiche-research"><h3>${t('researchSays')}</h3>${ids.map((k) => {
    const [author, key, url] = RESEARCH[STUDY_IDX[k]];
    return `<p><strong>${esc(author)}</strong> — ${t(key)} <a href="${url}" target="_blank" rel="noopener">↗</a></p>`;
  }).join('')}<p><small>${t('researchLimits')}</small></p></section>`;
}

function fichePath(s, f) {
  const aveu = f.type === 'aveu';
  const left = `<section>
    <div class="eyebrow">${t('pathEyebrow')}</div>
    ${f.safety ? `<div class="note fiche-safety">${t('safetyBanner')} ${btn(t('navSafety'), "navigate('safety')")}</div>` : ''}
    ${f.reviewed === false ? `<div class="note">${t('reviewPending')}</div>` : ''}
    <div class="tag" style="margin-top:20px">${t(FICHE_LABEL[f.type])}</div>
    <h1 class="scenario-title">${esc(f.title || s[0])}</h1><p>${esc(f.subtitle || s[1])}</p>
    <h3>${t('conclusionLabel')}</h3><p>${esc(f.conclude || s[3])}</p>
    ${ficheBlock('explanationsLabel', f.explanations)}
    ${ficheBlock('clarifyLabel', f.clarify)}
    ${ficheBlock('avoidLabel', f.avoid)}
    ${f.firstHours && f.firstHours.length ? `<details class="fiche-first"><summary>${t('firstHoursLabel')}</summary>${ficheList(f.firstHours)}</details>` : ''}
    ${aveu ? ficheBlock('shockLabel', f.shock) + (f.health ? `<h3>${t('healthLabel')}</h3><p>${esc(f.health)}</p>` : '') + ficheBlock('decideLabel', f.decide) + ficheBlock('supportLabel', f.support) : ''}
    ${ficheLinks(f)}
    <div class="note">${t('rights')}</div>
    ${ficheStudies(f)}
  </section>`;
  const right = `<section class="card"><div class="step">${t('step')} ${step + 1} / 3</div>${
    step === 0 ? `<h2>${t('chooseMoment')}</h2>${quote(t(aveu ? 'openingAveu' : 'opening'))}<div class="actions">${btn(t('yesContinue'), 'next()', true)}${btn(t('notNow'), "answer('later')")}${btn(t('rising'), "navigate('calm')")}</div>`
    : step === 1 ? `<h2>${t('askTitle')}</h2>${quote(f.question || s[2])}<p>${t('listen')}</p><div class="actions">${f.answers.map((a, k) => btn(a.label, `ficheAnswer(${k})`)).join('')}</div>`
    : `<h2>${t(aveu ? 'decideTitle' : 'nextTitle')}</h2>${aveu ? ficheList(f.decide) : ''}${f.next && f.next.length ? `<h3>${t('nextIdeas')}</h3>${ficheList(f.next)}` : ''}<p>${t('freeAgreement')}</p>
      <div class="actions">${btn(t('writeFeelings'), `openJournal(${JSON.stringify(f.title || s[0]).replace(/"/g, '&quot;')})`)}${btn(t('navCalm'), "navigate('calm')")}${btn(t('finish'), "navigate('home')")}</div>`
  }<div id="pathResult" aria-live="polite"></div></section>`;
  return `${btn(t('back'), "navigate('home')")}<div class="twoCol" style="margin-top:28px">${left}${right}</div>`;
}
function ficheAnswer(k) { answerKey = 'f' + k; ficheResult(k); }
function ficheResult(k) {
  const f = fiche(chosen), a = f && f.answers[k];
  if (!a) return;
  document.querySelector('#pathResult').innerHTML = `<div class="result"><strong>${esc(a.label)}</strong><p>${esc(a.advice)}</p>
    ${a.followUp ? `<p>${t('youCanSay')}</p>${quote(a.followUp)}` : ''}<div class="actions">${btn(t('next'), 'next()', true)}</div></div>`;
}
