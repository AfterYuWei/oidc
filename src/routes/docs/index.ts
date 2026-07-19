import type { Context } from 'hono';
import type { AppEnv, ProviderName } from '../../types';
import { listProviders } from '../../providers';
import {
  type Locale,
  detectLocale,
  getTranslations,
  type Translations,
} from './translations';

/**
 * GET /
 *
 * 网关根路径：渲染自描述 API 文档页面，替代原来的官网跳转。
 * 支持中英双语（lang 查询参数 / Cookie / Accept-Language）与明暗主题切换。
 */
export async function docsHandler(c: Context<AppEnv>): Promise<Response> {
  const locale = detectLocale({
    query: (key: string) => c.req.query(key),
    header: (key: string) => c.req.header(key),
  });
  const origin = new URL(c.req.url).origin;
  const providers = listProviders();
  const queryProvider = c.req.query('provider');
  const selectedProvider = providers.includes(queryProvider as ProviderName)
    ? (queryProvider as ProviderName)
    : 'feishu';
  const t = getTranslations(locale);

  return c.html(renderDocs({ origin, providers, locale, t, selectedProvider }));
}

interface RenderOptions {
  origin: string;
  providers: ProviderName[];
  locale: Locale;
  t: Translations;
  selectedProvider: ProviderName;
}

