# 新品订阅通知（product-notify）部署文档

本文说明如何把应用部署到自己的 Linux 服务器。本地开发仍使用 SQLite，线上使用 MariaDB。

部署分成两件独立的事：

1. 在服务器上运行 Remix 应用，对外提供稳定的 HTTPS 地址。
2. 在开发电脑上执行 `pnpm run deploy`，把这个地址、OAuth 回调、权限、App Proxy、Webhook 和主题扩展同步到 Shopify。

`pnpm run deploy` 只更新 Shopify 侧的应用版本，不会把网站程序上传到服务器。

## 1. 发布前要改掉的配置

正式域名是 `https://notify.nxedc.net`，服务器代码目录是 `/www/code/shopify-product-notify`。`shopify.app.toml` 里的 `application_url` 和三条 `redirect_urls` 已经写成这个域名。服务器上的 `SHOPIFY_APP_URL` 必须与它相同。

仓库根目录的 `Dockerfile` 不能用于本次上线。它使用 Node 18 和 `npm ci`，而本项目要求 Node.js 22.12 及以上，依赖锁文件是 `pnpm-lock.yaml`。按下面的步骤在服务器上用 pnpm 安装并启动。

服务器上的代码必须包含：

- `prisma/mysql/schema.prisma`
- `prisma/mysql/migrations/`
- `package.json` 中的 `setup:production` 脚本

本地的 `prisma/dev.sqlite` 不会迁移到 MariaDB。上线后订阅者和发件设置都是空的，需要在店铺后台重新保存发件人。

## 2. 服务器要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Linux。应用监听本机端口，由反向代理提供 HTTPS |
| Node.js | **22 的最新版本，至少 22.12**。`package.json` 的范围是 `>=20.19 <22 \|\| >=22.12`，因此 22.12 及以上的长期支持版本都可以。不要使用 21、23，也不要使用 22.0 到 22.11。Node 20 虽在范围内，安全支持已于 2026 年 4 月结束 |
| pnpm | 9 或更新版本（锁文件为 lockfileVersion 9.0） |
| 数据库 | MariaDB。库和连接使用 `utf8mb4` |
| 域名 | `https://notify.nxedc.net`，证书有效 |
| 出站网络 | 服务器能访问 Shopify Admin API、`cdn.shopify.com` 和 `https://api.resend.com` |

防火墙只对公网开放 443。应用端口 `3000` 和 MariaDB 端口 `3306` 只允许本机访问。

应用在生产环境由 `remix-serve` 提供服务，读取 `PORT`，未设置时使用 `3000`。

## 3. 创建 MariaDB 库

在 MariaDB 中执行（把密码换成实际密码）：

```sql
CREATE DATABASE product_notify CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'product_notify'@'127.0.0.1' IDENTIFIED BY '请换成强密码';
GRANT ALL PRIVILEGES ON product_notify.* TO 'product_notify'@'127.0.0.1';
FLUSH PRIVILEGES;
```

连接串格式：

```text
mysql://product_notify:请换成强密码@127.0.0.1:3306/product_notify
```

密码里如果有 `@`、`:`、`/`、`#` 等字符，要按 URL 规则编码后再写入连接串。Prisma 使用 MySQL 协议连接 MariaDB，没有单独的 MariaDB provider。

线上会创建三张表：

| 表 | 作用 |
| --- | --- |
| `Session` | 店铺登录会话和访问令牌。`accessToken`、`refreshToken`、`scope` 为 `TEXT` |
| `Subscriber` | 订阅者。`(shop, email)` 唯一，邮箱为 `VARCHAR(254)` |
| `ShopSender` | 每店一条发件人设置 |

这些表由 `prisma/mysql/migrations` 创建。不要把 `prisma/migrations` 里的 SQLite 迁移应用到 MariaDB。

## 4. 放置代码

把包含 `prisma/mysql/` 的完整代码放到 `/www/code/shopify-product-notify`，然后安装依赖：

```bash
cd /www/code/shopify-product-notify
pnpm install --frozen-lockfile
```

生产依赖里已经包含 `prisma` 和 `@prisma/client`，构建和迁移不需要再单独安装数据库工具。

## 5. 环境变量

在服务器上建立 `/www/code/shopify-product-notify/.env`，权限设为仅运行用户可读（`chmod 600`）。不要把这个文件提交到仓库。

