const tests = [];
function assertEditor(name, pass) { tests.push({ name, pass: !!pass }); if (!pass) throw Error(name); }
async function waitCanvas() { for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,50));if($('canvas').contentDocument?.querySelector('[contenteditable=true]'))return;}throw Error('Canvas failed to bind'); }
async function resetEditor() {
 state.doc=parseHTML(fixtureHTML);state.data=structuredClone(fixtureData);state.uploads=new Map();state.history=[];state.cursor=-1;state.baseline=signature();checkpoint();renderCanvas();await waitCanvas();
}
async function runEditorTests(){try{
 await waitCanvas();
 assertEditor('Public page loads into the editing canvas without a token',state.doc&&$('canvas').contentDocument.querySelector('.hero'));
 assertEditor('Small-group wording removed everywhere',!serializedHTML().includes('소규모'));
 assertEditor('Rotation rationale removed; rotation process retained',!serializedHTML().includes('왜 파트너를')&&serializedHTML().includes('파트너를 바꿔요'));
 let frame=$('canvas').contentDocument;
 assertEditor('Whole paragraphs are editable, with inline colors preserved',frame.querySelector('.grid .card p').isContentEditable&&frame.querySelector('.grid .card p .chalk-green'));
 let lead=frame.querySelector('.hero .lead');lead.textContent='테스트 문구';lead.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();
 assertEditor('Typing updates the publishable homepage',state.doc.querySelector('.lead').textContent==='테스트 문구');
 travel(-1);await waitCanvas();assertEditor('Undo restores the original paragraph',state.doc.querySelector('.lead').textContent==='온라인 그룹 영어회화');
 travel(1);await waitCanvas();assertEditor('Redo restores the edit',state.doc.querySelector('.lead').textContent==='테스트 문구');
 await resetEditor();frame=$('canvas').contentDocument;
 let heading=frame.querySelector('h1');let selected=frame.createRange();selected.setStart(heading.firstChild,0);selected.setEnd(heading.firstChild,2);state.activeKey=heading.dataset.editKey;state.range=selected;formatSelection('blue');
 assertEditor('Chalk formatting preserves the rest of the heading',state.doc.querySelector('h1 .chalk-blue').textContent==='매일'&&state.doc.querySelector('h1 .chalk-yellow').textContent==='영어로 대화해요!');
 frame=$('canvas').contentDocument;heading=frame.querySelector('h1');let yellow=heading.querySelector('.chalk-yellow');selected=frame.createRange();selected.selectNodeContents(yellow);state.activeKey=heading.dataset.editKey;state.range=selected;formatSelection('clear');
 assertEditor('Clear formatting removes inherited chalk formatting',!state.doc.querySelector('h1 .chalk-yellow')&&state.doc.querySelector('h1').textContent.includes('영어로 대화해요!'));
 assertEditor('Pasted markup strips active content and attributes',cleanMarkup('<strong onclick="alert(1)">safe</strong><img src=x onerror=alert(2)><script>bad()</script>')==='<strong>safe</strong>');
 assertEditor('Publishing contains no editor decorations',!serializedHTML().includes('data-edit-key')&&!serializedHTML().includes('contenteditable'));
 await resetEditor();frame=$('canvas').contentDocument;
 const classTime=frame.querySelector('[data-edit-key="class:0:time"]');classTime.textContent='오전 07:00–07:30';classTime.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();
 assertEditor('Class times are editable in place',state.data.classes[0].time==='오전 07:00–07:30');
 frame.querySelector('#classes .status').click();assertEditor('Clicking availability toggles its data',state.data.classes[0].available===false);
 travel(-1);await waitCanvas();assertEditor('Undo restores availability without losing class-time edits',state.data.classes[0].available===true&&state.data.classes[0].time==='오전 07:00–07:30');
 frame=$('canvas').contentDocument;const title=frame.querySelector('.sample-title');title.textContent='새 PDF 제목';title.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();assertEditor('PDF titles are editable in place',state.data.samples[0].title==='새 PDF 제목');
 const contact=frame.querySelector('#contact .contact-label');contact.textContent='상담 문의하기';contact.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();assertEditor('Consultation button wording is editable',state.data.contactLabel==='상담 문의하기');
 assertEditor('Instagram icon survives label editing',frame.querySelector('#contact svg')?.getAttribute('aria-hidden')==='true'&&frame.querySelectorAll('#contact svg circle').length===2);
 setColor('green','#ffffff');checkpoint();assertEditor('Custom chalk colors persist',currentColor('green')==='#ffffff');
 assertEditor('Derived colors remain readable on the darkest light background',(luminance([238,233,223])+.05)/(luminance(inkColor('#ffffff').match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)))+.05)>=4.5);
 $('previewToggle').click();await new Promise(r=>setTimeout(r,200));frame=$('canvas').contentDocument;
 assertEditor('Visitor preview disables inline editing',!frame.querySelector('[contenteditable=true]'));
 $('previewToggle').click();await waitCanvas();
 openPanel('schedule');assertEditor('Schedule settings preserve month, price and six classes',$('settingsContent').querySelectorAll('input').length===21&&state.data.classes.length===6);
 openPanel('samples');assertEditor('Both PDF replacements and multiple-file upload remain available',$('settingsContent').querySelectorAll('input[type=file]').length===3);
 openPanel('faq');assertEditor('FAQ settings expose every question and answer',$('settingsContent').querySelectorAll('textarea').length===3);
 const originalCount=state.data.faqs.length;
 $('settingsContent').lastElementChild.click();await waitCanvas();
 assertEditor('FAQ questions can be added',state.data.faqs.length===originalCount+1);
 frame=$('canvas').contentDocument;
 const question=frame.querySelector('[data-edit-key="faq:3:question"]');question.textContent='새로운 질문?';question.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();
 const answer=frame.querySelector('[data-edit-key="faq:3:answer"]');answer.innerHTML='첫 번째 줄<br>두 번째 줄';answer.dispatchEvent(new InputEvent('input',{bubbles:true}));checkpoint();
 assertEditor('Inline FAQ edits persist as plain text',state.data.faqs[3].question==='새로운 질문?'&&state.data.faqs[3].answer.includes('\n'));
 travel(-1);await waitCanvas();assertEditor('FAQ answer changes support undo',state.data.faqs[3].answer==='답변을 입력해 주세요.');
 openPanel('faq');$('settingsContent').querySelectorAll('.danger')[3].click();await waitCanvas();assertEditor('FAQ questions can be removed',state.data.faqs.length===originalCount);
 closePanel();
 window.fixtureConflict=true;$('token').value='local-fixture-only';const writesBefore=window.fixtureCalls.filter(c=>c.method==='PATCH').length;let conflict=false;
 try{await publishChanges()}catch(e){conflict=e.message.includes('다른 곳')}
 assertEditor('Concurrent external edits stop publishing without changing the branch',conflict&&window.fixtureCalls.filter(c=>c.method==='PATCH').length===writesBefore);
 window.fixtureConflict=false;
 const assetPath='assets/test-calendar.png';const file=new File([new Uint8Array([137,80,78,71])],'calendar.png',{type:'image/png'});state.uploads.set(assetPath,{file,url:URL.createObjectURL(file)});state.data.calendar=assetPath;
 await publishChanges();
 const tree=window.fixtureCalls.findLast(c=>c.path==='git/trees'&&c.method==='POST');
 assertEditor('Text, JSON and uploads publish together in one tree',tree.payload.tree.length===3&&tree.payload.tree.some(e=>e.path===assetPath));
 const patch=window.fixtureCalls.findLast(c=>c.method==='PATCH');assertEditor('Publishing rejects force updates',patch.payload.force===false&&patch.path==='git/refs/heads/main');
 assertEditor('Successful publish clears dirty state',signature()===state.baseline&&$('publish').disabled);
 }catch(error){tests.push({error:error.message,pass:false})}
 state.baseline=signature();updateStatus();
 const report=node('pre',JSON.stringify(tests,null,2));report.id='test-results';report.style.cssText='position:fixed;inset:0;overflow:auto;background:#fff;color:#111;z-index:10000;padding:30px;margin:0;font:14px/1.6 monospace';document.body.append(report);
}
runEditorTests();
