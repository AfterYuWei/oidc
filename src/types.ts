import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * 渠道标识：飞书 / 钉钉 / 企业微信
 */
export type ProviderName = 'feishu' | 'dingtalk' | 'wecom';

/**
 * Cloudflare Workers 环境绑定
 *
 * 设计哲学：100% 无状态。
 * - PRIVATE_KEY: 全站唯一 RS256 私钥（PEM），通过 `wrangler secret put` 注入，
 *                绝不在任何物理介质上落地第三方应用凭证（如飞书 client_secret）。
 * - OIDC_QUOTA_STORE:   仅用于按大厂 App ID 扣减登录配额，不存储任何用户凭证。
 * - ISSUER:      可选，JWT iss 声明；缺省时取请求 origin。
 */
export interface Bindings {
  PRIVATE_KEY: string;
  OIDC_QUOTA_STORE: KVNamespace;
  ISSUER?: string;
}

/**
 * Hono 上下文泛型，统一注入 Bindings
 */
export interface AppEnv {
  Bindings: Bindings;
}
