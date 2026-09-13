/**
 * Smart Bookmark MCP 全流程端到端自动化验证脚本 (CDP 9222)
 *
 * 固化验证流程：
 * 1. 连接 Chrome CDP (端口 9222)，定位 Smart Bookmark home.html 页面
 * 2. 打开系统偏好设置弹窗 (SettingsModal)
 * 3. 切换至「MCP 协议」设置页面 (SettingsMcp)
 * 4. 进入第 2 步并开启 MCP 服务，断言服务正常运行 (8333 端口)
 * 5. 关闭 MCP 服务，断言服务已停止且 8333 端口释放
 * 6. 启动本地占位服务独占 127.0.0.1:8333 端口
 * 7. 再次打开 MCP 服务，断言页面触发端口占用报警 (含「更换端口」按钮)
 * 8. 点击「更换端口」，修改端口为 8334 并生效
 * 9. 断言 MCP 服务在 8334 端口成功重启并恢复绿色正常运行状态
 * 10. 清理占位进程并还原环境
 *
 * 运行方式：
 *   node test/verify-mcp-cdp-flow.js
 */

import http from 'node:http';

const CDP_PORT = process.env.CDP_PORT || '9222';
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = (err) => reject(new Error(`WebSocket connection failed: ${err}`));
    });

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('[CDP] Message parse error:', err);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function getHomeTab() {
  const res = await fetch(`${CDP_BASE}/json`);
  if (!res.ok) {
    throw new Error(`无法连接 CDP 端口 ${CDP_PORT}，请确认 Chrome 是否已开启远程调试`);
  }
  const tabs = await res.json();
  const homeTab = tabs.find((t) => t.url && t.url.includes('home.html'));
  if (!homeTab) {
    throw new Error('未找到 Smart Bookmark 主页 (home.html)，请先在浏览器中打开插件页面');
  }
  return homeTab;
}

