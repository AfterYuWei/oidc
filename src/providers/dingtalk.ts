import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { type Provider } from './types';
import { getPrivateKey, getPublicKey, getKid } from '../lib/keys';
import { decrementQuota } from '../middleware/quota';

// ============================================================================
// 钉钉 OAuth2 端点
// ============================================================================

const DINGTALK_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';
const DINGTALK_USER_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const DINGTALK_USER_INFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';

// ============================================================================
// TTL（秒）
// ============================================================================

/** packed_code：60 秒，短窗口限制重放 */
const PACKED_CODE_TTL_SEC = 60;
/** id_token：1 小时 */
const ID_TOKEN_TTL_SEC = 60 * 60;

// ============================================================================
// 新接口定义：状态双重缝合
// ============================================================================

/**
 * 第一重缝合：存储下游上下文（明文 Base64URL，通过钉钉 state 传递）
 */
interface DownstreamState {
  redirect_uri: string;
  state: string;
  nonce: string;
  scope: string;
  code_challenge?: string;
}

/**
 * 第二重缝合：packed_code JWT 载荷（RS256 签名）
 *
 * 安全：签名防止篡改；TTL 60 秒限制重放窗口
 */
interface PackedCodeClaims {
  typ: 'packed_code';
  dingtalk_auth_code: string;
  nonce: string;
  redirect_uri: string; // 用于 /api/token 校验
  client_id: string; // 防止跨租户攻击
}

// ============================================================================
// 钉钉 API 响应类型
// ============================================================================

