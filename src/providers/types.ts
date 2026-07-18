import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * 大厂返回的标准化用户信息
 *
 * 安全约束（严格遵守）：
 * - sub: 扫码用户的唯一 ID（如飞书 open_id），将作为 JWT.sub。
 *        绝不能是大厂 App ID，否则会破坏租户隔离。
 */
export interface ProviderUserInfo {
  sub: string;
  name?: string;
  email?: string;
  avatar?: string;
  extra?: Record<string, unknown>;
}

/**
 * 平台“翻译器”接口
 *
 * 每个大厂实现该接口，将私有 OAuth2 流程翻译为标准 OIDC。
 * Step 4 将为飞书完成完整实现，其余渠道保持占位。
 */
export interface Provider {
  readonly name: string;
  /** 拼接官方 OAuth2 授权 URL 并 302 重定向 */
  redirectToAuth(c: Context<AppEnv>): Promise<Response>;
  /** 接收回调 code，换取用户信息并签发 bridge_code，最后 302 回下游系统 */
  handleCallback(c: Context<AppEnv>): Promise<Response>;
  /** OIDC /token：验证 bridge_code，签发 id_token，扣减配额 */
  exchangeCode(c: Context<AppEnv>): Promise<Response>;
}

/**
 * 占位响应：供未实现的渠道/方法返回统一的 501
 */
export function notImplemented(feature: string, step = 4): Response {
  return new Response(
    JSON.stringify({ error: 'not_implemented', feature, step }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
}