```bash
NODE_ENV=production
PORT=3000
SHOPIFY_API_KEY=合作伙伴后台中该应用的 Client ID
SHOPIFY_API_SECRET=对应的 Client secret
SCOPES=read_products,write_app_proxy
SHOPIFY_APP_URL=https://notify.nxedc.net
DATABASE_URL=mysql://product_notify:请换成强密码@127.0.0.1:3306/product_notify
RESEND_API_KEY=Resend 控制台创建的 API Key
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 是 | 必须为 `production`。订阅接口在生产环境会拒绝没有 Shopify 签名的请求 |
| `PORT` | 否 | 应用监听端口，默认 `3000` |
| `SHOPIFY_API_KEY` | 是 | 与 `shopify.app.toml` 的 `client_id` 相同 |
| `SHOPIFY_API_SECRET` | 是 | 合作伙伴后台的 Client secret。用于校验 OAuth、Webhook 和 App Proxy |
| `SCOPES` | 是 | `read_products,write_app_proxy`，与 `shopify.app.toml` 一致，逗号后不要加空格 |
| `SHOPIFY_APP_URL` | 是 | 公网 HTTPS 根地址，不要末尾斜杠。必须与 `application_url` 完全一致 |
| `DATABASE_URL` | 是 | 仅线上使用。本地 `pnpm dev` 不读这个变量 |
| `RESEND_API_KEY` | 发信时必填 | 未设置时后台可以打开，但「发送通知」会被拒绝 |
| `SHOP_CUSTOM_DOMAIN` | 否 | 只有店铺使用自定义 myshopify 以外的域名参与 OAuth 时才需要 |

发件人名称和发件邮箱不写在环境变量里。每个店铺在后台「发件设置」单独保存，发件邮箱必须属于 Resend 里已经验证的域名。

## 6. 建表、构建、启动

在 `/www/code/shopify-product-notify` 执行：

```bash
pnpm run setup:production
pnpm run build
pnpm start
```

`setup:production` 等价于：

```bash
prisma generate --schema prisma/mysql/schema.prisma
prisma migrate deploy --schema prisma/mysql/schema.prisma
```

第一条按 MariaDB schema 生成 Prisma 客户端。第二条把 `prisma/mysql/migrations` 应用到 `DATABASE_URL` 指向的库。每次发布都可以重新执行，已经应用过的迁移会跳过。

Prisma 一次只能生成一种数据库的客户端。线上如果误执行了不带 `--schema` 的 `prisma generate` 或 `pnpm run setup`，客户端会变成 SQLite，需要重新执行 `pnpm run setup:production`。

`pnpm run build` 生成 `build/server/index.js`。`pnpm start` 使用 `remix-serve` 启动这个文件。

### 6.1 用 systemd 保持运行

`/etc/systemd/system/product-notify.service`：

```ini
[Unit]
Description=product-notify
After=network.target mariadb.service

[Service]
Type=simple
User=product-notify
WorkingDirectory=/www/code/shopify-product-notify
EnvironmentFile=/www/code/shopify-product-notify/.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`ExecStart` 里的 pnpm 路径用 `which pnpm` 的结果。然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now product-notify
sudo systemctl status product-notify
```

日志：

```bash
journalctl -u product-notify -f
```

## 7. 反向代理

用 Nginx 或 Caddy 把 `https://notify.nxedc.net` 转到 `127.0.0.1:3000`。证书使用 Let's Encrypt 即可。

Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name notify.nxedc.net;

    ssl_certificate     /etc/letsencrypt/live/notify.nxedc.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notify.nxedc.net/privkey.pem;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 发送通知是同步循环，每封邮件间隔 600ms，订阅者多时会超过默认的 60 秒
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

必须转发 `Host` 和 `X-Forwarded-Proto`，这样应用看到的地址才是 `https://notify.nxedc.net`，OAuth 回调和会话 Cookie 才能对上。

先确认公网可以打开应用再去改 Shopify 配置：

```bash
curl -I https://notify.nxedc.net
```

应返回 HTTP 响应，而不是连接失败或证书错误。未带店铺参数时，根路径会走到登录流程，返回跳转或登录页都说明进程已经在对外服务。

## 8. 把正式地址发布到 Shopify

`shopify.app.toml` 里下面 4 处已经是正式域名。发布前再核对一次，本机执行过 `pnpm dev` 时，CLI 可能把它们改回隧道地址：

```toml
application_url = "https://notify.nxedc.net"

[auth]
redirect_urls = [
  "https://notify.nxedc.net/auth/callback",
  "https://notify.nxedc.net/auth/shopify/callback",
  "https://notify.nxedc.net/api/auth/callback"
]
```

这 4 个地址必须与服务器上的 `SHOPIFY_APP_URL` 一致，并使用 HTTPS，且没有末尾斜杠。

Webhook、App Proxy 在配置里写的是相对路径，会跟着 `application_url` 走，一般不用改：

| 配置 | 值 | Shopify 实际访问 |
| --- | --- | --- |
| App Proxy | `url = "/api/subscribe"`，`prefix = "apps"`，`subpath = "subscribe"` | 店铺前台 `/apps/subscribe` 转发到 `https://notify.nxedc.net/api/subscribe` |
| `app/uninstalled` | `/webhooks/app/uninstalled` | 应用被卸载时删除该店会话、订阅者和发件人 |
| `app/scopes_update` | `/webhooks/app/scopes_update` | 更新会话里的权限 |
| `customers/data_request` | `/webhooks/customers/data_request` | 按店铺和邮箱查订阅记录，只写日志 |
| `customers/redact` | `/webhooks/customers/redact` | 删除该店该邮箱的订阅 |
| `shop/redact` | `/webhooks/shop/redact` | 删除该店订阅者和发件人 |

