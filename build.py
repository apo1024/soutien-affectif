from pathlib import Path
import json
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
for code in content:
    f=source/'fiches'/(code+'.json')
    items=json.loads(f.read_text(encoding='utf-8')) if f.exists() else []
    content[code]['fiches']=[next((x for x in items if x.get('n')==i+1),None) for i in range(len(content[code]['scenarios']))]
html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soutien Affectif</title><meta name="description" content="Un espace de dialogue pour les couples."><style>'+css+'</style></head><body><header></header><main id="app"></main><footer></footer><script>const CONTENT='+json.dumps(content,ensure_ascii=False)+'; const UI='+json.dumps(ui,ensure_ascii=False)+'; const RECIT='+json.dumps(recit,ensure_ascii=False)+';\n'+fiches_js+'\n'+app+'\n'+recit_js+'\n'+presence+'</script></body></html>'
(root/'index.html').write_text(html,encoding='utf-8')
print('Site generated: index.html')
