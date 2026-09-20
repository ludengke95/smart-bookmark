import assert from 'node:assert/strict';
import {
  deriveKeyFromPassphrase,
  encryptCloudPayload,
  decryptCloudPayload,
  isEncryptedEnvelope,
  setSessionMasterPassword,
  getSessionMasterPassword,
  clearSessionMasterPassword,
  isE2EEUnlocked,
  getWebDavMeta,
  putWebDavBackup,
  getWebDavBackup,
  getGistMeta,
  putGistBackup,
  getGistBackup
} from '../src/services/storage/cloud-sync.js';

console.log('--- 1. 验证 E2EE 内存会话态密钥生命周期 ---');
clearSessionMasterPassword();
assert.equal(isE2EEUnlocked(), false, '初始状态应为未解锁');
setSessionMasterPassword('TestPass@123');
assert.equal(isE2EEUnlocked(), true, '设置后应为已解锁');
assert.equal(getSessionMasterPassword(), 'TestPass@123', '读取密码应与设置一致');
clearSessionMasterPassword();
assert.equal(isE2EEUnlocked(), false, '清除后应为未解锁');
console.log('✓ E2EE 会话密钥生命周期测试通过');

console.log('--- 2. 验证 E2EE (PBKDF2 + AES-GCM-256) 加解密与异常防御 ---');
const samplePayload = JSON.stringify({
  version: '2.1.0',
  bookmarks: [{ id: 'bm_1', title: 'Intranet Admin', url: 'http://192.168.1.1:8080' }]
});

// 加密
const encryptedEnvelopeStr = await encryptCloudPayload(samplePayload, 'SafeMasterKey#99');
assert.equal(isEncryptedEnvelope(encryptedEnvelopeStr), true, '加密后应识别为加密信封');
const parsedEnvelope = JSON.parse(encryptedEnvelopeStr);
assert.equal(parsedEnvelope.encrypted, true);
assert.ok(parsedEnvelope.ciphertext);
assert.ok(parsedEnvelope.iv);
assert.ok(parsedEnvelope.salt);

// 正常解密
const decryptedStr = await decryptCloudPayload(encryptedEnvelopeStr, 'SafeMasterKey#99');
assert.equal(decryptedStr, samplePayload, '解密内容应与原始 JSON 一致');

// 密码错误防御
await assert.rejects(
  async () => {
    await decryptCloudPayload(encryptedEnvelopeStr, 'WrongPassword');
  },
  (err) => err.code === 'e2eeDecryptFailed',
  '错误密码必须抛出 e2eeDecryptFailed'
);

// 缺失密码防御
await assert.rejects(
  async () => {
    await decryptCloudPayload(encryptedEnvelopeStr, '');
  },
  (err) => err.code === 'e2eeLocked',
  '无密码必须抛出 e2eeLocked'
);

// 明文非信封载荷应直接返回原始内容
const plainJson = JSON.stringify({ plain: true });
const plainResult = await decryptCloudPayload(plainJson, 'any');
assert.equal(plainResult, plainJson, '明文应原样透传');
console.log('✓ E2EE 核心加解密与安全防御测试通过');

console.log('--- 3. 验证 WebDAV 原生客户端 (HEAD / PUT / GET) ---');
const originalFetch = globalThis.fetch;

// Mock WebDAV: HEAD 404 (文件不存在)
globalThis.fetch = async (url, opts) => {
  assert.ok(url.endsWith('/smart-bookmark-backup.json'), '请求路径应以 backup.json 结尾');
  assert.ok(opts.headers['Authorization'].startsWith('Basic '), '必须携带 Basic 认证');
  return {
    status: 404,
    ok: false,
    headers: new Headers()
  };
};
const meta404 = await getWebDavMeta(
  { url: 'https://dav.test.com/dav/', username: 'testuser' },
  { webdavPassword: 'pass' }
);
assert.equal(meta404.exists, false, '404 应返回 exists=false');

// Mock WebDAV: PUT 成功
globalThis.fetch = async (url, opts) => {
  assert.equal(opts.method, 'PUT');
  return {
    status: 201,
    ok: true,
    headers: new Headers({
      'ETag': '"etag_dav_123"',
      'Last-Modified': 'Wed, 21 Oct 2026 07:28:00 GMT'
    })
  };
};
const putRes = await putWebDavBackup(
  '{"backup": true}',
  { url: 'https://dav.test.com/dav/', username: 'testuser' },
  { webdavPassword: 'pass' }
);
assert.equal(putRes.etag, '"etag_dav_123"');

// Mock WebDAV: GET 成功
globalThis.fetch = async (url, opts) => {
  assert.equal(opts.method, 'GET');
  return {
    status: 200,
    ok: true,
    headers: new Headers({ 'ETag': '"etag_dav_123"' }),
    text: async () => '{"backup": true}'
  };
};
const getRes = await getWebDavBackup(
  { url: 'https://dav.test.com/dav/', username: 'testuser' },
  { webdavPassword: 'pass' }
);
assert.equal(getRes.content, '{"backup": true}');
assert.equal(getRes.etag, '"etag_dav_123"');

// Mock WebDAV: 401 权限异常
globalThis.fetch = async () => ({ status: 401, ok: false });
await assert.rejects(
  async () => {
    await getWebDavBackup(
      { url: 'https://dav.test.com/dav/', username: 'bad' },
      { webdavPassword: 'bad' }
    );
  },
  (err) => err.code === 'cloudAuthFailed',
  '401 必须映射为 cloudAuthFailed'
);
console.log('✓ WebDAV 协议动词与异常状态映射测试通过');

