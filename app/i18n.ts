import { createCookie } from "@remix-run/node";

const copy = {
  en: {
    navHome: "Home",
    navSubscribers: "Subscribers",
    navSettings: "Sender",
    navNotify: "Send notification",
    homeTitle: "NX Swift",
    homeCount: "This shop has {count} subscribers.",
    homeSender: "Mail is sent as {from}.",
    homeNoSender: "No sender is saved yet. Open Sender and add one.",
    homeStepBlock:
      "In the theme editor, add the NX Swift app block to a page.",
    homeStepSender:
      "Save this shop's sender name and email. Each shop has its own sender.",
    homeStepNotify:
      "Choose a product under Send notification. Mail uses this shop's sender.",
    homeSettings: "Sender settings",
    homeSubscribers: "View subscribers",
    homeNotify: "Send notification",
    homePrivacy: "Privacy policy",
    settingsTitle: "Sender",
    settingsSubtitle: "Applies only to {shop}. Other shops save their own sender.",
    settingsName: "Sender name",
    settingsNameHelp: "Name recipients see, such as the shop name. Optional.",
    settingsEmail: "Sender email",
    settingsEmailHelp:
      "Must be an address on a domain verified in this app's Resend account. Shops cannot connect a separate Resend account. Saving here does not change any other shop.",
    settingsSave: "Save",
    settingsNameTooLong: "Sender name must be 80 characters or fewer",
    settingsEmailInvalid: "Enter a valid sender email",
    settingsSaved: "Saved sender for this shop: {from}",
    subscribersTitle: "Subscribers",
    subscribersSubtitle: "{count} subscribers for this shop",
    subscribersEmpty:
      "No subscribers yet. Add the NX Swift block in the theme editor. Emails submitted there appear here.",
    colEmail: "Email",
    colSubscribed: "Subscribed",
    dataRequestsTitle: "Customer data requests",
    dataRequestsHelp:
      "When a customer asks the shop for their data, the matching subscription is listed here for the merchant. The same summary is emailed to this shop's sender address when one is saved.",
    dataRequestsEmpty: "No customer data requests yet.",
    dataRequestFound: "Subscribed {at}",
    dataRequestMissing: "No subscription stored for this email",
    colRequested: "Requested",
    notifyTitle: "Send a new-product email",
    notifySubtitle: "Sends to {count} subscribers of this shop",
    notifyNoKey: "RESEND_API_KEY is not configured, so mail cannot be sent.",
    notifyNoSender: "Save this shop's sender name and email first.",
    notifyFrom: "This shop sends as {from}. Other shops' senders are not used.",
    notifySearch: "Search products",
    notifySearchButton: "Search",
    notifyPick: "Product",
    notifyVariant: "Variant",
    notifyNoVariant: "No variant",
    notifyNone: "No active products",
    notifyPreview: "The email includes the product name, image, and link.",
    notifySend: "Send",
    notifyHint:
      "Showing up to 50 active products. Search to find others. Mail is sent in batches; keep this page open until it finishes.",
    notifyProgress: "Sending… {sent} sent, {failed} failed.",
    notifyDone: "Finished: {sent} sent, {failed} failed.",
    notifySelectProduct: "Choose a product",
    notifyBadUrl: "Could not build the product link",
    notifyMissingProduct: "Product not found",
    notifyMissingVariant: "Variant not found",
    notifyNoSubscribers: "This shop has no subscribers",
    emailSubject: "New product: {title}",
    emailHello: "{shop} added a product you subscribed to:",
    emailButton: "View product",
    emailUnsubscribe: "Unsubscribe",
    subUnauthorized: "Unauthorized request",
    subBadSignature: "Subscription check failed. Refresh the page and try again.",
    subPostOnly: "POST only",
    subUsePost: "Submit email with POST to subscribe",
    subBadForm: "Could not read the form",
    subBadShop: "Could not identify the shop",
    subBadEmail: "Enter a valid email",
    subSuccess: "Subscribed",
    subAlready: "This email is already subscribed",
    unsubTitle: "Unsubscribed",
    unsubBody: "This email will no longer receive new-product alerts from this shop.",
    unsubInvalidTitle: "Link expired",
    unsubInvalidBody: "This unsubscribe link is invalid. Use the link in the latest email.",
    landingTitle: "NX Swift",
    landingText: "Enter the shop domain to open the app.",
    landingLabel: "Shop domain",
    landingExample: "example.myshopify.com",
    landingSubmit: "Log in",
    landingLanguage: "Language",
    loginMissingShop: "Please enter your shop domain to log in",
    loginInvalidShop: "Please enter a valid shop domain to log in",
  },
  zh: {
    navHome: "首页",
    navSubscribers: "订阅者",
    navSettings: "发件设置",
    navNotify: "发送通知",
    homeTitle: "玄鸟",
    homeCount: "当前已有 {count} 位顾客订阅新品通知。",
    homeSender: "本店发件人是 {from}。",
    homeNoSender: "本店还没有发件人，请先到「发件设置」填写。",
    homeStepBlock: "在线商店 → 自定义 → 应用区块，把「玄鸟」拖到页面上。",
    homeStepSender: "在「发件设置」保存本店的发件名称和邮箱。每家店单独保存。",
    homeStepNotify: "在「发送通知」选择商品，邮件会用本店发件人寄出。",
    homeSettings: "发件设置",
    homeSubscribers: "查看订阅者",
    homeNotify: "发送通知",
    homePrivacy: "隐私政策",
    settingsTitle: "发件设置",
    settingsSubtitle: "只对 {shop} 生效，其他店铺需要各自填写",
    settingsName: "发件人名称",
    settingsNameHelp: "收件人看到的名称，例如店铺名。可以留空。",
    settingsEmail: "发件邮箱",
    settingsEmailHelp:
      "必须是本应用所用 Resend 账号里已验证域名下的邮箱。商家不能接入自己的 Resend 账号。保存在这里不会影响其他店铺。",
    settingsSave: "保存",
    settingsNameTooLong: "发件人名称不能超过 80 个字符",
    settingsEmailInvalid: "请填写有效的发件邮箱",
    settingsSaved: "已保存本店发件人：{from}",
    subscribersTitle: "订阅者",
    subscribersSubtitle: "当前店铺共 {count} 位订阅者",
    subscribersEmpty:
      "还没有订阅者。在主题编辑器中添加「玄鸟」区块后，顾客提交的邮箱会显示在这里。",
    colEmail: "邮箱",
    colSubscribed: "订阅时间",
    dataRequestsTitle: "顾客数据请求",
    dataRequestsHelp:
      "顾客向店铺要求导出个人数据时，匹配到的订阅会列在这里。若已保存发件邮箱，同一份摘要也会发到该邮箱。",
    dataRequestsEmpty: "还没有顾客数据请求。",
    dataRequestFound: "已订阅，时间 {at}",
    dataRequestMissing: "没有保存这个邮箱的订阅",
    colRequested: "请求时间",
    notifyTitle: "发送新品通知",
    notifySubtitle: "将发送给当前店铺的 {count} 位订阅者",
    notifyNoKey: "服务器尚未配置 RESEND_API_KEY，暂时不能发信。",
    notifyNoSender: "请先在「发件设置」填写本店的发件名称和邮箱。",
    notifyFrom: "本店将以 {from} 发信，不会使用其他店铺的发件人。",
    notifySearch: "搜索商品",
    notifySearchButton: "搜索",
    notifyPick: "选择商品",
    notifyVariant: "规格",
    notifyNoVariant: "不选择规格",
    notifyNone: "没有在售商品",
    notifyPreview: "邮件会包含商品名称、图片和商品链接。",
    notifySend: "发送通知",
    notifyHint:
      "列表最多显示 50 个在售商品，可用搜索查找其他商品。邮件分批发送，请保持页面打开直到结束。",
    notifyProgress: "正在发送… 成功 {sent} 封，失败 {failed} 封。",
    notifyDone: "发送完成：成功 {sent} 封，失败 {failed} 封。",
    notifySelectProduct: "请选择要通知的商品",
    notifyBadUrl: "无法生成商品链接",
    notifyMissingProduct: "找不到该商品",
    notifyMissingVariant: "找不到该规格",
    notifyNoSubscribers: "当前店铺还没有订阅者",
    emailSubject: "新品上架：{title}",
    emailHello: "您好！您订阅的店铺 {shop} 上新了：",
    emailButton: "查看商品详情",
    emailUnsubscribe: "退订",
    subUnauthorized: "未授权的请求",
    subBadSignature: "订阅校验失败，请刷新页面后重试",
    subPostOnly: "仅支持 POST",
    subUsePost: "请使用 POST 提交 email 完成订阅",
    subBadForm: "无法读取表单",
    subBadShop: "无法识别店铺",
    subBadEmail: "邮箱格式不正确",
    subSuccess: "订阅成功",
    subAlready: "该邮箱已订阅，无需重复提交",
    unsubTitle: "已退订",
    unsubBody: "这个邮箱不会再收到该店铺的新品通知。",
    unsubInvalidTitle: "链接无效",
    unsubInvalidBody: "退订链接无效。请使用最近一封邮件里的退订链接。",
    landingTitle: "玄鸟",
    landingText: "输入店铺域名以打开应用。",
    landingLabel: "店铺域名",
    landingExample: "example.myshopify.com",
    landingSubmit: "登录",
    landingLanguage: "语言",
    loginMissingShop: "请输入店铺域名后再登录",
    loginInvalidShop: "请输入有效的店铺域名后再登录",
  },
} as const;