function renderDocs({ origin, providers, locale, t, selectedProvider }: RenderOptions): string {
  const otherLocale: Locale = locale === 'zh' ? 'en' : 'zh';
  const providerTags = providers
    .map(
      (p) =>
        `<a href="?provider=${p}" class="provider-tag${p === selectedProvider ? ' active' : ''}" title="${p}" onclick="switchProvider('${p}', event)">${p}</a>`,
    )
    .join('');

  const esc = escapeHtml;

  return `<!doctype html>
<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}" data-theme="system">
<head>
  <meta charset="utf-8">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(t.apiDocs)} · ${esc(t.brand)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --background: 0 0% 100%;
      --foreground: 240 10% 4%;
      --card: 240 5% 96%;
      --card-foreground: 240 10% 4%;
      --muted: 240 5% 92%;
      --muted-foreground: 240 4% 46%;
      --subtle: 240 4% 46%;
      --border: 240 6% 90%;
      --accent: 142 71% 45%;
      --accent-foreground: 0 0% 100%;
      --radius: 12px;
      --max-width: 900px;
    }

    @media (prefers-color-scheme: dark) {
      html:not([data-theme="light"]) {
        --background: 0 0% 0%;
        --foreground: 0 0% 100%;
        --card: 0 0% 4%;
        --card-foreground: 0 0% 100%;
        --muted: 0 0% 7%;
        --muted-foreground: 0 0% 55%;
        --subtle: 0 0% 53%;
        --border: 0 0% 100% / 0.1;
        --accent: 142 71% 45%;
        --accent-foreground: 0 0% 100%;
      }
    }

    html[data-theme="dark"] {
      --background: 0 0% 0%;
      --foreground: 0 0% 100%;
      --card: 0 0% 4%;
      --card-foreground: 0 0% 100%;
      --muted: 0 0% 7%;
      --muted-foreground: 0 0% 55%;
      --subtle: 0 0% 53%;
      --border: 0 0% 100% / 0.1;
      --accent: 142 71% 45%;
      --accent-foreground: 0 0% 100%;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      line-height: 1.7;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    ::selection {
      background: hsl(var(--accent) / 0.3);
      color: hsl(var(--foreground));
    }

    a { color: hsl(var(--accent)); text-decoration: none; }
    a:hover { text-decoration: underline; }

    header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: hsl(var(--background) / 0.7);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid hsl(var(--border));
    }

    .header-inner {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .brand {
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
      color: hsl(var(--foreground));
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-icon {
      width: 20px;
      height: 20px;
      display: block;
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: hsl(var(--muted-foreground));
      cursor: pointer;
      transition: all 0.2s;
    }

    .icon-btn:hover {
      background: hsl(var(--muted));
      color: hsl(var(--foreground));
    }

    .lang-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 34px;
      padding: 0 8px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: hsl(var(--muted-foreground));
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .lang-btn:hover {
      background: hsl(var(--muted));
      color: hsl(var(--foreground));
    }

    .page {
      position: relative;
      overflow: hidden;
    }

    .aurora {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 0;
    }

    .aurora span {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.35;
      animation: aurora 12s ease-in-out infinite;
    }

    .aurora span:nth-child(1) {
      top: 10%;
      left: 50%;
      width: 700px;
      height: 500px;
      background: rgba(139, 92, 246, 0.35);
      transform: translateX(-50%);
    }

    .aurora span:nth-child(2) {
      top: 18%;
      left: 30%;
      width: 500px;
      height: 400px;
      background: rgba(59, 130, 246, 0.28);
      animation-delay: -4s;
    }

    .aurora span:nth-child(3) {
      top: 40%;
      right: 20%;
      width: 450px;
      height: 350px;
      background: rgba(236, 72, 153, 0.22);
      animation-delay: -8s;
    }

    @keyframes aurora {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      33% { transform: translate(2%, 2%) rotate(5deg); }
      66% { transform: translate(-2%, 1%) rotate(-5deg); }
    }

    .grid-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.03;
      background-image:
        linear-gradient(hsl(var(--foreground) / 0.1) 1px, transparent 1px),
        linear-gradient(90deg, hsl(var(--foreground) / 0.1) 1px, transparent 1px);
      background-size: 60px 60px;
      z-index: 1;
    }

    main {
      position: relative;
      z-index: 2;
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 48px 24px 100px;
    }

    .hero {
      text-align: center;
      padding: 64px 0 48px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: hsl(var(--card));
      border: 1px solid hsl(var(--border));
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      margin-bottom: 24px;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: hsl(var(--accent));
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    h1 {
      font-size: clamp(40px, 8vw, 64px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
      margin: 0 0 20px;
    }

    .text-gradient {
      background: linear-gradient(135deg, hsl(var(--foreground)) 0%, hsl(var(--muted-foreground)) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 18px;
      color: hsl(var(--muted-foreground));
      max-width: 640px;
      margin: 0 auto 48px;
      line-height: 1.7;
    }

    .hero-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 64px;
      text-align: left;
    }

    .card {
      background: hsl(var(--card));
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      padding: 22px;
      transition: transform 0.2s, border-color 0.2s;
    }

    .card:hover {
      transform: translateY(-2px);
      border-color: hsl(var(--foreground) / 0.15);
    }

    .card h3 {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 500;
      color: hsl(var(--muted-foreground));
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .card p {
      margin: 0;
      font-size: 14px;
      color: hsl(var(--foreground) / 0.85);
      line-height: 1.6;
    }

    h2 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 64px 0 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid hsl(var(--border));
    }

    h3 {
      font-size: 20px;
      font-weight: 600;
      margin: 36px 0 14px;
      color: hsl(var(--accent));
    }

    h4 {
      font-size: 15px;
      font-weight: 600;
      margin: 22px 0 10px;
      color: hsl(var(--foreground));
    }

    p, li {
      color: hsl(var(--muted-foreground));
    }

    ul, ol {
      padding-left: 22px;
    }

    li {
      margin: 8px 0;
    }

    code {
      font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
      font-size: 13px;
      background: hsl(var(--muted));
      padding: 2px 6px;
      border-radius: 5px;
      color: hsl(var(--accent));
    }

    .terminal {
      background: hsl(var(--card));
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      overflow: hidden;
      margin: 20px 0;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid hsl(var(--border));
      background: hsl(var(--card));
    }

    .terminal-header span {
      width: 11px;
      height: 11px;
      border-radius: 50%;
    }

    .terminal-header span:nth-child(1) { background: #FF5F57; }
    .terminal-header span:nth-child(2) { background: #FEBC2E; }
    .terminal-header span:nth-child(3) { background: #28C840; }

    .copy-btn {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid hsl(var(--border));
      background: hsl(var(--card));
      color: hsl(var(--muted-foreground));
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: hsl(var(--muted));
      color: hsl(var(--foreground));
    }

    .copy-btn.copied {
      color: hsl(var(--accent));
      border-color: hsl(var(--accent));
    }

    .terminal-body {
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.7;
      overflow-x: auto;
      color: hsl(var(--foreground) / 0.8);
    }

    .terminal-body code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      color: inherit;
    }

    .terminal-body .prompt { color: hsl(var(--accent)); }
    .terminal-body .comment { color: hsl(var(--muted-foreground) / 0.6); }
    .terminal-body .string { color: #34d399; }
    .terminal-body .key { color: #60a5fa; }

    .endpoint {
      background: hsl(var(--card));
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      margin: 24px 0;
      overflow: hidden;
    }

    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px;
      background: hsl(var(--muted) / 0.5);
      border-bottom: 1px solid hsl(var(--border));
      flex-wrap: wrap;
    }

    .method {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      background: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }

    .path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      color: hsl(var(--foreground));
    }

    .endpoint-title {
      margin-left: auto;
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }

    .endpoint-body {
      padding: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 14px;
    }

    th, td {
      text-align: left;
      padding: 11px 14px;
      border-bottom: 1px solid hsl(var(--border));
    }

    th {
      color: hsl(var(--foreground));
      font-weight: 600;
      background: hsl(var(--muted) / 0.4);
      font-size: 13px;
    }

    td {
      color: hsl(var(--muted-foreground));
      vertical-align: top;
    }

    td code { white-space: nowrap; }

    .tag {
      display: inline-block;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .tag.required { background: hsl(142 71% 45% / 0.12); color: hsl(142 71% 45%); }
    .tag.optional { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }

    .providers-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 16px 0 24px;
    }

    .provider-tag {
      padding: 5px 12px;
      border-radius: 999px;
      background: hsl(var(--muted));
      border: 1px solid hsl(var(--border));
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: hsl(var(--foreground));
      transition: all 0.2s;
    }

    .provider-tag:hover {
      background: hsl(var(--border));
      text-decoration: none;
    }

    .provider-tag.active {
      background: hsl(var(--accent));
      border-color: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }

    .note {
      border-left: 3px solid hsl(var(--accent));
      background: hsl(var(--accent) / 0.06);
      padding: 14px 18px;
      border-radius: 0 var(--radius) var(--radius) 0;
      margin: 18px 0;
      font-size: 14px;
    }

    .note.warning {
      border-left-color: hsl(38 92% 50%);
      background: hsl(38 92% 50% / 0.06);
    }

    .note.danger {
      border-left-color: hsl(0 84% 60%);
      background: hsl(0 84% 60% / 0.06);
    }

    .provider-section {
      margin-bottom: 32px;
    }

    .footer {
      text-align: center;
      color: hsl(var(--muted-foreground));
      font-size: 13px;
      margin-top: 80px;
      padding-top: 32px;
      border-top: 1px solid hsl(var(--border));
    }

    @media (max-width: 640px) {
      .header-inner { padding: 0 16px; }
      main { padding: 32px 16px 80px; }
      .hero { padding: 40px 0 32px; }
      .endpoint-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .endpoint-title { margin-left: 0; }
      th, td { padding: 9px 10px; font-size: 13px; }
    }
  </style>
  <script>
    (function () {
      try {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') {
          document.documentElement.setAttribute('data-theme', saved);
        }
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="/" class="brand">
        <svg class="brand-icon" width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="#0A0B0D"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M16 5C9.92487 5 5 9.92487 5 16C5 22.0751 9.92487 27 16 27C22.0751 27 27 22.0751 27 16C27 9.92487 22.0751 5 16 5ZM16 10C12.6863 10 10 12.6863 10 16C10 19.3137 12.6863 22 16 22C19.3137 22 22 19.3137 22 16C22 12.6863 19.3137 10 16 10Z" fill="#32F08C"/>
        </svg>
        ${esc(t.brand)}
      </a>
      <div class="header-actions">
        <button class="lang-btn" onclick="toggleLang()" title="${esc(otherLocale === 'zh' ? '中文' : 'English')}">
          ${esc(t.lang[otherLocale])}
        </button>
        <button class="icon-btn" id="theme-btn" onclick="toggleTheme()" title="${esc(t.theme.light)} / ${esc(t.theme.dark)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <div class="page">
    <div class="aurora">
      <span></span><span></span><span></span>
    </div>
    <div class="grid-overlay"></div>

    <main>
      <section class="hero">
        <div class="badge">
          <span class="badge-dot"></span>
          ${esc(t.apiDocs)}
        </div>
        <h1>
          ${esc(t.hero.title)}
        </h1>
        <p class="subtitle">${esc(t.hero.subtitle)}</p>

        <div class="hero-cards">
          <div class="card">
            <h3>${esc(t.cards.style.title)}</h3>
            <p>${esc(t.cards.style.text)}</p>
          </div>
          <div class="card">
            <h3>${esc(t.cards.signing.title)}</h3>
            <p>${esc(t.cards.signing.text)}</p>
          </div>
          <div class="card">
            <h3>${esc(t.cards.quota.title)}</h3>
            <p>${esc(t.cards.quota.text)}</p>
          </div>
          <div class="card">
            <h3>${esc(t.cards.origin.title)}</h3>
            <p><code>${esc(origin)}</code></p>
          </div>
        </div>
      </section>

      <section id="quick-start">
        <h2>${esc(t.quickStart.title)}</h2>
        <ol>
          ${t.quickStart.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
        </ol>
        ${terminal(
          t.quickStart.discoveryLabel,
          `${origin}/${selectedProvider}/.well-known/openid-configuration`,
        )}
      </section>

      <section id="endpoints">
        <h2>${esc(t.endpoints.title)}</h2>
        <p>${esc(t.endpoints.intro)}</p>
        <div class="providers-row">${providerTags}</div>

        ${endpoint(
          'GET',
          `/${selectedProvider}/.well-known/openid-configuration`,
          t.endpoints.discovery.title,
          `
            <p>${esc(t.endpoints.discovery.desc)}</p>
            <table>
              <tr><th>${esc(t.table.pathParam)}</th><th>${esc(t.table.description)}</th></tr>
              <tr><td><code>provider</code></td><td>${esc(t.endpoints.discovery.paramProvider)}: ${providers.map((p) => `<code>${p}</code>`).join(' / ')}</td></tr>
            </table>
            <h4>${esc(t.endpoints.discovery.responseExample)}</h4>
            ${terminal(
              'JSON',
              JSON.stringify(
                {
                  issuer: `${origin}/${selectedProvider}`,
                  authorization_endpoint: `${origin}/${selectedProvider}/api/auth`,
                  token_endpoint: `${origin}/${selectedProvider}/api/token`,
                  userinfo_endpoint: `${origin}/${selectedProvider}/api/userinfo`,
                  jwks_uri: `${origin}/${selectedProvider}/.well-known/jwks.json`,
                  response_types_supported: ['code'],
                  subject_types_supported: ['public'],
                  id_token_signing_alg_values_supported: ['RS256'],
                  scopes_supported: ['openid', 'profile', 'email'],
                  claims_supported: ['sub', 'name', 'email', 'picture'],
                  code_challenge_methods_supported: ['S256'],
                },
                null,
                2,
              ),
            )}
          `,
        )}

        ${endpoint(
          'GET',
          `/${selectedProvider}/.well-known/jwks.json`,
          t.endpoints.jwks.title,
          `
            <p>${esc(t.endpoints.jwks.desc)}</p>
            <div class="note">${esc(t.endpoints.jwks.note)}</div>
          `,
        )}

        ${endpoint(
          'GET',
          `/${selectedProvider}/api/auth`,
          t.endpoints.auth.title,
          `
            <p>${esc(t.endpoints.auth.desc)}</p>
            <table>
              <tr><th>${esc(t.table.param)}</th><th></th><th>${esc(t.table.description)}</th></tr>
              <tr><td><code>client_id</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.auth.paramClientId)}</td></tr>
              <tr><td><code>redirect_uri</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.auth.paramRedirectUri)}</td></tr>
              <tr><td><code>response_type</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.auth.paramResponseType)}</td></tr>
              <tr><td><code>scope</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.auth.paramScope)}</td></tr>
              <tr><td><code>state</code></td><td><span class="tag optional">${esc(t.table.optional)}</span></td><td>${esc(t.endpoints.auth.paramState)}</td></tr>
              <tr><td><code>nonce</code></td><td><span class="tag optional">${esc(t.table.optional)}</span></td><td>${esc(t.endpoints.auth.paramNonce)}</td></tr>
              <tr><td><code>code_challenge</code></td><td><span class="tag optional">${esc(t.table.optional)}</span></td><td>${esc(t.endpoints.auth.paramCodeChallenge)}</td></tr>
              ${selectedProvider === 'wecom' ? `<tr><td><code>agentid</code></td><td><span class="tag optional">${esc(t.table.optional)}</span></td><td>${esc(t.endpoints.auth.paramAgentId)}</td></tr>` : ''}
            </table>
            <div class="note">${esc(t.endpoints.auth.note)}</div>
          `,
        )}

        ${endpoint(
          'GET',
          `/${selectedProvider}/api/callback`,
          t.endpoints.callback.title,
          `
            <p>${esc(t.endpoints.callback.desc)}</p>
            <div class="note warning">${esc(t.endpoints.callback.warning)}</div>
          `,
        )}

        ${endpoint(
          'POST',
          `/${selectedProvider}/api/token`,
          t.endpoints.token.title,
          `
            <p>${esc(t.endpoints.token.desc)}</p>
            <table>
              <tr><th>${esc(t.table.param)}</th><th></th><th>${esc(t.table.description)}</th></tr>
              <tr><td><code>grant_type</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.token.paramGrantType)}</td></tr>
              <tr><td><code>code</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.token.paramCode)}</td></tr>
              <tr><td><code>client_id</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.token.paramClientId)}</td></tr>
              <tr><td><code>client_secret</code></td><td><span class="tag required">${esc(t.table.required)}</span></td><td>${esc(t.endpoints.token.paramClientSecret)}</td></tr>
              <tr><td><code>redirect_uri</code></td><td><span class="tag optional">${esc(t.table.optional)}</span></td><td>${esc(t.endpoints.token.paramRedirectUri)}</td></tr>
            </table>
            <h4>${esc(t.endpoints.token.basicAuthExample)}</h4>
            ${terminal(
              'curl',
              `curl -X POST ${origin}/${selectedProvider}/api/token \\\n  -u "APP_ID:APP_SECRET" \\\n  -d "grant_type=authorization_code" \\\n  -d "code=PACKED_CODE"`,
            )}
            <h4>${esc(t.endpoints.token.responseExample)}</h4>
            ${terminal(
              'JSON',
              JSON.stringify(
                {
                  token_type: 'Bearer',
                  access_token: 'eyJhbGciOiJSUzI1NiIs...',
                  id_token: 'eyJhbGciOiJSUzI1NiIs...',
                  expires_in: 3600,
                },
                null,
                2,
              ),
            )}
          `,
        )}

        ${endpoint(
          'GET',
          `/${selectedProvider}/api/userinfo`,
          t.endpoints.userinfo.title,
          `
            <p>${esc(t.endpoints.userinfo.desc)}</p>
            ${terminal(
              'curl',
              `curl ${origin}/${selectedProvider}/api/userinfo \\\n  -H "Authorization: Bearer ID_TOKEN"`,
            )}
            <h4>${esc(t.endpoints.userinfo.responseExample)}</h4>
            ${terminal(
              'JSON',
              userinfoExample(selectedProvider, locale),
            )}
          `,
        )}
      </section>

      <section id="providers">
        <h2>${esc(t.providers.title)}</h2>
        <div class="providers-row">${providerTags}</div>
        ${renderProviderSection({ origin, provider: selectedProvider, t, locale })}
      </section>

      <section id="quota">
        <h2>${esc(t.quota.title)}</h2>
        <ul>
          ${t.quota.items.map((item) => `<li>${esc(item)}</li>`).join('')}
        </ul>
      </section>

      <section id="security">
        <h2>${esc(t.security.title)}</h2>
        <ul>
          ${t.security.items.map((item) => `<li>${esc(item)}</li>`).join('')}
        </ul>
      </section>

      <section id="errors">
        <h2>${esc(t.errors.title)}</h2>
        <table>
          <tr><th>${esc(t.table.errorCode)}</th><th>${esc(t.table.http)}</th><th>${esc(t.table.meaning)}</th></tr>
          ${[
            ['unsupported_provider', '400', t.errors.unsupported_provider],
            ['invalid_request', '400', t.errors.invalid_request],
            ['invalid_client', '401', t.errors.invalid_client],
            ['invalid_grant', '400/502', t.errors.invalid_grant],
            ['invalid_token', '401', t.errors.invalid_token],
            ['not_implemented', '501', t.errors.not_implemented],
            ['internal_error', '500', t.errors.internal_error],
          ]
            .map(
              ([code, http, meaning]) =>
                `<tr><td><code>${esc(code)}</code></td><td>${esc(http)}</td><td>${esc(meaning)}</td></tr>`,
            )
            .join('')}
        </table>
      </section>

      <div class="footer">${esc(t.footer)}</div>
    </main>
  </div>

  <script>
    function toggleLang() {
      const next = '${otherLocale}';
      document.cookie = 'lang=' + next + ';path=/;max-age=31536000;SameSite=Lax';
      const url = new URL(window.location.href);
      url.searchParams.set('lang', next);
      window.location.href = url.toString();
    }

    function toggleTheme() {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      let next;
      if (current === 'dark') next = 'light';
      else if (current === 'light') next = prefersDark ? 'system' : 'dark';
      else next = 'dark';

      if (next === 'system') {
        root.removeAttribute('data-theme');
        localStorage.removeItem('theme');
      } else {
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      }
    }

    async function switchProvider(provider, event) {
      if (event) event.preventDefault();
      const current = new URL(window.location.href).searchParams.get('provider') || 'feishu';
      if (provider === current) return;

      const url = new URL(window.location.href);
      url.searchParams.set('provider', provider);
      history.replaceState(null, '', url.toString());

      try {
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('fetch failed');
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const sections = ['quick-start', 'endpoints', 'providers'];
        for (const id of sections) {
          const current = document.getElementById(id);
          const next = doc.getElementById(id);
          if (current && next) current.innerHTML = next.innerHTML;
        }
      } catch (err) {
        console.error('[docs] switch provider failed:', err);
        window.location.href = url.toString();
      }
    }

    async function copyTerminal(btn) {
      const pre = btn.closest('.terminal').querySelector('pre');
      if (!pre) return;
      const text = pre.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('copied');
        const original = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = original;
        }, 1500);
      } catch (err) {
        console.error('[docs] copy failed:', err);
      }
    }
  </script>
</body>
</html>`;
}

