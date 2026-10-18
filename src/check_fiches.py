"""Contrôle des fiches « Doutes de tromperie » (src/fiches/<lang>.json) selon la spécification
corrections-doutes-de-tromperie.md : structure (section 3), points particuliers (étape 4), règles de rédaction (section 7).

Usage : python src/check_fiches.py fr [fichier.json ...]   → code de sortie 1 s'il y a une erreur.
Sans fichier, contrôle src/fiches/<lang>.json et exige les 24 fiches.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TYPES = {**{n: 'doute' for n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}, **{n: 'communication' for n in [13, 14, 15, 16]},
         **{n: 'aveu' for n in [12, 17, 18, 19, 20, 21, 22, 23, 24]}}
BADGE = {'doute': 'context', 'communication': 'communication', 'aveu': 'acknowledged'}
HEALTH_REQUIRED = {12, 19, 20, 22, 24}
STUDIES = {'apostolou2022', 'mazzini2025', 'mcdaniel2017', 'dew2022'}
LINKS = {'recit', 'journal', 'danger', 'pause', 'contexte'}
REFUSAL = re.compile(r'refus|refuse|refuses|refusal|declin|rechaz|niega|se niega|refize|pa vle', re.I)
WHY = re.compile(r'^\s*[«"\']?\s*(pourquoi|why|por ?qu[eé]|poukisa)\b', re.I)
CONCLUDE = re.compile(r"probablement une tromperie|c'est un signe que|signe (?:clair |certain )?de tromperie|vous trompe (?:sûrement|certainement)|tu me mens|probably cheating|is a sign that|probablemente (?:te )?engañ|se yon siy ke", re.I)
SURVEIL = re.compile(r"fouill|géolocalis|geolocaliz|faux profil|fake profile|perfil falso|fo pwofil|capture[s]? d'écran|screenshot|espionn|spy on|track (?:their|the) phone", re.I)
NEGATION = re.compile(r"\b(sans|ne|n'|jamais|pas|interdit|évitez|eviter|never|don't|do not|without|nunca|no|sin|evite|pa|janm|san)\b", re.I)


def sentences(text):
    return [s for s in re.split(r'(?<=[.!?…])\s+', str(text or '')) if s.strip()]


def check(f, lang, errors):
    n = f.get('n'); tag = f'fiche {n:02d}' if isinstance(n, int) else 'fiche ?'
    def err(msg): errors.append(f'{tag}: {msg}')
    if n not in TYPES: return err('numéro « n » invalide')
    t = TYPES[n]
    if f.get('type') != t: err(f"type {f.get('type')} au lieu de {t}")
    if f.get('badge') != BADGE[t]: err(f"badge {f.get('badge')} au lieu de {BADGE[t]}")
    for k in ['id', 'title', 'subtitle', 'conclude', 'question']:
        if not str(f.get(k) or '').strip(): err(f'champ « {k} » vide')
    def count(k, lo, hi):
        v = f.get(k)
        if not isinstance(v, list) or not (lo <= len(v) <= hi): err(f'« {k} » doit contenir {lo} à {hi} éléments (a {len(v) if isinstance(v, list) else 0})')
    count('explanations', 3, 5); count('clarify', 1, 5); count('avoid', 2, 3); count('firstHours', 2, 4); count('answers', 3, 5); count('next', 2, 4)
    answers = f.get('answers') or []
    for a in answers:
        for k in ['label', 'advice', 'followUp']:
            if not str((a or {}).get(k) or '').strip(): err(f'réponse sans « {k} »')
    if not any(REFUSAL.search(str(a.get('label', ''))) for a in answers): err('aucune réponse de type « refus »')
    for k in f.get('links') or []:
        if k not in LINKS: err(f'lien inconnu {k}')
    for k in f.get('studies') or []:
        if k not in STUDIES: err(f'étude inconnue {k}')
    if t == 'aveu':
        if f.get('safety') is not True: err('aveu : safety doit être true')
        for k in ['shock', 'decide', 'support']:
            if not isinstance(f.get(k), list) or not f.get(k): err(f'aveu : « {k} » manquant')
        if n in HEALTH_REQUIRED and not str(f.get('health') or '').strip(): err('aveu : « health » obligatoire pour cette fiche')
        if 'danger' not in (f.get('links') or []): err("aveu : lien 'danger' attendu")
    if t == 'communication' and 'contexte' not in (f.get('links') or []): err("communication : lien 'contexte' attendu")
    # Règles de rédaction (section 7)
    def texts(skip_avoid):
        out = [('conclude', f.get('conclude')), ('question', f.get('question')), ('health', f.get('health'))]
        for k in ['explanations', 'clarify', 'firstHours', 'next', 'shock', 'decide', 'support'] + ([] if skip_avoid else ['avoid']):
            out += [(k, x) for x in (f.get(k) or [])]
        for a in answers:
            # labels quote the partner's reaction (« tu m'espionnes ? ») : checked for length, not for advice
            out += ([('answers.label', a.get('label'))] if not skip_avoid else []) + [('answers.advice', a.get('advice')), ('answers.followUp', a.get('followUp'))]
        return [(k, v) for k, v in out if v]
    for k, v in texts(False):
        for s in sentences(v):
            if len(s.split()) > 25: err(f'phrase de plus de 25 mots dans {k} : « {s[:70]}… »')
        if CONCLUDE.search(v): err(f'conclusion interdite dans {k} : « {v[:70]} »')
    for k, v in texts(True):
        for s in sentences(v):
            if SURVEIL.search(s) and not NEGATION.search(s): err(f'surveillance conseillée dans {k} : « {s[:80]} »')
    for k, v in [('question', f.get('question'))] + [('followUp', a.get('followUp')) for a in answers]:
        if v and WHY.search(v): err(f'question commençant par « Pourquoi » dans {k}')


def main():
    lang = sys.argv[1] if len(sys.argv) > 1 else 'fr'
    files = [Path(p) for p in sys.argv[2:]] or [ROOT / 'fiches' / f'{lang}.json']
    errors, seen = [], []
    for p in files:
        data = json.loads(p.read_text(encoding='utf-8'))
        for f in data:
            seen.append(f.get('n')); check(f, lang, errors)
    if len(set(seen)) != len(seen): errors.append('numéros en double : ' + str(sorted(x for x in seen if seen.count(x) > 1)))
    if not sys.argv[2:] and sorted(seen) != list(range(1, 25)): errors.append('il manque des fiches : ' + str(sorted(set(range(1, 25)) - set(seen))))
    for e in errors: print('✗', e)
    print(f'{lang}: {len(seen)} fiche(s), {len(errors)} erreur(s)')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
