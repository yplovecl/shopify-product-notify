import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function json(body: { success: boolean; message: string }, status = 200) {
  return Response.json(body, { status });
}

function readShop(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const shop = value?.trim().toLowerCase() ?? "";
    if (SHOP_RE.test(shop)) return shop;
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.has("signature")) {
    await authenticate.public.appProxy(request);
  } else if (process.env.NODE_ENV === "production") {
    return json({ success: false, message: "未授权的请求" }, 401);
  }

  return json({
    success: true,
    message: "请使用 POST 提交 email 完成订阅",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ success: false, message: "仅支持 POST" }, 405);
  }

  const url = new URL(request.url);
  const hasSignature = url.searchParams.has("signature");
  let trustedShop: string | null = null;

  if (hasSignature) {
    try {
      const { session } = await authenticate.public.appProxy(request.clone());
      trustedShop = readShop(session?.shop, url.searchParams.get("shop"));
    } catch (error) {
      if (error instanceof Response) {
        return json(
          { success: false, message: "订阅校验失败，请刷新页面后重试" },
          401,
        );
      }
      throw error;
    }
  } else if (process.env.NODE_ENV === "production") {
    return json({ success: false, message: "未授权的请求" }, 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, message: "无法读取表单" }, 400);
  }

  const emailField = formData.get("email");
  const shopField = formData.get("shop");
  const email = typeof emailField === "string" ? emailField.trim().toLowerCase() : "";
  const shop =
    trustedShop ??
    readShop(
      request.headers.get("X-Shopify-Shop-Domain"),
      url.searchParams.get("shop"),
      typeof shopField === "string" ? shopField : null,
    );

  if (!shop) {
    return json({ success: false, message: "无法识别店铺" }, 400);
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ success: false, message: "邮箱格式不正确" }, 400);
  }

  try {
    await db.subscriber.create({
      data: { shop, email },
    });
    return json({ success: true, message: "订阅成功" });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return json({ success: true, message: "该邮箱已订阅，无需重复提交" });
    }
    throw error;
  }
};
