# 新品订阅通知（product-notify）功能与流程文档

## 1. 项目简介

一个 Shopify 嵌入式应用：

- 顾客在店铺前台用邮箱订阅「新品通知」。
- 商家在 Shopify 后台选择一个在售商品，一键给本店所有订阅者发送新品邮件。
- 每家店铺使用自己的发件人，订阅者与发件人数据按店铺隔离。

技术栈：Remix、Polaris 12、App Bridge 4、Prisma（SQLite）、Resend（发邮件）、React Email（邮件模板）、主题应用扩展（前台订阅区块）、App Proxy（前台到应用的通道）。

## 2. 功能清单

| 角色 | 功能 | 入口 |
| --- | --- | --- |
| 顾客 | 在店铺页面提交邮箱订阅 | 主题区块「新品订阅」 |
| 商家 | 查看首页概览：店铺、订阅者数量、当前发件人 | 后台 `/app` |
| 商家 | 查看订阅者列表（邮箱、订阅时间） | `/app/subscribers` |
| 商家 | 设置本店发件人名称和发件邮箱 | `/app/settings` |
| 商家 | 选择商品并给全部订阅者发送新品通知 | `/app/notify` |
| 系统 | 响应卸载、权限变更、合规数据请求并清理数据 | `/webhooks/*` |

## 3. 系统架构

```mermaid
flowchart LR
    subgraph Storefront["店铺前台（顾客）"]
        A["主题编辑器添加「新品订阅」区块"] --> B["订阅表单：邮箱输入框 + 订阅按钮"]
    end

    subgraph Admin["Shopify 后台（商家）"]
        H["首页：新品订阅通知"]
        S1["发件设置"]
        S2["订阅者列表"]
        S3["发送通知"]
        H --> S1
        H --> S2
        H --> S3
    end

    subgraph App["Remix 应用服务"]
        P["/api/subscribe 订阅接口"]
        R1["app.settings 发件设置"]
        R2["app.subscribers 订阅者"]
        R3["app.notify 发送通知"]
        W["webhooks 生命周期与合规"]
    end

    subgraph DB["SQLite 数据库"]
        T1[("Subscriber 订阅者")]
        T2[("ShopSender 发件人")]
        T3[("Session 会话")]
    end

    B -->|"POST 经 App Proxy /apps/subscribe"| P
    P --> T1
    S1 --> R1 --> T2
    S2 --> R2 --> T1
    S3 --> R3
    R3 --> T1
    R3 --> T2
    R3 -->|"GraphQL 查商品"| SH["Shopify Admin API"]
    R3 -->|"逐封发送"| RS["Resend 邮件服务"]
    RS --> M["订阅者邮箱"]
    SH -.->|"卸载与合规通知"| W
    W --> T1
    W --> T2
    W --> T3
```

## 4. 数据模型

```mermaid
erDiagram
    Subscriber {
        int id PK
        string shop "店铺域名 xxx.myshopify.com"
        string email "已转小写"
        datetime createdAt
    }
    ShopSender {
        string shop PK "每店一条"
        string fromName "可为空"
        string fromEmail
        datetime updatedAt
    }
    Session {
        string id PK
        string shop
        string accessToken
        string scope
    }
```

- `Subscriber` 对 `(shop, email)` 有唯一约束，同一店铺同一邮箱不会重复。
- `ShopSender` 以 `shop` 为主键，一家店只有一个发件人。
- `Session` 由 Shopify 应用框架管理，保存登录会话与访问令牌。
- 三张表之间没有外键，靠 `shop` 字段关联。

## 5. 路由与文件对照

