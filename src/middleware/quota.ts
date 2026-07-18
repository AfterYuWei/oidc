import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/** 新用户免注册赠送的免费额度（次） */
const DEFAULT_FREE_QUOTA = 100;

/** 商业授权 / 充值入口 */
const RECHARGE_URL = 'https://oidc.cc';

/**
 * 无状态配额拦截中间件
 * ------------------------------
 * 设计哲学（Indie Hacker 零配置闭环）：
 * - 以请求中的 `client_id`（大厂 App ID）充当 License Key，免注册即用；
 * - KV 查不到 → 视为新用户，自动写入赠送额度并放行；
 * - 额度存在且 ≤ 0 → 拦截，返回 403 充值引导页；
 * - 本中间件只「查」，不「扣」。扣减延迟到 Step 4 扫码成功、JWT 签发后执行，
 *   避免用户点开扫码页却未完成登录而被白白计数。
 *
 * 挂载位置：仅 `/:provider/api/auth`（client_id 在 query 中）。
 */
export const quotaMiddleware = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const clientId = c.req.query('client_id');
    if (!clientId) {
      return c.text('Missing client_id (App ID)', 400);
    }

    const kvKey = `quota:${clientId}`;
    const currentStr = await c.env.QUOTA_KV.get(kvKey);

    if (currentStr === null) {
      // 新用户初次访问：免注册，直接赠送免费额度
      await c.env.QUOTA_KV.put(kvKey, String(DEFAULT_FREE_QUOTA));
    } else {
      const current = parseInt(currentStr, 10);
      if (Number.isNaN(current) || current <= 0) {
        // 额度耗尽，拦截并引导充值
        return c.html(renderQuotaExhaustedPage(clientId), 403);
      }
    }

    await next();
    return;
  };
};

/**
 * 扣减配额（供 Step 4 在 id_token 签发成功后调用）
 *
 * 注意：Cloudflare KV 无原生原子 DECR，此处为「读-改-写」；KV 为最终一致，
 * 高并发下存在竞态（可能少扣）。对「赠送额度 + 防滥用」场景足够，
 * 若需强一致可升级为 Durable Objects 计数器。
 */
export async function decrementQuota(
  kv: KVNamespace,
  clientId: string,
): Promise<number> {
  const kvKey = `quota:${clientId}`;
  const currentStr = await kv.get(kvKey);
  const current =
    currentStr === null ? DEFAULT_FREE_QUOTA : parseInt(currentStr, 10);
  const next = Number.isNaN(current) ? 0 : Math.max(0, current - 1);
  await kv.put(kvKey, String(next));
  return next;
}

/**
 * 渲染额度耗尽引导页（403）
 *
 * 安全：client_id 来自 query，属攻击者可控输入，必须 HTML 转义后再插入，
 * 否则 `<script>` 之类的 client_id 会造成反射型 XSS。
 */
function renderQuotaExhaustedPage(clientId: string): string {
  const safe = escapeHtml(clientId);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>授权额度已耗尽 · oidc-bridge</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#0f172a;color:#e2e8f0}
    .card{max-width:520px;padding:48px 40px;border-radius:16px;text-align:center;
          background:#1e293b;box-shadow:0 20px 60px rgba(0,0,0,.4)}
    h2{margin:0 0 16px;font-size:22px;color:#f87171}
    p{margin:8px 0;line-height:1.7;color:#cbd5e1}
    code{background:#0f172a;padding:2px 8px;border-radius:6px;color:#38bdf8;
         word-break:break-all}
    .btn{display:inline-block;margin-top:20px;padding:12px 28px;border-radius:10px;
         background:#3b82f6;color:#fff;text-decoration:none;font-weight:600;
         transition:background .15s}
    .btn:hover{background:#2563eb}
  </style>
</head>
<body>
  <div class="card">
    <h2>🚫 授权额度已耗尽</h2>
    <p>应用 <code>${safe}</code> 的免费配额已用完。</p>
    <p>请前往 <a class="btn" href="${RECHARGE_URL}" target="_blank" rel="noopener noreferrer">oidc.cc</a> 购买商业授权锁或续费。</p>
  </div>
</body>
</html>`;
}

/** 最小化 HTML 转义，防止 client_id 注入 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
