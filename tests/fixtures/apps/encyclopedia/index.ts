import type {
  FixtureApp,
  FixtureContext,
  FixtureReply,
} from '../../app-contract.js';
import { articleById, searchArticles } from './data.js';
import {
  featuredSvg,
  logicSvg,
  renderArticle,
  renderHome,
  renderSearch,
  wikiMarkSvg,
} from './render.js';

function reply(status: number, body: Record<string, unknown>): FixtureReply {
  return { status, body, contentType: 'application/json; charset=utf-8' };
}

function methodNotAllowed(allow: string): FixtureReply {
  return {
    status: 405,
    body: { error: 'Method not allowed', allowed: allow },
    contentType: 'application/json; charset=utf-8',
  };
}

function result(ctx: FixtureContext): Record<string, unknown> {
  return ctx.state.result;
}

async function jsonBody(
  ctx: FixtureContext,
): Promise<Record<string, unknown> | null> {
  try {
    return await ctx.readJson();
  } catch {
    return null;
  }
}

const assets: Record<string, () => string> = {
  'wiki-mark.svg': wikiMarkSvg,
  'featured.svg': featuredSvg,
  'logic-diagram.svg': logicSvg,
};

async function handlePage(ctx: FixtureContext): Promise<FixtureReply> {
  if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
  const tail = ctx.tail.replace(/\/$/, '');
  if (tail === '') return { status: 200, body: renderHome(ctx.runId) };
  if (tail === 'results') {
    const query = ctx.address.searchParams.get('search') ?? '';
    if (!query.trim() || query.length > 160)
      return reply(400, { error: 'Invalid search query' });
    const pageValue = ctx.address.searchParams.get('page') ?? '1';
    if (!/^[1-9]\d*$/.test(pageValue) || Number(pageValue) > 100)
      return reply(400, { error: 'Invalid result page' });
    const maxPage = Math.max(
      1,
      Math.ceil(searchArticles(query.trim()).length / 4),
    );
    if (Number(pageValue) > maxPage)
      return reply(404, { error: 'Result page not found' });
    if (
      ctx.state.result.searchQuery === query.trim() &&
      ctx.state.result.resultPage !== Number(pageValue)
    ) {
      ctx.state.result.resultPage = Number(pageValue);
      ctx.record('resultsPageViewed', {
        query: query.trim(),
        page: Number(pageValue),
      });
    }
    return {
      status: 200,
      body: renderSearch(ctx.runId, query.trim(), Number(pageValue)),
    };
  }
  if (tail.startsWith('article/')) {
    const articleId = tail.slice('article/'.length);
    const article = articleById(articleId);
    if (!article) return reply(404, { error: 'Article not found' });
    return { status: 200, body: renderArticle(ctx.runId, article) };
  }
  if (tail.startsWith('assets/')) {
    const renderer = assets[tail.slice('assets/'.length)];
    if (!renderer) return reply(404, { error: 'Asset not found' });
    return {
      status: 200,
      body: renderer(),
      contentType: 'image/svg+xml; charset=utf-8',
    };
  }
  return reply(404, { error: 'Page not found' });
}

async function handleApi(ctx: FixtureContext): Promise<FixtureReply> {
  const tail = ctx.tail.replace(/\/$/, '');
  if (tail === 'suggestions') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    const query = ctx.address.searchParams.get('q')?.trim() ?? '';
    if (query.length > 160)
      return reply(400, { error: 'Invalid search query' });
    return reply(200, {
      suggestions:
        query.length >= 2
          ? searchArticles(query)
              .slice(0, 5)
              .map(({ id, title, subtitle }) => ({ id, title, subtitle }))
          : [],
    });
  }
  if (tail === 'search') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    const body = await jsonBody(ctx);
    const query = body?.query;
    if (typeof query !== 'string' || !query.trim() || query.length > 160)
      return reply(400, {
        error: 'Search query must contain 1–160 characters',
      });
    const value = query.trim();
    const matches = searchArticles(value);
    result(ctx).query = value;
    result(ctx).searchQuery = value;
    result(ctx).resultPage = 1;
    result(ctx).view = 'results';
    result(ctx).articleId = null;
    result(ctx).articleTitle = null;
    result(ctx).navigated = false;
    ctx.record('searchSubmitted', {
      query: value,
      resultCount: matches.length,
    });
    return reply(200, { query: value, resultCount: matches.length });
  }
  if (tail === 'open-article') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    const body = await jsonBody(ctx);
    const articleId = body?.articleId;
    if (typeof articleId !== 'string')
      return reply(400, { error: 'Invalid article ID' });
    const article = articleById(articleId);
    if (!article) return reply(404, { error: 'Article not found' });
    result(ctx).articleId = article.id;
    result(ctx).articleTitle = article.title;
    result(ctx).navigated = true;
    result(ctx).view = 'article';
    ctx.record('articleOpened', {
      articleId: article.id,
      title: article.title,
    });
    return reply(200, { articleId: article.id, title: article.title });
  }
  if (tail === 'navigate-home') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    result(ctx).articleId = null;
    result(ctx).articleTitle = null;
    result(ctx).navigated = false;
    result(ctx).view = 'main';
    ctx.record('homeOpened');
    return reply(200, { view: 'main' });
  }
  if (tail === 'state') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    return reply(200, {
      result: result(ctx),
      revision: ctx.state.revision,
      events: ctx.state.events,
    });
  }
  return reply(404, { error: 'Endpoint not found' });
}

const encyclopediaApp: FixtureApp = {
  scenarios: ['encyclopedia'],
  initialResult() {
    return {
      query: '',
      searchQuery: '',
      articleId: null,
      articleTitle: null,
      navigated: false,
      resultPage: null,
      view: 'main',
    };
  },
  handle(ctx) {
    return ctx.kind === 'page' ? handlePage(ctx) : handleApi(ctx);
  },
};

export default encyclopediaApp;
