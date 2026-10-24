'use strict';
const $ = id => document.getElementById(id);
const repository = 'https://api.github.com/repos/ryanpatricktoomey/ryan-english-classes/';
const colors = ['green', 'yellow', 'pink', 'blue'];
const state = { doc: null, data: {}, htmlSha: null, dataSha: null, sourceHTML: '', sourceData: '', uploads: new Map(), history: [], cursor: -1, baseline: '', preview: false, panel: 'schedule', busy: false, activeKey: null, range: null, renderID: 0 };
let historyTimer, toastTimer;

function parseHTML(html) { return new DOMParser().parseFromString(html, 'text/html'); }
function decode64(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
function bytes64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function encode64(value) { return bytes64(new TextEncoder().encode(value)); }
async function gh(path, method = 'GET', payload) {
  const token = $('token').value.trim();
  const response = await fetch(repository + path, {
    method,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.message || 'GitHub error ' + response.status);
  return result;
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function serializedHTML() { return '<!doctype html>\n' + state.doc.documentElement.outerHTML; }
function snapshot() { return { html: serializedHTML(), data: JSON.stringify(state.data), uploads: [...state.uploads] }; }
function signature(item = snapshot()) { return item.html + '\n' + item.data; }
function updateStatus() {
  const dirty = state.doc && signature() !== state.baseline;
  $('saveState').textContent = state.busy ? '게시 중…' : dirty ? '게시하지 않은 변경 사항' : '변경 사항 없음';
  $('publish').disabled = !dirty || state.busy;
  $('undo').disabled = state.cursor <= 0 || state.busy;
  $('redo').disabled = state.cursor >= state.history.length - 1 || state.busy;
}
function checkpoint() {
  clearTimeout(historyTimer);
  const item = snapshot();
  if (state.cursor >= 0 && signature(state.history[state.cursor]) === signature(item)) { updateStatus(); return; }
  state.history.splice(state.cursor + 1);
  state.history.push(item);
  if (state.history.length > 80) state.history.shift();
  state.cursor = state.history.length - 1;
  updateStatus();
}
function changed() {
  clearTimeout(historyTimer); historyTimer = setTimeout(checkpoint, 450); updateStatus();
}
function travel(delta) {
  checkpoint();
  const next = state.cursor + delta;
  if (next < 0 || next >= state.history.length) return;
  const item = state.history[next];
  state.doc = parseHTML(item.html); state.data = JSON.parse(item.data); state.uploads = new Map(item.uploads); state.cursor = next;
  renderCanvas(true); if (!$('settings').hidden) renderSettings(); updateStatus();
}
function shortcut(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); travel(event.shiftKey ? 1 : -1);
  }
}

// Only presentation markup can enter an editable paragraph. Pasted HTML is never accepted.
function cleanMarkup(source) {
  const template = document.createElement('template'); template.innerHTML = source;
  const box = template.content;
  function clean(parent) {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName.toLowerCase();
      if (['script', 'style', 'iframe', 'object', 'svg', 'img', 'input'].includes(tag)) { child.remove(); continue; }
      clean(child);
      if (!['span', 'strong', 'b', 'em', 'i', 'br', 'small'].includes(tag)) {
        if (['div', 'p'].includes(tag)) child.before(document.createElement('br'));
        child.replaceWith(...child.childNodes); continue;
      }
      const chalk = [...child.classList].filter(c => /^chalk-(green|yellow|pink|blue)$/.test(c));
      const decorative = child.getAttribute('aria-hidden') === 'true';
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (chalk.length) child.className = chalk.join(' ');
      if (decorative) child.setAttribute('aria-hidden', 'true');
      if (tag !== 'br' && !child.textContent && !child.querySelector('br')) child.remove();
    }
  }
  clean(box); return template.innerHTML;
}
function editableBlocks(doc) {
  const candidates = [...doc.querySelectorAll('.site-brand,.hero .eyebrow,.hero h1,.hero .lead,.hero-links a,.enrollment-note,main section h2,main section h3,main section p,main section .quote,main section .mission strong,main section .mission div,main section .section-kicker,.schedule-contact,.consult-step span,footer')];
  return candidates.filter(el => !el.closest('#calendar,#classes,#video,#samples,#contact,#month,#faq-list') && !candidates.some(other => other !== el && other.contains(el)));
}
function syncEditable(element) {
  const key = element.dataset.editKey;
  if (!key) return;
  if (key.startsWith('copy:')) {
    const target = editableBlocks(state.doc)[Number(key.split(':')[1])];
    if (target) target.innerHTML = cleanMarkup(element.innerHTML);
  } else if (key.startsWith('class:')) {
    const [, index, field] = key.split(':'); state.data.classes[index][field] = element.textContent;
  } else if (key.startsWith('sample:')) {
    const [, index, field] = key.split(':'); state.data.samples[index][field] = element.textContent;
  } else if (key.startsWith('faq:')) {
    const [, index, field] = key.split(':'); state.data.faqs[index][field] = element.textContent;
  } else if (key === 'contactLabel') state.data.contactLabel = element.textContent;
  changed();
}
function insertText(doc, text) {
  const selection = doc.getSelection(); if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0); range.deleteContents();
  const fragment = doc.createDocumentFragment();
  text.split(/\r?\n/).forEach((line, index) => { if (index) fragment.append(doc.createElement('br')); fragment.append(doc.createTextNode(line)); });
  const last = fragment.lastChild; range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
}
function markEditable(element, key) {
  element.dataset.editKey = key;
  element.contentEditable = state.preview ? 'false' : 'true';
  if (state.preview) return;
  element.spellcheck = false;
  element.addEventListener('focus', () => { state.activeKey = key; $('hint').textContent = '단어나 문장을 선택하면 위에서 서식을 바꿀 수 있어요.'; });
  element.addEventListener('input', () => syncEditable(element));
  element.addEventListener('blur', checkpoint);
  element.addEventListener('paste', event => {
    event.preventDefault(); insertText(element.ownerDocument, event.clipboardData.getData('text/plain')); syncEditable(element);
  });
  element.addEventListener('drop', event => event.preventDefault());
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); insertText(element.ownerDocument, '\n'); syncEditable(element); }
  });
}
function viewData() {
  const data = structuredClone(state.data);
  const resolve = path => state.uploads.get(path)?.url || path;
  data.calendar = resolve(data.calendar);
  (data.samples || []).forEach(sample => { sample.url = resolve(sample.url); sample.preview = resolve(sample.preview); });
  return data;
}
function renderCanvas(preserveScroll = false) {
  if (!state.doc) return;
  const oldDoc = $('canvas').contentDocument;
  const scroll = preserveScroll && oldDoc ? oldDoc.documentElement.scrollTop : 0;
  const clone = state.doc.cloneNode(true);
  clone.querySelectorAll('script').forEach(el => el.remove());
  const base = clone.createElement('base'); base.href = new URL('./', location.href).href; clone.head.prepend(base);
  renderSite(viewData(), clone);
  // The editor uses a poster instead of executing an embedded player.
  const videoFrame = clone.querySelector('#video iframe');
  if (videoFrame) {
    const cover = clone.createElement('a');
    cover.href = state.data.youtube; cover.target = '_blank'; cover.rel = 'noopener';
    cover.className = 'editor-video-cover'; cover.setAttribute('aria-label', '수업 설명 영상');
    const id = new URL(videoFrame.src).pathname.split('/').pop();
    cover.style.cssText = 'display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;border-radius:12px;background:#252427 url(https://i.ytimg.com/vi/'+id+'/hqdefault.jpg) center/cover no-repeat;text-decoration:none';
    const label = clone.createElement('span');label.textContent = state.preview ? '▶ YouTube에서 재생 ↗' : '▶ 수업 설명 영상';label.style.cssText = 'background:#252427dd;color:#fff;padding:12px 18px;border-radius:8px;font-weight:700';cover.append(label);videoFrame.replaceWith(cover);
  }
  editableBlocks(clone).forEach((element, index) => element.dataset.editKey = 'copy:' + index);
  const style = clone.createElement('style'); style.id = 'editor-decoration';
  style.textContent = state.preview ? '' : '[contenteditable=true]{cursor:text;outline:1px dashed transparent;outline-offset:5px;min-width:1ch}[contenteditable=true]:hover{outline-color:#8c8b83}[contenteditable=true]:focus{outline:2px solid #4e9fbb;outline-offset:5px} [data-settings]{cursor:pointer;outline-offset:5px}[data-settings]:hover{outline:2px dashed #4e9fbb}.editor-class-status{cursor:pointer!important}.editor-class-status:focus-visible{outline:3px solid #4e9fbb}.editor-media-label{display:inline-block;font:600 12px/1.5 Pretendard,system-ui;padding:5px 9px;background:#e9e3d6;color:#514a3d;border-radius:5px;margin-bottom:8px}';
  clone.head.append(style);
  const renderID = ++state.renderID;
  $('canvas').onload = () => {
    if (renderID !== state.renderID) return;
    const doc = $('canvas').contentDocument;
    doc.documentElement.style.scrollBehavior = 'auto';
    doc.documentElement.scrollTop = scroll;
    bindCanvas(doc); state.range = null; state.activeKey = null;
  };
  $('canvas').srcdoc = '<!doctype html>\n' + clone.documentElement.outerHTML;
}
function bindCanvas(doc) {
  doc.querySelectorAll('[data-edit-key]').forEach(el => markEditable(el, el.dataset.editKey));
  if (!state.preview) {
    doc.querySelectorAll('#classes .class').forEach((row, index) => {
      const title = row.querySelector('strong'); title.replaceChildren();
      const name = doc.createElement('span'); name.textContent = state.data.classes[index].name;
      const time = doc.createElement('span'); time.textContent = state.data.classes[index].time;
      title.append(name, ' · ', time); markEditable(name, 'class:' + index + ':name'); markEditable(time, 'class:' + index + ':time');
      const status = row.querySelector('.status'); status.classList.add('editor-class-status'); status.tabIndex = 0; status.setAttribute('role', 'button'); status.title = '클릭해서 모집 상태 변경';
      const toggle = () => { checkpoint(); const item = state.data.classes[index]; item.available = !item.available; status.textContent = item.available ? '🟢 신청 가능' : '🔴 마감'; status.classList.toggle('open', item.available); checkpoint(); };
      status.addEventListener('click', toggle); status.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    });
    doc.querySelectorAll('#samples .sample-card').forEach((link, index) => {
      markEditable(link.querySelector('.sample-title'), 'sample:' + index + ':title');
      const description = link.querySelector('.sample-description');
      if (description) markEditable(description, 'sample:' + index + ':description');
      link.dataset.settings = 'samples'; link.title = 'PDF 설정 열기';
    });
    doc.querySelectorAll('#faq-list .faq-item').forEach((item, index) => {
      item.open = true;
      markEditable(item.querySelector('.faq-question'), 'faq:' + index + ':question');
      markEditable(item.querySelector('.faq-answer'), 'faq:' + index + ':answer');
      item.querySelector('summary').addEventListener('click', event => event.preventDefault());
    });
    const faq = doc.getElementById('faq');
    if (faq) {
      faq.hidden = false;
      const controls = doc.createElement('div');
      controls.style.cssText = 'display:flex;gap:10px;margin-top:20px';
      for (const [label, callback] of [['+ 질문 추가', () => mutate(() => (state.data.faqs ||= []).push({question:'새 질문', answer:'답변을 입력해 주세요.'}))], ['FAQ 관리', () => openPanel('faq')]]) {
        const button = doc.createElement('button'); button.textContent = label; button.type = 'button';
        button.style.cssText = 'font:inherit;padding:10px 15px;border:1px solid #bfb6a7;border-radius:7px;background:#fff;cursor:pointer';
        button.onclick = callback; controls.append(button);
      }
      faq.querySelector('.wrap').append(controls);
    }
    const contact = doc.querySelector('#contact .btn'); if (contact) markEditable(contact.querySelector('.contact-label') || contact, 'contactLabel');
    for (const [selector, panel, label] of [['#video', 'media', '영상 바꾸기'], ['#calendar', 'media', '달력 바꾸기'], ['#month', 'schedule', '월 · 수업 횟수 · 가격 수정']]) {
      const element = doc.querySelector(selector); element.dataset.settings = panel; element.title = label; element.tabIndex = 0;
      if (selector !== '#month') { const tag = doc.createElement('span'); tag.className = 'editor-media-label'; tag.textContent = label; element.prepend(tag); }
      if (selector === '#video') { const frame = element.querySelector('iframe'); if (frame) frame.style.pointerEvents = 'none'; }
    }
    doc.addEventListener('selectionchange', () => {
      const selection = doc.getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const start = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest('[data-edit-key]');
      const end = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement).closest('[data-edit-key]');
      if (start && start === end) { state.range = range.cloneRange(); state.activeKey = start.dataset.editKey; }
    });
    doc.addEventListener('keydown', shortcut);
  }
  doc.addEventListener('click', event => {
    const link = event.target.closest('a');
    const settings = event.target.closest('[data-settings]');
    if (!state.preview) {
      if (link) event.preventDefault();
      if (settings && !event.target.closest('[contenteditable=true]')) { event.preventDefault(); openPanel(settings.dataset.settings); }
    } else if (link?.getAttribute('href')?.startsWith('#')) {
      event.preventDefault(); doc.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView();
    }
  });
  doc.querySelectorAll('[data-settings]').forEach(el => el.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === el && !state.preview) { event.preventDefault(); openPanel(el.dataset.settings); } }));
}
function formatSelection(kind) {
  const doc = $('canvas').contentDocument;
  const element = [...doc.querySelectorAll('[data-edit-key]')].find(el => el.dataset.editKey === state.activeKey);
  if (!element || !state.range || state.range.collapsed || !element.contains(state.range.commonAncestorContainer)) { notify('먼저 바꿀 단어나 문장을 선택해 주세요.'); return; }
  checkpoint();
  const range = state.range.cloneRange();
  const before = doc.createRange(); before.selectNodeContents(element); before.setEnd(range.startContainer, range.startOffset);
  const after = doc.createRange(); after.selectNodeContents(element); after.setStart(range.endContainer, range.endOffset);
  const leading = before.cloneContents(), trailing = after.cloneContents(), content = range.cloneContents();
  const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const boldParent = start.closest('strong,b');
  const inheritBold = boldParent && boldParent.contains(range.endContainer);
  let wrapper;
  if (kind === 'clear') {
    wrapper = doc.createElement('span');
    const plain = current => { for(const child of current.childNodes){ if(child.nodeType===3)wrapper.append(doc.createTextNode(child.textContent));else if(child.nodeName==='BR')wrapper.append(doc.createElement('br'));else plain(child); } };
    plain(content);
  } else {
    wrapper = doc.createElement(kind === 'bold' ? 'strong' : 'span');
    if (colors.includes(kind)) {
      content.querySelectorAll('[class]').forEach(el => colors.forEach(color => el.classList.remove('chalk-' + color)));
      wrapper.className = 'chalk-' + kind;
    }
    if (inheritBold && kind !== 'bold') { const bold=doc.createElement('strong');bold.append(content);wrapper.append(bold); }
    else wrapper.append(content);
  }
  element.replaceChildren(leading, wrapper, trailing);
  const selection = doc.getSelection(); const selected=doc.createRange();selected.selectNodeContents(wrapper);selection.removeAllRanges();selection.addRange(selected);state.range=selected.cloneRange();
  syncEditable(element); checkpoint();
}

