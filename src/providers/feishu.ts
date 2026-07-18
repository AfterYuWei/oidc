import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { type Provider } from './types';
import { getPrivateKey, getPublicKey, getKid } from '../lib/keys';
import { decrementQuota } from '../middleware/quota';

// ============================================================================
// 飞书 OAuth2 端点
// ============================================================================

const FEISHU_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_APP_TOKEN_URL =
  'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal';
const FEISHU_USER_TOKEN_URL =
  'https://open.feishu.cn/open-apis/authen/v1/access_token';

// ============================================================================
// TTL（秒）
// ============================================================================

/** bridge_state：5 分钟，足够用户完成扫码 */
const BRIDGE_STATE_TTL_SEC = 5 * 60;
/** bridge_code：60 秒，短窗口限制重放（零存储下无法做一次性消费） */
const BRIDGE_CODE_TTL_SEC = 60;
/** id_token：1 小时 */
const ID_TOKEN_TTL_SEC = 60 * 60;

// ============================================================================
// Bridge JWT Claims 类型
// ============================================================================

/**
 * bridge_state：作为飞书 `state` 参数传递，把下游 OIDC 参数 + 飞书凭证
 * 跨“飞书重定向”携带到 /api/callback。
 *
 * ⚠️ 安全：client_secret 仅“签名”未“加密”。JWT 内容可见但不可篡改。
 *    TTL 5 分钟；下游必须使用 HTTPS；若 URL 泄露需立即轮换 App Secret。
 *    未来可升级为 JWE 加密以彻底隐藏 client_secret。
 */
interface BridgeStateClaims {
  typ: 'bridge_state';
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  state: string;
  nonce: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}

/**
 * bridge_code：作为标准 OIDC `code` 返回给下游，把用户身份 + 下游参数
 * 携带到 /api/token。不含 client_secret。
 *
 * 由 /api/callback 在飞书换 token 成功后签发；
 * 由 /api/token 验证后用于签发最终 id_token。
 */
interface BridgeCodeClaims {
  typ: 'bridge_code';
  client_id: string;
  redirect_uri: string;
  state: string;
  nonce: string;
  /** 扫码用户的飞书 open_id，将成为 id_token.sub */
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}

// ============================================================================
// 工具函数
// ============================================================================

function issuerOf(c: Context<AppEnv>): string {
  return c.env.ISSUER || new URL(c.req.url).origin;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 7636 PKCE 校验：S256 = base64url(sha256(verifier)) == challenge */
async function verifyPkce(
  verifier: string,
  challenge: string,
  method: 'S256' | undefined,
): Promise<boolean> {
  if (method !== 'S256') return false;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(hash)) === challenge;
}

/** 从 form-encoded body 中安全取字符串值（parseBody 返回 string | File） */
function formStr(
  body: Record<string, string | File>,
  key: string,
): string | undefined {
  const v = body[key];
  return typeof v === 'string' ? v : undefined;
}

// ============================================================================
// Bridge JWT 签发 / 验证
// ============================================================================

async function signBridgeState(
  c: Context<AppEnv>,
  claims: Omit<BridgeStateClaims, 'typ'>,
): Promise<string> {
  const key = await getPrivateKey(c.env.PRIVATE_KEY);
  const kid = await getKid(c.env.PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...claims, typ: 'bridge_state' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuerOf(c))
    .setIssuedAt(now)
    .setExpirationTime(now + BRIDGE_STATE_TTL_SEC)
    .sign(key);
}

async function verifyBridgeState(
  c: Context<AppEnv>,
  jwt: string,
): Promise<BridgeStateClaims> {
  const key = await getPublicKey(c.env.PRIVATE_KEY);
  const { payload } = await jwtVerify(jwt, key, {
    issuer: issuerOf(c),
    algorithms: ['RS256'],
  });
  if (payload.typ !== 'bridge_state') {
    throw new Error(`unexpected typ: ${String(payload.typ)}`);
  }
  return payload as unknown as BridgeStateClaims;
}

async function signBridgeCode(
  c: Context<AppEnv>,
  claims: Omit<BridgeCodeClaims, 'typ'>,
): Promise<string> {
  const key = await getPrivateKey(c.env.PRIVATE_KEY);
  const kid = await getKid(c.env.PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...claims, typ: 'bridge_code' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuerOf(c))
    .setIssuedAt(now)
    .setExpirationTime(now + BRIDGE_CODE_TTL_SEC)
    .sign(key);
}

async function verifyBridgeCode(
  c: Context<AppEnv>,
  jwt: string,
): Promise<BridgeCodeClaims> {
  const key = await getPublicKey(c.env.PRIVATE_KEY);
  const { payload } = await jwtVerify(jwt, key, {
    issuer: issuerOf(c),
    algorithms: ['RS256'],
  });
  if (payload.typ !== 'bridge_code') {
    throw new Error(`unexpected typ: ${String(payload.typ)}`);
  }
  return payload as unknown as BridgeCodeClaims;
}

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
    .setIssuer(issuerOf(c))
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + ID_TOKEN_TTL_SEC)
    .sign(key);
}

