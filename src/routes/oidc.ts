import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { isValidProvider, listProviders } from '../providers';
import { getJwks } from '../lib/keys';

export const oidcRoutes = new Hono<AppEnv>();

/**
 * GET /:provider/.well-known/jwks.json
 *
 * OIDC 公开端点：导出 RS256 公钥（JWK Set），供下游系统（如 GitLab）自动验签。
 *
 * - 公钥由全局私钥（env.PRIVATE_KEY）派生，永不泄露私钥分量；
 * - kid = RFC 7638 公钥指纹，密钥轮换时自动变更；
 * - 响应可被边缘缓存 1 小时（公钥在轮换前稳定不变）。
 */
oidcRoutes.get('/.well-known/jwks.json', async (c) => {
  const provider = c.req.param('provider');
  if (!isValidProvider(provider)) {
    return c.json(
      {
        error: 'unsupported_provider',
        provider,
        supported: listProviders(),
      },
      400,
    );
  }

  const jwks = await getJwks(c.env.PRIVATE_KEY);
  return c.json(jwks, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});
