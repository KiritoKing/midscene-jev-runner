import type {
  FixtureApp,
  FixtureContext,
  FixtureReply,
} from '../../app-contract';
import { marketingClient } from './marketing-client';
import { marketingStyle } from './marketing-style';

type Row = {
  id: string;
  sourceId?: string;
  name: string;
  status: string;
  scene: string;
  owner: string;
  created: string;
  startDate?: string;
  validUntil: string;
  rule: string;
  audience?: string;
  benefit: string;
  quantity?: number;
  frequency: number;
  period?: string;
  grantMode?: string;
  description?: string;
};

const source: Row = {
  id: 'campaign-source-01',
  name: 'Blue Meridian',
  status: '进行中',
  scene: '触点玩法',
  owner: '运营一组',
  created: '2026-09-01',
  validUntil: '2026-12-31',
  rule: 'rule-growth',
  benefit: 'benefit-voucher',
  frequency: 2,
};
const statuses = ['进行中', '未生效', '审批中', '已结束', '已停用'];
const scenes = ['触点玩法', '收银台玩法', '优惠券', '任务营销'];
const rows: Row[] = [
  source,
  ...Array.from(
    { length: 34 },
    (_, index): Row => ({
      id: `ACT-${String(index + 1021).padStart(5, '0')}`,
      name: `${['春季回馈', '新客触达', '会员唤醒', '支付激励', '周末权益', '场景转化', '活跃提升'][index % 7]} ${String(index + 1).padStart(2, '0')}`,
      status: statuses[index % statuses.length],
      scene: scenes[index % scenes.length],
      owner: ['增长运营', '支付营销', '活动运营'][index % 3],
      created: `2026-${String(1 + (index % 8)).padStart(2, '0')}-${String(4 + (index % 24)).padStart(2, '0')}`,
      validUntil: `2026-12-${String(10 + (index % 20)).padStart(2, '0')}`,
      rule: index % 2 ? 'rule-loyalty' : 'rule-growth',
      benefit: index % 2 ? 'benefit-points' : 'benefit-voucher',
      frequency: 1 + (index % 3),
    }),
  ),
];

const rules = [
  {
    id: 'rule-growth',
    name: '新客与活跃用户',
    group: '人群规则',
    segment: '近 30 日活跃',
  },
  {
    id: 'rule-loyalty',
    name: '会员等级人群',
    group: '人群规则',
    segment: '银卡及以上',
  },
  {
    id: 'rule-returning',
    name: '回流用户',
    group: '人群规则',
    segment: '近 90 日回流',
  },
];
const benefits = [
  { id: 'benefit-voucher', name: '满减券', unit: '张', stock: 24000 },
  { id: 'benefit-points', name: '积分奖励', unit: '点', stock: 650000 },
  { id: 'benefit-badge', name: '会员徽章', unit: '枚', stock: 8000 },
];

type Wizard = {
  stage: string;
  sourceId: string | null;
  sessionId: string | null;
  name: string | null;
  useSourceSettings: boolean | null;
  completed: number[];
  basic?: Record<string, unknown>;
  people?: Record<string, unknown>;
  frequency?: Record<string, unknown>;
  entitlement?: Record<string, unknown>;
  confirmed?: boolean;
};

