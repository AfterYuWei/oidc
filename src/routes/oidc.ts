import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { isValidProvider, listProviders } from '../providers';
import { getJwks } from '../lib/keys';

export const oidcRoutes = new Hono<AppEnv>();

/**
 * GET /:provider/.well-known/openid-configuration
 *
 * OIDC Discovery 端点：供下游系统（如 GitLab）自动发现 OIDC 配置。
 *
 * 返回标准 OpenID Connect Discovery 文档，包含：
 * - issuer：JWT issuer 声明
 * - authorization_endpoint：授权端点
 * - token_endpoint：令牌端点
 * - jwks_uri：公钥端点
 * - 支持的 response_types、scopes、claims 等
 */
oidcRoutes.get('/.well-known/openid-configuration', async (c) => {
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

  const origin = new URL(c.req.url).origin;
  const baseUrl = `${origin}/${provider}`;

  // issuer 必须包含 provider 路径，否则下游系统无法区分飞书/钉钉/企业微信
  return c.json(
    {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/api/auth`,
      token_endpoint: `${baseUrl}/api/token`,
      userinfo_endpoint: `${baseUrl}/api/userinfo`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'name', 'email', 'picture'],
      code_challenge_methods_supported: ['S256'],
    },
    200,
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  );
});

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