// ============================================================================
// 飞书 API 调用（client_secret 仅在内存中，请求结束即释放）
// ============================================================================

interface FeishuUserInfo {
  open_id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

async function fetchAppAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const resp = await fetch(FEISHU_APP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: clientId, app_secret: clientSecret }),
  });
  if (!resp.ok) {
    throw new Error(`feishu app_access_token HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    code: number;
    msg: string;
    app_access_token?: string;
  };
  if (data.code !== 0 || !data.app_access_token) {
    throw new Error(`feishu app_access_token code=${data.code} msg=${data.msg}`);
  }
  return data.app_access_token;
}

async function fetchUserAccessToken(
  appAccessToken: string,
  code: string,
): Promise<FeishuUserInfo> {
  const resp = await fetch(FEISHU_USER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
  if (!resp.ok) {
    throw new Error(`feishu user_access_token HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    code: number;
    msg: string;
    data?: FeishuUserInfo;
  };
  if (data.code !== 0 || !data.data) {
    throw new Error(`feishu user_access_token code=${data.code} msg=${data.msg}`);
  }
  return data.data;
}

// ============================================================================
// Provider 实现
// ============================================================================

export const feishuProvider: Provider = {
  name: 'feishu',

  /**
   * GET /feishu/api/auth
   *
   * 下游以标准 OIDC 参数 + 飞书 client_secret 调用。
   * 把所有参数签入 bridge_state JWT，作为飞书 `state` 参数。
   * 302 重定向到飞书授权页。
   */
  async redirectToAuth(c: Context<AppEnv>): Promise<Response> {
    const clientId = c.req.query('client_id');
    const clientSecret = c.req.query('client_secret');
    const redirectUri = c.req.query('redirect_uri');
    const responseType = c.req.query('response_type');
    const scope = c.req.query('scope');
    const state = c.req.query('state') || '';
    const nonce = c.req.query('nonce') || '';
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethodRaw = c.req.query('code_challenge_method');

    // 必填校验
    if (!clientId) {
      return c.json({ error: 'invalid_request', message: 'missing client_id' }, 400);
    }
    if (!clientSecret) {
      return c.json({ error: 'invalid_request', message: 'missing client_secret' }, 400);
    }
    if (!redirectUri) {
      return c.json({ error: 'invalid_request', message: 'missing redirect_uri' }, 400);
    }
    try {
      new URL(redirectUri);
    } catch {
      return c.json({ error: 'invalid_request', message: 'invalid redirect_uri' }, 400);
    }
    if (responseType !== 'code') {
      return c.json({ error: 'invalid_request', message: 'response_type must be code' }, 400);
    }
    if (!scope || !scope.split(/\s+/).includes('openid')) {
      return c.json({ error: 'invalid_request', message: 'scope must include openid' }, 400);
    }
    // 仅支持 S256（RFC 7636 推荐方法），plain 不接受
    if (codeChallenge && codeChallengeMethodRaw !== 'S256') {
      return c.json(
        { error: 'invalid_request', message: 'code_challenge_method must be S256' },
        400,
      );
    }
    const codeChallengeMethod: 'S256' | undefined = codeChallenge
      ? 'S256'
      : undefined;

    // 签发 bridge_state
    const bridgeState = await signBridgeState(c, {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    });

    // 拼接飞书授权 URL
    const origin = new URL(c.req.url).origin;
    const callbackUrl = `${origin}/${feishuProvider.name}/api/callback`;
    const feishuUrl = new URL(FEISHU_AUTHORIZE_URL);
    feishuUrl.searchParams.set('app_id', clientId);
    feishuUrl.searchParams.set('redirect_uri', callbackUrl);
    feishuUrl.searchParams.set('state', bridgeState);
    return c.redirect(feishuUrl.toString(), 302);
  },

  /**
   * GET /feishu/api/callback
   *
   * 飞书回调：?code=feishu_code&state=bridge_state
   *
   * 1. 验证 bridge_state（签名 + exp + typ）。
   * 2. 用 client_secret（仅内存）换取 app_access_token，再换 user_access_token + 用户信息。
   * 3. 签发 bridge_code（含 sub=open_id + 下游参数，不含 client_secret）。
   * 4. 302 回下游 redirect_uri?code=bridge_code&state=原 state。
   *
   * 注意：本端点不签发 id_token、不扣配额。id_token 与 decrementQuota 在 /api/token。
   */
  async handleCallback(c: Context<AppEnv>): Promise<Response> {
    const code = c.req.query('code');
    const stateJwt = c.req.query('state');
    if (!code) {
      return c.json({ error: 'invalid_request', message: 'missing code' }, 400);
    }
    if (!stateJwt) {
      return c.json({ error: 'invalid_request', message: 'missing state' }, 400);
    }

    // 1. 验证 bridge_state
    let state: BridgeStateClaims;
    try {
      state = await verifyBridgeState(c, stateJwt);
    } catch (e) {
      return c.json(
        {
          error: 'invalid_state',
          message: e instanceof Error ? e.message : 'verify failed',
        },
        400,
      );
    }

    // 2. 换取 Feishu app_access_token（client_secret 仅在内存中使用）
    let appAccessToken: string;
    try {
      appAccessToken = await fetchAppAccessToken(
        state.client_id,
        state.client_secret,
      );
    } catch (e) {
      return c.json(
        {
          error: 'feishu_app_token_failed',
          message: e instanceof Error ? e.message : 'unknown',
        },
        502,
      );
    }

    // 3. 换取 user_access_token + 用户信息
    let userInfo: FeishuUserInfo;
    try {
      userInfo = await fetchUserAccessToken(appAccessToken, code);
    } catch (e) {
      return c.json(
        {
          error: 'feishu_user_token_failed',
          message: e instanceof Error ? e.message : 'unknown',
        },
        502,
      );
    }
    if (!userInfo.open_id) {
      return c.json({ error: 'feishu_no_open_id' }, 502);
    }

    // 4. 签发 bridge_code
    const bridgeCode = await signBridgeCode(c, {
      client_id: state.client_id,
      redirect_uri: state.redirect_uri,
      state: state.state,
      nonce: state.nonce,
      sub: userInfo.open_id,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.avatar_url,
      code_challenge: state.code_challenge,
      code_challenge_method: state.code_challenge_method,
    });

    // 5. 302 回下游
    const downstream = new URL(state.redirect_uri);
    downstream.searchParams.set('code', bridgeCode);
    downstream.searchParams.set('state', state.state);
    return c.redirect(downstream.toString(), 302);
  },

  /**
   * POST /feishu/api/token
   *
   * 标准 OIDC /token：下游用 bridge_code 换取 id_token。
   *
   * 1. 验证 bridge_code（签名 + exp + typ）。
   * 2. 校验 client_id / redirect_uri（防篡改）。
   * 3. 校验 PKCE（code_verifier 对应 code_challenge）。
   * 4. 签发 RS256 id_token（sub=open_id, aud=client_id, nonce, name, picture...）。
   * 5. ★ 在 id_token 签发成功的最后一瞬间执行 decrementQuota。
   */
  async exchangeCode(c: Context<AppEnv>): Promise<Response> {
    const body = await c.req.parseBody();
    const grantType = formStr(body, 'grant_type');
    const code = formStr(body, 'code');
    const clientId = formStr(body, 'client_id');
    const redirectUri = formStr(body, 'redirect_uri');
    const codeVerifier = formStr(body, 'code_verifier');

    if (grantType !== 'authorization_code') {
      return c.json({ error: 'unsupported_grant_type' }, 400);
    }
    if (!code) {
      return c.json({ error: 'invalid_grant', message: 'missing code' }, 400);
    }
    if (!clientId) {
      return c.json({ error: 'invalid_client', message: 'missing client_id' }, 400);
    }

    // 1. 验证 bridge_code
    let claims: BridgeCodeClaims;
    try {
      claims = await verifyBridgeCode(c, code);
    } catch (e) {
      return c.json(
        {
          error: 'invalid_grant',
          message: e instanceof Error ? e.message : 'verify failed',
        },
        400,
      );
    }

    // 2. 防篡改校验
    if (claims.client_id !== clientId) {
      return c.json({ error: 'invalid_client', message: 'client_id mismatch' }, 400);
    }
    if (redirectUri && claims.redirect_uri !== redirectUri) {
      return c.json(
        { error: 'invalid_grant', message: 'redirect_uri mismatch' },
        400,
      );
    }

    // 3. PKCE 校验
    if (claims.code_challenge) {
      if (!codeVerifier) {
        return c.json(
          { error: 'invalid_grant', message: 'missing code_verifier' },
          400,
        );
      }
      const ok = await verifyPkce(
        codeVerifier,
        claims.code_challenge,
        claims.code_challenge_method,
      );
      if (!ok) {
        return c.json(
          { error: 'invalid_grant', message: 'PKCE verification failed' },
          400,
        );
      }
    }

    // 4. 签发 id_token
    const idToken = await signIdToken(c, {
      sub: claims.sub,
      aud: claims.client_id,
      nonce: claims.nonce,
      name: claims.name,
      email: claims.email,
      picture: claims.picture,
    });

    // 5. ★ 在 id_token 签发成功的最后一瞬间扣减配额
    await decrementQuota(c.env.QUOTA_KV, claims.client_id);

    return c.json({
      token_type: 'Bearer',
      id_token: idToken,
      expires_in: ID_TOKEN_TTL_SEC,
    });
  },
};
