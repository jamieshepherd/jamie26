import { marked } from 'marked';
import './styles.css';

const skipBoot = new URLSearchParams(location.search).has('skipBoot');
const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
})[char]);

const markdownFiles = import.meta.glob('./content/*/index.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const cleanInline = (text) => text
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`>#]/g, '')
  .replace(/\\([+\-])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const parseFrontmatter = (source) => {
  const match = source.match(/^\+\+\+\s*\n([\s\S]*?)\n\+\+\+\s*\n?/);
  const metadata = {};
  if (!match) return { metadata, body: source };
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([a-zA-Z0-9_]+)\s*=\s*['\"](.*?)['\"]\s*$/);
    if (pair) metadata[pair[1]] = pair[2];
  }
  return { metadata, body: source.slice(match[0].length) };
};

const articles = Object.entries(markdownFiles).map(([path, source]) => {
  const slug = path.split('/').at(-2);
  const { metadata, body } = parseFrontmatter(source);
  const firstParagraph = body
    .split(/\n\s*\n/)
    .find((block) => block.trim() && !block.trim().startsWith('#') && !block.trim().startsWith('!')) || '';
  const prepared = body
    .replace(/{{<\s*youtube\s+([^ >]+)\s*>}}/g, '<iframe src="https://www.youtube-nocookie.com/embed/$1" title="Embedded video" loading="lazy" allowfullscreen></iframe>')
    .replace(/^\/>\s*$/gm, '')
    .replace(/\]\(\.\/([^)]*)\)/g, `](/posts/${slug}/$1)`);

  return {
    slug,
    title: metadata.title || slug.replaceAll('-', ' '),
    date: metadata.date || '2020-01-01',
    location: metadata.location || 'THE INTERNET',
    body: marked.parse(prepared),
    deck: cleanInline(firstParagraph).slice(0, 215),
  };
}).sort((a, b) => b.date.localeCompare(a.date));

const articleNumbers = new Map(
  [...articles]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((article, index) => [article.slug, index + 1]),
);
const articleNumber = (article) => articleNumbers.get(article.slug);

const formatDate = (date, long = false) => new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: long ? 'long' : 'short',
  day: long ? 'numeric' : undefined,
}).format(new Date(`${date}T12:00:00`)).toUpperCase();

const nodes = document.querySelector('[data-thought-nodes]');
const indexList = document.querySelector('[data-index-list]');

articles.forEach((article, index) => {
  const node = document.createElement('button');
  node.className = 'thought-node';
  node.dataset.article = article.slug;
  node.dataset.date = article.date;
  node.innerHTML = `
    <span class="thought-node__dot"></span>
    <span class="thought-node__copy">
      <small>${String(articleNumber(article)).padStart(2, '0')} / ${formatDate(article.date)}</small>
      <strong>${article.title}</strong>
    </span>`;
  nodes.append(node);

  const row = document.createElement('button');
  row.className = 'archive-row';
  row.dataset.article = article.slug;
  row.innerHTML = `
    <span class="archive-row__n">${String(articleNumber(article)).padStart(2, '0')}</span>
    <span class="archive-row__title">${article.title}</span>
    <time class="archive-row__date">${formatDate(article.date, true)}</time>
    <span class="archive-row__arrow">↗</span>`;
  indexList.append(row);
});

document.querySelector('[data-object-count]').textContent = String(articles.length).padStart(2, '0');
document.querySelector('[data-index-count]').textContent = `${String(articles.length).padStart(2, '0')} OBJECTS`;
const timelineCanvas = document.querySelector('[data-timeline-canvas]');
const timelineContext = timelineCanvas.getContext('2d');
const reduceTimelineMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeline = document.querySelector('[data-orbit]');
const originControl = document.querySelector('.timeline-origin');
const nowControl = document.querySelector('.timeline-now');
const birthTime = Date.UTC(1990, 0, 1);
const usefulTime = Date.UTC(2010, 0, 1);
const millisecondsPerYear = 365.2425 * 86400000;
const worldRadius = 500;
const earlyRadius = 58;
const earlyTurns = 1.15;
const yearsPerTurn = 2;
let timelineLayout;
let timelinePath;
let timelineItems = articles.map((article) => ({
  kind: 'article',
  id: article.slug,
  time: Date.parse(`${article.date}T12:00:00Z`),
  node: nodes.querySelector(`[data-article="${article.slug}"]`),
}));

const mobileTimelineTitle = document.querySelector('[data-mobile-timeline-title]');
const mobileTimelineKind = document.querySelector('[data-mobile-timeline-kind]');
const mobileTimelineDate = document.querySelector('[data-mobile-timeline-date]');
const mobileTimelineOlder = document.querySelector('[data-mobile-timeline-step="older"]');
const mobileTimelineNewer = document.querySelector('[data-mobile-timeline-step="newer"]');
let mobileTimelineIndex = 0;
let mobileTimelineItem = null;

const orderedTimelineItems = () => [...timelineItems].sort((a, b) => b.time - a.time);
const selectMobileTimelineItem = (index = mobileTimelineIndex) => {
  const ordered = orderedTimelineItems();
  timelineItems.forEach((item) => item.node.classList.remove('is-selected'));
  if (!ordered.length) return;
  mobileTimelineIndex = Math.max(0, Math.min(ordered.length - 1, index));
  mobileTimelineItem = ordered[mobileTimelineIndex];
  mobileTimelineItem.node.classList.add('is-selected');
  const article = mobileTimelineItem.kind === 'article'
    ? articles.find((entry) => entry.slug === mobileTimelineItem.id)
    : null;
  mobileTimelineTitle.textContent = article?.title || mobileTimelineItem.preview || 'UNTITLED SIGNAL';
  mobileTimelineKind.textContent = mobileTimelineItem.kind === 'article' ? 'LONG' : 'SHORT';
  mobileTimelineDate.textContent = formatDate(new Date(mobileTimelineItem.time).toISOString().slice(0, 10));
  mobileTimelineOlder.disabled = mobileTimelineIndex >= ordered.length - 1;
  mobileTimelineNewer.disabled = mobileTimelineIndex === 0;
};

mobileTimelineOlder.addEventListener('click', () => selectMobileTimelineItem(mobileTimelineIndex + 1));
mobileTimelineNewer.addEventListener('click', () => selectMobileTimelineItem(mobileTimelineIndex - 1));
document.querySelector('[data-mobile-timeline-go]').addEventListener('click', () => {
  if (!mobileTimelineItem) return;
  if (mobileTimelineItem.kind === 'article') openArticle(mobileTimelineItem.id);
  else window.open(mobileTimelineItem.url, '_blank', 'noopener,noreferrer');
});
selectMobileTimelineItem(0);

let indexFilter = 'long';
const renderIndex = () => {
  const ordered = [...timelineItems]
    .filter((item) => indexFilter === 'long' ? item.kind === 'article' : item.kind === 'signal')
    .sort((a, b) => b.time - a.time);
  indexList.innerHTML = '';
  ordered.forEach((item, index) => {
    const row = document.createElement('button');
    const date = new Date(item.time).toISOString().slice(0, 10);
    row.className = `archive-row${item.kind === 'signal' ? ' archive-row--signal' : ''}`;
    if (item.kind === 'signal') row.dataset.signalUrl = item.url;
    else row.dataset.article = item.id;
    const article = item.kind === 'article' ? articles.find((entry) => entry.slug === item.id) : null;
    const title = article?.title || item.preview;
    row.innerHTML = `
      <span class="archive-row__n">${item.kind === 'signal' ? `S${String(index + 1).padStart(2, '0')}` : String(articleNumber(article)).padStart(2, '0')}</span>
      <span class="archive-row__title">${item.kind === 'signal' ? escapeHtml(title) : title}</span>
      <time class="archive-row__date">${formatDate(date, true)}</time>
      <span class="archive-row__arrow">↗</span>`;
    indexList.append(row);
  });
  document.querySelector('[data-index-count]').textContent = `${String(ordered.length).padStart(2, '0')} ${indexFilter.toUpperCase()}`;
};

renderIndex();
document.querySelectorAll('[data-index-filter]').forEach((button) => button.addEventListener('click', () => {
  indexFilter = button.dataset.indexFilter;
  document.querySelectorAll('[data-index-filter]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderIndex();
}));

const timelineCamera = {
  x: 0, y: 0, z: 1,
  targetX: 0, targetY: 0, targetZ: 1,
  initialized: false,
};

const timelineYears = (time) => Math.max(0, (time - birthTime) / millisecondsPerYear);
const usefulYears = timelineYears(usefulTime);

const worldPointAt = (time, now = Date.now()) => {
  const years = timelineYears(time);
  const totalYears = timelineYears(now);
  let turns;
  let radius;
  if (time <= usefulTime) {
    const progress = Math.min(1, years / usefulYears);
    turns = progress * earlyTurns;
    radius = 5 + (earlyRadius - 5) * progress;
  } else {
    const usefulProgress = Math.min(1, (years - usefulYears) / (totalYears - usefulYears));
    turns = earlyTurns + (years - usefulYears) / yearsPerTurn;
    radius = earlyRadius + (worldRadius - earlyRadius) * usefulProgress;
  }
  const angle = turns * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, radius, angle };
};

const worldToScreen = (point) => {
  const { anchorX, anchorY } = timelineLayout;
  return {
    x: (point.x - timelineCamera.x) * timelineCamera.z + anchorX,
    y: (point.y - timelineCamera.y) * timelineCamera.z + anchorY,
  };
};

const screenToWorld = (x, y, zoom = timelineCamera.z) => ({
  x: timelineCamera.x + (x - timelineLayout.anchorX) / zoom,
  y: timelineCamera.y + (y - timelineLayout.anchorY) / zoom,
});

const positionTimelineItems = () => {
  if (!timelineLayout) return;
  const minimumGap = 10 * 86400000;
  let newerDisplayTime = Infinity;
  [...timelineItems].sort((a, b) => b.time - a.time).forEach((item) => {
    item.displayTime = Math.min(item.time, newerDisplayTime - minimumGap);
    newerDisplayTime = item.displayTime;
    const anchor = worldPointAt(item.displayTime, timelineLayout.now);
    item.anchor = anchor;
    item.x = anchor.x;
    item.y = anchor.y;
  });
};

const applyTimelineDom = () => {
  if (!timelineLayout) return;
  const origin = worldToScreen(worldPointAt(birthTime, timelineLayout.now));
  const edge = worldToScreen(worldPointAt(timelineLayout.now, timelineLayout.now));
  originControl.style.left = `${origin.x}px`;
  originControl.style.top = `${origin.y}px`;
  nowControl.style.left = `${edge.x}px`;
  nowControl.style.top = `${edge.y}px`;
  timelineItems.forEach((item) => {
    const point = worldToScreen(item);
    item.node.style.left = `${point.x}px`;
    item.node.style.top = `${point.y}px`;
    item.node.classList.toggle('thought-node--copy-left', point.x > timelineLayout.width - 230);
    const outOfRange = point.x < -180 || point.x > timelineLayout.width + 180 || point.y < -100 || point.y > timelineLayout.height + 100;
    item.node.style.visibility = outOfRange ? 'hidden' : '';
  });
};

const showOverview = () => {
  timelineCamera.targetX = 0;
  timelineCamera.targetY = 0;
  timelineCamera.targetZ = timelineLayout.minimumZoom;
};

const resizeTimeline = () => {
  const bounds = timeline.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const compact = width < 900;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  timelineCanvas.width = Math.round(width * dpr);
  timelineCanvas.height = Math.round(height * dpr);
  timelineCanvas.style.width = `${width}px`;
  timelineCanvas.style.height = `${height}px`;

  const now = Date.now();
  const anchorX = width * (compact ? .5 : .66);
  const anchorY = height * (compact ? .49 : .52);
  const minimumZoom = Math.max(.3, Math.min(width * (compact ? .86 : .69), height * .9) / (worldRadius * 2));
  timelineLayout = { width, height, dpr, compact, anchorX, anchorY, now, minimumZoom };
  timelinePath = new Path2D();
  const steps = Math.ceil(timelineYears(now) * 90);
  for (let index = 0; index <= steps; index += 1) {
    const time = birthTime + (now - birthTime) * (index / steps);
    const point = worldPointAt(time, now);
    if (index === 0) timelinePath.moveTo(point.x, point.y);
    else timelinePath.lineTo(point.x, point.y);
  }
  positionTimelineItems();
  if (!timelineCamera.initialized || compact) {
    timelineCamera.initialized = true;
    showOverview();
    timelineCamera.x = timelineCamera.targetX;
    timelineCamera.y = timelineCamera.targetY;
    timelineCamera.z = timelineCamera.targetZ;
  } else {
    timelineCamera.targetZ = Math.max(timelineCamera.targetZ, minimumZoom);
    timelineCamera.z = Math.max(timelineCamera.z, minimumZoom);
  }
  applyTimelineDom();
};

const drawTimeline = () => {
  const layout = timelineLayout;
  if (!layout) return;
  const { width, height, dpr, anchorX, anchorY } = layout;
  const ctx = timelineContext;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  timelineCamera.x += (timelineCamera.targetX - timelineCamera.x) * .035;
  timelineCamera.y += (timelineCamera.targetY - timelineCamera.y) * .035;
  timelineCamera.z += (timelineCamera.targetZ - timelineCamera.z) * .035;
  const transformX = anchorX - timelineCamera.x * timelineCamera.z;
  const transformY = anchorY - timelineCamera.y * timelineCamera.z;
  applyTimelineDom();

  ctx.setTransform(
    dpr * timelineCamera.z, 0, 0, dpr * timelineCamera.z,
    dpr * transformX, dpr * transformY,
  );
  const atmosphere = ctx.createRadialGradient(0, 0, 0, 0, 0, worldRadius * 1.08);
  atmosphere.addColorStop(0, 'rgba(114,238,242,.025)');
  atmosphere.addColorStop(.75, 'rgba(114,238,242,.01)');
  atmosphere.addColorStop(1, 'rgba(9,10,8,0)');
  ctx.fillStyle = atmosphere;
  ctx.beginPath();
  ctx.arc(0, 0, worldRadius * 1.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 1 / timelineCamera.z;
  ctx.strokeStyle = 'rgba(114,238,242,.055)';
  for (let month = 0; month < 12; month += 1) {
    const angle = month / 12 * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
    ctx.lineTo(Math.cos(angle) * (worldRadius + 18), Math.sin(angle) * (worldRadius + 18));
    ctx.stroke();
  }

  const nowYear = new Date(layout.now).getUTCFullYear();
  [2010].forEach((year) => {
    const point = worldPointAt(Date.UTC(year, 0, 1), layout.now);
    ctx.strokeStyle = 'rgba(114,238,242,.045)';
    ctx.beginPath();
    ctx.arc(0, 0, point.radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const spiralBreath = reduceTimelineMotion ? .5 : (Math.sin(performance.now() / 2200) + 1) / 2;
  ctx.strokeStyle = 'rgba(114,238,242,.035)';
  ctx.lineWidth = 7 / timelineCamera.z;
  ctx.shadowColor = `rgba(114,238,242,${.14 + spiralBreath * .1})`;
  ctx.shadowBlur = (5 + spiralBreath * 2) / timelineCamera.z;
  ctx.stroke(timelinePath);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(114,238,242,${.2 + spiralBreath * .06})`;
  ctx.lineWidth = 1.1 / timelineCamera.z;
  ctx.stroke(timelinePath);
  ctx.restore();

  timelineItems.forEach(({ anchor, x, y, kind, displayTime }) => {
    if (kind === 'signal') {
      const span = 18 * 86400000;
      const before = worldPointAt(displayTime - span, layout.now);
      const after = worldPointAt(displayTime + span, layout.now);
      ctx.strokeStyle = 'rgba(114,238,242,.46)';
      ctx.lineWidth = 1.5 / timelineCamera.z;
      ctx.beginPath();
      ctx.moveTo(before.x, before.y);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.lineTo(after.x, after.y);
      ctx.stroke();
    }
    if (Math.hypot(x - anchor.x, y - anchor.y) < 3) return;
    ctx.strokeStyle = kind === 'signal' ? 'rgba(114,238,242,.25)' : 'rgba(255,61,129,.22)';
    ctx.lineWidth = 1 / timelineCamera.z;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${layout.compact ? 8 : 9}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
  [2010, 2014, 2018, 2022, nowYear].forEach((year) => {
    const point = worldToScreen(worldPointAt(Date.UTC(year, 0, 1), layout.now));
    if (point.x < -40 || point.x > width + 40 || point.y < -30 || point.y > height + 30) return;
    ctx.strokeStyle = year === nowYear ? 'rgba(255,61,129,.72)' : 'rgba(114,238,242,.32)';
    ctx.beginPath();
    ctx.moveTo(point.x - 5, point.y);
    ctx.lineTo(point.x + 5, point.y);
    ctx.stroke();
    ctx.fillStyle = year === nowYear ? 'rgba(255,61,129,.9)' : 'rgba(114,238,242,.5)';
    ctx.fillText(String(year), point.x + 8, point.y);
  });

  requestAnimationFrame(drawTimeline);
};

resizeTimeline();
requestAnimationFrame(drawTimeline);
window.addEventListener('resize', resizeTimeline, { passive: true });

const zoomTimelineAt = (factor, x = timelineLayout.anchorX, y = timelineLayout.anchorY) => {
  const currentZoom = timelineCamera.targetZ;
  const nextZoom = Math.max(timelineLayout.minimumZoom, Math.min(2.8, currentZoom * factor));
  if (Math.abs(nextZoom - currentZoom) < .0001) return;
  const before = {
    x: timelineCamera.targetX + (x - timelineLayout.anchorX) / currentZoom,
    y: timelineCamera.targetY + (y - timelineLayout.anchorY) / currentZoom,
  };
  timelineCamera.targetX = before.x - (x - timelineLayout.anchorX) / nextZoom;
  timelineCamera.targetY = before.y - (y - timelineLayout.anchorY) / nextZoom;
  timelineCamera.targetZ = nextZoom;
};

timeline.addEventListener('wheel', (event) => {
  if (timelineLayout.compact) return;
  event.preventDefault();
  const bounds = timeline.getBoundingClientRect();
  zoomTimelineAt(Math.exp(-event.deltaY * .0012), event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });

let dragPoint = null;
timeline.addEventListener('pointerdown', (event) => {
  if (timelineLayout.compact) return;
  if (event.target.closest('button')) return;
  dragPoint = { x: event.clientX, y: event.clientY };
  timeline.classList.add('is-dragging');
  timeline.setPointerCapture(event.pointerId);
});
timeline.addEventListener('pointermove', (event) => {
  if (!dragPoint) return;
  const dx = event.clientX - dragPoint.x;
  const dy = event.clientY - dragPoint.y;
  timelineCamera.x -= dx / timelineCamera.z;
  timelineCamera.y -= dy / timelineCamera.z;
  timelineCamera.targetX = timelineCamera.x;
  timelineCamera.targetY = timelineCamera.y;
  dragPoint = { x: event.clientX, y: event.clientY };
});
const endTimelineDrag = () => {
  dragPoint = null;
  timeline.classList.remove('is-dragging');
};
timeline.addEventListener('pointerup', endTimelineDrag);
timeline.addEventListener('pointercancel', endTimelineDrag);

const reader = document.querySelector('[data-reader]');
let currentArticle = 0;

const setLock = () => {
  const overlayOpen = document.querySelector('.panel[aria-hidden="false"], .reader[aria-hidden="false"]');
  document.body.classList.toggle('is-locked', Boolean(overlayOpen));
};

const openArticle = (slug, updateHistory = true) => {
  const index = articles.findIndex((article) => article.slug === slug);
  if (index < 0) return;
  currentArticle = index;
  const article = articles[index];
  document.querySelector('[data-reader-index]').textContent = `OBJECT ${String(articleNumber(article)).padStart(2, '0')}`;
  document.querySelector('[data-reader-date]').textContent = formatDate(article.date, true);
  document.querySelector('[data-reader-location]').textContent = article.location;
  document.querySelector('[data-reader-title]').textContent = article.title;
  document.querySelector('[data-reader-deck]').textContent = article.deck;
  document.querySelector('[data-reader-body]').innerHTML = article.body;
  reader.scrollTop = 0;
  if (skipBoot) reader.style.transition = 'none';
  reader.setAttribute('aria-hidden', 'false');
  setLock();
  if (updateHistory) history.pushState({ article: slug }, '', `#read/${slug}`);
};

const closeReader = (updateHistory = true) => {
  reader.setAttribute('aria-hidden', 'true');
  setLock();
  if (updateHistory && location.hash.startsWith('#read/')) history.pushState({}, '', location.pathname);
};

document.addEventListener('click', (event) => {
  const signalTrigger = event.target.closest('[data-signal-url]');
  if (signalTrigger) {
    window.open(signalTrigger.dataset.signalUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const articleTrigger = event.target.closest('[data-article]');
  if (articleTrigger) openArticle(articleTrigger.dataset.article);
});
document.querySelector('[data-close-reader]').addEventListener('click', () => closeReader());
document.querySelector('[data-next-article]').addEventListener('click', () => {
  openArticle(articles[(currentArticle + 1) % articles.length].slug);
});
document.querySelector('[data-random-article]').addEventListener('click', () => {
  let next = Math.floor(Math.random() * articles.length);
  if (next === currentArticle && articles.length > 1) next = (next + 1) % articles.length;
  openArticle(articles[next].slug);
});

const updateReaderProgress = () => {
  const range = reader.scrollHeight - reader.clientHeight;
  const progress = range > 0 ? Math.min(100, Math.round((reader.scrollTop / range) * 100)) : 0;
  document.querySelector('[data-reader-progress]').textContent = `${String(progress).padStart(3, '0')}%`;
  document.querySelector('[data-reader-progress-bar]').style.width = `${progress}%`;
};
reader.addEventListener('scroll', updateReaderProgress, { passive: true });

const identityPanel = document.querySelector('[data-identity-panel]');
const openPanel = (panel) => {
  document.querySelectorAll('.panel').forEach((item) => item.setAttribute('aria-hidden', String(item !== panel)));
  panel.setAttribute('aria-hidden', 'false');
  setLock();
};
document.querySelectorAll('[data-open-identity]').forEach((button) => button.addEventListener('click', () => openPanel(identityPanel)));
document.querySelectorAll('[data-home]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.panel').forEach((panel) => panel.setAttribute('aria-hidden', 'true'));
  reader.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-index');
  document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item.dataset.mode === 'orbit'));
  setLock();
  if (location.hash) history.pushState({}, '', location.pathname);
}));
document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', () => {
  button.closest('.panel').setAttribute('aria-hidden', 'true');
  setLock();
}));

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
  const indexMode = button.dataset.mode === 'index';
  if (indexMode && window.innerWidth < 900) window.scrollTo({ top: 0, behavior: 'auto' });
  document.body.classList.toggle('is-index', indexMode);
  document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
}));

