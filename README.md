# iFix Workshop

为单技师电子产品维修工作室设计的订单追踪与经营管理系统。适用于电脑、手机、相机、电视、游戏主机及小家电等维修业务。

## 主要功能

- 从接收、检测、待件、维修、测试、可取件到已取件的完整工单流程
- 客户、设备、序列号、故障、交付日期与维修备注记录
- 零件采购、物流状态、到货日期及关联工单成本跟踪
- 报价、实际收费、收款状态、待收款与毛利汇总
- 逾期和紧急工单提醒、交付排期及历史工单搜索
- 响应式工作台，可在桌面和手机上使用

数据持久化在 Cloudflare D1，应用由 Cloudflare Workers 承载。

## 访问口令

整个站点（页面、`/api/workshop`、图片接口）由 `worker/auth.ts` 用 HTTP Basic Auth 保护。浏览器会弹出登录框：用户名任意，密码为 `APP_PASSWORD`。这是单一共享口令，不是账号系统。

- **部署**：口令存为 Cloudflare Secret，不进仓库。设置后再部署即可；以后改口令重新执行 `secret put`。

  ```bash
  npx wrangler secret put APP_PASSWORD
  npm run deploy:cloudflare
  ```

- **本地开发**：`localhost` 未配置口令时不校验。想在本地测试登录，在项目根目录创建 `.dev.vars`（已被 git 忽略）：

  ```
  APP_PASSWORD=本地测试口令
  ```

- **未配置时默认拒绝**：非 localhost 的请求在没有 `APP_PASSWORD` 时返回 503，不会因为漏配而公开数据。
- **失败限速**：同一 IP 在一个 15 分钟窗口内（从第一次输错算起）输错 5 次口令即被锁定，直到窗口结束，所以最长锁 15 分钟，期间连正确口令也会被拒绝（429，带 `Retry-After`）；输对一次会清零。失败记录存在 D1 的 `auth_failures` 表中（自动创建，无需迁移）。不带口令的请求不计数、也不写库。
  - 这是尽力而为的限速：能拖慢持续猜测，但挡不住同时发出的大量并发请求；它按单个 IP 计数，换 IP（包括同一 IPv6 /64 段内换地址）就能绕过。口令本身仍要足够长、足够随机。
  - D1 出错或超过 1 秒无响应时只会跳过限速，口令校验照常生效。
  - 本地开发（没有 `CF-Connecting-IP`）不限速。
  - 需要更强保护可在 Cloudflare 控制台增加 Rate limiting 规则或改用 Cloudflare Access。
- **链接预览**：整个站点都要口令，聊天软件抓不到页面的预览卡片，这是有意为之。

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`
- 构建时能访问 `fonts.googleapis.com` 和 `fonts.gstatic.com`：Geist 字体在构建时下载并自托管到 `dist/client/assets/_vinext_fonts/`。`.vinext/` 是生成的字体缓存，里面记录了构建机器的绝对路径，已被 git 忽略，不要提交（提交后换一台机器构建，字体地址会 404）。断网构建不会失败，页面会改为运行时从 Google Fonts CDN 加载字体。

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, then run `tests/*.test.mjs` (rendered metadata and the password gate)
- `npm run validate:artifact`: recheck an existing artifact's ESM `default.fetch` export (and its Sites manifest, if one is present)
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
