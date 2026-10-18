from pathlib import Path
import base64, copy, json, os
root=Path(__file__).resolve().parent
source=root/'src'
content=json.loads((source/'content.json').read_text(encoding='utf-8'))
ui=json.loads((source/'ui.json').read_text(encoding='utf-8'))
css=(source/'styles.css').read_text(encoding='utf-8')
app=(source/'app.js').read_text(encoding='utf-8')
presence=(source/'presence.js').read_text(encoding='utf-8')
recit=json.loads((source/'recit.json').read_text(encoding='utf-8'))
recit_js=(source/'recit.js').read_text(encoding='utf-8')
fiches_js=(source/'fiches.js').read_text(encoding='utf-8')
membres_js=(source/'membres.js').read_text(encoding='utf-8')
for code in content:
    f=source/'fiches'/(code+'.json')
    items=json.loads(f.read_text(encoding='utf-8')) if f.exists() else []
    content[code]['fiches']=[next((x for x in items if x.get('n')==i+1),None) for i in range(len(content[code]['scenarios']))]

FREE_FICHE=1  # fiche 02 (index 1) stays readable in the public showcase; also keep in sync with FREE_FICHE in membres.js

def page(content_js, recit_js_data, extra=''):
    return ('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soutien Affectif</title>'
            '<meta name="description" content="Un espace de dialogue pour les couples."><style>'+css+'</style></head><body><header></header><main id="app"></main><footer></footer>'
            '<script>const CONTENT='+json.dumps(content_js,ensure_ascii=False)+'; const UI='+json.dumps(ui,ensure_ascii=False)+'; const RECIT='+json.dumps(recit_js_data,ensure_ascii=False)+';'+extra+'\n'
            +fiches_js+'\n'+app+'\n'+recit_js+'\n'+membres_js+'\n'+presence+'</script></body></html>')

# Full version (everything open) — used only by the automated tests, never published.
(root/'_test_full.html').write_text(page(content,recit),encoding='utf-8')

# Public showcase: home + fiche 02 + danger signs readable; the rest is encrypted for every subscriber code.
import sys
sys.path.insert(0, r'C:/Projets/prive')
import keyring   # trousseau des 500 codes abonnés (+ ancien code commun)
secret=json.dumps({'CONTENT':content,'RECIT':recit},ensure_ascii=False).encode('utf-8')
payload=keyring.seal(secret)

public=copy.deepcopy(content)
for code,c in public.items():
    c['scenarios']=[s if i==FREE_FICHE else [s[0],s[1],'',''] for i,s in enumerate(c['scenarios'])]
    c['fiches']=[f if i==FREE_FICHE else None for i,f in enumerate(c['fiches'])]
    c['signs']=[]                     # « Corps & expressions » is a members page; dangerItems stay public (safety first)
public_recit={l:{} for l in recit}
(root/'index.html').write_text(page(public,public_recit,' const MEMBERS_PAYLOAD='+json.dumps(payload)+';\n'+keyring.JS),encoding='utf-8')
print('Site generated: index.html (vitrine publique + espace membres chiffré) and _test_full.html (tests)')
