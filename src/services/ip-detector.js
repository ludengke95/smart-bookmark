/**
 * WebRTC 本机局域网 IP 自动探测器
 */
import { isPrivateIp } from './xor-matcher.js';

export async function detectLocalIp(timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === 'undefined') {
      resolve('');
      return;
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve('');
      }
    }, timeoutMs);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('');

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate || !event.candidate.candidate) {
          return;
        }

        const cand = event.candidate.candidate;
        const ipMatch = cand.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
        if (ipMatch && ipMatch[1]) {
          const foundIp = ipMatch[1];
          if (isPrivateIp(foundIp)) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              pc.close();
              resolve(foundIp);
            }
          }
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve('');
          }
        });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve('');
      }
    }
  });
}