function terminal(_title: string, content: string): string {
  return `<div class="terminal">
  <div class="terminal-header">
    <span></span><span></span><span></span>
    <button class="copy-btn" type="button" onclick="copyTerminal(this)" title="${escapeHtml(_title === 'curl' ? '复制命令' : '复制代码')}" aria-label="复制">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  </div>
  <pre class="terminal-body"><code>${escapeHtml(content)}</code></pre>
</div>`;
}

function endpoint(
  method: string,
  path: string,
  title: string,
  body: string,
): string {
  return `<div class="endpoint" id="ep-${path.replace(/[^a-zA-Z0-9]/g, '-')}">
  <div class="endpoint-header">
    <span class="method">${escapeHtml(method)}</span>
    <span class="path">${escapeHtml(path)}</span>
    <span class="endpoint-title">${escapeHtml(title)}</span>
  </div>
  <div class="endpoint-body">${body}</div>
</div>`;
}

interface ProviderConfig {
  name: string;
  clientIdTip: string;
  secretTip: string;
  extraTitle?: string;
  extraText?: string;
  extraOption1?: string;
  extraOption2?: string;
}

function renderProviderSection({
  origin,
  provider,
  t,
}: {
  origin: string;
  provider: string;
  t: Translations;
  locale: Locale;
}): string {
  const cfg = (t.providers[provider as keyof typeof t.providers] || {}) as ProviderConfig;
  const extra =
    provider === 'wecom'
      ? `<div class="note warning">
          <strong>${escapeHtml(t.providers.wecom.extraTitle)}</strong><br>
          ${escapeHtml(t.providers.wecom.extraText)}<br>
          1. ${escapeHtml(t.providers.wecom.extraOption1)}<br>
          2. ${escapeHtml(t.providers.wecom.extraOption2)}
        </div>`
      : '';

  return `<section class="provider-section" id="provider-${provider}">
  <h3>${escapeHtml(cfg.name)}</h3>
  <table>
    <tr><th>${escapeHtml(t.table.configItem)}</th><th>${escapeHtml(t.table.value)}</th></tr>
    <tr><td>${escapeHtml(t.providers.issuer)}</td><td><code>${escapeHtml(`${origin}/${provider}/.well-known/openid-configuration`)}</code></td></tr>
    <tr><td>${escapeHtml(t.providers.clientId)}</td><td>${escapeHtml(cfg.clientIdTip)}</td></tr>
    <tr><td>${escapeHtml(t.providers.clientSecret)}</td><td>${escapeHtml(cfg.secretTip)}</td></tr>
    <tr><td>${escapeHtml(t.providers.scopes)}</td><td><code>openid profile email</code></td></tr>
  </table>
  ${extra}
</section>`;
}

function providerSubExample(provider: ProviderName): string {
  switch (provider) {
    case 'dingtalk':
      return 'unionId_xxx';
    case 'wecom':
      return 'userid_xxx / openid_xxx';
    case 'feishu':
    default:
      return 'ou_xxx';
  }
}

function userinfoExample(provider: ProviderName, locale: Locale): string {
  return JSON.stringify(
    {
      sub: providerSubExample(provider),
      name: locale === 'zh' ? '张三' : 'Zhang San',
      email: 'user@example.com',
      picture: 'https://example.com/avatar.png',
    },
    null,
    2,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
