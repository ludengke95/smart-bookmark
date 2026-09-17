/**
 * 云同步与端到端加密服务 (Cloud Sync & E2EE)
 *
 * 支持 WebDAV 与 GitHub Gist 双协议，无中心化后端，
 * 可选原生 Web Crypto (PBKDF2 + AES-GCM-256) 端到端加密。
 */
import { db } from './db.js';
import { withStorageLock } from './base.js';
import { broadcastStorageChange } from './sync.js';
import { serviceError } from '../errors.js';
import { exportFullBackupJson, importFullBackupJson, createSnapshot } from './backup.js';
import {
  bytesToBase64,
  base64ToBytes,
  saveCloudCredentials,
  getCloudCredentials,
  clearCloudCredentials
} from './secure-vault.js';

export { saveCloudCredentials, getCloudCredentials, clearCloudCredentials };

export const CLOUD_SYNC_STORAGE_KEY = 'cloud_sync_settings';
export const BACKUP_FILENAME = 'smart-bookmark-backup.json';

export const DEFAULT_CLOUD_SYNC_SETTINGS = {
  provider: 'none', // 'none' | 'webdav' | 'gist'
  autoUploadOnBackup: true,
  useE2EE: false,
  webdav: {
    url: '', // WebDAV 目标目录 URL
    username: ''
  },
  gist: {
    gistId: ''
  },
  lastSyncTime: 0,
  lastRemoteHash: '',
  lastError: ''
};

const PBKDF2_ITERATIONS = 100000;

// 内存态 E2EE 主密码驻留缓存（浏览器会话级，重启后重置为空）
let sessionMasterPassword = null;

export function setSessionMasterPassword(password) {
  sessionMasterPassword = password ? String(password).trim() : null;
}

export function getSessionMasterPassword() {
  return sessionMasterPassword;
}

export function clearSessionMasterPassword() {
  sessionMasterPassword = null;
}

export function isE2EEUnlocked() {
  return Boolean(sessionMasterPassword);
}

function getCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in current environment');
}

/**
 * 从主密码派生 AES-GCM-256 密钥
 */
export async function deriveKeyFromPassphrase(passphrase, saltBytes) {
  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 使用主密码将明文 JSON 字符串加密为信封结构
 */
export async function encryptCloudPayload(plaintext, passphrase) {
  if (!passphrase) {
    throw serviceError('e2eeLocked', 'Master password is required for encryption');
  }
  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  const ciphertextBuf = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return JSON.stringify({
    v: 1,
    encrypted: true,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuf))
  }, null, 2);
}

/**
 * 判断字符串是否为加密信封
 */
export function isEncryptedEnvelope(content) {
  if (typeof content !== 'string') return false;
  try {
    const parsed = JSON.parse(content);
    return Boolean(parsed?.encrypted && parsed?.ciphertext && parsed?.salt && parsed?.iv);
  } catch {
    return false;
  }
}

/**
 * 使用主密码解密信封结构
 */
export async function decryptCloudPayload(rawText, passphrase) {
  let envelope;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    throw serviceError('invalidPayload', 'Remote backup is not valid JSON');
  }

  // 非加密载荷直接返回
  if (!envelope?.encrypted || !envelope?.ciphertext || !envelope?.salt || !envelope?.iv) {
    return rawText;
  }

  if (!passphrase) {
    throw serviceError('e2eeLocked', 'Master password required to decrypt cloud backup');
  }

  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ct = base64ToBytes(envelope.ciphertext);
    const key = await deriveKeyFromPassphrase(passphrase, salt);

    const decryptedBuf = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ct
    );
    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    throw serviceError('e2eeDecryptFailed', 'Failed to decrypt cloud backup: incorrect password');
  }
}

/**
 * 获取云同步持久化配置
 */
export async function getCloudSyncSettings() {
  const record = await db.appSettings.get(CLOUD_SYNC_STORAGE_KEY);
  return record?.value ? { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...record.value } : DEFAULT_CLOUD_SYNC_SETTINGS;
}

