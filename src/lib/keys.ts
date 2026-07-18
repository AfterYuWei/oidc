import { calculateJwkThumbprint, type JWK } from 'jose';

/**
 * 密钥与 JWKS 按 isolate 缓存
 * ------------------------------
 * Cloudflare Workers 的 V8 isolate 在生命周期内可复用，模块级变量可跨请求命中缓存，
 * 实现 0 毫秒冷启动后的极速响应。当 isolate 被回收时缓存自动失效，无持久化风险。
 *
 * 安全说明：仅缓存“全局私钥”与“公钥 JWK”，绝不缓存任何第三方应用凭证。
 */
let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicJwk: (JWK & { kid: string }) | null = null;
let cachedPem = '';

/**
 * 将 PKCS8 PEM 解析为 DER 字节（纯字符串处理，无 node:crypto 依赖）。
 * 兼容 `-----BEGIN PRIVATE KEY-----` 与 `-----BEGIN RSA PRIVATE KEY-----` 头部剥离。
 */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 导入 RS256 私钥（PKCS8 PEM -> CryptoKey）。
 *
 * 关键点：使用 `crypto.subtle.importKey` 直接导入并设 `extractable=true`，
 * 因为 jose 的 `importPKCS8` 硬编码 `extractable:false`，会导致 `exportKey` 失败。
 * 此处需要可导出，以便派生公钥 JWK 供 JWKS 端点发布。
 *
 * 该 CryptoKey 同时用于：
 * 1. jose `SignJWT` 签发 id_token（Step 4）；
 * 2. `crypto.subtle.exportKey('jwk')` 派生公钥 JWK。
 *
 * 纯 Web Crypto API，严禁 node:crypto。
 */
async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign'],
  );
}

/**
 * 取得（缓存的）RS256 私钥，供 jose SignJWT 签名使用。
 * 返回 DOM CryptoKey（jose 的 KeyLike 兼容 CryptoKey）。
 */
export async function getPrivateKey(pem: string): Promise<CryptoKey> {
  if (cachedPrivateKey && cachedPem === pem) {
    return cachedPrivateKey;
  }
  cachedPrivateKey = await importRsaPrivateKey(pem);
  cachedPem = pem;
  return cachedPrivateKey;
}

/**
 * 派生公钥 JWK（含 kid），按 isolate 缓存。
 *
 * kid 采用 RFC 7638 JWK Thumbprint（公钥指纹），保证：
 * 1. 密钥轮换时 kid 自动变更，下游系统可平滑切换；
 * 2. 同一公钥在所有 isolate 上计算得到同一 kid，无一致性问题。
 */
export async function getPublicJwk(pem: string): Promise<JWK & { kid: string }> {
  if (cachedPublicJwk && cachedPem === pem) {
    return cachedPublicJwk;
  }
  const privateKey = await getPrivateKey(pem);
  const privateJwk = (await crypto.subtle.exportKey('jwk', privateKey)) as JWK;

  // 仅保留公钥分量，剔除 d / p / q / dp / dq / qi 等私有字段
  const publicJwk: JWK = {
    kty: privateJwk.kty,
    n: privateJwk.n,
    e: privateJwk.e,
    alg: 'RS256',
    use: 'sig',
  };

  const kid = await calculateJwkThumbprint({
    kty: publicJwk.kty!,
    n: publicJwk.n!,
    e: publicJwk.e!,
  });
  publicJwk.kid = kid;

  cachedPublicJwk = publicJwk as JWK & { kid: string };
  return cachedPublicJwk;
}

let cachedPublicKey: CryptoKey | null = null;

/**
 * 取得（缓存的）RS256 公钥（用于 JWT 验签）。
 *
 * 私钥导入时 usage 为 ['sign']，无法直接用于 `crypto.subtle.verify`。
 * 此处从已派生的公钥 JWK 重新导入为 usage=['verify'] 的 CryptoKey，
 * 供 jose `jwtVerify` 在 Step 4 验证 bridge_state / bridge_code 时使用。
 */
export async function getPublicKey(pem: string): Promise<CryptoKey> {
  if (cachedPublicKey && cachedPem === pem) {
    return cachedPublicKey;
  }
  const jwk = await getPublicJwk(pem);
  cachedPublicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty!,
      n: jwk.n!,
      e: jwk.e!,
      alg: 'RS256',
      ext: true,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify'],
  );
  return cachedPublicKey;
}

/**
 * 构造标准 JWKS（JSON Web Key Set）文档，供下游系统自动验签。
 */
export async function getJwks(pem: string): Promise<{ keys: JWK[] }> {
  const key = await getPublicJwk(pem);
  return { keys: [key] };
}

/**
 * 读取当前公钥的 kid（用于签发 id_token 时写入 header，Step 4 使用）。
 */
export async function getKid(pem: string): Promise<string> {
  const jwk = await getPublicJwk(pem);
  return jwk.kid;
}