function json(status: number, body: Record<string, unknown>): FixtureReply {
  return { status, body, contentType: 'application/json; charset=utf-8' };
}
function bad(message: string, status = 400): FixtureReply {
  return json(status, { error: message });
}
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function getWizard(ctx: FixtureContext): Wizard {
  return ctx.state.result.wizard as Wizard;
}
function sessionMatches(
  ctx: FixtureContext,
  body: Record<string, unknown>,
): boolean {
  const wizard = getWizard(ctx);
  return Boolean(
    wizard.sessionId &&
      body.sessionId === wizard.sessionId &&
      [...rows, ...(ctx.state.result.copies as Row[])].some(
        (row) => row.id === wizard.sourceId,
      ),
  );
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
function list(ctx: FixtureContext): FixtureReply {
  const query = asText(ctx.address.searchParams.get('q')).toLowerCase();
  const status = asText(ctx.address.searchParams.get('status'));
  const scene = asText(ctx.address.searchParams.get('scene'));
  const sort = asText(ctx.address.searchParams.get('sort')) || 'created-desc';
  const page = Math.max(
    1,
    Math.min(100, Number(ctx.address.searchParams.get('page')) || 1),
  );
  const pageSize = Math.max(
    1,
    Math.min(20, Number(ctx.address.searchParams.get('pageSize')) || 10),
  );
  const copies = ctx.state.result.copies as Row[];
  const filtered = [...rows, ...copies].filter(
    (row) =>
      (!query ||
        row.name.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query)) &&
      (!status || row.status === status) &&
      (!scene || row.scene === scene),
  );
  filtered.sort((a, b) =>
    sort === 'name-asc'
      ? a.name.localeCompare(b.name)
      : sort === 'name-desc'
        ? b.name.localeCompare(a.name)
        : sort === 'created-asc'
          ? a.created.localeCompare(b.created)
          : b.created.localeCompare(a.created),
  );
  return json(200, {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  });
}
function validateStep(
  step: number,
  data: Record<string, unknown>,
): string | null {
  if (step === 1) {
    const name = asText(data.name);
    if (name.length < 3 || name.length > 64) return '玩法名称需为 3–64 个字符';
    if (
      !validDate(asText(data.startDate)) ||
      !validDate(asText(data.endDate)) ||
      asText(data.startDate) < '2026-09-23' ||
      asText(data.endDate) <= asText(data.startDate)
    )
      return '请选择有效的开始和结束日期';
    if (
      !['触点玩法', '收银台玩法', '优惠券', '任务营销'].includes(
        asText(data.scene),
      )
    )
      return '请选择活动场景';
  } else if (step === 2) {
    if (!rules.some((rule) => rule.id === data.ruleId))
      return '请选择有效的人群规则';
    if (!['all', 'new', 'returning'].includes(asText(data.audience)))
      return '请选择参与用户范围';
  } else if (step === 3) {
    if (
      !Number.isInteger(data.limit) ||
      Number(data.limit) < 1 ||
      Number(data.limit) > 10
    )
      return '单人参与次数需为 1–10';
    if (!['day', 'week', 'campaign'].includes(asText(data.period)))
      return '请选择频控周期';
  } else if (step === 4) {
    if (!benefits.some((benefit) => benefit.id === data.benefitId))
      return '请选择有效权益';
    if (
      !Number.isInteger(data.quantity) ||
      Number(data.quantity) < 1 ||
      Number(data.quantity) > 1000
    )
      return '发放数量需为 1–1000';
    if (data.benefitId === 'benefit-voucher' && data.ruleId !== 'rule-growth')
      return '该券权益要求新客与活跃用户规则';
  }
  return null;
}
function api(ctx: FixtureContext): Promise<FixtureReply> | FixtureReply {
  const method = ctx.request.method || 'GET';
  const parts = ctx.tail.split('/').filter(Boolean);
  if (method === 'GET' && parts[0] === 'activities' && parts.length === 1)
    return list(ctx);
  if (method === 'GET' && parts[0] === 'activities' && parts.length === 2) {
    const row = [...rows, ...(ctx.state.result.copies as Row[])].find(
      (item) => item.id === parts[1],
    );
    return row ? json(200, { activity: row }) : bad('玩法不存在', 404);
  }
  if (method === 'GET' && parts.join('/') === 'reference/rules')
    return json(200, { rules });
  if (method === 'GET' && parts.join('/') === 'reference/benefits') {
    const ruleId = ctx.address.searchParams.get('ruleId');
    if (!rules.some((rule) => rule.id === ruleId))
      return bad('请先选择有效的人群规则');
    return json(200, {
      benefits: benefits.filter(
        (item) => item.id !== 'benefit-voucher' || ruleId === 'rule-growth',
      ),
    });
  }
  if (method === 'GET' && parts.join('/') === 'result')
    return json(200, {
      result: ctx.state.result,
      attempts: ctx.state.attempts,
    });
  if (method === 'GET' && parts.join('/') === 'session')
    return json(200, { wizard: getWizard(ctx) });
  if (method === 'POST' && parts.join('/') === 'session/open')
    return ctx.readJson().then((body) => {
      const selected = [...rows, ...(ctx.state.result.copies as Row[])].find(
        (row) => row.id === body.sourceId,
      );
      if (!selected) return bad('只可从现有玩法创建副本', 404);
      const wizard: Wizard = {
        stage: 'basic',
        sourceId: selected.id,
        sessionId: `session-${ctx.runId}-${ctx.state.revision + 1}`,
        name: null,
        useSourceSettings: true,
        completed: [],
        basic: {
          name: `${selected.name} 副本`,
          scene: selected.scene,
          startDate: '',
          endDate: '',
        },
        people: { ruleId: selected.rule, audience: 'all' },
        frequency: { limit: selected.frequency, period: 'day' },
        entitlement: {
          benefitId: selected.benefit,
          quantity: 1,
          ruleId: selected.rule,
        },
      };
      ctx.state.result.wizard = wizard;
      ctx.record('wizard-opened', {
        sourceId: selected.id,
        sessionId: wizard.sessionId,
      });
      return json(200, { wizard, source: selected });
    });
  if (method === 'POST' && parts.join('/') === 'session/step')
    return ctx.readJson().then((body) => {
      if (!sessionMatches(ctx, body)) return bad('会话不存在或已过期', 409);
      const wizard = getWizard(ctx);
      const step = Number(body.step);
      if (![1, 2, 3, 4].includes(step) || wizard.completed.length < step - 1)
        return bad('请按顺序完成步骤', 409);
      const data = body.data;
      if (!data || typeof data !== 'object' || Array.isArray(data))
        return bad('缺少步骤数据');
      const values = data as Record<string, unknown>;
      const error = validateStep(step, values);
      if (error) return bad(error);
      if (step === 4 && values.ruleId !== wizard.people?.ruleId)
        return bad('权益与已选择的人群规则不一致');
      const key = (['basic', 'people', 'frequency', 'entitlement'] as const)[
        step - 1
      ];
      wizard[key] = structuredClone(values);
      wizard.completed = [...wizard.completed.slice(0, step - 1), step];
      wizard.stage = ['people', 'frequency', 'entitlement', 'preview'][
        step - 1
      ];
      wizard.confirmed = false;
      if (step === 1) wizard.name = asText(values.name);
      ctx.record('wizard-step-completed', {
        step,
        sessionId: wizard.sessionId,
      });
      return json(200, { wizard });
    });
  if (method === 'POST' && parts.join('/') === 'session/preview')
    return ctx.readJson().then((body) => {
      if (!sessionMatches(ctx, body)) return bad('会话不存在或已过期', 409);
      const wizard = getWizard(ctx);
      if (
        wizard.completed.join(',') !== '1,2,3,4' ||
        wizard.stage !== 'preview'
      )
        return bad('请完成全部配置步骤', 409);
      wizard.confirmed = body.confirmed === true;
      if (!wizard.confirmed) return bad('请确认差异预览');
      ctx.record('preview-confirmed', { sessionId: wizard.sessionId });
      return json(200, { confirmed: true });
    });
  if (method === 'POST' && parts.join('/') === 'clone')
    return ctx.readJson().then((body) => {
      const submissionId = asText(body.submissionId);
      const previous = ctx.state.submissions.get(submissionId);
      if (submissionId && previous) {
        ctx.state.attempts.push({
          operation: 'clone',
          submissionId,
          outcome: 'replayed',
        });
        return json(200, { copy: previous, replayed: true });
      }
      const wizard = getWizard(ctx);
      if (
        !submissionId ||
        !sessionMatches(ctx, body) ||
        wizard.completed.join(',') !== '1,2,3,4' ||
        wizard.stage !== 'preview' ||
        wizard.confirmed !== true ||
        asText(body.name) !== wizard.name
      ) {
        ctx.state.attempts.push({
          operation: 'clone',
          submissionId: submissionId || null,
          outcome: 'rejected',
        });
        return bad('需完成并确认差异预览后提交', 409);
      }
      const id = `COPY-${ctx.runId}-${String((ctx.state.result.copies as Row[]).length + 1).padStart(4, '0')}`;
      const basic = wizard.basic || {};
      const selected = [...rows, ...(ctx.state.result.copies as Row[])].find(
        (row) => row.id === wizard.sourceId,
      );
      if (!selected) return bad('来源玩法不存在', 409);
      const copy: Row = {
        ...selected,
        id,
        sourceId: selected.id,
        name: wizard.name || '',
        status: '未生效',
        scene: asText(basic.scene),
        created: '2026-09-23',
        startDate: asText(basic.startDate),
        validUntil: asText(basic.endDate),
        rule: asText(wizard.people?.ruleId),
        audience: asText(wizard.people?.audience),
        benefit: asText(wizard.entitlement?.benefitId),
        quantity: Number(wizard.entitlement?.quantity),
        frequency: Number(wizard.frequency?.limit),
        period: asText(wizard.frequency?.period),
        grantMode: asText(wizard.frequency?.grantMode),
        description: asText(basic.description),
      };
      (ctx.state.result.copies as Row[]).push(copy);
      ctx.state.result.latestCopy = copy;
      wizard.stage = 'warning';
      ctx.state.submissions.set(submissionId, structuredClone(copy));
      ctx.state.attempts.push({
        operation: 'clone',
        submissionId,
        outcome: 'committed',
      });
      ctx.record('clone-created', {
        sourceId: selected.id,
        copyId: id,
        submissionId,
      });
      if (ctx.address.searchParams.get('fault') === 'commit503')
        return bad('提交响应暂不可用，请先读回', 503);
      return json(201, { copy });
    });
  if (['GET', 'POST'].includes(method)) return bad('未找到该接口', 404);
  return bad('不支持的请求方法', 405);
}

