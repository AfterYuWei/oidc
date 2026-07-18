import type { ProviderName } from '../types';
import type { Provider } from './types';
import { feishuProvider } from './feishu';
import { dingtalkProvider } from './dingtalk';
import { wecomProvider } from './wecom';

/**
 * 渠道注册表：所有大厂翻译器聚合于此，通过动态路由 /:provider/... 分流。
 */
const REGISTRY: Record<ProviderName, Provider> = {
  feishu: feishuProvider,
  dingtalk: dingtalkProvider,
  wecom: wecomProvider,
};

const SUPPORTED: ReadonlySet<string> = new Set(Object.keys(REGISTRY));

/**
 * 校验 URL 中的 provider 段是否受支持（类型守卫）。
 * 接受 `string | undefined` 以适配 Hono `c.req.param()` 的返回类型。
 */
export function isValidProvider(name: string | undefined): name is ProviderName {
  return !!name && SUPPORTED.has(name);
}

/** 取得对应渠道的翻译器实例 */
export function getProvider(name: ProviderName): Provider {
  return REGISTRY[name];
}

/** 受支持渠道列表（用于自描述/文档） */
export function listProviders(): ProviderName[] {
  return Object.keys(REGISTRY) as ProviderName[];
}
