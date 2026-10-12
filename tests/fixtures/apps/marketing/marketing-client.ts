export const marketingClient = String.raw`
(() => {
  const runId = window.__MARKETING_RUN_ID__;
  const base = '/api/marketing/' + encodeURIComponent(runId) + '/';
  const root = document.getElementById('panel-host');
  const tabbar = document.getElementById('tabbar');
  const menuTree = document.getElementById('menu-tree');
  const toast = document.getElementById('toast');
  const tabs = new Map();
  let active = null;
  let primary = 'tactics';
  let toastTimer;
  const pageBase = '/scenario/marketing-clone';
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function notice(message) { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3600); }
  async function request(path, options) {
    const response = await fetch(base + path, {cache:'no-store', ...options});
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || '请求失败'); error.status = response.status; throw error; }
    return data;
  }
  function post(path, body) { return request(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); }
  const nav = {
    overview:[['工作台', [['运营概览','overview'],['待办事项','todo']]]],
    tactics:[['玩法管理', [['活动玩法', [['触点玩法','touchpoint'],['收银台玩法','cashier'],['优惠券玩法','coupon']]], ['玩法草稿','drafts']]], ['配置服务', [['人群规则','rules'],['权益配置','benefits']]]],
    assets:[['资产中心', [['权益库存','benefits'],['人群规则','rules']]]],
    analysis:[['报表中心', [['玩法数据','reports'],['转化分析','conversion']]]],
    settings:[['系统设置', [['权限说明','access'],['配置说明','guide']]]],
  };
  const labels = {overview:'运营概览',todo:'待办事项',touchpoint:'触点玩法',cashier:'收银台玩法',coupon:'优惠券玩法',drafts:'玩法草稿',rules:'人群规则',benefits:'权益配置',reports:'玩法数据',conversion:'转化分析',access:'权限说明',guide:'配置说明'};
  const ruleLabels = {'rule-growth':'新客与活跃用户','rule-loyalty':'会员等级人群','rule-returning':'回流用户'};
  const benefitLabels = {'benefit-voucher':'满减券','benefit-points':'积分奖励','benefit-badge':'会员徽章'};
  function menuItem(entry, depth) {
    const title = entry[0], target = entry[1];
    if (Array.isArray(target)) return '<div class="menu-child"><button type="button" data-expand="' + esc(title) + '" aria-expanded="true">' + esc(title) + '<span>⌄</span></button><div class="menu-children">' + target.map(child => menuItem(child, depth + 1)).join('') + '</div></div>';
    return '<button class="menu-leaf' + (target === active ? ' selected' : '') + '" type="button" data-open="' + esc(target) + '">' + esc(title) + '</button>';
  }
  function drawMenu() { menuTree.innerHTML = nav[primary].map((group,index) => '<div class="menu-group"><button type="button" data-expand="' + esc(group[0]) + '" aria-expanded="' + (index===0) + '">' + esc(group[0]) + '<span>' + (index===0?'⌄':'›') + '</span></button><div class="menu-children" ' + (index===0?'':'hidden') + '>' + group[1].map(item => menuItem(item,0)).join('') + '</div></div>').join(''); document.querySelector('.secondary-title').textContent = ({overview:'工作台',tactics:'营销玩法',assets:'资源管理',analysis:'数据分析',settings:'配置中心'})[primary]; }
  document.querySelectorAll('[data-primary]').forEach(button => button.addEventListener('click', () => { primary = button.dataset.primary; document.querySelectorAll('[data-primary]').forEach(item => item.classList.toggle('selected', item === button)); drawMenu(); }));
  menuTree.addEventListener('click', event => {
    const expand = event.target.closest('[data-expand]');
    if (expand) { const child = expand.nextElementSibling; child.hidden = !child.hidden; expand.setAttribute('aria-expanded', String(!child.hidden)); expand.querySelector('span').textContent = child.hidden ? '›' : '⌄'; return; }
    const leaf = event.target.closest('[data-open]'); if (leaf) openTab(leaf.dataset.open);
  });
  function openTab(id) {
    if (!tabs.has(id)) { const panel = document.createElement('section'); panel.className = 'panel'; panel.dataset.panel = id; panel.hidden = true; root.append(panel); tabs.set(id,{panel}); buildPanel(id,panel); }
    active = id;
    for (const [key, tab] of tabs) tab.panel.hidden = key !== id;
    drawTabs(); drawMenu();
  }
  function closeTab(id) {
    const tab = tabs.get(id); if (!tab) return;
    tab.panel.remove(); tabs.delete(id);
    if (active === id) { const left = [...tabs.keys()]; active = left[left.length-1] || null; }
    if (!active) openTab('touchpoint'); else { for (const [key,value] of tabs) value.panel.hidden = key !== active; drawTabs(); drawMenu(); }
  }
  function drawTabs() {
    tabbar.innerHTML = [...tabs.keys()].map(id => '<button class="tab' + (id === active ? ' selected' : '') + '" role="tab" aria-selected="' + (id === active) + '" data-tab="' + esc(id) + '"><span>' + esc(labels[id] || '克隆玩法') + '</span>' + (id === 'touchpoint' ? '' : '<span class="close" data-close="' + esc(id) + '" aria-label="关闭' + esc(labels[id] || '克隆玩法') + '">×</span>') + '</button>').join('');
  }
  tabbar.addEventListener('click', event => { const close = event.target.closest('[data-close]'); if (close) { closeTab(close.dataset.close); return; } const tab = event.target.closest('[data-tab]'); if (tab) openTab(tab.dataset.tab); });
  function buildPanel(id,panel) {
    if (id === 'touchpoint' || id === 'drafts' || id === 'cashier' || id === 'coupon') buildList(panel,id);
    else if (id === 'rules' || id === 'benefits') buildReference(panel,id);
    else if (id === 'reports' || id === 'conversion') buildReports(panel,id);
    else panel.innerHTML = '<div class="breadcrumb">工作台 / <b>' + esc(labels[id]) + '</b></div><div class="page-heading"><h1>' + esc(labels[id]) + '</h1></div><div class="simple-grid"><div class="card metric">进行中玩法<strong>12</strong><small>近 7 日 +3</small></div><div class="card metric">待审批<strong>5</strong><small>需关注</small></div><div class="card metric">权益余量<strong>84%</strong><small>整体稳定</small></div></div><div class="card" style="padding:22px"><h2>运营动态</h2><p>在左侧菜单打开触点玩法，查看活动配置与发放记录。</p></div>';
  }
  function buildReference(panel,id) {
    panel.innerHTML = '<div class="breadcrumb">营销玩法 / 配置服务 / <b>' + esc(labels[id]) + '</b></div><div class="page-heading"><h1>' + esc(labels[id]) + '</h1></div><div class="card"><div class="table-toolbar"><strong>配置列表</strong></div><div id="reference-content" class="table-wrap"><div class="empty">正在加载...</div></div></div>';
    request(id === 'rules' ? 'reference/rules':'reference/benefits?ruleId=rule-growth').then(data => { if (!panel.isConnected) return; const items = data[id]; panel.querySelector('#reference-content').innerHTML = '<table class="data-table"><thead><tr><th>编号</th><th>名称</th><th>类型 / 单位</th><th>说明</th></tr></thead><tbody>' + items.map(item => '<tr><td class="id-cell">'+esc(item.id)+'</td><td>'+esc(item.name)+'</td><td>'+esc(item.group||item.unit)+'</td><td>'+esc(item.segment||('库存 '+item.stock))+'</td></tr>').join('') + '</tbody></table>'; }).catch(error => notice(error.message));
  }
  function buildReports(panel,id) { panel.innerHTML = '<div class="breadcrumb">数据分析 / <b>' + esc(labels[id]) + '</b></div><div class="page-heading"><h1>' + esc(labels[id]) + '</h1></div><div class="simple-grid"><div class="card metric">触达用户<strong>38,402</strong></div><div class="card metric">参与转化<strong>8.6%</strong></div><div class="card metric">发放权益<strong>7,281</strong></div></div><div class="card" style="padding:22px"><h2>趋势概览</h2><p class="muted">按玩法与日期查看运营表现</p><svg width="100%" height="180" viewBox="0 0 800 180" role="img" aria-label="参与趋势图"><path d="M0 150 L90 130 L180 139 L270 85 L360 100 L450 56 L540 77 L630 35 L720 58 L800 20" fill="none" stroke="#165dff" stroke-width="3"/></svg></div>'; }
  function buildList(panel,id) {
    const state = {page:1,query:'',status:'',scene:id==='cashier'?'收银台玩法':id==='coupon'?'优惠券':'',sort:'created-desc',pageSize:10,selected:null};
    panel.__listState = state;
    panel.innerHTML = '<div class="breadcrumb">营销玩法 / 玩法管理 / <b>' + esc(labels[id]) + '</b></div><div class="page-heading"><div><h1>' + esc(labels[id]) + '</h1><div class="subheading">管理营销活动的生命周期与配置</div></div><button class="primary-button" data-list-create>＋ 新建玩法</button></div><div class="card"><div class="card-heading">筛选条件</div><form class="filters" id="search-form"><label class="field"><span>玩法名称 / 编号</span><input name="query" placeholder="请输入玩法名称或编号"></label><label class="field"><span>玩法状态</span><select name="status"><option value="">全部状态</option><option>进行中</option><option>未生效</option><option>审批中</option><option>已结束</option><option>已停用</option></select></label><label class="field"><span>活动场景</span><select name="scene"><option value="">全部场景</option><option>触点玩法</option><option>收银台玩法</option><option>优惠券</option><option>任务营销</option></select></label><div class="filter-actions"><button class="primary-button">查询</button><button class="plain-button" type="button" data-reset>重置</button></div></form></div><div class="card"><div class="table-toolbar"><strong>玩法列表</strong><span class="muted" id="total-count"></span><div class="spacer"></div><label class="muted">排序 <select id="sort" aria-label="列表排序"><option value="created-desc">创建时间：新到旧</option><option value="created-asc">创建时间：旧到新</option><option value="name-asc">名称：升序</option><option value="name-desc">名称：降序</option></select></label></div><div class="table-wrap" id="table-body"><div class="load-line"></div></div><div class="pagination" id="pagination"></div></div><div id="detail-layer"></div>';
    const form = panel.querySelector('#search-form');
    form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); state.query = String(data.get('query')||'').trim(); state.status = String(data.get('status')||''); state.scene = String(data.get('scene')||''); state.page = 1; loadList(panel); });
    panel.querySelector('[data-reset]').addEventListener('click', () => { form.reset(); state.query=''; state.status=''; state.scene=''; state.page=1; loadList(panel); });
    panel.querySelector('#sort').addEventListener('change', event => { state.sort=event.target.value; state.page=1; loadList(panel); });
    panel.querySelector('[data-list-create]').addEventListener('click', () => notice('请选择现有玩法的「克隆」操作以创建副本'));
    panel.addEventListener('click', event => {
      const page = event.target.closest('[data-page]'); if (page) {state.page=Number(page.dataset.page);loadList(panel);return;}
      const name = event.target.closest('[data-detail]'); if (name) {openDetail(panel,name.dataset.detail);return;}
      const more = event.target.closest('[data-more]'); if (more) { const menu=more.parentElement.querySelector('.row-menu'); panel.querySelectorAll('.row-menu').forEach(item => { if(item!==menu)item.hidden=true; }); menu.hidden=!menu.hidden;return; }
      const clone = event.target.closest('[data-clone]'); if (clone) { panel.querySelectorAll('.row-menu').forEach(item => item.hidden=true); startClone(clone.dataset.clone); return; }
      if (!event.target.closest('.row-menu')) panel.querySelectorAll('.row-menu').forEach(item => item.hidden=true);
    });
    loadList(panel);
  }
  async function loadList(panel) {
    const state=panel.__listState;
    panel.querySelector('#table-body').innerHTML='<div class="load-line"></div>';
    const params = new URLSearchParams({q:state.query,status:state.status,scene:state.scene,sort:state.sort,page:String(state.page),pageSize:String(state.pageSize)});
    try {
      const data = await request('activities?'+params);
      if (!panel.isConnected) return;
      panel.querySelector('#total-count').textContent='共 '+data.total+' 条';
      panel.querySelector('#table-body').innerHTML = data.rows.length ? '<table class="data-table"><thead><tr><th>玩法名称 / 编号</th><th>活动场景</th><th>状态</th><th>负责人</th><th>人群规则</th><th>权益配置</th><th>创建时间</th><th>有效期至</th><th>操作</th></tr></thead><tbody>' + data.rows.map(row => '<tr data-row="'+esc(row.id)+'"><td><button class="link-button name-cell" data-detail="'+esc(row.id)+'">'+esc(row.name)+'</button><div class="id-cell">'+esc(row.id)+'</div></td><td>'+esc(row.scene)+'</td><td><span class="status '+(row.status==='进行中'?'running':row.status==='审批中'?'pending':'')+'">'+esc(row.status)+'</span></td><td>'+esc(row.owner)+'</td><td>'+esc(ruleLabels[row.rule]||row.rule)+'<div class="id-cell">'+esc(row.rule)+'</div></td><td>'+esc(benefitLabels[row.benefit]||row.benefit)+'<div class="id-cell">'+esc(row.benefit)+'</div></td><td>'+esc(row.created)+'</td><td>'+esc(row.validUntil)+'</td><td class="operation-cell"><button class="link-button" data-detail="'+esc(row.id)+'">详情</button><button class="link-button" data-more="'+esc(row.id)+'" aria-label="更多操作 '+esc(row.name)+'" aria-expanded="false">更多 ▾</button><div class="row-menu" hidden><button data-clone="'+esc(row.id)+'">克隆玩法</button><button data-detail="'+esc(row.id)+'">查看配置</button></div></td></tr>').join('') + '</tbody></table>' : '<div class="empty">暂无符合条件的玩法</div>';
      const pages=Math.max(1,Math.ceil(data.total/state.pageSize));
      panel.querySelector('#pagination').innerHTML='<span class="muted">每页 '+state.pageSize+' 条 · 第 '+state.page+' / '+pages+' 页</span><button data-page="'+Math.max(1,state.page-1)+'" '+(state.page===1?'disabled':'')+' aria-label="上一页">‹</button>'+Array.from({length:Math.min(pages,5)},(_,i)=>'<button class="'+(state.page===i+1?'selected':'')+'" data-page="'+(i+1)+'">'+(i+1)+'</button>').join('')+'<button data-page="'+Math.min(pages,state.page+1)+'" '+(state.page===pages?'disabled':'')+' aria-label="下一页">›</button>';
    } catch(error) {panel.querySelector('#table-body').innerHTML='<div class="empty">'+esc(error.message)+'</div>';}
  }
  async function openDetail(panel,id) {
    try {
      const {activity}=await request('activities/'+encodeURIComponent(id));
      const layer=panel.querySelector('#detail-layer');
      layer.innerHTML='<div class="drawer-overlay"><div class="drawer"><div class="drawer-header"><h2>玩法详情</h2><button class="drawer-close" data-close-detail aria-label="关闭详情">×</button></div><activity-detail></activity-detail><iframe class="microframe" title="规则与权益配置说明" src="'+pageBase+'/reference-frame?runId='+encodeURIComponent(runId)+'"></iframe><div style="margin-top:20px"><button class="primary-button" data-drawer-clone="'+esc(activity.id)+'">克隆玩法</button></div></div></div>';
      const host=layer.querySelector('activity-detail');
      const shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML='<style>:host{display:block;font:14px system-ui;color:#1d2129}dl{display:grid;grid-template-columns:110px 1fr;gap:11px}dt{color:#86909c}dd{margin:0}h3{margin:0 0 8px}</style><h3>'+esc(activity.name)+'</h3><div style="color:#86909c">'+esc(activity.id)+'</div><dl><dt>活动场景</dt><dd>'+esc(activity.scene)+'</dd><dt>当前状态</dt><dd>'+esc(activity.status)+'</dd><dt>负责人</dt><dd>'+esc(activity.owner)+'</dd><dt>人群规则</dt><dd>'+esc(activity.rule)+'</dd><dt>权益配置</dt><dd>'+esc(activity.benefit)+'</dd><dt>单人参与次数</dt><dd>'+esc(activity.frequency)+'</dd><dt>有效期</dt><dd>'+esc(activity.validUntil)+'</dd></dl>';
      layer.querySelector('[data-close-detail]').onclick=()=>{layer.innerHTML='';};
      layer.querySelector('[data-drawer-clone]').onclick=()=>{layer.innerHTML='';startClone(id);};
      layer.querySelector('.drawer-overlay').addEventListener('click',event=>{if(event.target.classList.contains('drawer-overlay'))layer.innerHTML='';});
    } catch(error){notice(error.message);}
  }
  async function startClone(id) {
    try {
      const data=await post('session/open',{sourceId:id});
      const cloneId='clone';
      if(tabs.has(cloneId)){tabs.get(cloneId).panel.remove();tabs.delete(cloneId);}
      const panel=document.createElement('section');panel.className='panel';panel.dataset.panel=cloneId;panel.hidden=true;root.append(panel);
      tabs.set(cloneId,{panel});buildWizard(panel,data.wizard,data.source);openTab(cloneId);
    } catch(error){notice(error.message);}
  }
  function buildWizard(panel,wizard,source) {
    const state={wizard,source,current:1,rules:[],benefits:[],busy:false,confirmed:false,submissionId:'submit-'+runId+'-'+Date.now().toString(36)};
    panel.__wizardState=state;
    panel.innerHTML='<div class="breadcrumb">营销玩法 / 触点玩法 / <b>克隆玩法</b></div><div class="page-heading"><div><h1>克隆玩法</h1><div class="subheading">来源：'+esc(source.name)+' · '+esc(source.id)+'</div></div></div><div class="wizard"><div class="stepbar" id="stepbar"></div><div class="wizard-body"><section class="wizard-step" data-step="1"><h2>1. 基础信息</h2><div class="notice-box">克隆时沿用来源配置。玩法名称可调整，有效期需重新选择。</div><div class="form-line"><label class="required" for="copy-name">玩法名称</label><div><input id="copy-name" maxlength="64" value="'+esc(wizard.basic.name)+'"><small>3–64 个字符，同一玩法下名称应清晰可辨</small></div></div><div class="form-line"><label class="required" for="copy-scene">活动场景</label><select id="copy-scene"><option>触点玩法</option><option>收银台玩法</option><option>优惠券</option><option>任务营销</option></select></div><div class="form-line"><label class="required">有效期</label><div class="form-row"><input id="start-date" type="date" aria-label="开始日期"><input id="end-date" type="date" aria-label="结束日期"></div></div><div class="form-line"><label for="copy-description">玩法说明</label><div><input id="copy-description" placeholder="可选：填写玩法目标或备注"></div></div></section><section class="wizard-step" data-step="2" hidden><h2>2. 参与人群</h2><div class="notice-box">规则列表由配置服务加载。权益候选会根据所选规则更新。</div><div class="form-line"><label class="required" for="rule-select">人群规则</label><div><select id="rule-select"><option value="">正在加载规则...</option></select><small id="rule-description"></small></div></div><div class="form-line"><label class="required">参与用户</label><div class="radio-row"><label><input type="radio" name="audience" value="all" checked> 全部符合规则用户</label><label><input type="radio" name="audience" value="new"> 新客</label><label><input type="radio" name="audience" value="returning"> 回流用户</label></div></div></section><section class="wizard-step" data-step="3" hidden><h2>3. 参与与发放频控</h2><div class="form-line"><label class="required" for="frequency-limit">单人参与次数</label><div><input id="frequency-limit" type="number" min="1" max="10" value="'+esc(wizard.frequency.limit)+'"><small>允许 1–10 次</small></div></div><div class="form-line"><label class="required" for="frequency-period">限制周期</label><select id="frequency-period"><option value="day">每天</option><option value="week">每周</option><option value="campaign">活动期间</option></select></div><div class="form-line"><label for="grant-mode">发放方式</label><select id="grant-mode"><option>实时发放</option><option>次日发放</option></select></div></section><section class="wizard-step" data-step="4" hidden><h2>4. 发放权益</h2><div class="notice-box" id="benefit-notice">正在按人群规则加载可用权益...</div><div class="form-line"><label class="required" for="benefit-select">权益类型</label><select id="benefit-select" disabled><option value="">正在加载权益...</option></select></div><div class="form-line"><label class="required" for="benefit-quantity">单次发放数量</label><div><input id="benefit-quantity" type="number" min="1" max="1000" value="1"><small>允许 1–1000</small></div></div></section><section class="wizard-step" data-step="5" hidden><h2>5. 差异预览</h2><div class="notice-box">请核对新副本与来源玩法的配置差异，确认后再提交。</div><div id="preview-content"></div><button class="plain-button" data-open-confirm>查看并确认差异</button><span id="confirm-indicator" class="muted" style="margin-left:10px">尚未确认</span></section><section class="wizard-step" data-step="6" hidden><h2>6. 预警配置</h2><div class="notice-box">玩法副本已创建。可继续设置异常预警；本演练在此阶段结束。</div><div id="created-detail"></div><div class="warning-box">预警配置尚未保存。</div><div class="form-line"><label for="alarm-threshold">单日发放预警阈值</label><input id="alarm-threshold" type="number" placeholder="请输入阈值"></div></section></div><div class="wizard-footer"><button class="plain-button" data-previous>上一步</button><button class="primary-button" data-next>下一步</button><button class="primary-button" data-submit hidden>提交</button></div></div><div id="wizard-modal"></div>';
    panel.querySelector('#copy-scene').value=wizard.basic.scene;
    panel.querySelector('#rule-select').onchange=()=>{ const rule=state.rules.find(item=>item.id===panel.querySelector('#rule-select').value);panel.querySelector('#rule-description').textContent=rule?rule.segment:'';loadBenefits(panel); };
    panel.querySelector('[data-next]').onclick=()=>advance(panel);
    panel.querySelector('[data-previous]').onclick=()=>{if(state.current>1 && state.current<6){state.current--;showStep(panel);}};
    panel.querySelector('[data-open-confirm]').onclick=()=>openConfirm(panel);
    panel.querySelector('[data-submit]').onclick=()=>submitClone(panel);
    Promise.all([request('reference/rules'),request('activities/'+encodeURIComponent(source.id))]).then(([data,detail])=>{
      if(!panel.isConnected)return;
      state.rules=data.rules;
      const select=panel.querySelector('#rule-select');
      select.innerHTML=data.rules.map(rule=>'<option value="'+esc(rule.id)+'">'+esc(rule.name)+'</option>').join('');
      select.value=wizard.people.ruleId;
      select.dispatchEvent(new Event('change'));
      state.source=detail.activity;
    }).catch(error=>notice(error.message));
    showStep(panel);
  }
  async function loadBenefits(panel) {
    const state=panel.__wizardState, ruleId=panel.querySelector('#rule-select').value, select=panel.querySelector('#benefit-select');
    select.disabled=true;select.innerHTML='<option value="">正在加载权益...</option>';state.benefits=[];
    try {
      const data=await request('reference/benefits?ruleId='+encodeURIComponent(ruleId));
      if(!panel.isConnected || panel.querySelector('#rule-select').value!==ruleId)return;
      state.benefits=data.benefits;select.innerHTML=data.benefits.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+' · 库存 '+esc(item.stock)+'</option>').join('');
      select.value=data.benefits.some(item=>item.id===state.wizard.entitlement.benefitId)?state.wizard.entitlement.benefitId:(data.benefits[0]?.id||'');
      select.disabled=false;
      panel.querySelector('#benefit-notice').textContent='已根据「'+(state.rules.find(item=>item.id===ruleId)?.name||'当前规则')+'」加载 '+data.benefits.length+' 种可用权益。';
    } catch(error){panel.querySelector('#benefit-notice').textContent=error.message;}
  }
  function showStep(panel) {
    const state=panel.__wizardState,step=state.current;
    panel.querySelectorAll('.wizard-step').forEach(item=>item.hidden=Number(item.dataset.step)!==step);
    panel.querySelector('#stepbar').innerHTML=['基础信息','参与人群','参与频控','发放权益','差异预览','预警配置'].map((name,i)=>'<div class="step '+(i+1===step?'active':i+1<step?'done':'')+'"><span class="step-index">'+(i+1<step?'✓':i+1)+'</span>'+name+'</div>').join('');
    panel.querySelector('[data-previous]').hidden=step===1||step===6;
    panel.querySelector('[data-next]').hidden=step>=5;
    panel.querySelector('[data-submit]').hidden=step!==5;
    if(step===5) drawPreview(panel);
  }
  function stepData(panel,step) {
    const $=selector=>panel.querySelector(selector);
    if(step===1)return {name:$('#copy-name').value.trim(),scene:$('#copy-scene').value,startDate:$('#start-date').value,endDate:$('#end-date').value,description:$('#copy-description').value.trim()};
    if(step===2)return {ruleId:$('#rule-select').value,audience:panel.querySelector('input[name="audience"]:checked')?.value};
    if(step===3)return {limit:Number($('#frequency-limit').value),period:$('#frequency-period').value,grantMode:$('#grant-mode').value};
    return {benefitId:$('#benefit-select').value,quantity:Number($('#benefit-quantity').value),ruleId:$('#rule-select').value};
  }
  async function advance(panel) {
    const state=panel.__wizardState,step=state.current;if(state.busy)return;
    if(step===2 && !state.rules.length){notice('人群规则尚未加载');return;}
    if(step===4 && (panel.querySelector('#benefit-select').disabled||!state.benefits.length)){notice('权益列表尚未加载');return;}
    state.busy=true;panel.querySelector('[data-next]').disabled=true;
    try { const data=await post('session/step',{sessionId:state.wizard.sessionId,step,data:stepData(panel,step)});state.wizard=data.wizard;state.confirmed=false;panel.querySelector('#confirm-indicator').textContent='尚未确认';state.current=step+1;showStep(panel); }
    catch(error){notice(error.message);}finally{state.busy=false;panel.querySelector('[data-next]').disabled=false;}
  }
  function drawPreview(panel) {
    const state=panel.__wizardState,w=state.wizard,s=state.source;
    const fields=[['玩法名称',s.name,w.basic.name],['活动场景',s.scene,w.basic.scene],['有效期至',s.validUntil,w.basic.endDate],['人群规则',s.rule,w.people.ruleId],['单人参与次数',s.frequency,w.frequency.limit],['发放权益',s.benefit,w.entitlement.benefitId],['单次发放数量','来源配置',w.entitlement.quantity]];
    panel.querySelector('#preview-content').innerHTML='<table class="diff-table"><thead><tr><th>配置项</th><th>来源玩法</th><th>新副本</th></tr></thead><tbody>'+fields.map(row=>'<tr><td>'+esc(row[0])+'</td><td>'+esc(row[1])+'</td><td class="diff-new">'+esc(row[2])+'</td></tr>').join('')+'</tbody></table>';
  }
  function openConfirm(panel) {
    const state=panel.__wizardState;if(state.current!==5)return;
    const modal=panel.querySelector('#wizard-modal');
    modal.innerHTML='<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="确认玩法差异"><h2>确认玩法差异</h2><p>新副本将以「'+esc(state.wizard.name)+'」创建，来源玩法保持不变。</p><div class="warning-box">请核对有效期、人群规则与权益配置。提交成功后将进入预警配置。</div><div class="modal-actions"><button class="plain-button" data-cancel-confirm>返回核对</button><button class="primary-button" data-confirm-diff>确认差异</button></div></div></div>';
    modal.querySelector('[data-cancel-confirm]').onclick=()=>{modal.innerHTML='';};
    modal.querySelector('[data-confirm-diff]').onclick=async()=>{try{await post('session/preview',{sessionId:state.wizard.sessionId,confirmed:true});state.confirmed=true;panel.querySelector('#confirm-indicator').textContent='已确认';modal.innerHTML='';notice('差异已确认');}catch(error){notice(error.message);}};
  }
  async function submitClone(panel) {
    const state=panel.__wizardState;if(state.busy)return;
    if(!state.confirmed){notice('请先查看并确认差异');return;}
    state.busy=true;panel.querySelector('[data-submit]').disabled=true;
    let uncertain=false;
    try{await post('clone'+(new URLSearchParams(location.search).get('fault')==='commit503'?'?fault=commit503':''),{sessionId:state.wizard.sessionId,submissionId:state.submissionId,name:state.wizard.name});}
    catch(error){if(error.status!==503){notice(error.message);state.busy=false;panel.querySelector('[data-submit]').disabled=false;return;}uncertain=true;}
    try{
      const data=await request('result');
      const copy=data.result.copies.find(item=>item.name===state.wizard.name&&item.id===data.result.latestCopy?.id);
      if(!copy){notice('提交结果未确认，请查看列表后再处理');return;}
      state.current=6;state.copy=copy;panel.querySelector('#created-detail').innerHTML='<div class="detail-grid"><dt>新玩法编号</dt><dd>'+esc(copy.id)+'</dd><dt>玩法名称</dt><dd>'+esc(copy.name)+'</dd><dt>当前状态</dt><dd>'+esc(copy.status)+'</dd></div>';
      showStep(panel);notice(uncertain?'已通过独立读回确认创建成功':'副本创建成功');
      for(const [id,tab] of tabs)if(tab.panel.__listState)loadList(tab.panel);
    }catch(error){notice('读回失败：'+error.message);}finally{state.busy=false;panel.querySelector('[data-submit]').disabled=false;}
  }
  drawMenu();openTab('touchpoint');
})();
`;
