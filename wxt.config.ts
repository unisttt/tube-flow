import { defineConfig } from 'wxt';

// WXT 設定。manifest の宣言的部分（permissions / commands など）はここに集約する。
// エントリポイント（content / background / popup / options）は entrypoints/ から自動検出される。
export default defineConfig({
  srcDir: '.',
  // 明示 import で統一（暗黙の auto-import は使わない）
  imports: false,
  manifest: {
    name: 'Tube Flow',
    description: 'YouTube のホーム/視聴ページで表示カードを制限し、集中をサポートするツール',
    permissions: ['storage', 'tabs'],
    host_permissions: ['*://www.youtube.com/*'],
    commands: {
      'tube-flow-next': {
        suggested_key: { default: 'Alt+J', mac: 'Alt+J' },
        description: '次のカードへ移動',
      },
      'tube-flow-watch-later': {
        suggested_key: { default: 'Alt+L', mac: 'Alt+L' },
        description: '現在カードを後で見るに追加',
      },
      'tube-flow-not-interested': {
        suggested_key: { default: 'Alt+Shift+I', mac: 'Alt+Shift+I' },
        description: '現在カードを興味なしにする',
      },
    },
  },
});
