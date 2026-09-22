# Midscene JEV Runner

面向 [Midscene Test](https://midscenejs.com/zh/midscene-test/overview) 的社区维护
JEV Runner。本项目独立于 Midscene 仓库，不是 Midscene 官方包。

本包提供：

- `runJev(page, options)`：直接在 Playwright 中运行 JEV。
- `createJevNodes(options)`：向 Midscene Test 注册严格 schema 的 `jevAct`
  节点。
- 调用方持有浏览器生命周期：Runner 不创建、导航、路由或关闭传入的
  Playwright `Page`。
- 可选的独立完成校验和结构化 observer 事件。

## 安装

```sh
pnpm add @chlrc/midscene-jev-runner @midscene/test playwright
```

要求 Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`。

## 配置

凭据只能通过进程环境变量传入，不要写入 YAML：

```sh
export OPENROUTER_API_KEY=...
```

Runner 默认请求 OpenRouter Decisions 的
`https://openrouter.ai/api/alpha/decisions`，模型为
`~typesafe/jev-latest`。兼容旧配置，未设置 `OPENROUTER_API_KEY` 时会回退读取
`MIDSCENE_JEV_API_KEY`；兼容网关可通过 `MIDSCENE_JEV_BASE_URL` 和
`MIDSCENE_JEV_MODEL_NAME` 覆盖。

如任务包含 `TYPE_TEXT`，还需
配置 `MIDSCENE_JEV_TEXT_API_KEY`、`MIDSCENE_JEV_TEXT_BASE_URL`、
`MIDSCENE_JEV_TEXT_MODEL_NAME`，或对应的 `MIDSCENE_MODEL_*` 环境变量。

## 注册 Midscene Test 节点

```ts
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createJevNodes } from '@chlrc/midscene-jev-runner';
import { chromium, type Browser, type Page } from 'playwright';

interface ProjectContext {
  browser: Browser;
  page: Page;
}

const setup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  async setup({ onTeardown }) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://your-safe-test-page.example');
    onTeardown(() => browser.close());
    return { browser, page };
  },
});

const nodes = createJevNodes<ProjectContext>({
  getPage: ({ context }) => context.page,
  verifyCompletion: async ({ page }) =>
    page.getByText('Complete', { exact: false }).isVisible(),
});

export default defineTestProject<ProjectContext>({
  projects: [{ name: 'jev', files: { include: ['midscene.yaml'] }, setup }],
  nodes,
});
```

```yaml
cases:
  - name: JEV completes a browser task
    steps:
      - jevAct:
          goal: Complete the task and leave visible evidence of completion.
          maxSteps: 20
          maxTaskMs: 180000
```

对任何有副作用的流程都强烈建议提供 `verifyCompletion`。未提供时，`DONE`
仅表示模型判断任务已完成，不代表业务验收成功。

从 `0.1.1` 起，Runner 会在动作执行后以及下一次模型决策前调用完成校验，
避免页面异步完成后继续产生多余操作。

从 `0.1.2` 起，页面观察采用站点无关、可感知工作流的通用实现：向模型提供
无障碍控件、字段状态、可见步骤、校验反馈和活动弹层，不依赖应用特有选择器。
Runner 还会跨无关 DOM 重渲染抑制重复的语义失败，在执行前重新检查目标是否被
遮挡，并可关闭与目标无关的活动弹层，同时仍不接管调用方的 `Page` 生命周期。

## 直接调用

```ts
import { runJev } from '@chlrc/midscene-jev-runner';

const result = await runJev(page, {
  goal: 'Complete the form',
  verifyCompletion: async ({ page }) => page.getByText('Complete').isVisible(),
});
```

完整 Midscene Test 配置见 [`example/`](./example)。

## 安全与职责边界

- 发给模型的 URL 会移除 query 和 fragment。
- action space 会排除密码和文件输入框。
- Runner 不记录 API Key 或 Authorization Header。
- 鉴权、请求拦截、导航、清理和领域写入门禁由调用方负责。

## 许可证

MIT。DOM snapshot 实现改编自 `jev-ultrafast`，详见
[`THIRD_PARTY_LICENSES.txt`](./THIRD_PARTY_LICENSES.txt)。

English documentation: [README.md](./README.md).