/**
 * 保存云同步配置
 */
export async function saveCloudSyncSettings(partial = {}) {
  return await withStorageLock(async () => {
    const current = await getCloudSyncSettings();
    const updated = {
      ...current,
      ...partial,
      webdav: { ...(current.webdav || {}), ...(partial.webdav || {}) },
      gist: { ...(current.gist || {}), ...(partial.gist || {}) }
    };
    await db.appSettings.put({ key: CLOUD_SYNC_STORAGE_KEY, value: updated });
    broadcastStorageChange({ type: 'CLOUD_SYNC_SETTINGS_CHANGED', data: updated });
    return updated;
  });
}

// -------------------------------------------------------------
// WebDAV 原生客户端（HEAD / GET / PUT，零 XML 解析）
// -------------------------------------------------------------

function normalizeWebDavFileUrl(baseUrl) {
  let url = (baseUrl || '').trim();
  if (!url) return '';
  if (!url.endsWith('/')) {
    url += '/';
  }
  return url + BACKUP_FILENAME;
}

function buildBasicAuthHeader(username, password) {
  const combined = `${username || ''}:${password || ''}`;
  return `Basic ${bytesToBase64(new TextEncoder().encode(combined))}`;
}

export async function getWebDavMeta(webdavConfig, credentials) {
  const fileUrl = normalizeWebDavFileUrl(webdavConfig?.url);
  if (!fileUrl) throw serviceError('invalidUrl', 'WebDAV directory URL is required');

  const headers = {
    'Authorization': buildBasicAuthHeader(webdavConfig.username, credentials?.webdavPassword)
  };

  let res;
  try {
    res = await fetch(fileUrl, { method: 'HEAD', headers });
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to WebDAV server', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'WebDAV credentials invalid');
  }
  if (res.status === 404) {
    return { exists: false, etag: '', lastModified: '' };
  }
  if (!res.ok) {
    throw serviceError('cloudFetchFailed', `WebDAV HEAD request returned ${res.status}`);
  }

  return {
    exists: true,
    etag: res.headers.get('ETag') || '',
    lastModified: res.headers.get('Last-Modified') || ''
  };
}

export async function putWebDavBackup(content, webdavConfig, credentials) {
  const fileUrl = normalizeWebDavFileUrl(webdavConfig?.url);
  if (!fileUrl) throw serviceError('invalidUrl', 'WebDAV directory URL is required');

  const headers = {
    'Authorization': buildBasicAuthHeader(webdavConfig.username, credentials?.webdavPassword),
    'Content-Type': 'application/json; charset=utf-8'
  };

  let res;
  try {
    res = await fetch(fileUrl, { method: 'PUT', headers, body: content });
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to WebDAV server', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'WebDAV credentials invalid');
  }
  if (res.status === 404 || res.status === 409) {
    throw serviceError('cloudDirNotFound', 'Target directory does not exist on WebDAV server');
  }
  if (!res.ok) {
    throw serviceError('cloudUploadFailed', `WebDAV upload failed with status ${res.status}`);
  }

  return {
    etag: res.headers.get('ETag') || '',
    lastModified: res.headers.get('Last-Modified') || ''
  };
}

export async function getWebDavBackup(webdavConfig, credentials) {
  const fileUrl = normalizeWebDavFileUrl(webdavConfig?.url);
  if (!fileUrl) throw serviceError('invalidUrl', 'WebDAV directory URL is required');

  const headers = {
    'Authorization': buildBasicAuthHeader(webdavConfig.username, credentials?.webdavPassword)
  };

  let res;
  try {
    res = await fetch(fileUrl, { method: 'GET', headers });
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to WebDAV server', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'WebDAV credentials invalid');
  }
  if (res.status === 404) {
    throw serviceError('cloudFileNotFound', 'Remote backup file not found on WebDAV');
  }
  if (!res.ok) {
    throw serviceError('cloudFetchFailed', `WebDAV GET failed with status ${res.status}`);
  }

  const text = await res.text();
  return {
    content: text,
    etag: res.headers.get('ETag') || '',
    lastModified: res.headers.get('Last-Modified') || ''
  };
}

