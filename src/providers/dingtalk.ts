import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { type Provider, notImplemented } from './types';

/**
 * 钉钉翻译器（Step 4 完整实现）
 *
 * 闭环：
 * 1. redirectToAuth -> 拼接 https://login.dingtalk.com/oauth2/auth 并重定向
 * 2. handleCallback -> 用 client_secret 换取 unionId / nick
 * 3. signToken      -> jose 签发 RS256 id_token，sub = unionId，aud = 钉钉 App ID
 */
export const dingtalkProvider: Provider = {
  name: 'dingtalk',
  async redirectToAuth(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('dingtalk.redirectToAuth');
  },
  async handleCallback(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('dingtalk.handleCallback');
  },
  async exchangeCode(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('dingtalk.exchangeCode');
  },
};
