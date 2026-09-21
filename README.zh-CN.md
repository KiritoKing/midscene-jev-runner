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
pnpm add midscene-jev-runner @midscene/test playwright
```

要求 Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`。

## 配置

凭据只能通过进程环境变量传入，不要写入 YAML：

```sh
export MIDSCENE_JEV_API_KEY=...
export MIDSCENE_JEV_BASE_URL=https://your-jev-endpoint/v1
export MIDSCENE_JEV_MODEL_NAME=jev-latest
```

`MIDSCENE_JEV_MODEL_NAME` 默认是 `jev-latest`。如任务包含 `TYPE_TEXT`，还需
配置 `MIDSCENE_JEV_TEXT_API_KEY`、`MIDSCENE_JEV_TEXT_BASE_URL`、
`MIDSCENE_JEV_TEXT_MODEL_NAME`，或对应的 `MIDSCENE_MODEL_*` 环境变量。

## 注册 Midscene Test 节点

```ts
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createJevNodes } from 'midscene-jev-runner';
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

## 直接调用

```ts
import { runJev } from 'midscene-jev-runner';

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