// -------------------------------------------------------------
// GitHub Gist 客户端
// -------------------------------------------------------------

function buildGistHeaders(token) {
  return {
    'Authorization': `Bearer ${token || ''}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

export async function getGistMeta(gistConfig, credentials) {
  const token = credentials?.gistToken;
  const gistId = gistConfig?.gistId?.trim();
  if (!token) throw serviceError('cloudTokenRequired', 'GitHub Personal Access Token is required');
  if (!gistId) return { exists: false, etag: '', lastModified: '' };

  let res;
  try {
    res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'GET',
      headers: buildGistHeaders(token)
    });
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to GitHub API', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'GitHub PAT invalid or expired');
  }
  if (res.status === 404) {
    return { exists: false, etag: '', lastModified: '' };
  }
  if (!res.ok) {
    throw serviceError('cloudFetchFailed', `GitHub Gist request failed with status ${res.status}`);
  }

  const data = await res.json();
  const hasFile = Boolean(data.files && data.files[BACKUP_FILENAME]);
  return {
    exists: hasFile,
    etag: res.headers.get('ETag') || '',
    lastModified: data.updated_at || ''
  };
}

export async function putGistBackup(content, gistConfig, credentials) {
  const token = credentials?.gistToken;
  if (!token) throw serviceError('cloudTokenRequired', 'GitHub Personal Access Token is required');

  const gistId = gistConfig?.gistId?.trim();
  let res;
  try {
    if (!gistId) {
      // 首次自动创建私有 Gist
      res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: buildGistHeaders(token),
        body: JSON.stringify({
          description: 'Smart Bookmark Cloud Backup',
          public: false,
          files: {
            [BACKUP_FILENAME]: { content }
          }
        })
      });
    } else {
      // 更新既有 Gist
      res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: buildGistHeaders(token),
        body: JSON.stringify({
          files: {
            [BACKUP_FILENAME]: { content }
          }
        })
      });
    }
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to GitHub API', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'GitHub PAT invalid or expired');
  }
  if (res.status === 404) {
    throw serviceError('cloudFileNotFound', 'Configured Gist ID not found on GitHub');
  }
  if (!res.ok) {
    throw serviceError('cloudUploadFailed', `Gist upload failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    gistId: data.id,
    etag: res.headers.get('ETag') || '',
    lastModified: data.updated_at || ''
  };
}

export async function getGistBackup(gistConfig, credentials) {
  const token = credentials?.gistToken;
  const gistId = gistConfig?.gistId?.trim();
  if (!token) throw serviceError('cloudTokenRequired', 'GitHub Personal Access Token is required');
  if (!gistId) throw serviceError('cloudGistIdRequired', 'Gist ID is required to download backup');

  let res;
  try {
    res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'GET',
      headers: buildGistHeaders(token)
    });
  } catch (err) {
    throw serviceError('cloudNetworkError', 'Failed to connect to GitHub API', {}, err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw serviceError('cloudAuthFailed', 'GitHub PAT invalid or expired');
  }
  if (res.status === 404) {
    throw serviceError('cloudFileNotFound', 'Target Gist not found on GitHub');
  }
  if (!res.ok) {
    throw serviceError('cloudFetchFailed', `Gist fetch failed with status ${res.status}`);
  }

  const data = await res.json();
  const fileObj = data.files?.[BACKUP_FILENAME];
  if (!fileObj) {
    throw serviceError('cloudFileNotFound', `Backup file ${BACKUP_FILENAME} not found in Gist`);
  }

  let content = fileObj.content;
  if (fileObj.truncated && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!rawRes.ok) throw serviceError('cloudFetchFailed', 'Failed to fetch full Gist raw content');
    content = await rawRes.text();
  }

  return {
    content,
    etag: res.headers.get('ETag') || '',
    lastModified: data.updated_at || ''
  };
}

