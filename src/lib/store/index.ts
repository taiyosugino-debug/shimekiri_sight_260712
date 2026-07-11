// =============================================================
// Store シングルトン取得（PROJECT_SPEC.md §4）
// DATA_BACKEND=gsheets かつ必須 env が揃っていれば gsheets、それ以外は memory。
// =============================================================

import { Store } from '../types';
import { MemoryStore } from './memory';
import { GSheetsStore } from './gsheets';

let singleton: Store | null = null;
let demo = true;

function hasGsheetsEnv(): boolean {
  return Boolean(
    process.env.GSHEETS_SPREADSHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function createStore(): Store {
  const backend = process.env.DATA_BACKEND || 'memory';

  if (backend === 'gsheets') {
    if (hasGsheetsEnv()) {
      demo = false;
      return new GSheetsStore();
    }
    console.warn(
      '[store] DATA_BACKEND=gsheets が指定されていますが、必須環境変数（GSHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY）が不足しているため memory バックエンドにフォールバックします。',
    );
    demo = true;
    return new MemoryStore();
  }

  demo = true;
  return new MemoryStore();
}

/** Store シングルトンを取得する */
export function getStore(): Store {
  if (!singleton) {
    singleton = createStore();
  }
  return singleton;
}

/** 現在のバックエンドがデモ（memory）かどうか */
export function isDemo(): boolean {
  // シングルトン未生成の場合は生成して backend 判定を確定させる
  getStore();
  return demo;
}