const tickClock = () => {
  document.querySelector('[data-clock]').textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date());
};
tickClock();
setInterval(tickClock, 1000);

const addTimelineSignals = (records) => {
  const signals = records.flatMap((record, index) => {
    const source = record.source === 'x' ? 'X' : 'BSKY';
    const sourceId = String(record.sourceId || record.id || index);
    const url = record.url;
    const time = Date.parse(record.createdAt);
    if (!Number.isFinite(time) || !record.text || !url) return [];
    const node = document.createElement('button');
    node.className = 'thought-node thought-node--signal';
    node.dataset.signalUrl = url;
    node.title = record.text;
    const preview = record.text.replace(/\s+/g, ' ').trim();
    node.innerHTML = `
      <span class="thought-node__dot"></span>
      <span class="thought-node__copy">
        <small>SHORT SIGNAL / ${source} / ${formatDate(new Date(time).toISOString().slice(0, 10))}</small>
        <strong>${escapeHtml(preview.slice(0, 92))}${preview.length > 92 ? '…' : ''}</strong>
      </span>`;
    nodes.append(node);
    return [{ kind: 'signal', id: `signal-${record.source}-${sourceId}`, time, node, url, preview }];
  });

  timelineItems = [...timelineItems.filter((item) => item.kind !== 'signal'), ...signals];
  document.querySelector('[data-object-count]').textContent = String(timelineItems.length).padStart(2, '0');
  renderIndex();
  positionTimelineItems();
  selectMobileTimelineItem(0);
};

