"""Build isolated browser fixtures; all GitHub requests use fake responses."""
from pathlib import Path
import json,shutil
root=Path(__file__).resolve().parents[1]
(root/'dist').mkdir(exist_ok=True)
for filename in ['index.html','admin.html','admin.js','admin.css','site-renderer.js','site-data.json']:
 shutil.copy2(root/filename,root/'dist'/filename)
shutil.copytree(root/'assets',root/'dist/assets',dirs_exist_ok=True)
shutil.copy2(root/'tests/visual-editor.browser.js',root/'dist/editor-tests.js')
html=(root/'index.html').read_text();data=json.loads((root/'site-data.json').read_text())
script='''<script>
const fixtureHTML=HTML_VALUE,fixtureData=DATA_VALUE;
const originalFetch=window.fetch.bind(window);window.fixtureCalls=[];window.fixtureConflict=false;
function fixtureB64(value){const b=new TextEncoder().encode(value);let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s)}
window.fetch=async (url,options={})=>{
 if(!String(url).startsWith('https://api.github.com/repos/ryanpatricktoomey/ryan-english-classes/'))return originalFetch(url,options);
 const path=String(url).split('ryan-english-classes/')[1],method=options.method||'GET',payload=options.body?JSON.parse(options.body):null;
 window.fixtureCalls.push({path,method,payload});let result;
 if(method==='GET'&&path.startsWith('contents/index.html'))result={sha:window.fixtureConflict?'changed-sha':'fixture-html',content:fixtureB64(fixtureHTML)};
 else if(method==='GET'&&path.startsWith('contents/site-data.json'))result={sha:'fixture-data',content:fixtureB64(JSON.stringify(fixtureData))};
 else if(path==='git/ref/heads/main')result={object:{sha:'fixture-head'}};
 else if(path==='git/commits/fixture-head')result={tree:{sha:'fixture-tree'}};
 else if(path==='git/blobs'&&method==='POST')result={sha:'blob-'+window.fixtureCalls.length};
 else if(path==='git/trees'&&method==='POST')result={sha:'new-tree'};
 else if(path==='git/commits'&&method==='POST')result={sha:'new-commit'};
 else if(path==='git/refs/heads/main'&&method==='PATCH')result={object:{sha:payload.sha}};
 else return new Response(JSON.stringify({message:'Unexpected fixture call '+path}),{status:400});
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
</script>'''
script=script.replace('HTML_VALUE',json.dumps(html,ensure_ascii=False).replace('<','\\u003c')).replace('DATA_VALUE',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
admin=(root/'admin.html').read_text().replace('<script src="site-renderer.js?',script+'<script src="site-renderer.js?')
(root/'dist/editor-review.html').write_text(admin)
(root/'dist/editor-test.html').write_text(admin.replace('</body>','<script src="editor-tests.js"></script></body>'))