| 路径 | 文件 | 说明 |
| --- | --- | --- |
| `/app` | `app/routes/app._index.tsx` | 首页，三个入口按钮 |
| `/app/subscribers` | `app/routes/app.subscribers.tsx` | 订阅者列表 |
| `/app/settings` | `app/routes/app.settings.tsx` | 发件设置 |
| `/app/notify` | `app/routes/app.notify.tsx` | 发送通知 |
| `/api/subscribe` | `app/routes/api.subscribe.tsx` | 前台订阅接口，经 App Proxy 访问 |
| `/webhooks/app/uninstalled` | `app/routes/webhooks.app.uninstalled.tsx` | 应用被卸载 |
| `/webhooks/app/scopes_update` | `app/routes/webhooks.app.scopes_update.tsx` | 权限变更 |
| `/webhooks/customers/data_request` | `app/routes/webhooks.customers.data_request.tsx` | 顾客数据查询 |
| `/webhooks/customers/redact` | `app/routes/webhooks.customers.redact.tsx` | 顾客数据删除 |
| `/webhooks/shop/redact` | `app/routes/webhooks.shop.redact.tsx` | 店铺数据删除 |
| `/auth/*` | `app/routes/auth.$.tsx`、`app/routes/auth.login/` | 登录与授权 |
| 前台区块 | `extensions/subscription-form/` | 订阅表单（Liquid、JS、CSS） |
| 邮件模板 | `app/emails/NewProductNotification.tsx` | 新品通知邮件 |

## 6. 流程图

### 6.1 顾客订阅

```mermaid
flowchart TD
    A["顾客在店铺页面输入邮箱，点击订阅"] --> B["subscription-form.js 拦截表单提交"]
    B --> C["按钮置灰，POST 到 /apps/subscribe，带 shop 与 email"]
    C --> D["Shopify App Proxy 加签并转发到 /api/subscribe"]
    D --> E{"请求方法是 POST?"}
    E -->|否| E1["405 仅支持 POST"]
    E -->|是| F{"URL 带 signature?"}
    F -->|是| G["authenticate.public.appProxy 校验签名"]
    G --> G1{"签名通过?"}
    G1 -->|否| G2["401 订阅校验失败，请刷新页面后重试"]
    G1 -->|是| H["取签名里的 shop 作为可信店铺"]
    F -->|否| F1{"生产环境?"}
    F1 -->|是| F2["401 未授权的请求"]
    F1 -->|否| H2["开发环境放行，无可信店铺"]
    H --> I["读取表单"]
    H2 --> I
    I --> I1{"表单可读?"}
    I1 -->|否| I2["400 无法读取表单"]
    I1 -->|是| J["规范化邮箱：去空格、转小写、校验格式与长度"]
    J --> K["确定店铺：可信店铺，其次请求头、查询参数、表单字段，需匹配 xxx.myshopify.com"]
    K --> L{"识别到店铺?"}
    L -->|否| L1["400 无法识别店铺"]
    L -->|是| M{"邮箱格式有效?"}
    M -->|否| M1["400 邮箱格式不正确"]
    M -->|是| N["写入 Subscriber：shop + email"]
    N --> O{"唯一键冲突 P2002?"}
    O -->|否，写入成功| O1["200 订阅成功"]
    O -->|是，已订阅过| O2["200 该邮箱已订阅，无需重复提交"]
    O1 --> Z["前端显示返回的 message，按钮恢复"]
    O2 --> Z
    E1 --> Z
    G2 --> Z
    F2 --> Z
    I2 --> Z
    L1 --> Z
    M1 --> Z
```

要点：

- 生产环境必须带 App Proxy 签名，否则直接 401。
- 店铺以签名里的 `shop` 为准，表单里的 `shop` 只作为兜底，防止顾客伪造别家店铺。
- 重复订阅也返回成功，对顾客无感。

### 6.2 商家进入应用、发件设置、订阅者列表

