import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { type Provider, notImplemented } from './types';

/**
 * 企业微信翻译器（Step 4 完整实现）
 *
 * 闭环：
 * 1. redirectToAuth -> 拼接 https://open.weixin.qq.com/connect/oauth2/authorize 并重定向
 * 2. handleCallback -> 用 corp_secret 换取 userid
 * 3. signToken      -> jose 签发 RS256 id_token，sub = userid，aud = 企业微信 corpid
 */
export const wecomProvider: Provider = {
  name: 'wecom',
  async redirectToAuth(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('wecom.redirectToAuth');
  },
  async handleCallback(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('wecom.handleCallback');
  },
  async exchangeCode(_c: Context<AppEnv>): Promise<Response> {
    return notImplemented('wecom.exchangeCode');
  },
};
