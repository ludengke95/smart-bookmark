import os from 'node:os';

console.log('====================================================');
console.log('🔍 正在检测本机所有网络适配器 (Node.js os.networkInterfaces)');
console.log('====================================================\n');

const interfaces = os.networkInterfaces();
let totalFound = 0;
let ipv4List = [];

for (const [name, addrs] of Object.entries(interfaces)) {
  console.log(`📡 网卡名称: [${name}]`);
  for (const addr of addrs) {
    if (addr.family === 'IPv4' || addr.family === 4) {
      console.log(`   └─ IPv4: ${addr.address}  (子网掩码: ${addr.netmask}, 内部回环: ${addr.internal})`);
      if (!addr.internal) {
        totalFound++;
        ipv4List.push({ name, ip: addr.address });
      }
    }
  }
}

console.log('\n====================================================');
console.log(`📊 统计: 共检测到 ${totalFound} 个非回环 IPv4 地址:`);
ipv4List.forEach((item, idx) => {
  console.log(`   ${idx + 1}. 网卡: ${item.name.padEnd(25)} -> IP: ${item.ip}`);
});
console.log('====================================================');