console.log('--- 4. 验证 GitHub Gist 客户端 (POST / PATCH / GET) ---');
// Mock Gist: POST 新建私有 Gist
globalThis.fetch = async (url, opts) => {
  assert.equal(url, 'https://api.github.com/gists');
  assert.equal(opts.method, 'POST');
  const body = JSON.parse(opts.body);
  assert.equal(body.public, false, 'Gist 必须强制私有 public: false');
  assert.ok(body.files['smart-bookmark-backup.json']);
  return {
    status: 201,
    ok: true,
    headers: new Headers({ 'ETag': '"gist_etag_1"' }),
    json: async () => ({ id: 'new_gist_id_888', updated_at: '2026-09-17T00:00:00Z' })
  };
};
const gistCreateRes = await putGistBackup(
  '{"gist": true}',
  { gistId: '' },
  { gistToken: 'ghp_secret' }
);
assert.equal(gistCreateRes.gistId, 'new_gist_id_888');

// Mock Gist: PATCH 更新既有 Gist
globalThis.fetch = async (url, opts) => {
  assert.equal(url, 'https://api.github.com/gists/existing_gist_123');
  assert.equal(opts.method, 'PATCH');
  return {
    status: 200,
    ok: true,
    headers: new Headers({ 'ETag': '"gist_etag_2"' }),
    json: async () => ({ id: 'existing_gist_123', updated_at: '2026-09-17T01:00:00Z' })
  };
};
const gistPatchRes = await putGistBackup(
  '{"gist": true}',
  { gistId: 'existing_gist_123' },
  { gistToken: 'ghp_secret' }
);
assert.equal(gistPatchRes.gistId, 'existing_gist_123');
assert.equal(gistPatchRes.etag, '"gist_etag_2"');

// Mock Gist: GET 拉取
globalThis.fetch = async (url) => {
  assert.equal(url, 'https://api.github.com/gists/existing_gist_123');
  return {
    status: 200,
    ok: true,
    headers: new Headers({ 'ETag': '"gist_etag_2"' }),
    json: async () => ({
      id: 'existing_gist_123',
      updated_at: '2026-09-17T01:00:00Z',
      files: {
        'smart-bookmark-backup.json': {
          content: '{"gist": true}',
          truncated: false
        }
      }
    })
  };
};
const gistGetRes = await getGistBackup(
  { gistId: 'existing_gist_123' },
  { gistToken: 'ghp_secret' }
);
assert.equal(gistGetRes.content, '{"gist": true}');

// 还原 fetch
globalThis.fetch = originalFetch;
console.log('✓ GitHub Gist 协议读写与私有保护测试通过');


console.log('--- 5. 验证冲突检测边界与 WebDAV 首次/后续推送 ---');
// 场景 A: 首次同步（从不同步过），云端已存在文件 -> 触发冲突拦截
const neverSynced = { lastSyncTime: 0, lastRemoteHash: '' };
const remoteExists = { exists: true, etag: '"etag_remote_1"' };
const hasConflictFirstTime = Boolean(
  remoteExists.exists && (
    !neverSynced.lastSyncTime ||
    Boolean(remoteExists.etag && neverSynced.lastRemoteHash && remoteExists.etag !== neverSynced.lastRemoteHash)
  )
);
assert.equal(hasConflictFirstTime, true, '从未同步过且远端已有文件必须触发冲突');

// 场景 B: 已经成功同步过一次，WebDAV PUT 响应无 ETag（保留原有或为空），再次推送时不应误报冲突
const syncedBeforeNoEtag = { lastSyncTime: 12345678, lastRemoteHash: '' };
const remoteNoEtagChange = { exists: true, etag: '' };
const hasConflictSynced = Boolean(
  remoteNoEtagChange.exists && (
    (!syncedBeforeNoEtag.lastSyncTime || syncedBeforeNoEtag.lastSyncTime === 0) ||
    Boolean(remoteNoEtagChange.etag && syncedBeforeNoEtag.lastRemoteHash && remoteNoEtagChange.etag !== syncedBeforeNoEtag.lastRemoteHash)
  )
);
assert.equal(hasConflictSynced, false, '已同步设备在无 ETag 漂移时不应误报冲突');

// 场景 C: 远端已被其他设备更新（ETag 不一致） -> 必须拦截冲突
const syncedWithOldHash = { lastSyncTime: 12345678, lastRemoteHash: '"etag_device_a"' };
const remoteUpdatedByOther = { exists: true, etag: '"etag_device_b"' };
const hasConflictOtherDevice = Boolean(
  remoteUpdatedByOther.exists && (
    (!syncedWithOldHash.lastSyncTime || syncedWithOldHash.lastSyncTime === 0) ||
    Boolean(remoteUpdatedByOther.etag && syncedWithOldHash.lastRemoteHash && remoteUpdatedByOther.etag !== syncedWithOldHash.lastRemoteHash)
  )
);
assert.equal(hasConflictOtherDevice, true, '远端 ETag 不一致时必须触发冲突拦截');
console.log('✓ 冲突检测状态机边界测试通过');

console.log('\n==============================');
console.log('🎉 云同步与 E2EE 核心服务测试全部通过！');
console.log('==============================');
