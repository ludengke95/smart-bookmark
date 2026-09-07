/**
 * 跨上下文存储变更广播总线 (Cross-Context Sync Bus)
 *
 * 基于原生 BroadcastChannel 弥补 IndexedDB 缺乏系统级 onChange 监听的短板，
 * 实现多个 NewTab 页面、Popup 弹窗与 Service Worker 之间的毫秒级状态同步。
 */

const SYNC_CHANNEL_NAME = 'smart_bookmark_sync_channel';

let channelInstance = null;

function getChannel() {
  if (!channelInstance && typeof BroadcastChannel !== 'undefined') {
    try {
      channelInstance = new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch (e) {
      console.warn('[SyncBus] Failed to initialize BroadcastChannel:', e);
    }
  }
  return channelInstance;
}

/**
 * 广播存储变更事件
 * @param {{ type: string, action?: string, id?: string, data?: any }} event
 */
export function broadcastStorageChange(event) {
  const channel = getChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      ...event,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('[SyncBus] Broadcast error:', err);
  }
}

/**
 * 监听跨上下文存储变更事件
 * @param {(event: { type: string, action?: string, id?: string, data?: any, timestamp: number }) => void} callback
 * @returns {() => void} 移除监听器函数
 */
export function onStorageChange(callback) {
  const channel = getChannel();
  if (!channel) return () => {};

  const handler = (e) => {
    if (e.data && typeof e.data === 'object' && e.data.type) {
      try {
        callback(e.data);
      } catch (err) {
        console.error('[SyncBus] Callback error:', err);
      }
    }
  };

  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
  };
}