权限保持：

```toml
scopes = "read_products,write_app_proxy"
```

在已经登录 Shopify CLI 的开发电脑上，于项目目录执行：

```bash
pnpm run deploy
```

按提示确认发布。这一步会发布新的应用版本，包含应用 URL、回调地址、权限、Webhook、App Proxy，以及 `extensions/subscription-form` 主题扩展。

`shopify.app.toml` 里的 `automatically_update_urls_on_dev = true` 只影响本机执行 `pnpm dev` 时的开发预览地址。已发布的线上版本使用最后一次 `pnpm run deploy` 写入的地址。

服务器上不需要安装 Shopify CLI，也不要在服务器上执行 `pnpm dev`。

## 9. 店铺里要做的事

1. 在 Shopify 后台重新打开应用，按新域名完成授权。权限或地址变化后，旧会话不能继续使用。
2. 打开「发件设置」，保存发件名称和发件邮箱。邮箱必须是 Resend 账号中已验证域名下的地址。`send`、`rsend` 这类子域名用于退信，不能当作发件地址。
3. 在主题编辑器添加「新品订阅」区块。区块里的订阅接口路径保持默认 `/apps/subscribe`，与 App Proxy 的 prefix、subpath 一致。
4. 到合作伙伴后台确认该应用版本已经发布。本应用在代码里是 App Store 分发（`AppDistribution.AppStore`）。开发店铺可以安装已发布版本；要给任意商家安装，还需要在合作伙伴后台提交 App Store 审核。`customers/data_request` 目前只把查询记到日志，审核前需要单独处理向顾客提供数据的流程。

## 10. 上线后自检

| 检查 | 预期 |
| --- | --- |
| `systemctl status product-notify` | 进程为 active |
| 打开 `https://notify.nxedc.net` | 有 HTTP 响应，证书有效 |
| 后台打开应用 | 能看到「新品订阅通知」首页，而不是空白或隧道错误 |
| 发件设置保存后刷新 | 首页显示刚才保存的发件人 |
| 主题区块提交一个邮箱 | 订阅者列表出现该邮箱；重复提交得到「该邮箱已订阅」 |
| 直接请求 `https://notify.nxedc.net/api/subscribe` 且不带 Shopify 签名 | 返回 401 |
| 选择一个在售商品发送通知 | 订阅者收到邮件。未配置 `RESEND_API_KEY` 或未保存发件人时，页面会拒绝发送 |
| MariaDB | 存在 `Session`、`Subscriber`、`ShopSender` |

发送很多订阅者时，请求会按每人约 600ms 持续占用，反向代理的读超时要覆盖整次发送。页面要保持打开，当前没有后台队列。

## 11. 以后更新版本

在服务器上：

```bash
cd /www/code/shopify-product-notify
# 拉入新代码后
pnpm install --frozen-lockfile
pnpm run setup:production
pnpm run build
sudo systemctl restart product-notify
```

如果这次改了 `shopify.app.toml`（地址、权限、Webhook、App Proxy 或主题扩展），还要在开发电脑上再执行一次 `pnpm run deploy`。只改了服务器上的业务代码时，不需要重新 deploy。

更新环境变量后要重启服务。修改 `DATABASE_URL` 后要重新执行 `pnpm run setup:production`，让客户端和迁移指向新库。

## 12. 备份

定期备份 MariaDB 的 `product_notify` 库。`Session` 表里有店铺访问令牌，备份文件要限制读取权限。卸载应用或收到 `shop/redact` 时，程序会删除该店的订阅者和发件人；会话在卸载时删除。

## 13. 常见问题

**后台空白，或仍提示隧道不可用。** `SHOPIFY_APP_URL`、`application_url` 和三条 `redirect_urls` 里还有旧隧道主机名，或者四者不一致。改成正式域名，重新 `pnpm run deploy`，再在后台强制刷新应用。

**订阅接口返回「未授权的请求」。** 生产环境要求请求来自 App Proxy 并带 Shopify 签名。确认 `NODE_ENV=production`，主题区块路径是 `/apps/subscribe`，并且已经执行过包含 App Proxy 的 `pnpm run deploy`。

**数据库报 Session 表不存在，或客户端驱动不匹配。** 线上执行的是 `pnpm run setup`。改为 `pnpm run setup:production` 后重启。

**能打开后台，但不能发信。** 先看页面提示：缺少 `RESEND_API_KEY`，或该店还没有发件人。发件域名要在 Resend 中验证通过。

**`prisma migrate deploy` 报找不到 OpenSSL。** 在系统上安装 OpenSSL 后重新执行 `pnpm run setup:production`。
