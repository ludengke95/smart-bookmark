/**
 * 安全机密凭据库 (Secure Vault)
 *
 * 基于 Web Crypto API (AES-GCM-256 + PBKDF2) 实现 API Key 等高敏数据的本地落盘加密，
 * 解决通用设置明文暴露、全量备份外泄与历史快照残留问题。
 */
import { db } from './db.js';
import { withStorageLock } from './base.js';
import { broadcastStorageChange } from './sync.js';

export const VAULT_KEYS = {
  AI_API_KEY: 'vault:ai_api_key'
};

const PBKDF2_ITERATIONS = 100000;

function getCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in current environment');
}

/**
 * 跨环境字节数组转 Base64
 */
export function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 跨环境 Base64 转字节数组
 */
export function base64ToBytes(base64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 生成掩码字符串（供 UI 安全展示，不泄露完整明文）
 * 例如: sk-abc12345678 -> sk-••••••••5678
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  if (trimmed.startsWith('sk-') && trimmed.length > 10) {
    const suffix = trimmed.slice(-4);
    return `sk-••••••••${suffix}`;
  }
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/**
 * 派生 AES-GCM 加密主密钥
 */
async function deriveMasterKey(saltBytes) {
  const cryptoObj = getCrypto();
  const extId = (typeof chrome !== 'undefined' && chrome?.runtime?.id) ? chrome.runtime.id : 'smart-bookmark-local';
  const origin = (typeof location !== 'undefined' && location?.origin) ? location.origin : 'smart-bookmark-origin';
  const materialStr = `${extId}::${origin}::smart-bookmark-vault-v1`;

  const enc = new TextEncoder();
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(materialStr),
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
 * 加密明文字符串
 */
export async function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const cryptoObj = getCrypto();
  const enc = new TextEncoder();

  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const key = await deriveMasterKey(salt);

  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    v: 1,
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt)
  };
}

/**
 * 解密密文记录
 */
export async function decryptSecret(record) {
  if (!record || !record.ciphertext || !record.iv || !record.salt) {
    return '';
  }
  try {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.ciphertext);
    const key = await deriveMasterKey(salt);

    const decryptedBuffer = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error('[SecureVault] Decryption failed:', err);
    return '';
  }
}

/**
 * 保存 AI API Key（加密落盘并广播状态，不广播明文）
 */
export async function saveAiApiKey(apiKey) {
  return await withStorageLock(async () => {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      await db.appSettings.delete(VAULT_KEYS.AI_API_KEY);
      broadcastStorageChange({
        type: 'AI_KEY_STATUS_CHANGED',
        data: { hasKey: false, maskedKey: '' }
      });
      return { hasKey: false, maskedKey: '' };
    }

    const encrypted = await encryptSecret(trimmed);
    const masked = maskSecret(trimmed);
    const record = {
      ...encrypted,
      updatedAt: Date.now(),
      masked
    };

    await db.appSettings.put({ key: VAULT_KEYS.AI_API_KEY, value: record });
    broadcastStorageChange({
      type: 'AI_KEY_STATUS_CHANGED',
      data: { hasKey: true, maskedKey: masked }
    });
    return { hasKey: true, maskedKey: masked };
  });
}

/**
 * 获取 AI API Key 状态（掩码与是否存在，安全无明文）
 */
export async function getAiApiKeyStatus() {
  const item = await db.appSettings.get(VAULT_KEYS.AI_API_KEY);
  if (!item?.value?.ciphertext) {
    return { hasKey: false, maskedKey: '', updatedAt: 0 };
  }
  return {
    hasKey: true,
    maskedKey: item.value.masked || '••••••••',
    updatedAt: item.value.updatedAt || 0
  };
}

/**
 * 按需解密读取 AI API Key 明文（仅在请求发起前调用）
 */
export async function getAiApiKey() {
  const item = await db.appSettings.get(VAULT_KEYS.AI_API_KEY);
  if (!item?.value?.ciphertext) {
    return '';
  }
  return await decryptSecret(item.value);
}

/**
 * 清除 AI API Key
 */
export async function clearAiApiKey() {
  return await withStorageLock(async () => {
    await db.appSettings.delete(VAULT_KEYS.AI_API_KEY);
    broadcastStorageChange({
      type: 'AI_KEY_STATUS_CHANGED',
      data: { hasKey: false, maskedKey: '' }
    });
    return { hasKey: false, maskedKey: '' };
  });
}

/**
 * 历史旧版本明文迁移：将 settings.ai.apiKey 迁移至 SecureVault，并从 settings 中彻底擦除
 */
export async function migrateLegacyApiKey() {
  return await withStorageLock(async () => {
    try {
      const settingsRecord = await db.appSettings.get('settings');
      const legacyKey = settingsRecord?.value?.ai?.apiKey;

      if (legacyKey && typeof legacyKey === 'string' && legacyKey.trim()) {
        const existing = await db.appSettings.get(VAULT_KEYS.AI_API_KEY);
        if (!existing?.value?.ciphertext) {
          const encrypted = await encryptSecret(legacyKey.trim());
          await db.appSettings.put({
            key: VAULT_KEYS.AI_API_KEY,
            value: {
              ...encrypted,
              updatedAt: Date.now(),
              masked: maskSecret(legacyKey.trim())
            }
          });
        }

        // 擦除 settings 中的明文 apiKey
        const updatedSettings = { ...settingsRecord.value };
        if (updatedSettings.ai) {
          const cleanAi = { ...updatedSettings.ai };
          delete cleanAi.apiKey;
          updatedSettings.ai = cleanAi;
        }
        await db.appSettings.put({ key: 'settings', value: updatedSettings });
        console.info('[SecureVault] Migrated legacy apiKey to encrypted vault and sanitized settings');
        return true;
      }
    } catch (e) {
      console.warn('[SecureVault] Legacy migration check failed:', e);
    }
    return false;
  });
}
