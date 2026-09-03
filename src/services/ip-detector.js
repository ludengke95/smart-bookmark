/**
 * 多网卡与局域网 IP 智能探测器
 * 优先采用 chrome.system.network 获取本机真实多网卡物理/虚拟网络接口，
 * 并以 WebRTC 多 candidate 收集作为跨环境降级兜底。
 */
import { isPrivateIp } from './xor-matcher.js';

/**
 * 过滤并按物理优先级排序 IP 地址
 * 优先级规范：192.168.x.x (家庭/常见办公物理内网) > 10.x.x.x (企业物理/VPN内网) > 172.16-31.x.x (虚拟网卡/Docker)
 */
export function sortIpByPriority(ipList) {
  if (!Array.isArray(ipList)) return [];
  const uniqueIps = Array.from(new Set(ipList.filter(ip => isPrivateIp(ip) && !ip.startsWith('169.254.') && ip !== '127.0.0.1')));

  return uniqueIps.sort((a, b) => {
    const getScore = (ip) => {
      if (ip.startsWith('192.168.')) return 3;
      if (ip.startsWith('10.')) return 2;
      if (ip.startsWith('172.')) return 1;
      return 0;
    };
    return getScore(b) - getScore(a);
  });
}

/**
 * 基于 chrome.system.network API 获取所有网卡信息
 * @returns {Promise<Array<{name: string, address: string, prefixLength: number}>>}
 */
export async function getSystemNetworkInterfaces() {
  if (typeof chrome !== 'undefined' && chrome.system?.network?.getNetworkInterfaces) {
    try {
      return await new Promise((resolve) => {
        chrome.system.network.getNetworkInterfaces((interfaces) => {
          if (chrome.runtime?.lastError || !Array.isArray(interfaces)) {
            resolve([]);
            return;
          }
          resolve(interfaces);
        });
      });
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * WebRTC 多候选 Candidate 探测兜底
 * @param {number} timeoutMs
 * @returns {Promise<string[]>}
 */
export async function detectIpsViaWebRTC(timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === 'undefined') {
      resolve([]);
      return;
    }

    const ipSet = new Set();
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try { pc.close(); } catch {}
      resolve(Array.from(ipSet));
    };

    const timer = setTimeout(finish, timeoutMs);

    let pc;
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('');

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate) {
          finish();
          return;
        }

        const cand = event.candidate.candidate;
        const ipMatch = cand.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
        if (ipMatch && ipMatch[1]) {
          const foundIp = ipMatch[1];
          if (isPrivateIp(foundIp) && !foundIp.startsWith('169.254.') && foundIp !== '127.0.0.1') {
            ipSet.add(foundIp);
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => finish());
    } catch {
      finish();
    }
  });
}

/**
 * 综合探测本机所有有效局域网 IP (支持多网卡)
 * @returns {Promise<{ primaryIp: string, allIps: string[], interfaces: Array<{name: string, address: string, prefixLength: number}> }>}
 */
export async function detectAllLocalIps(timeoutMs = 1200) {
  // 1. 优先尝试系统级 chrome.system.network
  const sysInterfaces = await getSystemNetworkInterfaces();
  let foundIps = [];

  if (sysInterfaces.length > 0) {
    foundIps = sysInterfaces
      .map(item => item.address)
      .filter(addr => addr && typeof addr === 'string' && addr.includes('.') && isPrivateIp(addr) && !addr.startsWith('169.254.') && addr !== '127.0.0.1');
  }

  // 2. 如果系统级未探测到 IP（如普通网页环境或权限异常），降级走 WebRTC 多 Candidate 收集
  if (foundIps.length === 0) {
    foundIps = await detectIpsViaWebRTC(timeoutMs);
  }

  // 3. 排序与优选
  const sortedIps = sortIpByPriority(foundIps);
  const primaryIp = sortedIps[0] || '';

  return {
    primaryIp,
    allIps: sortedIps,
    interfaces: sysInterfaces
  };
}

/**
 * 兼容旧接口的单 IP 探测器
 */
export async function detectLocalIp(timeoutMs = 1200) {
  const { primaryIp } = await detectAllLocalIps(timeoutMs);
  return primaryIp;
}
