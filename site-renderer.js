/* Shared by the public page and the editor's script-free preview. */
function renderSite(data, root = document) {
  const get = id => root.getElementById(id);
  const make = (tag, className, text) => {
    const element = root.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  get('month').textContent = data.month + ' · ' + data.lessonCount + '회 수업' +
    (data.price ? ' · ' + Number(data.price).toLocaleString('ko-KR') + '원' : '');
  get('classes').replaceChildren();
  (data.classes || []).forEach(item => {
    const row = make('div', 'class');
    const title = make('strong');
    title.append(make('span', 'class-name', item.name), make('span', 'class-time', item.time));
    row.append(title,
      make('span', 'status' + (item.available ? ' open' : ''), item.available ? '🟢 신청 가능' : '🔴 마감'));
    get('classes').append(row);
  });
  if (data.calendar) {
    const image = make('img');
    image.src = data.calendar;
    image.alt = data.month + ' 수업 달력';
    image.loading = 'lazy';
    const link = make('a');
    link.href = data.calendar;
    link.target = '_blank';
    link.rel = 'noopener';
    link.append(image);
    get('calendar').replaceChildren(link);
  }
  if (data.youtube) {
    try {
      const url = new URL(data.youtube);
      let id = url.searchParams.get('v');
      if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
      if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2];
      if (id && /^[\w-]{11}$/.test(id)) {
        const loadPlayer = () => {
          const frame = make('iframe');
          const embed = new URL('https://www.youtube-nocookie.com/embed/' + id);
          embed.searchParams.set('autoplay', '1');
          const start = url.searchParams.get('start') || url.searchParams.get('t');
          if (start && /^\d+s?$/.test(start)) embed.searchParams.set('start', parseInt(start, 10));
          frame.src = embed.href;
          frame.title = '수업 설명 영상';
          frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
          frame.allowFullscreen = true;
          get('video').replaceChildren(frame);
          frame.focus();
        };
        if (data.videoPoster) {
          // Detached editor documents remain script-free and link to YouTube.
          const cover = make(root === document ? 'button' : 'a', 'video-cover');
          if (root === document) {
            cover.type = 'button';
            cover.addEventListener('click', loadPlayer, { once: true });
          } else {
            cover.href = data.youtube;
            cover.target = '_blank';
            cover.rel = 'noopener';
          }
          cover.setAttribute('aria-label', '수업 설명 영상 재생');
          const poster = make('img');
          poster.src = data.videoPoster;
          poster.alt = '';
          poster.width = 1672;
          poster.height = 941;
          poster.loading = 'lazy';
          const play = make('span', 'video-play', '영상 보기 ▶');
          play.setAttribute('aria-hidden', 'true');
          cover.append(poster, play);
          get('video').replaceChildren(cover);
        } else {
          const frame = make('iframe');
          frame.src = 'https://www.youtube-nocookie.com/embed/' + id;
          frame.title = '수업 설명 영상';
          frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
          frame.allowFullscreen = true;
          frame.loading = 'lazy';
          get('video').replaceChildren(frame);
        }
      }
    } catch { /* An invalid video URL should not hide the timetable or contact link. */ }
  }
  const grid = make('div', 'sample-grid');
  (data.samples || []).forEach(sample => {
    const link = make('a', 'sample-card');
    link.href = sample.url;
    link.target = '_blank';
    link.rel = 'noopener';
    if (sample.preview) {
      const image = make('img', 'sample-preview');
      image.src = sample.preview;
      image.alt = sample.title + ' 첫 페이지 미리보기';
      image.loading = 'lazy';
      link.append(image);
    }
    const content = make('span', 'sample-content');
    content.append(make('span', 'sample-title', sample.title));
    if (sample.description) content.append(make('span', 'sample-description', sample.description));
    content.append(make('span', 'sample-action', 'PDF 열어보기 ↗'));
    link.append(content);
    grid.append(link);
  });
  if (data.samples?.length) get('samples').replaceChildren(grid);
  const faq = get('faq-list');
  if (faq) {
    faq.replaceChildren();
    (data.faqs || []).forEach(item => {
      const details = make('details', 'faq-item');
      const summary = make('summary');
      summary.append(make('span', 'faq-question', item.question));
      details.append(summary, make('div', 'faq-answer', item.answer));
      faq.append(details);
    });
    get('faq').hidden = !(data.faqs || []).length;
  }
  const contactButtons = make('div', 'contact-options');
  if (data.instagram) {
    const contact = make('a', 'btn contact-instagram');
    contact.style.gap = '10px';
    const label = make('span', 'contact-label', (data.contactLabel || 'Instagram DM으로 무료 상담 문의').replace(/^📩\s*/u, ''));
    const ns = 'http://www.w3.org/2000/svg';
    const icon = root.createElementNS(ns, 'svg');
    Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', focusable: 'false' }).forEach(([key, value]) => icon.setAttribute(key, value));
    icon.style.flexShrink = '0';
    for (const [tag, attrs] of [['rect', { x: '3', y: '3', width: '18', height: '18', rx: '5' }], ['circle', { cx: '12', cy: '12', r: '4' }], ['circle', { cx: '17.5', cy: '6.5', r: '1', fill: 'currentColor', stroke: 'none' }]]) {
      const shape = root.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, value));
      icon.append(shape);
    }
    contact.append(icon, label);
    contact.href = data.instagram;
    contact.target = '_blank';
    contact.rel = 'noopener';
    contactButtons.append(contact);
  }

  if (data.kakao) {
    const contact = make('a', 'btn contact-kakao');
    contact.href = data.kakao;
    contact.target = '_blank';
    contact.rel = 'noopener';
    const ns = 'http://www.w3.org/2000/svg';
    const icon = root.createElementNS(ns, 'svg');
    Object.entries({viewBox:'0 0 24 24',width:'21',height:'21',fill:'currentColor','aria-hidden':'true'}).forEach(([k,v])=>icon.setAttribute(k,v));
    const path = root.createElementNS(ns, 'path');
    path.setAttribute('d','M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.8 6.7l-1.1 3.7 4.3-2.7c.7.1 1.3.2 2 .2 5.5 0 10-3.5 10-7.9S17.5 3 12 3Z');
    icon.append(path);
    contact.append(icon, make('span','kakao-label',data.kakaoLabel || '카카오톡으로 문의하기'));
    contactButtons.append(contact);
  }
  if (get('contact')) get('contact').replaceChildren(contactButtons);
  const sampleContact = get('sample-contact');
  if (sampleContact) {
    sampleContact.hidden = !contactButtons.children.length;
    sampleContact.replaceChildren(make('p','contact-prompt','수업이 궁금하신가요? 편한 방법으로 문의해 주세요.'), contactButtons.cloneNode(true));
  }
}

// Re-align an initial deep link while asynchronous content above it settles.
// User interaction immediately gives scrolling back to the visitor.
function settleInitialSectionLink() {
  const hash = location.hash;
  if (!hash) return;
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
  if (!target) return;
  let stopped = false, queued = false;
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const stop = () => {
    stopped = true; observer.disconnect(); clearTimeout(timeout);
    events.forEach(type => window.removeEventListener(type, stop));
    window.removeEventListener('hashchange', stop);
  };
  const align = () => {
    if (stopped || queued || location.hash !== hash) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (stopped) return;
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - padding;
      window.scrollTo({top, behavior: 'instant'});
    });
  };
  const observer = new ResizeObserver(align);
  const timeout = setTimeout(stop, 10000);
  events.forEach(type => window.addEventListener(type, stop, {passive:true, once:true}));
  window.addEventListener('hashchange', stop, {once:true});
  document.querySelectorAll('main > *, #calendar, #video, #samples, #classes').forEach(el => observer.observe(el));
  // Images before the destination must load even when the initial anchor skips them.
  document.querySelectorAll('img').forEach(image => {
    if (image.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) image.loading = 'eager';
  });
  document.fonts.ready.then(align);
  align();
}
