import { type Article, articleById, searchArticles } from './data.js';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function articleHref(id: string, runId: string): string {
  return `/scenario/encyclopedia/article/${encodeURIComponent(id)}?runId=${encodeURIComponent(runId)}`;
}

function articleLink(id: string, runId: string, label?: string): string {
  const article = articleById(id);
  if (!article) return escapeHtml(label ?? id);
  return `<a href="${articleHref(id, runId)}" data-article-id="${escapeHtml(id)}">${escapeHtml(label ?? article.title)}</a>`;
}

function searchLink(query: string, runId: string, label = query): string {
  return `<a href="/scenario/encyclopedia/results?runId=${encodeURIComponent(runId)}&search=${encodeURIComponent(query)}" data-search-query="${escapeHtml(query)}">${escapeHtml(label)}</a>`;
}

function infoButton(label: string): string {
  return `<button class="text-action" type="button" data-local-info="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function shell(
  title: string,
  content: string,
  runId: string,
  options: {
    toc?: string;
    searchQuery?: string;
    page?: 'main' | 'search' | 'article';
  } = {},
): string {
  const main = `/scenario/encyclopedia?runId=${encodeURIComponent(runId)}`;
  const searchValue = escapeHtml(options.searchQuery ?? '');
  const toc =
    options.toc ??
    `<div class="vector-toc-heading">Contents <span class="quiet">hide</span></div><ul><li><a href="#mw-content-text">(Top)</a></li><li><a href="#featured-article">From today's featured article</a></li><li><a href="#did-you-know">Did you know ...</a></li><li><a href="#in-the-news">In the news</a></li><li><a href="#on-this-day">On this day</a></li></ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - Wikipedia</title><link rel="icon" type="image/svg+xml" href="/scenario/encyclopedia/assets/wiki-mark.svg?runId=${encodeURIComponent(runId)}"><style>${css}</style></head><body>
<a class="jump-link" href="#mw-content-text">Jump to content</a>
<header class="mw-header" role="banner"><div class="header-inner">
  <button class="icon-button menu-toggle" id="menu-toggle" aria-label="Main menu" aria-expanded="true" title="Main menu"><span class="hamburger">☰</span></button>
  <a class="brand" href="${main}" data-go-home aria-label="Wikipedia main page"><img src="/scenario/encyclopedia/assets/wiki-mark.svg?runId=${encodeURIComponent(runId)}" alt="Wikipedia logo"><span class="wordmark"><strong>WIKIPEDIA</strong><small>The Free Encyclopedia</small></span></a>
  <form class="header-search" id="header-search" role="search"><div class="search-combobox"><span class="glass">⌕</span><input id="wiki-search" name="search" type="search" aria-label="Search Wikipedia" placeholder="Search Wikipedia" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="suggestions" value="${searchValue}"><div id="suggestions" class="suggestions" role="listbox" hidden></div></div><button type="submit">Search</button></form>
  <nav class="personal" aria-label="Personal tools">${infoButton('Donate')}${infoButton('Create account')}${infoButton('Log in')}<button class="icon-button" type="button" data-local-info="More options" title="More options" aria-label="More options">⋯</button></nav>
</div></header>
<div class="page-grid"><aside id="left-sidebar" class="left-sidebar" aria-label="Contents"><div class="sticky-sidebar">${toc}</div></aside>
<main class="mw-page-container" id="mw-content-text"><div class="page-head"><h1>${escapeHtml(title)}</h1><button class="language-button" type="button" data-local-info="Languages" aria-label="Languages"><span>文A</span> ${options.page === 'article' ? '55' : '349'} languages <span>⌄</span></button></div>
<nav class="page-tabs" aria-label="Page tabs"><div class="tab-group"><a class="selected" href="#mw-content-text">${options.page === 'search' ? 'Search' : options.page === 'article' ? 'Article' : 'Main Page'}</a>${options.page !== 'search' ? infoButton('Talk') : ''}</div><div class="tab-group secondary"><a class="selected" href="#mw-content-text">Read</a>${infoButton('View source')}${infoButton('View history')}<button id="tools-toggle" type="button">Tools⌄</button></div></nav>
<div id="preview-notice" class="preview-notice" role="status" hidden><span id="preview-notice-text"></span><button id="preview-notice-close" type="button" aria-label="Close preview notice">×</button></div><div class="main-content">${content}</div><footer id="site-footer" class="site-footer"><p>This page was last edited on 19 August 2026. Text is available under the Creative Commons Attribution-ShareAlike License; additional terms may apply.</p><p>${infoButton('Privacy policy')} · ${infoButton('About Wikipedia')} · ${infoButton('Disclaimers')} · ${infoButton('Contact Wikipedia')} · ${infoButton('Code of Conduct')}</p></footer></main>
<aside class="right-sidebar" aria-label="Appearance and tools"><div class="sticky-sidebar"><section class="appearance"><div class="side-heading">Appearance <button id="appearance-toggle" type="button" aria-label="Hide appearance">hide</button></div><div id="appearance-controls"><div class="setting-heading">Text</div><label><input type="radio" name="text-size" value="small"> Small</label><label><input type="radio" name="text-size" value="standard" checked> Standard</label><label><input type="radio" name="text-size" value="large"> Large</label><div class="setting-heading">Width</div><label><input type="radio" name="width" value="standard" checked> Standard</label><label><input type="radio" name="width" value="wide"> Wide</label><div class="setting-heading">Color</div><label><input type="radio" name="color" value="automatic" checked> Automatic</label><label><input type="radio" name="color" value="light"> Light</label><label><input type="radio" name="color" value="dark"> Dark</label></div></section><section id="tools-panel" class="tools-panel" hidden><div class="side-heading">Tools</div>${infoButton('What links here')}${infoButton('Related changes')}${infoButton('Permanent link')}${infoButton('Page information')}${infoButton('Cite this page')}</section></div></aside></div>
<script>${clientScript(runId)}</script></body></html>`;
}

function homePanel(
  id: string,
  heading: string,
  body: string,
  tint: 'green' | 'blue' | 'violet' = 'green',
): string {
  return `<section class="home-panel ${tint}" id="${id}"><h2>${heading}</h2><div class="panel-body">${body}</div></section>`;
}

export function renderHome(runId: string): string {
  const intro = `<div class="welcome"><h2>Welcome to <span>Wikipedia</span>,</h2><p>the free encyclopedia that anyone can edit.</p><small>${infoButton('Active editors')} · ${infoButton('Article count')} · ${infoButton('English language edition')}</small></div>`;
  const featured = homePanel(
    'featured-article',
    "From today's featured article",
    `<div class="float-illustration"><img src="/scenario/encyclopedia/assets/featured.svg?runId=${encodeURIComponent(runId)}" alt="Illustrated historical portrait"><span>Mary Mallon, c. 1909</span></div><p><strong>${articleLink('mary-mallon', runId)}</strong> (1869–1938), often called Typhoid Mary, was an Irish-born cook in the United States whose story became central to debates about disease carriers and public health. Investigators connected her work in several households with outbreaks of typhoid fever. She spent years in isolation on North Brother Island.</p><p>Her case continues to raise questions about individual liberty, medical uncertainty and the treatment of people who carry an infection without symptoms. ${articleLink('mary-mallon', runId, 'Full article...')}</p><div class="panel-foot">Recently featured: ${articleLink('kurt-godel', runId)} · ${articleLink('formal-system', runId)}</div>`,
  );
  const dyk = homePanel(
    'did-you-know',
    'Did you know ...',
    `<ul class="dense-list"><li>... that ${searchLink('early mechanical calculator', runId, 'an early mechanical calculator')} could perform repeated addition with a hand crank?</li><li>... that a tiny ${searchLink('marine snail', runId)} can survive in water with very little oxygen?</li><li>... that ${articleLink('kurt-godel', runId)} later worked on questions in cosmology?</li><li>... that a preserved ${searchLink('mountain railway', runId)} still uses wooden carriages built before 1930?</li><li>... that ${searchLink('community astronomers', runId)} helped identify a previously overlooked variable star?</li></ul>`,
    'blue',
  );
  const news = homePanel(
    'in-the-news',
    'In the news',
    `<ul class="dense-list"><li>Researchers publish a new survey of the ${searchLink('southern night sky', runId)}.</li><li>A major restoration of a ${searchLink('historic observatory', runId)} is completed.</li><li>The ${searchLink('international science prize', runId)} announces its annual recipients.</li><li>Several countries agree on a revised ${searchLink('marine conservation', runId)} framework.</li></ul><div class="panel-foot">Ongoing: ${searchLink('current events', runId, 'Current events')} · ${searchLink('recent deaths', runId, 'Recent deaths')}</div>`,
    'blue',
  );
  const day = homePanel(
    'on-this-day',
    'On this day',
    `<p><strong>September 23</strong>: Celebrate Bisexuality Day</p><ul class="dense-list"><li><strong>1803</strong> – The Battle of Assaye took place during the Second Anglo-Maratha War.</li><li><strong>1884</strong> – A shipwreck near Cape Virgenes helped spark a gold rush.</li><li><strong>1983</strong> – Gulf Air Flight 771 was destroyed while approaching the United Arab Emirates.</li><li><strong>1997</strong> – U2 performed in Sarajevo, the first major concert in the city after the Bosnian War.</li></ul><div class="panel-foot">More anniversaries: ${searchLink('September 22 anniversaries', runId, 'September 22')} · ${searchLink('September 24 anniversaries', runId, 'September 24')}</div>`,
  );
  const featureList = homePanel(
    'featured-list',
    "From today's featured list",
    `<p>The ${articleLink('punjab-legislative-assembly', runId)} has 117 constituencies. Its members are directly elected from single-seat constituencies for terms of up to five years.</p><p>In this list, each constituency appears with its district, reservation status and electoral history. ${articleLink('punjab-legislative-assembly', runId, 'Full list...')}</p>`,
  );
  const other = homePanel(
    'other-areas',
    'Other areas of Wikipedia',
    `<ul class="dense-list"><li>${infoButton('Community portal')} – The central hub for editors, projects and announcements.</li><li>${infoButton('Village pump')} – Discussion about policies and technical issues.</li><li>${infoButton('Help desk')} – Questions about using and editing Wikipedia.</li><li>${infoButton('Reference desk')} – Research questions on encyclopedic topics.</li></ul>`,
    'violet',
  );
  const sisters = homePanel(
    'sister-projects',
    "Wikipedia's sister projects",
    `<p>Wikipedia is written by volunteers and hosted by the Wikimedia Foundation, which also supports these projects:</p><div class="sister-grid"><span>◈ ${infoButton('Commons')}<small>Free media repository</small></span><span>◆ ${infoButton('Wikidata')}<small>Free knowledge base</small></span><span>▣ ${infoButton('Wikisource')}<small>Free-content library</small></span><span>◉ ${infoButton('Wikivoyage')}<small>Free travel guide</small></span></div>`,
    'violet',
  );
  const languages = homePanel(
    'languages',
    'Wikipedia languages',
    `<p>This local preview includes English articles only. Other language editions are outside its offline reading set.</p><div class="language-grid">${['العربية', 'Deutsch', 'Español', 'Français', 'Italiano', '日本語', 'Português', 'Русский', '中文'].map(infoButton).join('')}</div>`,
    'violet',
  );
  return shell(
    'Main Page',
    `${intro}<div class="home-columns"><div>${featured}${dyk}${day}${other}</div><div>${news}${featureList}${sisters}${languages}</div></div>`,
    runId,
    { page: 'main' },
  );
}

function highlight(text: string, query: string): string {
  const words =
    query.match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 3) ?? [];
  if (words.length === 0) return escapeHtml(text);
  const escaped = words.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const pattern = new RegExp(`(${escaped.join('|')})`, 'ig');
  return text
    .split(pattern)
    .map((part) =>
      words.some((word) => word.toLowerCase() === part.toLowerCase())
        ? `<strong class="searchmatch">${escapeHtml(part)}</strong>`
        : escapeHtml(part),
    )
    .join('');
}

export function renderSearch(
  runId: string,
  query: string,
  pageNumber: number,
): string {
  const matches = searchArticles(query);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(Math.max(pageNumber, 1), totalPages);
  const results = matches.slice((page - 1) * pageSize, page * pageSize);
  const resultMarkup = results
    .map(
      (article) =>
        `<li class="search-result"><div class="result-icon">W</div><div><h3>${articleLink(article.id, runId)}</h3><p class="result-snippet">${highlight(article.description, query)} ${highlight(article.subtitle, query)}</p><div class="result-meta">${escapeHtml(article.size)} – ${escapeHtml(article.updated)}</div></div></li>`,
    )
    .join('');
  const queryParam = encodeURIComponent(query);
  const pager =
    matches.length > pageSize
      ? `<nav class="pagination" aria-label="Search results pages">${page > 1 ? `<a href="/scenario/encyclopedia/results?runId=${encodeURIComponent(runId)}&search=${queryParam}&page=${page - 1}">Previous</a>` : ''}${Array.from({ length: totalPages }, (_, index) => `<a ${index + 1 === page ? 'aria-current="page"' : ''} href="/scenario/encyclopedia/results?runId=${encodeURIComponent(runId)}&search=${queryParam}&page=${index + 1}">${index + 1}</a>`).join('')}${page < totalPages ? `<a href="/scenario/encyclopedia/results?runId=${encodeURIComponent(runId)}&search=${queryParam}&page=${page + 1}">Next</a>` : ''}</nav>`
      : '';
  const body = `<div class="search-page"><form id="results-search" class="results-search" role="search"><input name="search" aria-label="Search Wikipedia" value="${escapeHtml(query)}"><button type="submit">Search</button></form><div class="search-result-count">${matches.length ? `Results ${(page - 1) * pageSize + 1} – ${Math.min(page * pageSize, matches.length)} of ${matches.length}` : 'No results found'}</div><nav class="search-categories" aria-label="Search categories"><a class="selected" href="#search-results">Content pages</a>${infoButton('Multimedia search')}${infoButton('Everything search')}${infoButton('Advanced search')}</nav><p class="no-page">${matches.length ? `Pages matching “<strong>${escapeHtml(query)}</strong>” are listed below.` : `No local page matches “<strong>${escapeHtml(query)}</strong>”. Try another topic or ${infoButton('Create a draft')}.`}</p><div class="search-list-head">Search results <span>⌄ Relevance</span></div><ol id="search-results" class="search-results">${resultMarkup || '<li>No matching pages were found. Try fewer or different words.</li>'}</ol>${pager}<section class="search-bottom"><h2>Search in other projects</h2><p>Other Wikimedia projects are outside this offline preview.</p></section></div>`;
  return shell('Search results', body, runId, {
    page: 'search',
    searchQuery: query,
    toc: '<div class="vector-toc-heading">Contents</div><p class="quiet">Search results</p>',
  });
}

function tocForArticle(article: Article): string {
  let sectionNumber = 0;
  let subsectionNumber = 0;
  return `<div class="vector-toc-heading">Contents <button id="toc-toggle" type="button">hide</button></div><ul id="toc-list"><li><a href="#mw-content-text">(Top)</a></li>${article.sections
    .map((section) => {
      if (section.level === 2) {
        sectionNumber++;
        subsectionNumber = 0;
      } else subsectionNumber++;
      const number =
        section.level === 2
          ? `${sectionNumber}`
          : `${sectionNumber}.${subsectionNumber}`;
      return `<li class="toc-level-${section.level}"><a href="#${escapeHtml(section.id)}"><span>${number}</span> ${escapeHtml(section.heading)}</a></li>`;
    })
    .join(
      '',
    )}<li><a href="#See_also">See also</a></li><li><a href="#References">References</a></li><li><a href="#External_links">External links</a></li></ul>`;
}

function articleIntro(article: Article, runId: string): string {
  if (article.id === 'godel-incompleteness') {
    return `<div class="hatnote">For the earlier result connecting logical validity and provability, see ${articleLink('godel-completeness', runId)}.</div><div class="article-badge">✓ <strong>Page version status</strong> &nbsp; This is an accepted version of this page.</div><p><strong>Gödel's incompleteness theorems</strong> are two theorems of ${articleLink('formal-system', runId, 'mathematical logic')} that concern the limits of provability in formal axiomatic theories. ${articleLink('kurt-godel', runId, 'Kurt Gödel')} published them in 1931, changing how mathematicians understand formal foundations.<sup><a href="#ref-1">[1]</a></sup></p><p>Informally, the first theorem says that a consistent formal system rich enough for arithmetic cannot decide every arithmetical statement. The second says that such a system cannot prove its own consistency by its ordinary internal means. The hypotheses matter: neither claim applies to every formal language or every mathematical theory.</p><p>The results have an important relationship with ${articleLink('halting-problem', runId, 'computability')}, the philosophy of mathematics and Hilbert’s program. They are sometimes confused with Gödel’s earlier ${articleLink('godel-completeness', runId, 'completeness theorem')}, a separate result about first-order logic.</p>`;
  }
  return article.introduction
    .map(
      (paragraph, index) =>
        `<p>${index === 0 ? `<strong>${escapeHtml(article.title)}</strong> ` : ''}${escapeHtml(index === 0 ? paragraph.replace(new RegExp(`^${article.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '') : paragraph)}</p>`,
    )
    .join('');
}

export function renderArticle(runId: string, article: Article): string {
  const sections = article.sections
    .map(
      (section) =>
        `<section class="article-section" id="${escapeHtml(section.id)}"><h${section.level}>${escapeHtml(section.heading)} <button class="heading-edit text-action" type="button" data-local-info="Edit section">[edit]</button></h${section.level}>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${section.id === 'First_incompleteness_theorem' ? '<div class="formula" aria-label="Formal expression for undecidability">T ⊬ G<sub>T</sub> &nbsp; and &nbsp; T ⊬ ¬G<sub>T</sub></div>' : ''}${section.id === 'Second_incompleteness_theorem' ? '<div class="formula" aria-label="Formal expression for consistency">T ⊬ Con(T)</div>' : ''}</section>`,
    )
    .join('');
  const related = article.related
    .map((id) => `<li>${articleLink(id, runId)}</li>`)
    .join('');
  const box = `<aside class="article-infobox"><div class="infobox-head">${escapeHtml(article.title)}</div><img src="/scenario/encyclopedia/assets/logic-diagram.svg?runId=${encodeURIComponent(runId)}" alt="Diagram of formal proof and undecidable statement"><p>Formal reasoning can encode claims about its own proofs.</p><dl><dt>Field</dt><dd>Mathematical logic</dd><dt>Published</dt><dd>1931</dd><dt>Author</dt><dd>${articleLink('kurt-godel', runId)}</dd></dl></aside>`;
  const content = `<article class="encyclopedia-article">${box}${articleIntro(article, runId)}<div class="short-description">${escapeHtml(article.subtitle)}</div>${sections}<section id="See_also" class="article-section"><h2>See also ${infoButton('Edit section')}</h2><ul class="article-list">${related}</ul></section><section id="References" class="article-section"><h2>References ${infoButton('Edit section')}</h2><ol class="article-list references"><li id="ref-1">Gödel, K. (1931). “On formally undecidable propositions of Principia Mathematica and related systems.”</li><li>Smith, P. (2013). <i>An Introduction to Gödel's Theorems</i>. Cambridge University Press.</li><li>Raatikainen, P. “Gödel's Incompleteness Theorems.” <i>Stanford Encyclopedia of Philosophy</i>.</li></ol></section><section id="External_links" class="article-section"><h2>External links ${infoButton('Edit section')}</h2><ul class="article-list"><li>${infoButton('Wikimedia Commons: mathematical logic')}</li><li>${infoButton('Wikidata item')}</li></ul></section><div class="categories">Categories: ${searchLink('mathematical logic', runId, 'Mathematical logic')} · ${searchLink('theorems in logic', runId, 'Theorems in logic')} · ${searchLink('foundations of mathematics', runId, 'Foundations of mathematics')}</div></article>`;
  return shell(article.title, content, runId, {
    page: 'article',
    toc: tocForArticle(article),
  });
}

export function wikiMarkSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58"><defs><radialGradient id="g"><stop stop-color="#fff"/><stop offset="1" stop-color="#cbd0d5"/></radialGradient></defs><circle cx="29" cy="29" r="26" fill="url(#g)" stroke="#8e959d"/><path d="M8 29h42M13 18h32M13 40h32M29 3c-7 12-10 38 0 52M29 3c7 12 10 38 0 52" fill="none" stroke="#a4abb2" stroke-width="1.2"/><text x="15" y="29" fill="#535b64" font-family="Georgia,serif" font-size="12">W</text><text x="31" y="40" fill="#535b64" font-family="Georgia,serif" font-size="11">Ω</text></svg>`;
}

