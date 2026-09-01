/**
 * 32位二进制按位异或 (XOR) 寻径算法与 IP 拓扑分类引擎
 */

/**
 * 将 IPv4 字符串转换为 32 位无符号整数
 */
export function ipToUint32(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') return null;
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) return null;
  
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0; // 确保为无符号整型
}

/**
 * 判断是否属于私有内网 IP 地址段
 * - 10.0.0.0/8 (10.0.0.0 ~ 10.255.255.255)
 * - 172.16.0.0/12 (172.16.0.0 ~ 172.31.255.255)
 * - 192.168.0.0/16 (192.168.0.0 ~ 192.168.255.255)
 * - 127.0.0.0/8 (本地回环)
 */
export function isPrivateIp(ipStr) {
  const ipNum = ipToUint32(ipStr);
  if (ipNum === null) return false;

  const octet1 = (ipNum >>> 24) & 255;
  const octet2 = (ipNum >>> 16) & 255;

  if (octet1 === 10) return true;
  if (octet1 === 172 && (octet2 >= 16 && octet2 <= 31)) return true;
  if (octet1 === 192 && octet2 === 168) return true;
  if (octet1 === 127) return true;

  return false;
}

/**
 * 分析 URL 的主机并自动识别分类（内网 vs 外网）
 */
export function classifyUrl(urlString) {
  try {
    let cleanUrl = urlString.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    const urlObj = new URL(cleanUrl);
    const host = urlObj.hostname;

    // 检查 host 是否是字面 IPv4
    const ipNum = ipToUint32(host);
    if (ipNum !== null) {
      const isPrivate = isPrivateIp(host);
      return {
        isIntranet: isPrivate,
        ip: host,
        host: host,
        type: isPrivate ? 'intranet' : 'extranet'
      };
    }

    // 检查是否是 .local 或私有域名后缀
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host === 'localhost') {
      return {
        isIntranet: true,
        ip: null,
        host: host,
        type: 'intranet'
      };
    }

    return {
      isIntranet: false,
      ip: null,
      host: host,
      type: 'extranet'
    };
  } catch {
    return {
      isIntranet: false,
      ip: null,
      host: urlString,
      type: 'extranet'
    };
  }
}

/**
 * 核心算法：计算两个 IP 之间的最长公共前缀位数 (Longest Common Prefix)
 * 实现：两个 IP 做按位异或 (XOR)，从最高位开始连续为 0 的位数即为公共前缀位数
 */
export function getCommonPrefixBits(clientIpStr, targetIpStr) {
  const numA = ipToUint32(clientIpStr);
  const numB = ipToUint32(targetIpStr);
  
  if (numA === null || numB === null) return 0;
  
  const xor = (numA ^ numB) >>> 0;
  if (xor === 0) return 32; // 完全一致，32 位满前缀匹配
  
  return Math.clz32(xor); // 获取 32 位整型的前导 0 个数
}

/**
 * 综合智能寻径排序算法
 * @param {Array} endpoints 书签包含的入口列表 [{ url, order, type }]
 * @param {string} clientIp 客户端本机局域网 IP
 * @param {Object} probeResults 探针结果映射 { [url]: { reachable: boolean, latency: number } }
 */
export function sortEndpointsByTopology(endpoints, clientIp = '', probeResults = {}) {
  if (!endpoints || endpoints.length === 0) {
    return { optimal: null, sorted: [], reason: '无配置入口' };
  }

  const enhancedList = endpoints.map((ep, idx) => {
    const classification = classifyUrl(ep.url);
    const probe = probeResults[ep.url] || { reachable: true, latency: null };
    const prefixBits = (classification.ip && clientIp) 
      ? getCommonPrefixBits(clientIp, classification.ip) 
      : 0;

    return {
      ...ep,
      originalIndex: idx,
      isIntranet: classification.isIntranet,
      targetIp: classification.ip,
      host: classification.host,
      reachable: probe.reachable !== false, // 默认信任为可达直至被探针判定不可达
      latency: probe.latency,
      prefixBits
    };
  });

  // 排序权重体系:
  // 1. 可达性 (可达 > 不可达)
  // 2. 网络类型 (内网 > 外网)
  // 3. 最长公共前缀匹配位数 (越大越靠前)
  // 4. 原始录入顺序决胜 (原 index 越小越靠前)
  enhancedList.sort((a, b) => {
    // 1. 可达性
    if (a.reachable !== b.reachable) {
      return a.reachable ? -1 : 1;
    }
    // 2. 内网优先于外网
    if (a.isIntranet !== b.isIntranet) {
      return a.isIntranet ? -1 : 1;
    }
    // 3. 内网之间：最长公共前缀比较
    if (a.isIntranet && b.isIntranet && a.prefixBits !== b.prefixBits) {
      return b.prefixBits - a.prefixBits;
    }
    // 4. 原录入顺序决胜
    return (a.order !== undefined && b.order !== undefined)
      ? (a.order - b.order)
      : (a.originalIndex - b.originalIndex);
  });

  const optimal = enhancedList[0];
  let reason = '默认入口';
  if (optimal) {
    if (!optimal.reachable) {
      reason = '所有地址均不可达 (降级第一项)';
    } else if (optimal.isIntranet && optimal.prefixBits > 0) {
      reason = `内网最佳匹配 (前缀 ${optimal.prefixBits} 位)${optimal.latency ? ' · ' + optimal.latency + 'ms' : ''}`;
    } else if (optimal.isIntranet) {
      reason = `内网私有地址${optimal.latency ? ' · ' + optimal.latency + 'ms' : ''}`;
    } else {
      reason = `外网公网直达${optimal.latency ? ' · ' + optimal.latency + 'ms' : ''}`;
    }
  }

  return {
    optimal,
    sorted: enhancedList,
    reason
  };
}
