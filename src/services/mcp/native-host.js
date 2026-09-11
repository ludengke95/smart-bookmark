/**
 * Smart Bookmark MCP Native Messaging Host Client
 * 运行于 Background Service Worker，通过 chrome.runtime.connectNative 与本地 Node 宿主长连接，
 * 配合 Offscreen Document 保活，实现无前台标签页依赖的静默常驻响应。
 */

import { MCP_TOOL_DEFINITIONS, executeMcpTool } from './tools.js';
import { acquireKeepalive } from './keepalive.js';
import { broadcastStorageChange } from '../storage/sync.js';
import { DEFAULT_MCP_WS_PORT } from '../../constants/index.js';

export const NATIVE_HOST_NAME = 'com.smartbookmark.mcp';

class NativeHostClient {
  constructor() {
    /** @type {chrome.runtime.Port | null} */
    this.port = null;
    this.status = {
      isConnected: false,
      isConnecting: false,
      port: DEFAULT_MCP_WS_PORT,
      allowLan: false,
      lastError: null,
      transport: 'native'
    };
    this.targetOptions = {};
    this.shouldBeConnected = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.releaseKeepalive = null;
    this.listeners = new Set();
  }

  /**
   * 订阅状态变化
   * @param {(status: typeof this.status) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  /**
   * 获取当前快照
   */
  getStatus() {
    return { ...this.status };
  }

  /**
   * 更新并广播状态
   * @param {Partial<typeof this.status>} partial
   */
  updateStatus(partial) {
    this.status = { ...this.status, ...partial };
    if (this.listeners) {
      for (const listener of this.listeners) {
        try {
          listener(this.getStatus());
        } catch (err) {
          console.error('[MCP Native] Listener error:', err);
        }
      }
    }
    broadcastStorageChange({
      type: 'MCP_STATUS_CHANGED',
      data: this.getStatus()
    });
  }

  /**
   * 发起 Native Messaging 连接
   * @param {number} [httpPort=8333]
   * @param {{ allowLan?: boolean, host?: string }} [options={}]
   */
  connect(httpPort = DEFAULT_MCP_WS_PORT, options = {}) {
    this.targetOptions = options;
    if (typeof chrome === 'undefined' || !chrome.runtime?.connectNative) {
      this.updateStatus({
        isConnected: false,
        isConnecting: false,
        lastError: 'Native Messaging is not supported in this environment'
      });
      return;
    }

    if (this.port) {
      return;
    }

    this.shouldBeConnected = true;
    this.updateStatus({ isConnecting: true, port: httpPort, lastError: null });

    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

      // 连接建立成功后获取一次保活锁，维持 SW 活跃
      this.releaseKeepalive = acquireKeepalive('native-host');

      // 监听消息
      this.port.onMessage.addListener((message) => this.handleMessage(message));

      // 监听断开
      this.port.onDisconnect.addListener(() => this.handleDisconnect(httpPort));

      // 发送初始化握手，附带所有工具定义与目标 HTTP 服务端口
      this.port.postMessage({
        type: 'START',
        payload: {
          port: httpPort,
          allowLan: !!options.allowLan,
          host: options.allowLan ? '0.0.0.0' : (options.host || '127.0.0.1'),
          tools: MCP_TOOL_DEFINITIONS
        }
      });
    } catch (err) {
      console.error('[MCP Native] Connect exception:', err);
      this.handleDisconnect(httpPort, err?.message || String(err));
    }
  }

  /**
   * 处理来自 Native Host 的消息
   * @param {any} message
   */
  async handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    const { type, requestId, payload } = message;

    switch (type) {
      case 'SERVER_STARTED': {
        this.reconnectAttempt = 0;
        this.updateStatus({
          isConnected: true,
          isConnecting: false,
          port: payload?.port || this.status.port,
          lastError: null
        });
        break;
      }

      case 'SERVER_STOPPED': {
        this.updateStatus({ isConnected: false });
        break;
      }

      case 'GET_TOOLS':
      case 'LIST_TOOLS': {
        if (requestId && this.port) {
          try {
            this.port.postMessage({
              responseToRequestId: requestId,
              payload: {
                status: 'success',
                data: MCP_TOOL_DEFINITIONS
              }
            });
          } catch (e) {
            console.warn('[MCP Native] Failed to reply tools:', e);
          }
        }
        break;
      }

      case 'CALL_TOOL': {
        const { name, args } = payload || {};
        const releaseToolKeepalive = acquireKeepalive(`mcp-tool-${requestId}`);
        try {
          const result = await executeMcpTool(name, args);
          if (this.port) {
            this.port.postMessage({
              responseToRequestId: requestId,
              payload: {
                status: 'success',
                data: result
              }
            });
          }
        } catch (err) {
          if (this.port) {
            this.port.postMessage({
              responseToRequestId: requestId,
              payload: {
                status: 'error',
                error: err?.message || String(err)
              }
            });
          }
        } finally {
          releaseToolKeepalive();
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * 断开处理与自动重连调度
   * @param {number} port
   * @param {string} [customError]
   */
  handleDisconnect(port, customError) {
    const errorMsg = customError || chrome.runtime?.lastError?.message || null;
    this.port = null;

    if (this.releaseKeepalive) {
      this.releaseKeepalive();
      this.releaseKeepalive = null;
    }

    this.updateStatus({
      isConnected: false,
      isConnecting: false,
      lastError: errorMsg
    });
    if (this.shouldBeConnected) {
      clearTimeout(this.reconnectTimer);
      // 指数退避调度重连（最小 1s，最大 30s，带随机微抖动）
      const delay = Math.min(30_000, 1000 * Math.pow(1.5, this.reconnectAttempt)) + Math.random() * 500;
      this.reconnectAttempt++;
      this.reconnectTimer = setTimeout(() => {
        if (this.shouldBeConnected) {
          this.connect(port, this.targetOptions);
        }
      }, delay);
    }
  }

  /**
   * 用户或系统主动断开
   */
  disconnect() {
    this.shouldBeConnected = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;

    if (this.port) {
      try {
        this.port.postMessage({ type: 'STOP' });
        this.port.disconnect();
      } catch {
        // ignore
      }
      this.port = null;
    }

    if (this.releaseKeepalive) {
      this.releaseKeepalive();
      this.releaseKeepalive = null;
    }

    this.updateStatus({
      isConnected: false,
      isConnecting: false,
      lastError: null
    });
  }
}

export const nativeHostClient = new NativeHostClient();