const loadSignals = async () => {
  try {
    const response = await fetch('/api/signals?limit=1000');
    if (!response.ok) throw new Error(`Signal API returned ${response.status}`);
    const data = await response.json();
    if (!data.signals?.length) throw new Error('Signal archive is empty');
    addTimelineSignals(data.signals);
    return;
  } catch {
    // Local Vite development and fresh deployments fall back to Bluesky directly.
  }

  try {
    const response = await fetch('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=jamie.sh&limit=25&filter=posts_no_replies');
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const data = await response.json();
    const records = data.feed.flatMap((item) => {
      const post = item.post;
      if (!post?.record?.text || item.reason || post.record.reply) return [];
      const sourceId = post.uri.split('/').at(-1);
      return [{
        source: 'bluesky',
        sourceId,
        createdAt: post.record.createdAt || post.indexedAt,
        text: post.record.text,
        url: `https://bsky.app/profile/${post.author.handle}/post/${sourceId}`,
      }];
    });
    if (!records.length) throw new Error('No transmissions found');
    addTimelineSignals(records);
  } catch {
    // The long-form timeline remains fully usable when every feed is unavailable.
  }
};
loadSignals();

const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d');
let stars = [];
let pointer = { x: .5, y: .5 };
let frame;

const resizeField = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.min(135, Math.floor((window.innerWidth * window.innerHeight) / 9000));
  stars = Array.from({ length: count }, (_, index) => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + .2,
    depth: Math.random(), phase: index * .7,
  }));
};