```mermaid
flowchart TD
    A["商家在 Shopify 后台打开应用"] --> B["iframe 加载 /app，带 shop、host、id_token"]
    B --> C{"请求带有效 id_token?"}
    C -->|缺少| C1["跳转 /auth/session-token 中转页，App Bridge 取令牌后回跳"]
    C1 --> B
    C -->|有| D["authenticate.admin 校验令牌"]
    D --> E{"库里有可用 Session?"}
    E -->|否| E1["Token Exchange 换取离线令牌并保存"]
    E -->|是| F["使用已保存会话"]
    E1 --> F
    F --> G["首页：显示店铺名、订阅者数量、当前发件人"]
    G --> H["按钮：发件设置 / 查看订阅者 / 发送通知"]
    H --> I["点击后整页跳转并保留 shop、host 等查询串"]

    I --> S["发件设置页"]
    S --> S1["loader：读取本店 ShopSender，回填名称与邮箱"]
    S1 --> S2["商家填写发件人名称与发件邮箱，点击保存"]
    S2 --> S3{"名称长度不超过 80?"}
    S3 -->|否| S4["提示：发件人名称不能超过 80 个字符"]
    S3 -->|是| S5{"邮箱格式有效?"}
    S5 -->|否| S6["提示：请填写有效的发件邮箱"]
    S5 -->|是| S7["upsert ShopSender，主键为 shop"]
    S7 --> S8["提示：已保存本店发件人"]

    I --> L["订阅者页"]
    L --> L1["loader：按店铺查 Subscriber，按创建时间倒序"]
    L1 --> L2{"有订阅者?"}
    L2 -->|否| L3["空状态：还没有订阅者，请先添加「新品订阅」区块"]
    L2 -->|是| L4["表格：邮箱 + 订阅时间"]
```

要点：

- 首页三个按钮用整页跳转并保留 `shop`、`host`、`id_token` 等查询参数。如果用客户端路由跳转会丢掉这些参数，页面会被重定向到登录页，看起来像按钮没反应。
- 发件邮箱必须属于当前 Resend 账号里已验证的域名，否则发信会被 Resend 拒绝。

### 6.3 发送新品通知

```mermaid
flowchart TD
    A["打开「发送通知」页"] --> B["loader：并行查询订阅者数量与本店发件人"]
    B --> C["Admin GraphQL：最近更新的 50 个在售商品"]
    C --> D["页面展示商品下拉、预览与提示横幅"]
    D --> E{"可以发送？需同时满足"}
    E -->|"RESEND_API_KEY 未配置"| E1["警告：服务器尚未配置 RESEND_API_KEY"]
    E -->|"本店无发件人"| E2["警告：请先在「发件设置」填写"]
    E -->|"订阅者为 0 或没选商品"| E3["发送按钮禁用"]
    E -->|是| F["商家选择商品，点击发送通知"]

    F --> G["action：authenticate.admin"]
    G --> H{"productId 以 gid://shopify/Product/ 开头?"}
    H -->|否| H1["拒绝：请选择要通知的商品"]
    H -->|是| I{"getResend 有客户端?"}
    I -->|否| I1["拒绝：服务器尚未配置 RESEND_API_KEY"]
    I -->|是| J{"本店有 ShopSender?"}
    J -->|否| J1["拒绝：请先在「发件设置」填写本店发件人"]
    J -->|是| K["拼出 from：名称 + 邮箱"]
    K --> L["GraphQL 查商品标题、handle、线上链接、主图与店铺名"]
    L --> M{"查询有错误或商品不存在?"}
    M -->|是| M1["拒绝：返回错误信息或找不到该商品"]
    M -->|否| N["生成商品链接：优先 onlineStoreUrl，否则 店铺域名/products/handle，只允许 http 与 https"]
    N --> O{"链接有效?"}
    O -->|否| O1["拒绝：无法生成商品链接"]
    O -->|是| P["读取本店全部订阅者，按 id 升序"]
    P --> Q{"订阅者数量大于 0?"}
    Q -->|否| Q1["拒绝：当前店铺还没有订阅者"]
    Q -->|是| R["主图仅在 https 时使用"]

    R --> S["逐个订阅者循环发送"]
    S --> T["Resend 发送：主题「新品上架：商品名」，正文用 NewProductNotification 模板"]
    T --> U{"Resend 返回错误或抛出异常?"}
    U -->|是| U1["failed 加 1，记录日志"]
    U -->|否| U2["sent 加 1"]
    U1 --> V{"还有下一位?"}
    U2 --> V
    V -->|是| V1["等待 600ms，控制在约 2 封每秒"]
    V1 --> S
    V -->|否| W["返回 ok、sent、failed 与汇总消息"]
    W --> X{"结果"}
    X -->|"failed 为 0"| X1["绿色提示：发送完成"]
    X -->|"部分成功"| X2["黄色提示：成功 n 封，失败 m 封"]
    X -->|"全部失败"| X3["红色提示"]
```

邮件内容（`NewProductNotification`）：