function page(runId: string): string {
  const safeRunId = JSON.stringify(runId).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>营销平台 · 触点玩法</title><style>${marketingStyle}</style></head><body>
  <header class="global-header"><div class="brand-mark">M</div><strong>营销平台</strong><span class="workspace-switch">营销运营中心⌄</span><div class="global-spacer"></div><span class="environment">演练环境</span><span class="header-icon" aria-hidden="true">⌕</span><span class="avatar">运</span></header>
  <div class="app-shell"><aside class="primary-nav" aria-label="主菜单"><div class="side-caption">工作台</div><button data-primary="overview">◫ <span>概览</span></button><button data-primary="tactics" class="selected">▦ <span>营销玩法</span></button><button data-primary="assets">▣ <span>资源管理</span></button><button data-primary="analysis">▤ <span>数据分析</span></button><button data-primary="settings">⚙ <span>配置中心</span></button></aside>
  <aside class="secondary-nav" aria-label="二级菜单"><div class="secondary-title">营销玩法</div><div id="menu-tree"></div></aside>
  <main class="content-shell"><div class="tabbar" id="tabbar" role="tablist" aria-label="已打开页面"></div><div id="panel-host"></div></main></div>
  <div class="toast" id="toast" role="status" hidden></div><script>window.__MARKETING_RUN_ID__=${safeRunId};${marketingClient}</script></body></html>`;
}

function referenceFrame(runId: string): string {
  const safeRunId = JSON.stringify(runId).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font:13px system-ui;color:#4e5969;padding:12px;margin:0;background:#f7f9fc}b{color:#1d2129}button,input{font:inherit;padding:5px 8px;border:1px solid #c9cdd4;background:white;border-radius:2px}button{cursor:pointer}#items button{display:block;width:100%;text-align:left;margin-top:5px}#detail{background:#e8f3ff;padding:7px;margin-top:7px}[hidden]{display:none}</style><b>规则参考</b><p>检索人群规则并查看适用范围。</p><label>规则名称 <input id="q" aria-label="规则名称" placeholder="输入关键词"></label><button id="search">查询规则</button><div id="items" aria-live="polite">正在加载规则...</div><div id="detail" hidden></div><script>
  const api='/api/marketing/'+encodeURIComponent(${safeRunId})+'/reference/rules';
  let rules=[];
  const items=document.querySelector('#items');
  const detail=document.querySelector('#detail');
  fetch(api).then(response=>response.json()).then(data=>{rules=data.rules;render();}).catch(()=>{items.textContent='规则加载失败';});
  function render(){const q=document.querySelector('#q').value.trim();const filtered=rules.filter(rule=>rule.name.includes(q)||rule.id.includes(q));items.replaceChildren();if(!filtered.length){items.textContent='没有匹配的规则';return;}for(const rule of filtered){const button=document.createElement('button');button.textContent=rule.name;button.addEventListener('click',()=>{detail.hidden=false;detail.textContent=rule.name+' · '+rule.segment+' · '+rule.id;});items.append(button);}detail.hidden=true;}
  document.querySelector('#search').addEventListener('click',render);
  </script></html>`;
}

const marketingApp: FixtureApp = {
  scenarios: ['marketing-clone'],
  initialResult() {
    return {
      source: structuredClone(source),
      copies: [],
      latestCopy: null,
      wizard: {
        stage: 'closed',
        sourceId: null,
        sessionId: null,
        name: null,
        useSourceSettings: null,
        completed: [],
      },
    };
  },
  async handle(ctx) {
    if (ctx.kind === 'api') return api(ctx);
    if (ctx.request.method !== 'GET') return bad('不支持的请求方法', 405);
    if (ctx.tail === '' || ctx.tail === 'tactics/touchpoint')
      return { status: 200, body: page(ctx.runId) };
    if (ctx.tail === 'reference-frame')
      return {
        status: 200,
        body: referenceFrame(ctx.runId),
      };
    return bad('页面不存在', 404);
  },
};

export default marketingApp;