interface DingtalkUserInfo {
  unionId: string;
  nickName?: string;
  email?: string;
  avatarUrl?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

function issuerOf(c: Context<AppEnv>, provider?: string): string {
  const base = c.env.ISSUER || new URL(c.req.url).origin;
  if (provider) {
    return `${base}/${provider}`;
  }
  return base;
}

// ============================================================================
// Base64URL 编解码（用于第一重缝合的 state）
// ============================================================================

function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

// ============================================================================
// packed_code JWT 签发 / 验证（第二重缝合）
// ============================================================================

async function signPackedCode(
  c: Context<AppEnv>,
  claims: Omit<PackedCodeClaims, 'typ'>,
): Promise<string> {
  const key = await getPrivateKey(c.env.PRIVATE_KEY);
  const kid = await getKid(c.env.PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...claims, typ: 'packed_code' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuerOf(c, 'dingtalk'))
    .setIssuedAt(now)
    .setExpirationTime(now + PACKED_CODE_TTL_SEC)
    .sign(key);
}

async function verifyPackedCode(
  c: Context<AppEnv>,
  jwt: string,
): Promise<PackedCodeClaims> {
  const key = await getPublicKey(c.env.PRIVATE_KEY);
  const { payload } = await jwtVerify(jwt, key, {
    issuer: issuerOf(c, 'dingtalk'),
    algorithms: ['RS256'],
  });
  if (payload.typ !== 'packed_code') {
    throw new Error(`unexpected typ: ${String(payload.typ)}`);
  }
  return payload as unknown as PackedCodeClaims;
}

// ============================================================================
// Basic Auth 解析
// ============================================================================

function fromBasicAuth(
  c: Context<AppEnv>,
  type: 'id' | 'secret',
): string | undefined {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Basic ')) return undefined;
  try {
    const decoded = atob(auth.slice(6));
    const idx = decoded.indexOf(':');
    if (idx === -1) return undefined;
    return type === 'id' ? decoded.slice(0, idx) : decoded.slice(idx + 1);
  } catch {
    return undefined;
  }
}

/** 从 form-encoded body 中安全取字符串值（parseBody 返回 string | File） */
function formStr(body: Record<string, string | File>, key: string): string | undefined {
  const v = body[key];
  return typeof v === 'string' ? v : undefined;
}

// ============================================================================
// 钉钉 API 调用（client_secret 仅在内存中，请求结束即释放）
// ============================================================================

async function fetchUserAccessToken(
  clientId: string,
  clientSecret: string,
  authCode: string,
): Promise<string> {
  const resp = await fetch(DINGTALK_USER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      clientId,
      clientSecret,
      code: authCode,
      grantType: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    throw new Error(`dingtalk userAccessToken HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    accessToken?: string;
    expiresIn?: number;
    error?: string;
  };
  if (!data.accessToken) {
    throw new Error(`dingtalk userAccessToken error: ${data.error || 'unknown'}`);
  }
  return data.accessToken;
}

async function fetchUserInfo(accessToken: string): Promise<DingtalkUserInfo> {
  const resp = await fetch(DINGTALK_USER_INFO_URL, {
    method: 'GET',
    headers: {
      'x-acs-dingtalk-access-token': accessToken,
    },
  });
  if (!resp.ok) {
    throw new Error(`dingtalk userInfo HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as DingtalkUserInfo;
  if (!data.unionId) {
    throw new Error('dingtalk userInfo missing unionId');
  }
  return data;
}

// ============================================================================
// id_token 签发
// ============================================================================

async function signIdToken(
  c: Context<AppEnv>,
  claims: {
    sub: string;
    aud: string;
    nonce: string;
    name?: string;
    email?: string;
    picture?: string;
  },
): Promise<string> {
  const key = await getPrivateKey(c.env.PRIVATE_KEY);
  const kid = await getKid(c.env.PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    nonce: claims.nonce,
    name: claims.name,
    email: claims.email,
    picture: claims.picture,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuerOf(c, 'dingtalk'))
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + ID_TOKEN_TTL_SEC)
    .sign(key);
}

// ============================================================================
// Provider 实现
// ============================================================================

export const dingtalkProvider: Provider = {
  name: 'dingtalk',

  /**
   * GET /dingtalk/api/auth
   *
   * 第一重缝合：接收标准 OIDC 参数，将下游上下文缝合到钉钉 state。
   *
   * 关键变化：不再要求 client_secret（标准 OIDC 客户端在授权端点不传此参数）
   */
  async redirectToAuth(c: Context<AppEnv>): Promise<Response> {
    const clientId = c.req.query('client_id');
    const redirectUri = c.req.query('redirect_uri');
    const responseType = c.req.query('response_type');
    const scope = c.req.query('scope');
    const state = c.req.query('state') || '';
    const nonce = c.req.query('nonce') || '';
    const codeChallenge = c.req.query('code_challenge');

    // 必填校验（不要求 client_secret）
    if (!clientId) {
      return c.json(
        { error: 'invalid_request', error_description: 'missing client_id' },
        400,
      );
    }
    if (!redirectUri) {
      return c.json(
        { error: 'invalid_request', error_description: 'missing redirect_uri' },
        400,
      );
    }
    try {
      new URL(redirectUri);
    } catch {
      return c.json(
        { error: 'invalid_request', error_description: 'invalid redirect_uri' },
        400,
      );
    }
    if (responseType !== 'code') {
      return c.json(
        { error: 'invalid_request', error_description: 'response_type must be code' },
        400,
      );
    }
    if (!scope || !scope.split(/\s+/).includes('openid')) {
      return c.json(
        { error: 'invalid_request', error_description: 'scope must include openid' },
        400,
      );
    }

    // 第一重缝合：将下游上下文编码为 Base64URL
    const downstreamState: DownstreamState = {
      redirect_uri: redirectUri,
      state,
      nonce,
      scope,
      ...(codeChallenge && { code_challenge: codeChallenge }),
    };
    const encoded = base64urlEncode(JSON.stringify(downstreamState));
    const dingtalkState = `${clientId}|${encoded}`;

    // 构建钉钉授权 URL（redirect_uri 固定为网关回调地址）
    const origin = new URL(c.req.url).origin;
    const callbackUrl = `${origin}/${dingtalkProvider.name}/api/callback`;
    const dingtalkUrl = new URL(DINGTALK_AUTHORIZE_URL);
    dingtalkUrl.searchParams.set('client_id', clientId);
    dingtalkUrl.searchParams.set('redirect_uri', callbackUrl);
    dingtalkUrl.searchParams.set('response_type', 'code');
    dingtalkUrl.searchParams.set('scope', 'openid');
    dingtalkUrl.searchParams.set('state', dingtalkState);
    dingtalkUrl.searchParams.set('prompt', 'consent');

    return c.redirect(dingtalkUrl.toString(), 302);
  },

  /**
   * GET /dingtalk/api/callback
   *
   * 第二重缝合：解缝合钉钉返回的 state，签发 packed_code JWT，重定向回下游。
   */
  async handleCallback(c: Context<AppEnv>): Promise<Response> {
    const authCode = c.req.query('authCode') || c.req.query('code');
    const dingtalkState = c.req.query('state');

    if (!authCode) {
      return c.json(
        { error: 'invalid_request', error_description: 'missing code' },
        400,
      );
    }
    if (!dingtalkState) {
      return c.json(
        { error: 'invalid_request', error_description: 'missing state' },
        400,
      );
    }

    // 1. 解缝合第一重
    const pipeIdx = dingtalkState.indexOf('|');
    if (pipeIdx === -1) {
      return c.json(
        { error: 'invalid_request', error_description: 'malformed state' },
        400,
      );
    }
    const clientId = dingtalkState.slice(0, pipeIdx);
    const encoded = dingtalkState.slice(pipeIdx + 1);

    let downstreamState: DownstreamState;
    try {
      downstreamState = JSON.parse(base64urlDecode(encoded));
    } catch {
      return c.json(
        { error: 'invalid_request', error_description: 'state decode failed' },
        400,
      );
    }

    // 2. 第二重缝合：用 RS256 签发 packed_code JWT
    const packedCode = await signPackedCode(c, {
      dingtalk_auth_code: authCode,
      nonce: downstreamState.nonce,
      redirect_uri: downstreamState.redirect_uri,
      client_id: clientId,
    });

    // 3. 重定向回下游（使用还原的真实 redirect_uri）
    const downstream = new URL(downstreamState.redirect_uri);
    downstream.searchParams.set('code', packedCode);
    downstream.searchParams.set('state', downstreamState.state);

    return c.redirect(downstream.toString(), 302);
  },

  /**
   * POST /dingtalk/api/token
   *
   * 凭证透传：验证 packed_code 签名，校验 redirect_uri/client_id，
   * 用下游传来的 client_secret 调用钉钉 API，签发 id_token。
   */
  async exchangeCode(c: Context<AppEnv>): Promise<Response> {
    const body = await c.req.parseBody();

    // 1. 从 POST body 或 Authorization Header 获取凭证
    const clientId =
      formStr(body, 'client_id') || fromBasicAuth(c, 'id');
    const clientSecret =
      formStr(body, 'client_secret') || fromBasicAuth(c, 'secret');
    const code = formStr(body, 'code');
    const redirectUri = formStr(body, 'redirect_uri');

    // 必填校验
    if (!clientId || !clientSecret) {
      return c.json(
        { error: 'invalid_client', error_description: 'missing credentials' },
        401,
      );
    }
    if (!code) {
      return c.json(
        { error: 'invalid_grant', error_description: 'missing code' },
        400,
      );
    }

    // 2. 验证 packed_code 签名
    let packed: PackedCodeClaims;
    try {
      packed = await verifyPackedCode(c, code);
    } catch (e) {
      return c.json(
        {
          error: 'invalid_grant',
          error_description: e instanceof Error ? e.message : 'packed_code verify failed',
        },
        400,
      );
    }

    // 3. 强制校验 redirect_uri（RFC 6749）
    if (redirectUri && packed.redirect_uri !== redirectUri) {
      return c.json(
        {
          error: 'invalid_grant',
          error_description: 'redirect_uri mismatch',
        },
        400,
      );
    }

    // 4. 校验 client_id 一致性（防止跨租户攻击）
    if (packed.client_id !== clientId) {
      return c.json(
        {
          error: 'invalid_client',
          error_description: 'client_id mismatch',
        },
        400,
      );
    }

    // 5. 凭证透传：调用钉钉 API
    // 注意：dingtalk_auth_code 只能使用一次，重试会报错（钉钉标准行为）
    let accessToken: string;
    let userInfo: DingtalkUserInfo;
    try {
      accessToken = await fetchUserAccessToken(clientId, clientSecret, packed.dingtalk_auth_code);
      userInfo = await fetchUserInfo(accessToken);
    } catch (e) {
      return c.json(
        {
          error: 'invalid_grant',
          error_description: e instanceof Error ? e.message : 'dingtalk API error',
        },
        502,
      );
    }
    if (!userInfo.unionId) {
      return c.json({ error: 'invalid_grant', error_description: 'no unionId' }, 502);
    }

    // 6. 签发 id_token（使用 nonce）
    const idToken = await signIdToken(c, {
      sub: userInfo.unionId,
      aud: clientId,
      nonce: packed.nonce,
      name: userInfo.nickName,
      email: userInfo.email,
      picture: userInfo.avatarUrl,
    });

    // 7. 扣减配额
    await decrementQuota(c.env.OIDC_QUOTA_STORE, clientId);

    return c.json({
      token_type: 'Bearer',
      access_token: idToken, // GitLab 需要 access_token 用于 userinfo
      id_token: idToken,
      expires_in: ID_TOKEN_TTL_SEC,
    });
  },

  /**
   * GET /dingtalk/api/userinfo
   *
   * OIDC UserInfo 端点：用 access_token 获取用户信息。
   *
   * 注意：本实现中 access_token 实际上就是 id_token（简化方案）。
   *       验证 JWT 签名后返回用户信息。
   */
  async userinfo(c: Context<AppEnv>): Promise<Response> {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json(
        { error: 'invalid_request', error_description: 'missing Authorization header' },
        401,
      );
    }

    const accessToken = auth.slice(7);

    // 验证 access_token（实际是 id_token）
    try {
      const key = await getPublicKey(c.env.PRIVATE_KEY);
      const { payload } = await jwtVerify(accessToken, key, {
        issuer: issuerOf(c, 'dingtalk'),
        algorithms: ['RS256'],
      });

      // 返回标准 UserInfo 响应
      return c.json({
        sub: payload.sub,
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      });
    } catch (e) {
      return c.json(
        {
          error: 'invalid_token',
          error_description: e instanceof Error ? e.message : 'token verify failed',
        },
        401,
      );
    }
  },
};