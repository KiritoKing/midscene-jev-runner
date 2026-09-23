# Midscene JEV Runner

面向 [Midscene Test](https://midscenejs.com/zh/midscene-test/overview) 的社区维护
JEV 集成。本项目独立于 Midscene 仓库，不是 Midscene 官方包。

本包提供：

- `runJev(page, options)`：在调用方持有的 Playwright `Page` 上运行有界
  ReAct 循环。
- `evaluateJevAssertion(page, options)`：基于当前页面观察执行一次只读断言。
- `waitForJevAssertion(page, options)`：只读重试当前页面条件，直到成立或超时。
- `createJevNodes(options)`：注册严格 schema 的 `jevAct`、`jevAssert` 与
  `jevWaitFor` 节点。

`jevAct` 应作为单个原子 `aiAct` 意图的更快替代，而不是自主完成整条测试用例的
规划器。一个原子交互若会打开菜单或浮层，节点内部仍可执行一段很短的有界动作；完整
流程则应拆成有序的 Midscene Test steps。Runner 会在每次动作后重新观察，直到返回
`DONE`、`BLOCKED` 或达到配置上限。它的动作空间刻意不包含文本：只能点击、选择、
滚动、等待和关闭。它不会生成文本、填充或清空输入框，也不会创建导航、拦截请求或
关闭传入的页面。

## 安装

```sh
pnpm add @chlrc/midscene-jev-runner @midscene/test playwright
```

要求 Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`。

## 测试本仓库

`pnpm check` 执行离线 Chromium 场景集成验收、lint、类型检查、构建和包冒烟。
`pnpm test:e2e` 使用真实 JEV 与 Midscene 模型运行四个本地场景，需显式注入进程凭据。
配置、独立断言、`SELECT` 当前值与目标值契约、CI 门禁及 Red → Green 流程见[场景测试说明](./docs/testing.md)。
版本、changelog、tag 与 npm 发布的边界见[发布流程](./docs/releasing.md)。
原有单元和实验测试可通过 `pnpm test:legacy` 单独运行。

## 配置 JEV

凭据只能通过进程环境变量传入，不要写进 YAML：

```sh
export MIDSCENE_JEV_API_KEY=...
```

默认使用 TypeSafe System One：`POST https://api.typesafe.ai/v1/systemone`，
模型为 `jev-latest`。Runner 只读取 `MIDSCENE_JEV_API_KEY`，不会回退读取
`OPENROUTER_API_KEY`。

客户端发送文档规定的 System One 请求体（`model`、`state`、类型化
`questions`），因此服务端必须兼容该请求及响应结构。OpenRouter Key 不能替代
TypeSafe Key。使用本项目已验证的 OpenRouter Decisions 路径时，应显式配置完整
端点：

```sh
export MIDSCENE_JEV_API_KEY=...
export MIDSCENE_JEV_BASE_URL=https://openrouter.ai/api/alpha/decisions
export MIDSCENE_JEV_MODEL_NAME=jev-latest
```

`MIDSCENE_JEV_BASE_URL` 有两种合法语义：兼容 API 根路径（客户端会追加
`/systemone`），或以 `/systemone`、`/decisions` 结尾的完整端点（原样使用）。不要把
服务商网站裸域名当作 API 根路径，除非它确实在该位置提供 System One 资源。服务商
模型命名不同时设置 `MIDSCENE_JEV_MODEL_NAME`。不要指向仅支持 Chat Completions 的
端点：两者请求和响应 schema 不同；成功返回 HTML 或返回不兼容 JSON 结构时，客户端
会明确报告端点配置错误。

## 与 Midscene 原生节点组合

JEV 不负责文本输入。应由*使用本包的项目*注册 Midscene 标准节点，并在有界
`jevAct` 前通过 `aiInput` 提供调用方选定的文本。`createJevNodes()` 只注册
`jevAct`、`jevAssert` 和 `jevWaitFor`；只有消费者通过公开 `createMidsceneNodes()` factory 注册
Agent class 后，`aiInput` 才存在。

下面是消费者项目的配置示例，需要它自己安装 `@midscene/web`。本包及可运行的
`example/` 目录都不会导入该依赖。

```ts
import { createJevNodes } from '@chlrc/midscene-jev-runner';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { chromium, type Browser, type Page } from 'playwright';

interface ProjectContext {
  browser: Browser;
  page: Page;
  agent?: PlaywrightAgent;
}

const setup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  platform: 'web',
  async setup({ onTeardown }) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://your-safe-test-page.example');
    onTeardown(() => browser.close());
    return { browser, page };
  },
});

const midsceneNodes = createMidsceneNodes<ProjectContext>({
  agentClass: PlaywrightAgent,
  getAgent: ({ context }) => {
    context.agent ??= new PlaywrightAgent(context.page);
    return context.agent;
  },
});
const jevNodes = createJevNodes<ProjectContext>({
  getPage: ({ context }) => context.page,
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'web',
      platform: 'web',
      setup,
      files: { include: ['cases/**/*.yaml'] },
    },
  ],
  nodes: [...midsceneNodes, ...jevNodes],
});
```

完成上述注册后，一个 case 可以显式组合两个能力：

```yaml
cases:
  - name: 先输入文本，再完成非文本交互并验收
    steps:
      - aiInput:
          prompt: 搜索输入框
          value: 由调用方提供的搜索词
      - jevAct:
          goal: 为当前查询触发搜索动作。
          maxSteps: 4
          maxTaskMs: 30000
      - jevAssert:
          prompt: 所需结果和完成证据均可见。
          message: 页面没有展示预期的完成证据。

      # 异步结果可改用 jevWaitFor：
      # - jevWaitFor:
      #     prompt: 所需结果已经可见。
      #     options: { timeoutMs: 30000, checkIntervalMs: 3000 }
```

变更节点注册后应生成消费者项目的 Node Spec。它才是该安装版本中原生 `aiInput`
输入 schema 的唯一依据。

## 完成与断言证据

有副作用的流程请提供 `verifyCompletion`。JEV 的 `DONE` 只是模型输出，不是业务
成功证明。Runner 会在动作后及下一次模型决策前调用校验器，使异步完成能停止循环，
不会继续产生额外变更。

`jevAssert` 与 `evaluateJevAssertion` 均为只读：它们分别询问条件是否成立，以及
已观察的证据是否足够。只有两项由模型评估的概率均达到阈值才通过。证据充分且条件
概率不高于对称失败阈值时返回 `fail`；证据不足，或条件概率位于通过与失败阈值之间
时返回 `indeterminate`。这些概率不是
JEV 已看见所有隐藏或页面外缺口的确定性保证；页面外事实应继续使用确定性的应用或
API 校验。

`jevWaitFor` 重复同样的只读判断，接受 `prompt` 与可选的
`options.context`。`options.timeoutMs` 默认 15000 毫秒，
`options.checkIntervalMs` 默认 3000 毫秒；两次检查的开始时间至少间隔该值。
在超时窗口内启动的检查允许在窗口后结束。通过时返回检查次数、最后一次断言和
汇总模型用量；超时使 Step 失败，并保留诊断数据。Provider 或观察错误立即失败，
取消信号会终止等待。每轮均请求模型；无需语义条件时请用固定时长的 `wait` 节点。

## 从旧文本路径迁移

公开的 `TYPE_TEXT` 动作、文本生成、填充、清空、`textUsage`，以及全部
`MIDSCENE_JEV_TEXT_*` / `MIDSCENE_MODEL_*` 文本服务配置均已移除。把确定的输入值
移到消费者 Agent 注册的标准 Midscene `aiInput` step；之后由 `jevAct` 运行有界、
非文本 ReAct 循环，最后用 `jevAssert` 验证页面状态。

## 安全与通用性

- 鉴权、导航、请求拦截、清理及领域写入门禁由调用方负责。
- 发给模型的 URL 会移除 query 和 fragment；密码、文件输入会排除在 JEV 动作空间外。
- Provider 选择只是传输配置，不得成为站点特化分支。
- 候选硬过滤只能来自可观察的 HTML、ARIA、禁用/可见状态，或明确的安全边界；不得
  编码业务名、路由、固定字段文案、ID 或假定的操作顺序。文本和校验线索可以排序，
  但不能把业务假设变成全局硬过滤。

可运行的 [`example/`](./example) 仅使用本包的非文本节点与现有依赖；它不会声称已
注册 `aiInput`。

## 许可证

MIT。DOM snapshot 实现改编自 `jev-ultrafast`，详见
[`THIRD_PARTY_LICENSES.txt`](./THIRD_PARTY_LICENSES.txt)。

English documentation: [README.md](./README.md)。