export function featuredSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 240 280"><rect width="240" height="280" fill="#c8c5b6"/><rect x="13" y="13" width="214" height="254" fill="#e1dac7" stroke="#8b877a"/><ellipse cx="120" cy="114" rx="51" ry="66" fill="#9e907f"/><path d="M38 251c7-75 50-98 82-98s75 23 82 98" fill="#615d5a"/><path d="M81 87c2-42 76-52 82 0-15-12-66-12-82 0" fill="#554a40"/><path d="M101 115h12m20 0h12" stroke="#4b443c" stroke-width="3"/><path d="M107 147q13 8 28 0" fill="none" stroke="#6d5c50" stroke-width="2"/><text x="120" y="273" text-anchor="middle" font-family="Georgia,serif" font-size="11" fill="#5f5b52">ARCHIVAL PORTRAIT</text></svg>`;
}

export function logicSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="168" viewBox="0 0 300 168"><rect width="300" height="168" fill="#f4f6f7"/><rect x="18" y="29" width="96" height="42" rx="5" fill="#dce7f2" stroke="#8aa9c6"/><text x="66" y="55" text-anchor="middle" font-family="serif" font-size="15">Axioms</text><path d="M114 50h39" stroke="#627b91" stroke-width="2"/><path d="m146 44 9 6-9 6" fill="none" stroke="#627b91" stroke-width="2"/><rect x="157" y="29" width="125" height="42" rx="5" fill="#e7ecde" stroke="#a5b692"/><text x="220" y="55" text-anchor="middle" font-family="serif" font-size="15">Proofs</text><path d="M220 71v35H102" fill="none" stroke="#627b91" stroke-width="2"/><path d="m109 99-9 7 9 7" fill="none" stroke="#627b91" stroke-width="2"/><rect x="18" y="106" width="164" height="42" rx="5" fill="#f4e4dd" stroke="#c3a295"/><text x="100" y="133" text-anchor="middle" font-family="serif" font-size="15">Undecidable G</text></svg>`;
}

function clientScript(runId: string): string {
  return `