function field(parent, label, value, callback, options = {}) {
  const id = 'setting-' + (++field.counter);
  const labelEl = node('label', label); labelEl.htmlFor = id;
  const input = node(options.multiline ? 'textarea' : 'input'); input.id = id; if (!options.multiline) input.type = options.type || 'text'; input.value = value ?? '';
  if (options.min !== undefined) input.min = options.min;
  input.addEventListener('input', () => { callback(options.type === 'number' ? Number(input.value) : input.value); changed(); });
  input.addEventListener('change', () => { checkpoint(); renderCanvas(true); });
  parent.append(labelEl, input); return input;
}
field.counter = 0;
function action(parent, label, callback, className = '') { const button = node('button', label, className); button.type = 'button'; button.onclick = callback; parent.append(button); return button; }
function mutate(callback) { checkpoint(); callback(); checkpoint(); renderCanvas(true); renderSettings(); }
function openPanel(panel) {
  checkpoint(); state.panel = panel; $('settings').hidden = false; $('settingsToggle').setAttribute('aria-expanded', 'true'); renderSettings();
}
function closePanel() { $('settings').hidden = true; $('settingsToggle').setAttribute('aria-expanded', 'false'); }
function uploadControl(parent, label, accept, callback, multiple = false) {
  const id = 'upload-' + (++field.counter); const labelEl = node('label', label); labelEl.htmlFor = id;
  const input = node('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple; input.id = id;
  input.onchange = async () => {
    try {
      checkpoint();
      const files = [...input.files];
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) throw Error('파일 하나당 15MB까지 업로드할 수 있어요.');
        const pdf = accept.includes('pdf');
        if (pdf ? !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) : !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('지원하지 않는 파일 형식이에요.');
      }
      for (const file of files) {
        const safe = file.name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = 'assets/' + (accept.includes('pdf') ? 'sample' : 'calendar') + '-' + Date.now() + '-' + crypto.randomUUID().slice(0, 6) + '-' + safe;
        state.uploads.set(path, { file, url: URL.createObjectURL(file) }); callback(path, file);
      }
      checkpoint(); renderCanvas(true); renderSettings(); notify('파일을 준비했어요. 게시할 때 함께 업로드됩니다.');
    } catch (error) { notify(error.message); }
  };
  parent.append(labelEl, input);
}
function renderSettings() {
  const root = $('settingsContent'); root.replaceChildren();
  document.querySelectorAll('[data-panel]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.panel === state.panel)));
  const data = state.data;
  if (state.panel === 'schedule') {
    root.append(node('h2', '월간 정보'));
    field(root, '월', data.month, value => data.month = value);
    field(root, '수업 횟수', data.lessonCount, value => data.lessonCount = value, { type: 'number', min: 0 });
    field(root, '월 수강료 (원)', data.price, value => data.price = value, { type: 'number', min: 0 });
    root.append(node('h2', '수업 시간 · 모집 현황'), node('p', '페이지에서도 반 이름과 시간을 바로 수정할 수 있어요. 모집 상태를 클릭하면 신청 가능 / 마감이 바뀝니다.'));
    (data.classes || []).forEach((item, index) => {
      const card = node('div', undefined, 'setting-card');
      field(card, '반 이름', item.name, value => item.name = value);
      field(card, '시간', item.time, value => item.time = value);
      const row = node('div', undefined, 'setting-row');
      const label = node('label', '신청 가능'); const check = node('input'); check.type = 'checkbox'; check.checked = !!item.available;
      label.prepend(check); check.onchange = () => mutate(() => item.available = check.checked); row.append(label);
      action(row, '반 삭제', () => mutate(() => data.classes.splice(index, 1)), 'danger'); card.append(row); root.append(card);
    });
    action(root, '+ 반 추가', () => mutate(() => data.classes.push({ name: '새 반', time: '', available: false })), 'wide');
  } else if (state.panel === 'media') {
    root.append(node('h2', '수업 설명 영상'));
    field(root, 'YouTube 링크', data.youtube, value => data.youtube = value, { type: 'url' });
    root.append(node('h2', '월간 달력'));
    field(root, '현재 이미지 경로 또는 URL', data.calendar, value => data.calendar = value);
    uploadControl(root, '새 달력 이미지 (PNG / JPG / WebP)', 'image/png,image/jpeg,image/webp', path => data.calendar = path);
  } else if (state.panel === 'samples') {
    root.append(node('h2', '수업 샘플 PDF'));
    (data.samples || []).forEach((sample, index) => {
      const card = node('div', undefined, 'setting-card');
      field(card, '표시할 이름', sample.title, value => sample.title = value);
      field(card, '자료 설명', sample.description, value => sample.description = value, { multiline: true });
      field(card, 'PDF 링크 또는 경로', sample.url, value => sample.url = value);
      field(card, '미리보기 이미지 경로 (선택)', sample.preview, value => sample.preview = value);
      uploadControl(card, '이 PDF 교체', 'application/pdf,.pdf', path => { sample.url = path; delete sample.preview; });
      action(card, '이 자료 삭제', () => mutate(() => data.samples.splice(index, 1)), 'danger wide'); root.append(card);
    });
    uploadControl(root, 'PDF 추가 업로드', 'application/pdf,.pdf', (path, file) => data.samples.push({ title: file.name.replace(/\.pdf$/i, ''), url: path }), true);
    action(root, '+ 기존 PDF 링크 추가', () => mutate(() => data.samples.push({ title: '새 수업 자료', url: '', description: '' })), 'wide');
  } else if (state.panel === 'faq') {
    root.append(node('h2', '자주 묻는 질문'), node('p', '질문과 답변은 페이지에서 직접 수정하거나 여기에서 입력할 수 있어요. 미리보기에서는 답변을 펼치고 접을 수 있습니다.'));
    (data.faqs || []).forEach((item, index) => {
      const card = node('div', undefined, 'setting-card');
      field(card, '질문 ' + (index + 1), item.question, value => item.question = value);
      field(card, '답변', item.answer, value => item.answer = value, {multiline:true});
      action(card, '질문 삭제', () => mutate(() => data.faqs.splice(index, 1)), 'danger wide');
      root.append(card);
    });
    action(root, '+ 질문 추가', () => mutate(() => (data.faqs ||= []).push({question:'새 질문', answer:'답변을 입력해 주세요.'})), 'wide');
  } else if (state.panel === 'design') {
    root.append(node('h2', '분필 색상'), node('p', '칠판에서는 밝은 색상, 크림색 배경에서는 읽기 쉬운 진한 색상을 자동으로 사용합니다.'));
    const names = { green: '초록', yellow: '노랑', pink: '분홍', blue: '파랑' };
    colors.forEach(color => field(root, names[color] + ' 분필', currentColor(color), value => setColor(color, value), { type: 'color' }));
  } else if (state.panel === 'contact') {
    root.append(node('h2', '무료 상담'));
    field(root, 'Instagram DM 링크', data.instagram, value => data.instagram = value, { type: 'url' });
    field(root, '상담 버튼 문구', data.contactLabel || 'Instagram DM으로 무료 상담 문의', value => data.contactLabel = value);
    root.append(node('h2', '검색 결과 설명'));
    field(root, '사이트 설명', state.doc.querySelector('meta[name=description]')?.content || '', value => { let meta = state.doc.querySelector('meta[name=description]'); if (!meta) { meta = state.doc.createElement('meta'); meta.name = 'description'; state.doc.head.append(meta); } meta.content = value; }, { multiline: true });
  }
}
function luminance(rgb) { return rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
function inkColor(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16)); let ink = rgb;
  const background = luminance([238, 233, 223]);
  for (let factor = 1; (background + .05) / (luminance(ink) + .05) < 4.5 && factor > 0; factor -= .02) ink = rgb.map(v => Math.round(v * Math.max(0, factor - .02)));
  return '#' + ink.map(v => v.toString(16).padStart(2, '0')).join('');
}
function currentColor(name) {
  return [...state.doc.querySelector('style').textContent.matchAll(new RegExp('--chalk-' + name + '\\s*:\\s*(#[a-f0-9]{6})', 'gi'))].at(-1)?.[1] || { green: '#a9dfc3', yellow: '#ffe36e', pink: '#ffb9d0', blue: '#a5d9f5' }[name];
}
function setColor(name, value) {
  const palette = Object.fromEntries(colors.map(color => [color, color === name ? value : currentColor(color)]));
  const style = state.doc.querySelector('style');
  style.textContent = style.textContent.replace(/\/\* EDITOR COLORS START \*\/[\s\S]*?\/\* EDITOR COLORS END \*\//g, '') + '\n/* EDITOR COLORS START */\n:root{' + colors.map(color => '--chalk-' + color + ':' + palette[color] + ';--ink-' + color + ':' + inkColor(palette[color]) + ';').join('') + '}\n/* EDITOR COLORS END */';
}

async function loadSite() {
  try {
    let html, data;
    try {
      const [page, info] = await Promise.all([gh('contents/index.html'), gh('contents/site-data.json')]);
      html = decode64(page.content); data = decode64(info.content); state.htmlSha = page.sha; state.dataSha = info.sha;
    } catch {
      const responses = await Promise.all([fetch('./index.html?ts=' + Date.now()), fetch('./site-data.json?ts=' + Date.now())]);
      if (responses.some(response => !response.ok)) throw Error('사이트를 불러오지 못했어요. 페이지를 새로고침해 주세요.');
      [html, data] = await Promise.all(responses.map(response => response.text()));
    }
    state.sourceHTML = html; state.sourceData = data; state.doc = parseHTML(html); state.data = JSON.parse(data);
    state.data.classes ||= []; state.data.samples ||= []; state.data.faqs ||= [];
    state.baseline = signature(); checkpoint(); renderCanvas();
  } catch (error) { $('saveState').textContent = '불러오기 실패'; notify(error.message); }
}
function validateData() {
  if (!state.data.month.trim()) throw Error('월을 입력해 주세요.');
  for (const [label, value] of [['수업 횟수', state.data.lessonCount], ['수강료', state.data.price]]) if (!Number.isFinite(Number(value)) || Number(value) < 0) throw Error(label + '를 확인해 주세요.');
  function safeURL(value) {
    if (!value) return true;
    try { const url = new URL(value, location.href); return ['http:', 'https:'].includes(url.protocol); } catch { return false; }
  }
  for (const value of [state.data.calendar, state.data.youtube, state.data.instagram, ...state.data.samples.flatMap(item => [item.url, item.preview])]) if (!safeURL(value)) throw Error('링크는 https:// 주소 또는 파일 경로를 사용해 주세요.');
  for (const item of state.data.faqs || []) if (!item.question.trim() || !item.answer.trim()) throw Error('각 FAQ의 질문과 답변을 입력해 주세요.');
  for (const sample of state.data.samples) if (!sample.title.trim() || !sample.url.trim()) throw Error('각 PDF의 이름과 링크를 입력해 주세요.');
}
async function publishChanges() {
  if (state.busy) return;
  checkpoint(); validateData();
  if (!$('token').value.trim()) throw Error('GitHub token을 입력해 주세요.');
  state.busy = true; updateStatus(); $('confirmPublish').disabled = true; $('cancelPublish').disabled = true;
  const progress = text => { $('publishStatus').textContent = text; };
  try {
    progress('현재 사이트와 변경 사항을 확인하는 중…');
    const ref = await gh('git/ref/heads/main'); const parent = ref.object.sha;
    const [head, page, info] = await Promise.all([gh('git/commits/' + parent), gh('contents/index.html?ref=' + parent), gh('contents/site-data.json?ref=' + parent)]);
    const pageMatches = state.htmlSha ? page.sha === state.htmlSha : decode64(page.content).trim() === state.sourceHTML.trim();
    const dataMatches = state.dataSha ? info.sha === state.dataSha : decode64(info.content).trim() === state.sourceData.trim();
    if (!pageMatches || !dataMatches) throw Error('다른 곳에서 사이트가 변경되었어요. 현재 수정 내용을 보관한 채 게시를 멈췄습니다. 최신 사이트를 확인한 뒤 다시 편집해 주세요.');
    const html = serializedHTML(); const json = JSON.stringify(state.data, null, 2) + '\n';
    const entries = [];
    const used = new Set([state.data.calendar, ...state.data.samples.flatMap(item => [item.url, item.preview])]);
    for (const [path, upload] of state.uploads) {
      if (!used.has(path)) continue;
      progress('파일 준비 중: ' + upload.file.name);
      const blob = await gh('git/blobs', 'POST', { content: bytes64(new Uint8Array(await upload.file.arrayBuffer())), encoding: 'base64' });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    progress('문구와 월간 정보를 함께 게시하는 중…');
    const [htmlBlob, dataBlob] = await Promise.all([gh('git/blobs', 'POST', { content: html, encoding: 'utf-8' }), gh('git/blobs', 'POST', { content: json, encoding: 'utf-8' })]);
    entries.push({ path: 'index.html', mode: '100644', type: 'blob', sha: htmlBlob.sha }, { path: 'site-data.json', mode: '100644', type: 'blob', sha: dataBlob.sha });
    const tree = await gh('git/trees', 'POST', { base_tree: head.tree.sha, tree: entries });
    const commit = await gh('git/commits', 'POST', { message: 'Update website using visual editor', tree: tree.sha, parents: [parent] });
    // A non-fast-forward update is rejected if another editor publishes in the meantime.
    await gh('git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
    state.htmlSha = htmlBlob.sha; state.dataSha = dataBlob.sha; state.sourceHTML = html; state.sourceData = json;
    state.uploads.clear(); state.history = []; state.cursor = -1; state.baseline = signature(); checkpoint();
    progress('게시 완료! 실제 사이트 반영까지 잠시 기다려 주세요.');
    notify('게시했어요. 실제 사이트 반영까지 잠시 기다려 주세요.');
  } finally {
    state.busy = false; $('confirmPublish').disabled = false; $('cancelPublish').disabled = false; updateStatus();
  }
}

$('undo').onclick = () => travel(-1); $('redo').onclick = () => travel(1);
$('desktop').onclick = () => { $('canvasShell').classList.remove('mobile'); $('desktop').setAttribute('aria-pressed', 'true'); $('mobile').setAttribute('aria-pressed', 'false'); };
$('mobile').onclick = () => { $('canvasShell').classList.add('mobile'); $('desktop').setAttribute('aria-pressed', 'false'); $('mobile').setAttribute('aria-pressed', 'true'); };
$('previewToggle').onclick = () => {
  checkpoint(); state.preview = !state.preview; document.body.classList.toggle('previewing', state.preview);
  $('previewToggle').textContent = state.preview ? '편집으로 돌아가기' : '미리보기'; $('previewToggle').setAttribute('aria-pressed', String(state.preview));
  $('hint').textContent = state.preview ? '방문자에게 보이는 화면이에요.' : '글씨를 클릭하면 바로 수정할 수 있어요.';
  renderCanvas(true);
};
$('settingsToggle').onclick = () => $('settings').hidden ? openPanel(state.panel) : closePanel(); $('closeSettings').onclick = closePanel;
document.querySelectorAll('[data-panel]').forEach(button => button.onclick = () => openPanel(button.dataset.panel));
document.querySelectorAll('.format-actions button').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
$('bold').onclick = () => formatSelection('bold'); $('clearFormat').onclick = () => formatSelection('clear');
document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => formatSelection(button.dataset.color));
$('publish').onclick = () => { checkpoint(); $('publishStatus').textContent = ''; $('connection').showModal(); };
$('cancelPublish').onclick = () => $('connection').close();
$('connection').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
$('connectionForm').onsubmit = async event => { event.preventDefault(); try { await publishChanges(); } catch (error) { $('publishStatus').textContent = '게시하지 못했어요: ' + error.message; } };
document.addEventListener('keydown', event => { if (event.target.matches('input,textarea')) return; shortcut(event); });
window.addEventListener('beforeunload', event => { if (state.doc && signature() !== state.baseline) { event.preventDefault(); event.returnValue = ''; } });
const chromeObserver = new ResizeObserver(() => document.documentElement.style.setProperty('--chrome-height', ($('formatBar').offsetTop + $('formatBar').offsetHeight) + 'px'));
chromeObserver.observe(document.querySelector('.editor-bar')); chromeObserver.observe($('formatBar'));
loadSite();