- 商品主图（有则显示）
- 商品标题
- 「您好！您订阅的店铺 xxx 上新了：」
- 按钮「查看商品详情」，链接到商品页

### 6.4 生命周期与合规 Webhook

```mermaid
flowchart TD
    A["Shopify 发来 Webhook"] --> B["authenticate.webhook 校验 HMAC 签名"]
    B --> C{"主题"}

    C -->|"app/uninstalled 应用被卸载"| D{"Session 还存在?"}
    D -->|是| D1["删除该店铺所有 Session"]
    D -->|否| D2["跳过，可能是重复推送"]
    D1 --> D3["事务：删除该店 Subscriber 与 ShopSender"]
    D2 --> D3

    C -->|"app/scopes_update 权限变更"| E{"Session 存在?"}
    E -->|是| E1["更新 Session.scope 为最新权限"]
    E -->|否| E2["不处理"]

    C -->|"customers/redact 顾客删除请求"| F{"payload 里有顾客邮箱?"}
    F -->|是| F1["删除该店该邮箱的订阅记录"]
    F -->|否| F2["不处理"]

    C -->|"customers/data_request 顾客数据查询"| G{"payload 里有顾客邮箱?"}
    G -->|是| G1["按 shop + email 查询订阅记录，仅写日志"]
    G -->|否| G2["不处理"]

    C -->|"shop/redact 店铺数据删除"| H["事务：删除该店 Subscriber 与 ShopSender"]

    D3 --> Z["返回 200 空响应"]
    E1 --> Z
    E2 --> Z
    F1 --> Z
    F2 --> Z
    G1 --> Z
    G2 --> Z
    H --> Z
```

## 7. 配置说明

### 7.1 环境变量

| 变量 | 来源 | 说明 |
| --- | --- | --- |
| `SHOPIFY_API_KEY`、`SHOPIFY_API_SECRET`、`SCOPES`、`SHOPIFY_APP_URL` | `shopify app dev` 自动写入 | 应用身份与地址 |
| `RESEND_API_KEY` | 手动填写，在 https://resend.com/api-keys 创建 | 缺失时发送通知会被拒绝 |

发件名称和邮箱不放在环境变量里，由各店铺在「发件设置」里单独保存。

### 7.2 `shopify.app.toml`

- 权限：`read_products`、`write_app_proxy`。
- App Proxy：`/api/subscribe`，前台路径为 `/apps/subscribe`（`prefix = "apps"`，`subpath = "subscribe"`）。
- 前台区块里「订阅接口路径」默认 `/apps/subscribe`，需与上面的 prefix、subpath 保持一致。
- Webhook：`app/uninstalled`、`app/scopes_update`，以及三个合规主题 `customers/data_request`、`customers/redact`、`shop/redact`。

### 7.3 Resend 发件域名

- 发件邮箱必须是当前 Resend 账号里已验证域名下的邮箱，例如域名 `example.com` 验证通过后，可以用 `notify@example.com`。
- Resend 给域名生成的 `send`、`rsend` 之类子域名是退信与 SPF 用的，不能当作发件地址。
- DMARC 未生效不影响发信，但建议配置。

### 7.4 本地开发

```bash
pnpm install
pnpm dev          # 即 shopify app dev，会启动隧道、Vite 与代理
```

- 数据库为 SQLite（`prisma/dev.sqlite`），首次启动会自动应用迁移。
- `shopify app dev` 默认使用 Cloudflare 临时隧道，每次重启地址都会变，重启后需要在 Shopify 后台刷新应用页面。
- 开发预览的地址由 CLI 自动更新到应用配置里，无需手动修改 `shopify.app.toml`。

## 8. 已知限制

- 发送是同步循环，每封间隔 600ms。订阅者很多时，发送页需要保持打开，没有后台队列、断点续发或重试。
- 发送页只列出最近更新的 50 个在售商品。
- 没有退订功能，邮件中也没有退订链接。
- 没有「发送记录」，发送结果只在当次页面提示，失败的详情只写在服务端日志里。
- `customers/data_request` 只记录日志，不会向顾客返回数据。
- 数据库是 SQLite，适合开发和小规模使用，上线到多实例环境前需要换成托管数据库。
