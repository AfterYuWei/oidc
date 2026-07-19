export type Locale = 'zh' | 'en';

export function detectLocale(request: {
  query: (key: string) => string | undefined;
  header: (key: string) => string | undefined;
}): Locale {
  const queryLang = request.query('lang');
  if (queryLang === 'zh' || queryLang === 'en') return queryLang;

  const cookie = request.header('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)lang=(zh|en)(?:;|$)/);
  if (match) return match[1] as Locale;

  const accept = request.header('Accept-Language') || '';
  if (accept.includes('zh')) return 'zh';
  return 'en';
}

export const translations = {
  zh: {
    brand: 'oidc.cc',
    apiDocs: 'API 文档',
    lang: {
      zh: '中',
      en: 'EN',
    },
    theme: {
      light: '浅色',
      dark: '深色',
      system: '跟随系统',
    },
    hero: {
      title: 'API 文档',
      subtitle:
        '无状态身份网关：将飞书、钉钉、企业微信的非标准 OAuth2 流程翻译为标准 OpenID Connect。100% 零存储，无需用户数据库。',
    },
    cards: {
      style: { title: '接口风格', text: '标准 OIDC Discovery + 授权码模式，兼容 GitLab、Grafana、Dex 等下游系统。' },
      signing: { title: '签名算法', text: 'JWT 使用 RS256 签名，公钥通过 /.well-known/jwks.json 自动发布。' },
      quota: { title: '免费配额', text: '每个 App ID 默认赠送 100 次成功登录额度，仅在签发 id_token 后扣减。' },
      origin: { title: '当前 Origin', text: '{origin}' },
    },
    quickStart: {
      title: '快速开始',
      steps: [
        '选择任一 Provider（如 feishu），使用其 Discovery 端点配置你的 OIDC 客户端。',
        '将 client_id 设为大厂应用的 App ID（企业微信见特殊说明）。',
        '在 /api/token 中通过 client_secret 或 Basic Auth 传入应用密钥。',
        '网关完成扫码登录后返回标准 id_token，下游按 JWKS 验签即可。',
      ],
      discoveryLabel: 'OIDC Discovery URL',
    },
    endpoints: {
      title: '通用端点',
      intro: '以下端点均按 /{provider} 前缀隔离，当前支持的 provider：',
      discovery: {
        title: 'OIDC Discovery',
        desc: '返回标准 OpenID Connect Discovery 文档，供下游系统自动发现配置。',
        paramProvider: '渠道标识',
        responseExample: '响应示例',
      },
      jwks: {
        title: 'JWKS 公钥',
        desc: '发布 RS256 公钥集合，下游可据此验证 id_token 签名。',
        note: '公钥按 isolate 缓存 1 小时；密钥轮换时 kid 会随公钥指纹自动变更。',
      },
      auth: {
        title: '授权端点',
        desc: '登录入口。网关校验配额后，将下游上下文缝合进 provider 的 state，并 302 重定向到大厂授权页。',
        paramClientId: '大厂应用 App ID。企业微信特殊规则见下方。',
        paramRedirectUri: '下游回调地址，必须与 token 端点一致。',
        paramResponseType: '固定为 code。',
        paramScope: '必须包含 openid。',
        paramState: '防 CSRF 随机串，回调时原样返回。',
        paramNonce: '将被写入 id_token，用于防止重放。',
        paramCodeChallenge: 'PKCE S256 挑战值。',
        paramAgentId: '仅企业微信：应用 ID。',
        note: '授权端点不接收 client_secret，符合标准 OIDC 规范；密钥仅在 token 端点出现。',
      },
      callback: {
        title: '大厂回调端点',
        desc: '接收大厂授权成功后的回调，解缝合 state，签发内部 packed_code，并 302 回到下游 redirect_uri。',
        warning: '此端点由大厂浏览器跳转触发，不应被下游直接调用。',
      },
      token: {
        title: 'Token 端点',
        desc: '用授权码换取 id_token 与 access_token。成功签发后扣减一次配额。',
        paramGrantType: '固定为 authorization_code。',
        paramCode: '回调返回的 packed_code。',
        paramClientId: '大厂 App ID；可与 Basic Auth 中的 id 二选一。',
        paramClientSecret: '大厂应用密钥；可与 Basic Auth 中的 secret 二选一。',
        paramRedirectUri: '若提供，必须与 auth 端点传入值一致。',
        basicAuthExample: 'Basic Auth 示例',
        responseExample: '响应示例',
      },
      userinfo: {
        title: 'UserInfo 端点',
        desc: '用 access_token 获取用户信息。本实现中 access_token 即为 id_token。',
        responseExample: '响应示例',
      },
    },
    table: {
      param: '参数',
      required: '必填',
      optional: '可选',
      description: '说明',
      pathParam: '路径参数',
      configItem: '配置项',
      value: '值 / 说明',
      errorCode: '错误码',
      http: 'HTTP',
      meaning: '含义',
    },
    providers: {
      title: 'Provider 接入说明',
      issuer: 'Issuer / Discovery',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      scopes: 'Scopes',
      feishu: {
        name: '飞书',
        clientIdTip: '飞书开放平台「凭证与基础信息」中的 App ID',
        secretTip: '对应应用的 App Secret',
      },
      dingtalk: {
        name: '钉钉',
        clientIdTip: '钉钉开放平台应用详情页的 Client ID（原 AppKey）',
        secretTip: '对应应用的 Client Secret',
      },
      wecom: {
        name: '企业微信',
        clientIdTip: '企业微信 CorpID；或通过 CorpID_AgentID 形式一并传入应用 ID',
        secretTip: '企业微信应用的 Secret',
        extraTitle: '企业微信特殊参数',
        extraText: 'Web 登录组件需要 agentid。你可以：',
        extraOption1: '在 /api/auth 中额外传 agentid=AGENT_ID；',
        extraOption2: '或在 client_id 中使用 CorpID_AgentID 格式（下划线分隔）。',
      },
    },
    quota: {
      title: '配额与计费',
      items: [
        '每个 client_id（大厂 App ID）首次调用 /api/auth 时自动获赠 100 次免费额度。',
        '配额仅在实际签发 id_token 成功后扣减；用户只点开扫码页不完成登录不扣费。',
        '额度耗尽后 /api/auth 返回 403，提示前往官网购买商业授权。',
        '额度数据存储在 Cloudflare KV，最终一致；极端并发下可能存在少量少扣。',
      ],
    },
    security: {
      title: '安全说明',
      items: [
        '零存储：网关不保存任何用户凭证；client_secret 仅在单次请求内存中使用，请求结束即释放。',
        '状态缝合：下游上下文通过 Base64URL 编码后嵌入 provider state；内部 packed_code 使用 RS256 签名，TTL 60 秒。',
        '租户隔离：token 端点强制校验 client_id 与 packed_code 中记录的一致性，防止跨应用攻击。',
        '输入转义：所有用户可控字符串（如 client_id）在 HTML 错误页中均做转义，防止 XSS。',
      ],
    },
    errors: {
      title: '错误码',
      unsupported_provider: 'URL 中的 provider 不在支持列表。',
      invalid_request: '请求参数缺失或格式错误。',
      invalid_client: 'client_id / client_secret 缺失或 mismatch。',
      invalid_grant: '授权码无效、过期或调用大厂接口失败。',
      invalid_token: 'access_token 验签失败或过期。',
      not_implemented: '该功能尚未实现。',
      internal_error: '网关内部异常（不泄露堆栈）。',
    },
    footer: 'oidc.cc · 无状态身份网关',
    clientJs: {
      themeSaved: '主题已保存',
    },
  },
  en: {
    brand: 'oidc.cc',
    apiDocs: 'API Docs',
    lang: {
      zh: '中',
      en: 'EN',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    hero: {
      title: 'API Documentation',
      subtitle:
        'A stateless identity gateway that translates non-standard Feishu, DingTalk, and WeCom OAuth2 flows into standard OpenID Connect. 100% zero storage, no user database required.',
    },
    cards: {
      style: { title: 'Interface Style', text: 'Standard OIDC Discovery + authorization code flow, compatible with GitLab, Grafana, Dex, and other downstream systems.' },
      signing: { title: 'Signing Algorithm', text: 'JWTs are signed with RS256; public keys are automatically published at /.well-known/jwks.json.' },
      quota: { title: 'Free Quota', text: 'Each App ID gets 100 free successful logins by default; quota is deducted only after an id_token is issued.' },
      origin: { title: 'Current Origin', text: '{origin}' },
    },
    quickStart: {
      title: 'Quick Start',
      steps: [
        'Pick a Provider (e.g. feishu) and configure your OIDC client with its Discovery endpoint.',
        'Set client_id to the provider App ID (see WeCom special notes below).',
        'Pass client_secret via POST body or Basic Auth at /api/token.',
        'After the user scans the QR code, the gateway returns a standard id_token; verify it with JWKS.',
      ],
      discoveryLabel: 'OIDC Discovery URL',
    },
    endpoints: {
      title: 'Endpoints',
      intro: 'All endpoints are namespaced under /{provider}. Currently supported providers:',
      discovery: {
        title: 'OIDC Discovery',
        desc: 'Returns a standard OpenID Connect Discovery document for downstream auto-configuration.',
        paramProvider: 'Provider identifier',
        responseExample: 'Response Example',
      },
      jwks: {
        title: 'JWKS Public Keys',
        desc: 'Publishes the RS256 public key set for verifying id_token signatures.',
        note: 'Keys are cached at the isolate level for 1 hour; kid changes automatically on key rotation.',
      },
      auth: {
        title: 'Authorization Endpoint',
        desc: 'Login entrypoint. The gateway checks quota, stitches downstream context into the provider state, and 302-redirects to the provider authorization page.',
        paramClientId: 'Provider App ID. See WeCom special rules below.',
        paramRedirectUri: 'Downstream callback URI; must match the value sent to the token endpoint.',
        paramResponseType: 'Must be code.',
        paramScope: 'Must include openid.',
        paramState: 'CSRF-prevention random string; returned unchanged on callback.',
        paramNonce: 'Will be written into the id_token for replay prevention.',
        paramCodeChallenge: 'PKCE S256 challenge value.',
        paramAgentId: 'WeCom only: application ID.',
        note: 'The authorization endpoint does not accept client_secret, following standard OIDC; the secret only appears at the token endpoint.',
      },
      callback: {
        title: 'Provider Callback',
        desc: 'Receives the provider authorization callback, unstitches state, issues an internal packed_code, and 302-redirects back to the downstream redirect_uri.',
        warning: 'This endpoint is triggered by the provider browser redirect; downstream systems should not call it directly.',
      },
      token: {
        title: 'Token Endpoint',
        desc: 'Exchange the authorization code for an id_token and access_token. One quota is deducted after successful issuance.',
        paramGrantType: 'Must be authorization_code.',
        paramCode: 'The packed_code returned from the callback.',
        paramClientId: 'Provider App ID; can also be supplied via Basic Auth username.',
        paramClientSecret: 'Provider app secret; can also be supplied via Basic Auth password.',
        paramRedirectUri: 'If provided, must match the value passed to the auth endpoint.',
        basicAuthExample: 'Basic Auth Example',
        responseExample: 'Response Example',
      },
      userinfo: {
        title: 'UserInfo Endpoint',
        desc: 'Retrieve user information with an access_token. In this implementation access_token is the id_token itself.',
        responseExample: 'Response Example',
      },
    },
    table: {
      param: 'Parameter',
      required: 'Required',
      optional: 'Optional',
      description: 'Description',
      pathParam: 'Path Parameter',
      configItem: 'Config Item',
      value: 'Value / Description',
      errorCode: 'Error Code',
      http: 'HTTP',
      meaning: 'Meaning',
    },
    providers: {
      title: 'Provider Setup',
      issuer: 'Issuer / Discovery',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      scopes: 'Scopes',
      feishu: {
        name: 'Feishu',
        clientIdTip: 'App ID from the Feishu Open Platform app credentials page.',
        secretTip: 'The corresponding App Secret.',
      },
      dingtalk: {
        name: 'DingTalk',
        clientIdTip: 'Client ID (formerly AppKey) from the DingTalk Open Platform app details page.',
        secretTip: 'The corresponding Client Secret.',
      },
      wecom: {
        name: 'WeCom',
        clientIdTip: 'WeCom CorpID; or pass CorpID_AgentID to include the application ID.',
        secretTip: 'The WeCom application Secret.',
        extraTitle: 'WeCom Special Parameter',
        extraText: 'Web login requires agentid. You can either:',
        extraOption1: 'Pass agentid=AGENT_ID as an extra query parameter to /api/auth;',
        extraOption2: 'Or use the CorpID_AgentID format in client_id (underscore-separated).',
      },
    },
    quota: {
      title: 'Quota & Billing',
      items: [
        'Each client_id (provider App ID) receives 100 free successful logins automatically on the first call to /api/auth.',
        'Quota is deducted only after an id_token is successfully issued; opening the QR page without completing login is not counted.',
        'When quota is exhausted, /api/auth returns 403 with instructions to purchase a commercial license.',
        'Quota data is stored in Cloudflare KV (eventually consistent); minor under-counting is possible under extreme concurrency.',
      ],
    },
    security: {
      title: 'Security',
      items: [
        'Zero storage: the gateway does not persist any user credentials; client_secret exists only in memory for the duration of a single request.',
        'State stitching: downstream context is Base64URL-encoded into the provider state; internal packed_code is RS256-signed with a 60-second TTL.',
        'Tenant isolation: the token endpoint enforces that client_id matches the value recorded inside packed_code, preventing cross-app attacks.',
        'Input escaping: all attacker-controlled strings (e.g. client_id) are HTML-escaped before being rendered in error pages, preventing XSS.',
      ],
    },
    errors: {
      title: 'Error Codes',
      unsupported_provider: 'The provider in the URL is not in the supported list.',
      invalid_request: 'Missing or malformed request parameters.',
      invalid_client: 'client_id / client_secret missing or mismatch.',
      invalid_grant: 'Authorization code invalid, expired, or provider API call failed.',
      invalid_token: 'access_token signature verification failed or expired.',
      not_implemented: 'This feature is not yet implemented.',
      internal_error: 'Internal gateway error (stack trace is not exposed).',
    },
    footer: 'oidc.cc · Stateless Identity Gateway',
    clientJs: {
      themeSaved: 'Theme saved',
    },
  },
};

export type Translations = typeof translations.zh;

export function getTranslations(locale: Locale): Translations {
  return translations[locale];
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