const drawField = (time = 0) => {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  stars.forEach((star) => {
    const driftX = (pointer.x - .5) * 18 * star.depth;
    const driftY = (pointer.y - .5) * 18 * star.depth;
    const x = star.x * window.innerWidth + driftX;
    const y = star.y * window.innerHeight + driftY;
    const flicker = .18 + Math.sin(time * .001 + star.phase) * .12;
    ctx.beginPath();
    ctx.arc(x, y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(231,229,217,${flicker})`;
    ctx.fill();
  });
  frame = requestAnimationFrame(drawField);
};
resizeField();
drawField();
window.addEventListener('resize', resizeField);
window.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
}, { passive: true });

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) cancelAnimationFrame(frame);

document.querySelectorAll('.magnetic').forEach((element) => {
  element.addEventListener('pointermove', (event) => {
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * .16;
    const y = (event.clientY - rect.top - rect.height / 2) * .16;
    element.style.translate = `${x}px ${y}px`;
  });
  element.addEventListener('pointerleave', () => { element.style.translate = ''; });
});

const boot = document.querySelector('[data-boot]');
const bootPercent = document.querySelector('[data-boot-percent]');
const bootStart = performance.now();
if (skipBoot) boot.style.display = 'none';
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('preload')));
const animateBoot = (now) => {
  const progress = Math.min(100, Math.round(((now - bootStart) / 1100) * 100));
  bootPercent.textContent = String(progress).padStart(3, '0');
  if (progress < 100) requestAnimationFrame(animateBoot);
  else setTimeout(() => boot.classList.add('is-gone'), 120);
};
if (!skipBoot) requestAnimationFrame(animateBoot);

const handleHash = () => {
  const match = location.hash.match(/^#read\/(.+)$/);
  if (match) openArticle(match[1], false);
  else if (reader.getAttribute('aria-hidden') === 'false') closeReader(false);
};
window.addEventListener('popstate', handleHash);
if (skipBoot) handleHash();
else setTimeout(handleHash, 1300);

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (reader.getAttribute('aria-hidden') === 'false') closeReader();
  document.querySelectorAll('.panel[aria-hidden="false"]').forEach((panel) => panel.setAttribute('aria-hidden', 'true'));
  setLock();
});
