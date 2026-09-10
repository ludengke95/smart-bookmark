/**
 * Smart Bookmark Native Messaging Host
 * 负责通过标准输入输出 (stdin/stdout) 的 4 字节小端 (Little-Endian) 二进制协议与 Chrome/Edge 扩展通信，
 * 并拉起 Fastify/HTTP MCP 服务，充当外部 AI Agent 与浏览器扩展之间的安全桥梁。
 */

import { Buffer } from 'node:buffer';
import { createMcpHttpServer } from './server.js';

let httpServerInstance = null;
let cachedTools = [];
let pendingRequests = new Map();
let currentPort = 8333;

/**
 * 向 Chrome 扩展写入标准 Native Messaging 二进制帧 (4字节小端长度头 + UTF-8 JSON)
 * @param {any} message
 */
export function sendMessageToExtension(message) {
  try {
    const jsonBuf = Buffer.from(JSON.stringify(message), 'utf8');
    const headerBuf = Buffer.alloc(4);
    headerBuf.writeUInt32LE(jsonBuf.length, 0);
    process.stdout.write(Buffer.concat([headerBuf, jsonBuf]));
  } catch (err) {
    console.error('[Host] Failed to send message to extension:', err);
  }
}

/**
 * 向 Chrome 扩展发送异步请求并等待回复
 * @param {string} type
 * @param {any} payload
 * @param {number} [timeoutMs=45000]
 * @returns {Promise<any>}
 */
export function sendRequestToExtension(type, payload = {}, timeoutMs = 45000) {
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Native Messaging request [${type}:${requestId}] timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timer });

    sendMessageToExtension({
      type,
      requestId,
      payload
    });
  });
}

/**
 * 处理来自扩展发来的消息帧
 * @param {any} message
 */
async function handleExtensionMessage(message) {
  if (!message || typeof message !== 'object') return;

  const { type, requestId, responseToRequestId, payload } = message;

  // 如果是对之前发起请求的响应
  if (responseToRequestId && pendingRequests.has(responseToRequestId)) {
    const { resolve, reject, timer } = pendingRequests.get(responseToRequestId);
    clearTimeout(timer);
    pendingRequests.delete(responseToRequestId);

    if (payload?.status === 'error') {
      reject(new Error(payload.error || 'Unknown extension error'));
    } else {
      resolve(payload?.data !== undefined ? payload.data : payload);
    }
    return;
  }

  // 扩展发送的控制指令
  switch (type) {
    case 'START': {
      currentPort = parseInt(payload?.port, 10) || 8333;
      if (Array.isArray(payload?.tools)) {
        cachedTools = payload.tools;
      }

      if (!httpServerInstance) {
        try {
          httpServerInstance = createMcpHttpServer({
            port: currentPort,
            getTools: async () => {
              if (cachedTools.length > 0) return cachedTools;
              try {
                const tools = await sendRequestToExtension('GET_TOOLS', {}, 10000);
                if (Array.isArray(tools)) cachedTools = tools;
                return cachedTools;
              } catch {
                return cachedTools;
              }
            },
            callTool: async (name, args) => {
              return await sendRequestToExtension('CALL_TOOL', { name, args });
            }
          });

          await httpServerInstance.start();
          sendMessageToExtension({
            type: 'SERVER_STARTED',
            payload: { port: currentPort }
          });
        } catch (err) {
          sendMessageToExtension({
            type: 'SERVER_ERROR',
            payload: { error: err?.message || String(err) }
          });
        }
      } else {
        sendMessageToExtension({
          type: 'SERVER_STARTED',
          payload: { port: currentPort }
        });
      }
      break;
    }

    case 'STOP': {
      if (httpServerInstance) {
        await httpServerInstance.stop();
        httpServerInstance = null;
      }
      sendMessageToExtension({ type: 'SERVER_STOPPED' });
      break;
    }

    case 'UPDATE_TOOLS': {
      if (Array.isArray(payload?.tools)) {
        cachedTools = payload.tools;
      }
      break;
    }

    default:
      break;
  }
}

/**
 * 启动 Native Messaging 宿主，监听标准输入流
 */
export function startNativeHost() {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const msgLen = buffer.readUInt32LE(0);
      if (buffer.length < 4 + msgLen) {
        break; // 数据未完全到达，等待下一分块
      }

      const msgBuf = buffer.subarray(4, 4 + msgLen);
      buffer = buffer.subarray(4 + msgLen);

      try {
        const msg = JSON.parse(msgBuf.toString('utf8'));
        handleExtensionMessage(msg);
      } catch (err) {
        console.error('[Host] JSON parse error in frame:', err);
      }
    }
  });

  // 浏览器关闭或 Native Port 销毁时，stdin 会收到 EOF，宿主随之优雅终止
  process.stdin.on('end', async () => {
    if (httpServerInstance) {
      try {
        await httpServerInstance.stop();
      } catch {
        // ignore
      }
    }
    process.exit(0);
  });

  process.stdin.on('error', (err) => {
    console.error('[Host] stdin error:', err);
    process.exit(1);
  });
}
