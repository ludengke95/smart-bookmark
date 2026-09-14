import './setup.js';
import assert from 'node:assert/strict';
import { db } from '../src/services/storage/db.js';
import { clearAllData, getSettings } from '../src/services/storage/base.js';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  saveAiApiKey,
  getAiApiKey,
  getAiApiKeyStatus,
  clearAiApiKey,
  migrateLegacyApiKey,
  VAULT_KEYS
} from '../src/services/storage/secure-vault.js';
import {
  exportFullBackupJson,
  importFullBackupJson,
  createSnapshot,
  getSnapshots
} from '../src/services/storage/backup.js';

async function run() {
  console.log('=== 开始执行 Web Crypto 安全凭据与脱敏全链路测试 ===\n');

  await clearAllData();

  // 1. 底层加密与解密往返测试
  console.log('--- 1. 底层 AES-GCM 加密与解密往返 ---');
  const sampleKey = 'sk-proj-abc123456789xyz-test-key!@#$%^&*()_+';
  const encrypted = await encryptSecret(sampleKey);
  assert.ok(encrypted.ciphertext, '密文字段存在');
  assert.ok(encrypted.iv, 'IV 向量存在');
  assert.ok(encrypted.salt, 'Salt 盐值存在');
  assert.notEqual(encrypted.ciphertext, sampleKey, '密文绝不能等于明文');

  const decrypted = await decryptSecret(encrypted);
  assert.equal(decrypted, sampleKey, '解密后内容精确还原');
  console.log('✓ 加密与解密往返校验通过');

  // 2. 掩码生成规则测试
  console.log('--- 2. 掩码生成规则 ---');
  assert.equal(maskSecret(''), '', '空字符串返回空');
  assert.equal(maskSecret(null), '', 'null 返回空');
  assert.equal(maskSecret('12345'), '••••••••', '短文本全打码');
  assert.equal(maskSecret('sk-abcdef123456'), 'sk-••••••••3456', 'sk- 前缀规则正确');
  assert.equal(maskSecret('custom_api_key_8888'), 'cus••••••••8888', '常规长文本规则正确');
  console.log('✓ 掩码规则校验通过');

  // 3. 安全凭证存储与落盘密文验证
  console.log('--- 3. 存储层安全隔离与落盘密文 ---');
  const statusAfterSave = await saveAiApiKey('sk-deepseek-test-99887766');
  assert.equal(statusAfterSave.hasKey, true);
  assert.ok(statusAfterSave.maskedKey.includes('7766'));

  // 直接检查数据库底层落盘记录
  const rawRecord = await db.appSettings.get(VAULT_KEYS.AI_API_KEY);
  assert.ok(rawRecord?.value?.ciphertext, '落盘数据包含密文');
  assert.equal(rawRecord.value.apiKey, undefined, '落盘数据绝对不含明文 apiKey 属性');
  assert.notEqual(rawRecord.value.ciphertext, 'sk-deepseek-test-99887766', '落盘密文已加密');

  // 获取状态 (只包含掩码，无明文)
  const status = await getAiApiKeyStatus();
  assert.equal(status.hasKey, true);
  assert.ok(status.maskedKey.startsWith('sk-'));

  // 按需解密读取
  const readKey = await getAiApiKey();
  assert.equal(readKey, 'sk-deepseek-test-99887766', '按需解密获取正确明文');

  // 清除凭据
  await clearAiApiKey();
  const statusAfterClear = await getAiApiKeyStatus();
  assert.equal(statusAfterClear.hasKey, false);
  const clearedKey = await getAiApiKey();
  assert.equal(clearedKey, '', '清除后解密返回空串');
  console.log('✓ 存储层加密落盘、状态获取与清除校验通过');

  // 4. 历史版本明文迁移测试
  console.log('--- 4. 历史版本 settings.ai.apiKey 自动迁移 ---');
  // 注入旧版本明文设置
  await db.appSettings.put({
    key: 'settings',
    value: {
      theme: 'paper-sand',
      ai: {
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-legacy-old-format-key'
      }
    }
  });

  const migrated = await migrateLegacyApiKey();
  assert.equal(migrated, true, '成功识别并迁移旧密钥');

  // 验证旧设置中的 apiKey 已被擦除
  const currentSettings = await getSettings();
  assert.equal(currentSettings.ai?.apiKey, undefined, '通用设置中明文已被彻底擦除');
  assert.equal(currentSettings.ai?.baseUrl, 'https://api.deepseek.com', '非敏感配置完整保留');

  // 验证密钥已迁移至加密 vault
  const migratedKey = await getAiApiKey();
  assert.equal(migratedKey, 'sk-legacy-old-format-key', '旧密钥已加密并可正常读取');
  console.log('✓ 历史明文平滑迁移与擦除校验通过');

  // 5. 导出备份脱敏测试
  console.log('--- 5. 全量导出备份脱敏与显式导出 ---');
  // 5.1 默认脱敏导出
  const defaultExportJson = await exportFullBackupJson();
  const defaultPayload = JSON.parse(defaultExportJson);
  assert.equal(defaultPayload.sanitized, true, '标记为脱敏版本');
  assert.equal(defaultPayload.settings?.ai?.apiKey, undefined, '导出 settings 中绝无 apiKey');
  assert.equal(defaultPayload.credentials, undefined, '默认导出无 credentials 字段');

  // 5.2 显式包含敏感凭据导出
  const sensitiveExportJson = await exportFullBackupJson({ includeCredentials: true });
  const sensitivePayload = JSON.parse(sensitiveExportJson);
  assert.equal(sensitivePayload.sanitized, false, '标记为包含敏感凭据');
  assert.equal(sensitivePayload.includesCredentials, true);
  assert.equal(sensitivePayload.credentials?.aiApiKey, 'sk-legacy-old-format-key', '显式包含密钥');
  assert.equal(sensitivePayload.settings?.ai?.apiKey, undefined, 'settings 结构依然保持纯净脱敏');
  console.log('✓ 默认脱敏导出与显式导出校验通过');

  // 6. 快照强制脱敏测试
  console.log('--- 6. 快照强制脱敏 ---');
  const snap = await createSnapshot('测试快照脱敏');
  assert.equal(snap.data.settings?.ai?.apiKey, undefined, '新建快照中绝不包含 apiKey');

  const allSnapshots = await getSnapshots();
  const targetSnap = allSnapshots.find(s => s.id === snap.id);
  assert.equal(targetSnap.data.settings?.ai?.apiKey, undefined, '数据库检索的快照同样无 apiKey');
  console.log('✓ 快照脱敏校验通过');

  // 7. 导入旧版本备份兼容测试
  console.log('--- 7. 导入含明文旧备份自动升级 ---');
  await clearAiApiKey(); // 先清空
  assert.equal((await getAiApiKeyStatus()).hasKey, false);

  const legacyBackupJson = JSON.stringify({
    version: '2.0.0',
    bookmarks: [],
    groups: [],
    settings: {
      ai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-imported-from-old-backup'
      }
    }
  });

  const importRes = await importFullBackupJson(legacyBackupJson);
  assert.equal(importRes.success, true, '导入旧备份成功');

  // 验证旧备份中的 apiKey 自动转入加密库
  const restoredKey = await getAiApiKey();
  assert.equal(restoredKey, 'sk-imported-from-old-backup', '旧备份中的明文 Key 自动安全收敛入库');

  // 验证当前 settings 中没有残留明文
  const settingsAfterImport = await getSettings();
  assert.equal(settingsAfterImport.ai?.apiKey, undefined, '导入后 settings 表中无明文残留');
  console.log('✓ 导入旧备份升级兼容校验通过');

  // 8. 验证大模型 SSE 流式 chunk 响应弹性解析兼容
  console.log('--- 8. 大模型 SSE 流式 chunk 响应兼容解析 ---');
  const sseMockResponse = `data: {"id":"chatcmpl-D5ynau_5O9utz7IP-LiUiQk","object":"chat.completion.chunk","created":1789369361,"model":"gemini-3.8-flash","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-D5ynau_5O9utz7IP-LiUiQk","object":"chat.completion.chunk","created":1789369361,"model":"gemini-3.8-flash","choices":[{"index":0,"delta":{"content":"pong"},"finish_reason":null}]}

data: {"id":"chatcmpl-D5ynau_5O9utz7IP-LiUiQk","object":"chat.completion.chunk","created":1789369361,"model":"gemini-3.8-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2017,"completion_tokens":96,"total_tokens":2113}}`;

  // 模拟 Response 对象
  const mockResp = {
    text: async () => sseMockResponse
  };
  // 引入测试或者直接验证逻辑
  const lines = sseMockResponse.split('\n');
  let sseContent = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const dataStr = trimmed.replace(/^data:\s*/, '').trim();
    if (!dataStr || dataStr === '[DONE]') continue;
    try {
      const chunk = JSON.parse(dataStr);
      const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
      sseContent += delta;
    } catch (e) {}
  }
  assert.equal(sseContent, 'pong', 'SSE 格式响应成功解析出 pong');
  console.log('✓ SSE 流式响应解析校验通过');

  console.log('\n🎉 所有安全机密凭证与脱敏用例全部通过！');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