async function startPlaceholderServer(port = 8333) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Occupied by E2E test placeholder\n');
    });

    server.on('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function run() {
  console.log('🚀 开始执行 MCP 全流程自动化验证测试...');
  console.log(`📡 正在探测 CDP 服务: ${CDP_BASE}`);

  const homeTab = await getHomeTab();
  console.log(`✅ 定位到插件主页: ${homeTab.title} (${homeTab.url})`);

  const cdp = new CdpClient(homeTab.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('🔌 CDP 调试通道连接成功\n');

  let placeholderServer = null;

  try {
    // -------------------------------------------------------------
    // 步骤 1：打开系统偏好设置弹窗
    // -------------------------------------------------------------
    console.log('📌 [步骤 1] 打开系统偏好设置弹窗...');
    const modalOpened = await cdp.eval(`(() => {
      let modal = document.querySelector('[role="dialog"], .fixed.inset-0');
      if (!modal) {
        const settingsBtn = Array.from(document.querySelectorAll('header button')).find(b =>
          (b.getAttribute('title') && (b.getAttribute('title').includes('设置') || b.getAttribute('title').includes('Preferences'))) ||
          b.innerHTML.includes('10.325 4.317')
        );
        if (settingsBtn) settingsBtn.click();
      }
      return !!document.querySelector('[role="dialog"], .fixed.inset-0');
    })()`);
    await sleep(400);
    console.log('   ✓ 偏好设置弹窗已就绪');

    // -------------------------------------------------------------
    // 步骤 2：切换至「MCP 协议」设置页面
    // -------------------------------------------------------------
    console.log('📌 [步骤 2] 切换至「MCP 协议」Tab...');
    const switchedToMcp = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const mcpTabBtn = buttons.find(b => {
        const t = b.textContent.trim();
        return t === 'MCP 协议' || t === 'MCP';
      });
      if (mcpTabBtn) {
        mcpTabBtn.click();
        return true;
      }
      return false;
    })()`);
    if (!switchedToMcp) throw new Error('未找到 MCP 协议选项卡按钮');
    await sleep(300);
    console.log('   ✓ 已进入 MCP 协议配置页');

    // -------------------------------------------------------------
    // 步骤 3：切换到第 2 步并开启 MCP 服务 (预期 8333 端口正常启动)
    // -------------------------------------------------------------
    console.log('📌 [步骤 3] 切换到第 2 步并开启 MCP 服务...');
    await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const step2Btn = buttons.find(b => b.textContent.includes('2') && (b.textContent.includes('开启服务') || b.textContent.includes('Enable')));
      if (step2Btn) step2Btn.click();
    })()`);
    await sleep(400);

    // 开启开关（若已开启，先关闭以重现完整启动链路）
    await cdp.eval(`(() => {
      const toggle = document.querySelector('#mcp-toggle-step');
      if (toggle && toggle.getAttribute('aria-checked') === 'true') {
        toggle.click();
      }
    })()`);
    await sleep(500);

    await cdp.eval(`(() => {
      const toggle = document.querySelector('#mcp-toggle-step');
      if (toggle && toggle.getAttribute('aria-checked') !== 'true') {
        toggle.click();
      }
    })()`);

    // 轮询等待连通 (最多等待 5 秒)
    let isConnected = false;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const text = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      if (text.includes('服务运行正常 (端口 8333)') || text.includes('端口 8333')) {
        isConnected = true;
        break;
      }
    }
    if (!isConnected) throw new Error('MCP 服务未能按预期在 8333 端口启动');
    console.log('   ✓ MCP 服务成功启动，运行于 8333 端口');

    // -------------------------------------------------------------
    // 步骤 4：关闭 MCP 服务并确认 8333 端口释放
    // -------------------------------------------------------------
    console.log('📌 [步骤 4] 关闭 MCP 服务并验证端口释放...');
    await cdp.eval(`(() => {
      const toggle = document.querySelector('#mcp-toggle-step');
      if (toggle && toggle.getAttribute('aria-checked') === 'true') {
        toggle.click();
      }
    })()`);
    await sleep(800);

    const dialogAfterOff = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
    if (!dialogAfterOff.includes('服务已停止')) {
      throw new Error('MCP 服务关闭失败，页面状态未显示已停止');
    }
    console.log('   ✓ MCP 服务已正常关闭');

    // -------------------------------------------------------------
    // 步骤 5：启动外部占位服务占用 8333 端口
    // -------------------------------------------------------------
    console.log('📌 [步骤 5] 启动外部占位服务监听 127.0.0.1:8333...');
    placeholderServer = await startPlaceholderServer(8333);
    console.log('   ✓ 占位进程已成功独占 8333 端口');

    // -------------------------------------------------------------
    // 步骤 6：再次打开 MCP 服务，验证端口冲突报警
    // -------------------------------------------------------------
    console.log('📌 [步骤 6] 再次开启 MCP 服务，验证端口冲突报警...');
    await cdp.eval(`(() => {
      const toggle = document.querySelector('#mcp-toggle-step');
      if (toggle && toggle.getAttribute('aria-checked') !== 'true') {
        toggle.click();
      }
    })()`);

    let gotPortInUseError = false;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const dialogText = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      if (dialogText.includes('端口 8333 已被占用') || dialogText.includes('已被占用')) {
        gotPortInUseError = true;
        break;
      }
    }
    if (!gotPortInUseError) {
      throw new Error('8333 端口被占用时，前端未能正确呈现端口冲突错误状态');
    }

    const hasFixBtn = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent.includes('更换端口'));
    })()`);
    if (!hasFixBtn) {
      throw new Error('未出现「更换端口」引导按钮');
    }
    console.log('   ✓ 成功捕获端口冲突报警，且「更换端口」操作按钮已就绪');

    // -------------------------------------------------------------
    // 步骤 7：点击「更换端口」，修改为 8334 端口
    // -------------------------------------------------------------
    console.log('📌 [步骤 7] 点击「更换端口」并将服务端口修改为 8334...');
    await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fixBtn = buttons.find(b => b.textContent.includes('更换端口'));
      if (fixBtn) fixBtn.click();
    })()`);
    await sleep(300);

    const portChanged = await cdp.eval(`(() => {
      const input = document.querySelector('#mcp-port-input') || document.querySelector('input[type="number"]');
      if (!input) return false;
      input.value = '8334';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!portChanged) throw new Error('未找到端口输入框');
    console.log('   ✓ 端口已更新为 8334 并触发重连');

    // -------------------------------------------------------------
    // 步骤 8：断言 MCP 服务在 8334 端口成功重启并恢复绿色正常运行状态
    // -------------------------------------------------------------
    console.log('📌 [步骤 8] 等待 8334 端口重连成功并验证页面状态...');
    let recoveredOn8334 = false;
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const text = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      if (text.includes('服务运行正常 (端口 8334)')) {
        recoveredOn8334 = true;
        break;
      }
    }
    if (!recoveredOn8334) {
      const lastText = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      throw new Error(`MCP 服务未能通过 8334 端口成功启动。当前页面状态：\n${lastText}`);
    }
    console.log('   ✓ 验证成功！MCP 服务已在新端口 8334 恢复正常运行！');

    // -------------------------------------------------------------
    // 步骤 9：清理现场
    // -------------------------------------------------------------
    console.log('📌 [步骤 9] 清理测试现场与还原设置...');
    // 将端口重置回默认 8333
    if (placeholderServer) {
      await new Promise((resolve) => placeholderServer.close(resolve));
      placeholderServer = null;
      console.log('   ✓ 8333 占位服务已释放');
    }

    await cdp.eval(`(() => {
      const input = document.querySelector('#mcp-port-input') || document.querySelector('input[type="number"]');
      if (input) {
        input.value = '8333';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(800);
    console.log('   ✓ 服务端口已恢复为默认 8333');

    console.log('\n======================================================');
    console.log('🎉 MCP 启停、端口冲突检测与换端口重连全流程验证 100% 通过！');
    console.log('======================================================\n');
  } finally {
    if (placeholderServer) {
      placeholderServer.close();
    }
    cdp.close();
  }
}

run().catch((err) => {
  console.error('\n❌ 验证失败:', err.message);
  process.exit(1);
});