const RUN_ID = ${JSON.stringify(runId)};
const API = '/api/encyclopedia/' + encodeURIComponent(RUN_ID) + '/';
const PAGE = '/scenario/encyclopedia/';
async function post(path, payload) {
  const response = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function showError(message) {
  let status = document.getElementById('site-notice');
  if (!status) { status = document.createElement('div'); status.id = 'site-notice'; status.role = 'alert'; document.querySelector('.main-content').prepend(status); }
  status.textContent = message;
}
function showInfo(label) {
  const notice = document.getElementById('preview-notice');
  document.getElementById('preview-notice-text').textContent = label + ' is outside this local reading-and-search preview. Article links, search, contents and appearance controls work here.';
  notice.hidden = false;
  notice.scrollIntoView({ block: 'nearest' });
}
document.getElementById('preview-notice-close')?.addEventListener('click', () => {
  document.getElementById('preview-notice').hidden = true;
});
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-local-info]');
  if (action) showInfo(action.dataset.localInfo);
});
async function search(query) {
  const value = query.trim();
  if (!value) { showError('Enter a search term.'); return; }
  try {
    await post('search', { query: value });
    location.assign(PAGE + 'results?runId=' + encodeURIComponent(RUN_ID) + '&search=' + encodeURIComponent(value));
  } catch (error) { showError(String(error)); }
}
for (const form of [document.getElementById('header-search'), document.getElementById('results-search')]) {
  if (!form) continue;
  form.addEventListener('submit', (event) => { event.preventDefault(); search(form.querySelector('input[name="search"]').value); });
}
const input = document.getElementById('wiki-search');
const suggestions = document.getElementById('suggestions');
let suggestionTimer;
let suggestionRequest = 0;
input.addEventListener('input', () => {
  clearTimeout(suggestionTimer);
  const query = input.value.trim();
  if (query.length < 2) { suggestions.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
  const requestNumber = ++suggestionRequest;
  suggestionTimer = setTimeout(async () => {
    try {
      const response = await fetch(API + 'suggestions?q=' + encodeURIComponent(query));
      if (!response.ok || requestNumber !== suggestionRequest) return;
      const data = await response.json();
      suggestions.replaceChildren();
      for (const article of data.suggestions) {
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'suggestion'; item.setAttribute('role', 'option');
        const title = document.createElement('strong'); title.textContent = article.title;
        const subtitle = document.createElement('small'); subtitle.textContent = article.subtitle;
        item.append(title, subtitle);
        item.addEventListener('click', () => openArticle(article.id));
        suggestions.append(item);
      }
      const all = document.createElement('button'); all.type = 'button'; all.className = 'suggestion all-results'; all.textContent = 'Search pages containing ' + query;
      all.addEventListener('click', () => search(query)); suggestions.append(all);
      suggestions.hidden = false; input.setAttribute('aria-expanded', 'true');
    } catch (error) { suggestions.hidden = true; }
  }, 140);
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { suggestions.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  if (event.key === 'ArrowDown' && !suggestions.hidden) { event.preventDefault(); suggestions.querySelector('button')?.focus(); }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.search-combobox')) suggestions.hidden = true; });
async function openArticle(id) {
  try {
    await post('open-article', { articleId: id });
    location.assign(PAGE + 'article/' + encodeURIComponent(id) + '?runId=' + encodeURIComponent(RUN_ID));
  } catch (error) { showError(String(error)); }
}
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-article-id]');
  if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault(); openArticle(anchor.dataset.articleId);
});
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-search-query]');
  if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault(); search(anchor.dataset.searchQuery);
});
document.addEventListener('click', async (event) => {
  const anchor = event.target.closest('a[data-go-home]');
  if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  try {
    await post('navigate-home', {});
    location.assign('/scenario/encyclopedia?runId=' + encodeURIComponent(RUN_ID));
  } catch (error) { showError(String(error)); }
});
document.getElementById('menu-toggle')?.addEventListener('click', () => {
  const sidebar = document.getElementById('left-sidebar'); sidebar.hidden = !sidebar.hidden;
  document.getElementById('menu-toggle').setAttribute('aria-expanded', String(!sidebar.hidden));
});
document.getElementById('toc-toggle')?.addEventListener('click', (event) => {
  const list = document.getElementById('toc-list'); list.hidden = !list.hidden; event.target.textContent = list.hidden ? 'show' : 'hide';
});
document.getElementById('tools-toggle')?.addEventListener('click', () => {
  const panel = document.getElementById('tools-panel'); panel.hidden = !panel.hidden;
});
document.getElementById('appearance-toggle')?.addEventListener('click', (event) => {
  const controls = document.getElementById('appearance-controls'); controls.hidden = !controls.hidden; event.target.textContent = controls.hidden ? 'show' : 'hide';
});
for (const radio of document.querySelectorAll('.appearance input[type="radio"]')) radio.addEventListener('change', () => {
  document.body.dataset[radio.name === 'text-size' ? 'textSize' : radio.name] = radio.value;
});
`;
}

const css = `
.text-action{border:0;background:none;padding:0;color:#0645ad;cursor:pointer;text-align:left}.text-action:hover{text-decoration:underline}.preview-notice{display:flex;justify-content:space-between;gap:18px;align-items:center;border:1px solid #a3b8d0;background:#f5faff;padding:10px 12px;margin:12px 0;font-size:13px}.preview-notice[hidden]{display:none}.preview-notice button{border:0;background:none;color:#0645ad;font-size:20px;line-height:1}.language-grid .text-action{display:block}.site-footer .text-action,.personal .text-action{font-size:inherit}
:root{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202122;background:#fff}*{box-sizing:border-box}body{margin:0}a{color:#0645ad;text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}button{cursor:pointer}p{line-height:1.65;margin:.5em 0 1em}.quiet{color:#72777d}.jump-link{position:absolute;left:-9999px}.jump-link:focus{left:10px;top:10px;background:#fff;z-index:30}.mw-header{height:66px;background:#fff;border-bottom:1px solid #eaecf0}.header-inner{max-width:1650px;margin:auto;padding:8px 30px;display:flex;align-items:center;gap:18px;height:100%}.icon-button{border:0;background:none;font-size:22px;color:#54595d;padding:6px}.brand{display:flex;align-items:center;gap:7px;min-width:235px;color:#202122}.brand img{width:50px;height:50px}.wordmark{display:flex;flex-direction:column}.wordmark strong{font:24px/1 Georgia,serif;letter-spacing:1.8px;font-variant:small-caps}.wordmark small{font:11px Georgia,serif;text-align:center;margin-top:5px}.header-search{display:flex;width:min(500px,42vw);height:32px}.search-combobox{position:relative;display:flex;flex:1;border:1px solid #a2a9b1;min-width:0}.glass{font-size:23px;color:#72777d;line-height:27px;padding:0 7px}.header-search input{border:0;outline:0;flex:1;min-width:0;background:white}.header-search>button,.results-search button{border:1px solid #a2a9b1;border-left:0;background:#f8f9fa;padding:0 15px;font-weight:bold}.header-search>button:hover,.results-search button:hover{background:#eaecf0}.suggestions{position:absolute;z-index:20;top:31px;left:-1px;right:-1px;background:#fff;border:1px solid #a2a9b1;box-shadow:0 3px 8px #0002}.suggestion{display:flex;flex-direction:column;align-items:flex-start;width:100%;padding:8px 11px;background:#fff;border:0;text-align:left}.suggestion:hover,.suggestion:focus{background:#eaecf0}.suggestion small{margin-top:3px;color:#54595d}.suggestion.all-results{border-top:1px solid #eaecf0;color:#0645ad}.personal{margin-left:auto;display:flex;align-items:center;gap:15px;white-space:nowrap}.page-grid{display:grid;grid-template-columns:minmax(160px,210px) minmax(0,960px) minmax(145px,210px);gap:28px;max-width:1650px;margin:auto;padding:25px 30px}.sticky-sidebar{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto;scrollbar-width:thin}.left-sidebar{font-size:13px;color:#202122;padding-top:82px}.vector-toc-heading,.side-heading{font-weight:bold;border-bottom:1px solid #eaecf0;padding:8px 0}.vector-toc-heading button,.side-heading button{border:0;background:none;color:#0645ad;font-size:12px;float:right;font-weight:normal}.left-sidebar ul{list-style:none;margin:5px 0;padding:0}.left-sidebar li{padding:5px 0}.left-sidebar li.toc-level-3{padding-left:15px}.left-sidebar li a{color:#202122}.left-sidebar li a:hover{color:#0645ad}.left-sidebar li span{color:#54595d}.page-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #a2a9b1}.page-head h1{font:30px/1.35 Georgia,'Times New Roman',serif;margin:0 0 5px}.language-button{border:0;background:none;color:#0645ad;font-weight:bold}.page-tabs{display:flex;justify-content:space-between;border-bottom:1px solid #a2a9b1;min-height:42px}.tab-group{display:flex;align-items:stretch;gap:18px}.tab-group a,.tab-group button{display:flex;align-items:center;border:0;background:none;color:#0645ad;padding:0 1px}.tab-group .selected{border-bottom:2px solid #202122;color:#202122}.main-content{padding-top:16px}.right-sidebar{font-size:13px;padding-top:87px}.appearance label{display:block;line-height:1.8}.appearance input{accent-color:#36c}.setting-heading{font-weight:bold;margin:13px 0 5px}.tools-panel{margin-top:22px}.tools-panel a{display:block;padding:6px 0}.site-footer{font-size:11px;color:#54595d;border-top:1px solid #eaecf0;margin-top:32px;padding-top:10px}.site-footer p{line-height:1.5}.welcome{text-align:center;border:1px solid #c8ccd1;background:#f8f9fa;padding:12px}.welcome h2{font-size:22px;font-weight:normal;margin:0}.welcome h2 span{font-family:Georgia,serif}.welcome p{margin:4px 0}.welcome small{font-size:13px}.home-columns{display:grid;grid-template-columns:1.1fr .9fr;gap:8px;margin-top:8px}.home-panel{border:1px solid #cef2e0;background:#f5fffa;margin-bottom:8px}.home-panel.blue{border-color:#cedff2;background:#f5faff}.home-panel.violet{border-color:#ddcef2;background:#faf7ff}.home-panel h2{font:17px Georgia,serif;margin:0;background:#cef2e0;border-bottom:1px solid #a3d6bc;padding:6px 10px}.home-panel.blue h2{background:#cedff2;border-color:#a3b8d0}.home-panel.violet h2{background:#ddcef2;border-color:#c4a8e3}.panel-body{padding:5px 12px;font-size:13px}.panel-body p{line-height:1.55}.panel-foot{border-top:1px solid #ddd;font-size:12px;padding:8px 0;margin-top:8px}.float-illustration{float:right;width:124px;text-align:center;margin:4px 0 7px 12px}.float-illustration img{width:116px;height:138px;object-fit:cover}.float-illustration span{font-size:11px;color:#54595d}.dense-list{padding-left:20px;margin:9px 0}.dense-list li{margin-bottom:8px;line-height:1.5}.sister-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sister-grid span{font-size:20px;color:#54595d}.sister-grid strong{font-size:13px;color:#0645ad}.sister-grid small{display:block;font-size:11px;margin-left:24px}.language-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.search-page{max-width:860px}.results-search{display:flex;width:100%;height:36px;margin-bottom:15px}.results-search input{border:1px solid #a2a9b1;flex:1;padding:0 10px}.search-result-count{color:#54595d;margin:8px 0 16px}.search-categories{display:flex;gap:22px;border-bottom:1px solid #a2a9b1;margin-bottom:18px}.search-categories a{padding:8px 2px}.search-categories .selected{border-bottom:2px solid #202122;color:#202122}.no-page{padding:7px 0 14px;border-bottom:1px solid #eaecf0}.search-list-head{font-weight:bold;display:flex;justify-content:space-between}.search-list-head span{font-size:12px;color:#54595d;font-weight:normal}.search-results{list-style:none;padding:0;margin:14px 0}.search-result{display:flex;gap:12px;padding:12px 0 16px}.result-icon{width:48px;height:48px;min-width:48px;background:#f8f9fa;border:1px solid #c8ccd1;color:#54595d;font:29px Georgia,serif;text-align:center;padding-top:7px}.search-result h3{font-size:17px;font-weight:normal;margin:0 0 5px}.search-result p{margin:0 0 5px;line-height:1.5}.result-meta{color:#72777d;font-size:12px}.pagination{display:flex;gap:11px;padding:20px 0;border-top:1px solid #eaecf0}.pagination [aria-current]{font-weight:bold;color:#202122}.search-bottom{margin:22px 0;border-top:1px solid #eaecf0}.search-bottom h2{font:21px Georgia,serif}.encyclopedia-article{font:15px/1.65 Georgia,'Times New Roman',serif}.encyclopedia-article p{line-height:1.65}.encyclopedia-article a{font-family:Arial,Helvetica,sans-serif;font-size:.93em}.hatnote{font-style:italic;font-size:14px;padding:4px 0 15px}.article-badge{border:1px solid #c8ccd1;background:#f8f9fa;padding:7px 10px;margin:0 0 16px;font:12px Arial,sans-serif}.short-description{font:12px Arial,sans-serif;color:#54595d;margin:14px 0}.article-infobox{float:right;width:275px;border:1px solid #a2a9b1;background:#f8f9fa;margin:0 0 15px 20px;padding:7px;font:12px Arial,sans-serif;text-align:center}.article-infobox .infobox-head{background:#dce7f2;font-weight:bold;padding:7px;font-size:14px}.article-infobox img{width:100%;margin-top:7px}.article-infobox p{font-size:12px;line-height:1.4}.article-infobox dl{display:grid;grid-template-columns:75px 1fr;text-align:left;gap:6px}.article-infobox dt{font-weight:bold}.article-infobox dd{margin:0}.article-section{scroll-margin-top:14px}.article-section h2,.article-section h3{border-bottom:1px solid #a2a9b1;font:25px Georgia,serif;line-height:1.3;margin:25px 0 10px}.article-section h3{font-size:20px;border-color:#eaecf0}.article-section .heading-edit{font:12px Arial,sans-serif}.formula{text-align:center;font:22px Georgia,serif;padding:16px;background:#f8f9fa;margin:15px 0}.article-list{padding-left:30px}.article-list li{margin:5px 0}.references{font-size:13px}.categories{border:1px solid #a2a9b1;background:#f8f9fa;margin-top:28px;padding:8px;font:12px Arial,sans-serif}#site-notice{background:#fee7e6;border:1px solid #d33;color:#202122;padding:10px;margin-bottom:12px}body[data-text-size="small"] .encyclopedia-article{font-size:13px}body[data-text-size="large"] .encyclopedia-article{font-size:18px}body[data-width="wide"] .page-grid{max-width:none}body[data-color="dark"]{background:#202122;color:#eaecf0}body[data-color="dark"] .mw-header,body[data-color="dark"] .mw-page-container,body[data-color="dark"] .right-sidebar{background:#202122;color:#eaecf0}body[data-color="dark"] a{color:#8cb8ff}@media(max-width:1150px){.page-grid{grid-template-columns:170px minmax(0,1fr);gap:20px}.right-sidebar{display:none}.personal a{display:none}}@media(max-width:730px){.header-inner{padding:5px 12px;gap:8px}.brand{min-width:51px}.brand .wordmark{display:none}.header-search{width:auto;flex:1}.page-grid{display:block;padding:18px 14px}.left-sidebar{display:none}.secondary a:not(.selected){display:none}.home-columns{display:block}.article-infobox{width:210px}.page-head h1{font-size:25px}}
`;