// -------------------------------------------------------------
// 高层编排接口 (Test / Push / Pull / AutoSync)
// -------------------------------------------------------------

/**
 * 测试当前配置的云服务连通性
 */
export async function testCloudConnection() {
  const settings = await getCloudSyncSettings();
  const credentials = await getCloudCredentials();

  if (settings.provider === 'webdav') {
    const meta = await getWebDavMeta(settings.webdav, credentials);
    return { ok: true, fileExists: meta.exists, lastModified: meta.lastModified };
  }

  if (settings.provider === 'gist') {
    const token = credentials?.gistToken;
    if (!token) throw serviceError('cloudTokenRequired', 'GitHub Personal Access Token is required');

    if (settings.gist?.gistId) {
      const meta = await getGistMeta(settings.gist, credentials);
      return { ok: true, fileExists: meta.exists, lastModified: meta.lastModified };
    }
    // 尚未创建 Gist 时，调用 /user 校验 Token 合法性
    let res;
    try {
      res = await fetch('https://api.github.com/user', { headers: buildGistHeaders(token) });
    } catch (err) {
      throw serviceError('cloudNetworkError', 'Failed to connect to GitHub API', {}, err.message);
    }
    if (!res.ok) throw serviceError('cloudAuthFailed', 'GitHub PAT invalid or expired');
    const user = await res.json();
    return { ok: true, fileExists: false, user: user.login };
  }

  throw serviceError('cloudNoProvider', 'No cloud sync provider selected');
}

/**
 * 推送本地最新备份到云端
 * @param {object} [options]
 * @param {boolean} [options.force=false] - 是否跳过版本冲突乐观检查强制覆盖
 */
export async function pushToCloud({ force = false } = {}) {
  const settings = await getCloudSyncSettings();
  const credentials = await getCloudCredentials();

  if (settings.provider === 'none') {
    throw serviceError('cloudNoProvider', 'Cloud sync is not enabled');
  }

  // 1. 冲突防踩踏：检查云端当前状态
  if (!force) {
    let remoteMeta = null;
    try {
      if (settings.provider === 'webdav') {
        remoteMeta = await getWebDavMeta(settings.webdav, credentials);
      } else if (settings.provider === 'gist' && settings.gist?.gistId) {
        remoteMeta = await getGistMeta(settings.gist, credentials);
      }
    } catch {
      // 忽略检查异常（可能文件未创建）
    }

    if (remoteMeta?.exists && (!settings.lastRemoteHash || (remoteMeta.etag && remoteMeta.etag !== settings.lastRemoteHash))) {
      throw serviceError('cloudConflict', 'Remote backup is newer than last synced version', {
        remoteModified: remoteMeta.lastModified
      });
    }
  }

  // 2. 导出脱敏数据
  const rawJson = await exportFullBackupJson({ includeCredentials: false });

  // 3. 处理 E2EE 加密
  let payload = rawJson;
  if (settings.useE2EE) {
    const pass = getSessionMasterPassword();
    if (!pass) {
      throw serviceError('e2eeLocked', 'E2EE master password is required to encrypt cloud backup');
    }
    payload = await encryptCloudPayload(rawJson, pass);
  }

  // 4. 执行上传
  let result;
  if (settings.provider === 'webdav') {
    result = await putWebDavBackup(payload, settings.webdav, credentials);
  } else if (settings.provider === 'gist') {
    result = await putGistBackup(payload, settings.gist, credentials);
  }

  // 5. 更新元数据与同步状态
  const patch = {
    lastSyncTime: Date.now(),
    lastRemoteHash: result.etag || '',
    lastError: ''
  };
  if (settings.provider === 'gist' && result.gistId && result.gistId !== settings.gist?.gistId) {
    patch.gist = { ...(settings.gist || {}), gistId: result.gistId };
  }

  await saveCloudSyncSettings(patch);
  broadcastStorageChange({ type: 'CLOUD_SYNC_STATUS_CHANGED', status: 'idle', lastSyncTime: patch.lastSyncTime });
  return { success: true, ...result };
}

