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
    row.append(make('strong', '', item.name + ' · ' + item.time),
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
        const frame = make('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + id;
        frame.title = '수업 설명 영상';
        frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        frame.loading = 'lazy';
        get('video').replaceChildren(frame);
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
  if (data.instagram) {
    const contact = make('a', 'btn', '📩 Instagram DM으로 무료 상담 문의');
    contact.href = data.instagram;
    contact.target = '_blank';
    contact.rel = 'noopener';
    get('contact').replaceChildren(contact);
  }
}