export type Locale = keyof typeof copy;
export type CopyKey = keyof typeof copy.en;

export function resolveLocale(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const localeCookie = createCookie("npn_locale", {
  path: "/",
  sameSite: "none",
  secure: true,
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
});

export async function localeFromRequest(request: Request): Promise<Locale> {
  const query = new URL(request.url).searchParams.get("locale");
  if (query) return resolveLocale(query);
  const saved = await localeCookie.parse(request.headers.get("Cookie"));
  if (typeof saved === "string" && saved.length > 0) return resolveLocale(saved);
  return "en";
}

/** Public pages also follow the browser language when no locale was chosen yet. */
export async function localeForLanding(request: Request): Promise<Locale> {
  const query = new URL(request.url).searchParams.get("locale");
  if (query) return resolveLocale(query);
  const saved = await localeCookie.parse(request.headers.get("Cookie"));
  if (typeof saved === "string" && saved.length > 0) return resolveLocale(saved);

  const header = request.headers.get("Accept-Language") ?? "";
  const tags = header.split(",").map((part) => part.trim().split(";")[0] ?? "");
  for (const tag of tags) {
    const language = tag.toLowerCase();
    if (language.startsWith("zh")) return "zh";
    if (language.startsWith("en")) return "en";
  }
  return "en";
}

export function localeCookieHeader(request: Request, locale: Locale) {
  return localeCookie.serialize(locale, {
    secure: new URL(request.url).protocol === "https:",
  });
}

export function translate(locale: Locale) {
  const dictionary = copy[locale];
  return (key: CopyKey, vars?: Record<string, string | number>) => {
    let text: string = dictionary[key];
    if (!vars) return text;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
}
