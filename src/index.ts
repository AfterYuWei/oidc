import { Hono } from 'hono';
import type { AppEnv } from './types';
import { oidcRoutes } from './routes/oidc';
import { authRoutes } from './routes/auth';

/**
 * oidc-bridge
 * -----------
 * 无状态身份网关：将国内大厂（飞书/钉钉/企业微信）非标准 OAuth2
 * “翻译”为全球通用的标准 OIDC 协议。100% 零存储，绝不在边缘落地第三方凭证。
 */
const app = new Hono<AppEnv>();

// 根路径重定向到官网
app.get('/', (c) => c.redirect('https://oidc.com', 302));

// Step 2: OIDC 公开端点（JWKS）
app.route('/:provider', oidcRoutes);

// Step 1: 授权流程骨架（auth / callback）
app.route('/:provider', authRoutes);

// 全局错误处理：保证任何异常都返回结构化 JSON，绝不泄露堆栈
app.onError((err, c) => {
  console.error('[oidc-bridge] unhandled error:', err);
  return c.json(
    { error: 'internal_error', message: err instanceof Error ? err.message : 'unknown' },
    500,
  );
});

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

export default app;
