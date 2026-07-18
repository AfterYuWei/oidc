import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { isValidProvider, getProvider } from '../providers';
import { quotaMiddleware } from '../middleware/quota';

export const authRoutes = new Hono<AppEnv>();

/**
 * GET /:provider/api/auth
 *
 * 登录入口：配额拦截(Step 3) -> 校验渠道 -> 重定向到大厂授权页(Step 4)
 *
 * 下游系统以 `client_id` = 大厂 App ID 调用本端点发起扫码登录。
 * quotaMiddleware 仅「查」不「扣」；扣减在 Step 4 callback 签发成功后执行。
 */
authRoutes.get('/api/auth', quotaMiddleware(), async (c) => {
  const providerName = c.req.param('provider');
  if (!isValidProvider(providerName)) {
    return c.json({ error: 'unsupported_provider', provider: providerName }, 400);
  }

  // Step 4: 调用翻译器 redirectToAuth
  const provider = getProvider(providerName);
  return provider.redirectToAuth(c);
});

/**
 * GET /:provider/api/callback
 *
 * 大厂回调：验证 bridge_state -> 换取飞书用户信息 -> 签发 bridge_code -> 302 回下游
 *
 * 安全约束：bridge_state 中的 client_secret 仅在内存中用于本次请求的大厂接口调用，
 *           请求结束即随 isolate 上下文释放，绝不写入 OIDC_QUOTA_STORE 或日志。
 *
 * 注意：本端点只签发 bridge_code（标准 OIDC code），不签发 id_token、不扣配额。
 *       id_token 签发与 decrementQuota 在 /api/token 完成下游换码后执行。
 */
authRoutes.get('/api/callback', async (c) => {
  const providerName = c.req.param('provider');
  if (!isValidProvider(providerName)) {
    return c.json({ error: 'unsupported_provider', provider: providerName }, 400);
  }

  const provider = getProvider(providerName);
  return provider.handleCallback(c);
});

/**
 * POST /:provider/api/token
 *
 * OIDC token 端点：下游用 bridge_code 换取 id_token（标准授权码状态机的最后一步）。
 *
 * 流程：验证 bridge_code → 校验 client_id / redirect_uri / PKCE
 *       → 签发 RS256 id_token（sub=open_id, aud=client_id）
 *       → ★ 在 id_token 签发成功的最后一瞬间执行 decrementQuota。
 *
 * 不挂载 quotaMiddleware：配额已在 /api/auth 检查过，此处只扣不查，避免双重计数。
 */
authRoutes.post('/api/token', async (c) => {
  const providerName = c.req.param('provider');
  if (!isValidProvider(providerName)) {
    return c.json({ error: 'unsupported_provider', provider: providerName }, 400);
  }

  const provider = getProvider(providerName);
  return provider.exchangeCode(c);
});
