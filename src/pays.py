"""Fuseau horaire -> pays (approximatif, sans service extérieur).

Écrit la même table dans src/presence.js, stats.html et C:/Projets/cna_prive/presence_cna.js,
entre les marqueurs /*PAYS*/ et /*FINPAYS*/.  Lancer : python src/pays.py
"""
import json, re
from pathlib import Path

Z = {
 'US': 'America/New_York America/Detroit America/Chicago America/Denver America/Phoenix America/Los_Angeles America/Anchorage America/Boise America/Juneau America/Sitka America/Adak America/Nome America/Yakutat America/Menominee Pacific/Honolulu',
 'CA': 'America/Toronto America/Montreal America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina America/Moncton America/Whitehorse America/Yellowknife America/Iqaluit America/Glace_Bay America/Goose_Bay America/Swift_Current America/Dawson_Creek America/Atikokan',
 'HT': 'America/Port-au-Prince',
 'DO': 'America/Santo_Domingo',
 'PR': 'America/Puerto_Rico',
 'CU': 'America/Havana',
 'JM': 'America/Jamaica',
 'BS': 'America/Nassau',
 'TC': 'America/Grand_Turk',
 'GP': 'America/Guadeloupe',
 'MQ': 'America/Martinique',
 'GF': 'America/Cayenne',
 'MX': 'America/Mexico_City America/Cancun America/Monterrey America/Tijuana America/Merida America/Chihuahua America/Hermosillo America/Mazatlan',
 'BR': 'America/Sao_Paulo America/Fortaleza America/Recife America/Bahia America/Belem America/Manaus America/Cuiaba America/Maceio America/Campo_Grande',
 'CL': 'America/Santiago America/Punta_Arenas',
 'FR': 'Europe/Paris',
 'BE': 'Europe/Brussels',
 'CH': 'Europe/Zurich',
 'GB': 'Europe/London',
 'ES': 'Europe/Madrid',
 'SN': 'Africa/Dakar',
 'CD': 'Africa/Kinshasa Africa/Lubumbashi',
 'CI': 'Africa/Abidjan',
 'CM': 'Africa/Douala',
 'BD': 'Asia/Dhaka',
}
TZ = {tz: c for c, zs in Z.items() for tz in zs.split()}
# Les autres fuseaux comptent dans « Autre » (ZZ) : la page stats reste rapide malgré la limite du service gratuit.
# Some US zones have sub-paths (America/Indiana/..., America/Kentucky/..., America/North_Dakota/...)
JS = ('/*PAYS*/var PAYS_TZ = ' + json.dumps(TZ, separators=(',', ':')) + ';\n'
      'var PAYS_CODES = ' + json.dumps(list(Z) + ['ZZ']) + ';\n'
      'function paysDuFuseau() { try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone || "";'
      ' return PAYS_TZ[z] || (/^America\\/(Indiana|Kentucky|North_Dakota)\\//.test(z) ? "US" : "ZZ"); }'
      ' catch (e) { return "ZZ"; } }/*FINPAYS*/')

for f in [Path(__file__).parent / 'presence.js', Path(__file__).parent.parent / 'stats.html', Path(r'C:/Projets/cna_prive/presence_cna.js')]:
    s = f.read_text(encoding='utf-8')
    s, n = re.subn(r'/\*PAYS\*/.*?/\*FINPAYS\*/', lambda m: JS, s, flags=re.S)
    if n != 1: raise SystemExit(f'marqueur /*PAYS*/ absent ou multiple dans {f}')
    f.write_text(s, encoding='utf-8')
print(f'{len(TZ)} fuseaux -> {len(Z)} pays (+ ZZ autre)')