/**
 * 从云端拉取备份并覆盖本地数据
 * @param {object} [options]
 * @param {string} [options.passphrase] - 可选主密码
 */
export async function pullFromCloud({ passphrase = null } = {}) {
  const settings = await getCloudSyncSettings();
  const credentials = await getCloudCredentials();

  if (settings.provider === 'none') {
    throw serviceError('cloudNoProvider', 'Cloud sync is not enabled');
  }

  // 1. 拉取远端内容
  let pullRes;
  if (settings.provider === 'webdav') {
    pullRes = await getWebDavBackup(settings.webdav, credentials);
  } else if (settings.provider === 'gist') {
    pullRes = await getGistBackup(settings.gist, credentials);
  }

  const rawText = pullRes.content;
  const isEncrypted = isEncryptedEnvelope(rawText);

  // 2. 校验与解密
  let jsonString = rawText;
  if (isEncrypted) {
    const pass = passphrase || getSessionMasterPassword();
    if (!pass) {
      throw serviceError('e2eeLocked', 'Remote backup is encrypted. Master password required');
    }
    jsonString = await decryptCloudPayload(rawText, pass);
    // 成功解密后缓存密码至当前 Session
    setSessionMasterPassword(pass);
  }

  // 3. 覆盖本地数据前，强制生成 auto_precloud 本地安全快照
  try {
    await createSnapshot(null, 'auto_precloud');
  } catch (err) {
    console.warn('[CloudSync] Pre-cloud snapshot failed:', err);
  }

  // 4. 导入数据
  const importRes = await importFullBackupJson(jsonString, { skipCloudSync: true });
  if (!importRes.success) {
    throw serviceError('cloudImportFailed', importRes.message || 'Failed to import downloaded backup');
  }

  // 5. 更新同步状态
  const patch = {
    lastSyncTime: Date.now(),
    lastRemoteHash: pullRes.etag || '',
    lastError: ''
  };
  await saveCloudSyncSettings(patch);
  broadcastStorageChange({ type: 'CLOUD_SYNC_STATUS_CHANGED', status: 'idle', lastSyncTime: patch.lastSyncTime });
  return { success: true, count: importRes.count };
}

/**
 * 备份事件触发时的异步自动上传挂钩
 * 严格限制：破坏性前置快照 (auto_pre*) 坚决不上载
 * @param {string} backupType - 'manual' | 'auto_daily' | 'auto_preimport' 等
 */
export async function autoUploadOnBackup(backupType) {
  try {
    const settings = await getCloudSyncSettings();
    if (!settings.autoUploadOnBackup || settings.provider === 'none') {
      return { skipped: true, reason: 'disabled' };
    }

    // 拒绝前置破坏性保护快照上传
    if (backupType && typeof backupType === 'string' && backupType.startsWith('auto_pre')) {
      return { skipped: true, reason: 'pre_action_snapshot' };
    }

    // E2EE 模式若尚未解锁 Session 密码，跳过推送绝不裸传明文
    if (settings.useE2EE && !isE2EEUnlocked()) {
      await saveCloudSyncSettings({ lastError: 'locked_pending' });
      broadcastStorageChange({ type: 'CLOUD_SYNC_STATUS_CHANGED', status: 'locked_pending' });
      return { skipped: true, reason: 'locked_pending' };
    }

    // 尝试推送
    const res = await pushToCloud({ force: false });
    return { success: true, res };
  } catch (err) {
    const errorCode = err?.code || 'upload_failed';
    await saveCloudSyncSettings({ lastError: errorCode });
    broadcastStorageChange({
      type: 'CLOUD_SYNC_STATUS_CHANGED',
      status: errorCode === 'cloudConflict' ? 'conflict' : 'error',
      error: err.message
    });
    return { error: err };
  }
}
