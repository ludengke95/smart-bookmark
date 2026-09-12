import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { Launcher } from 'chrome-launcher';

const ROOT_DIR = process.cwd();
// WXT 开发模式（serve）下的输出目录
const EXT_DIR = resolve(ROOT_DIR, '.output/chrome-mv3-dev');
// 独立 Chrome 调试 Profile 目录（隔离在用户目录，避免跨平台路径与文件锁冲突）
const PROFILE_DIR = join(os.homedir(), '.smart-bookmark-debug-profile');
// 固定开发环境的 Extension ID（与 wxt.config.js 固化的公钥派生一致，全平台恒定）
const EXT_ID = 'gobioihpdadhghfbefcnobinbfadmpli';
const HOME_URL = `chrome-extension://${EXT_ID}/home.html`;
const DEBUG_PORT = parseInt(process.env.REMOTE_DEBUG_PORT || '9222', 10);

/**
 * 校验运行环境（确保支持全局 WebSocket 等必要特性）
 */
function checkEnvironment() {
  if (typeof globalThis.WebSocket === 'undefined') {
    throw new Error(
      `当前 Node.js 版本 (${process.version}) 未提供原生 WebSocket 支持。\n` +
      `请升级至 Node.js >= 22（推荐，符合项目 CONTRIBUTING 规范）或使用 Node 21+。`
    );
  }
}

/**
 * 清理可能残留的历史调试 Chrome 僵尸进程（跨平台兼容：仅匹配当前调试端口的实例，不影响日常浏览器）
 */
function cleanupStaleDebugProcesses(port) {
  try {
    if (process.platform === 'win32') {
      execSync(
        `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe' and CommandLine like '%remote-debugging-port=${port}%'\\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore' }
      );
    } else {
      // macOS / Linux 下通过 pkill 安全清理绑定该端口的调试浏览器进程
      execSync(`pkill -f "chrome.*--remote-debugging-port=${port}" || true`, { stdio: 'ignore' });
      execSync(`pkill -f "msedge.*--remote-debugging-port=${port}" || true`, { stdio: 'ignore' });
    }
  } catch {}
}

/**
 * 跨平台检测调试端口是否仍被非 Chrome 进程占用
 */
function isPortInUse(port) {
  return new Promise((resolveResult) => {
    const server = http.createServer();
    server.once('error', (err) => {
      resolveResult(err.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => resolveResult(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * 跨平台全自动探测本机可用的 Chrome / Chromium / Edge 路径
 * 优先级：环境变量 CHROME_PATH > chrome-launcher 跨平台查找器 > 跨平台常见目录回退
 */
function findBrowserPath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  // 1. 优先使用 chrome-launcher 的标准跨平台发现机制（内置 Windows 注册表、macOS Applications、Linux /usr/bin）
  try {
    const installations = Launcher.getInstallations();
    if (installations && installations.length > 0 && existsSync(installations[0])) {
      return installations[0];
    }
  } catch {}

  // 2. 跨平台兜底候选清单（涵盖 Edge 及各类操作系统特殊路径）
  const platform = process.platform;
  const candidates = [];

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      join(localAppData, 'Google/Chrome/Application/chrome.exe'),
      join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
      join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
      join(programFiles, 'Microsoft/Edge/Application/msedge.exe')
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge-stable',
      '/snap/bin/chromium'
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `未在当前系统 (${platform}) 找到可用的 Chrome / Edge 浏览器可执行文件。\n` +
    `可通过环境变量设置自定义路径，例如: CHROME_PATH=/path/to/chrome npm run dev:debug`
  );
}

/**
 * 初始化独立调试 Profile 配置：确保 Default/Preferences 中开发者模式为开启状态
 */
function prepareProfilePreferences(profilePath) {
  const defaultDir = join(profilePath, 'Default');
  if (!existsSync(defaultDir)) {
    mkdirSync(defaultDir, { recursive: true });
  }

  const prefsFile = join(defaultDir, 'Preferences');
  let prefs = {};

  if (existsSync(prefsFile)) {
    try {
      prefs = JSON.parse(readFileSync(prefsFile, 'utf-8'));
    } catch {
      prefs = {};
    }
  }

  if (!prefs.extensions) prefs.extensions = {};
  if (!prefs.extensions.ui) prefs.extensions.ui = {};
  prefs.extensions.ui.developer_mode = true;

  writeFileSync(prefsFile, JSON.stringify(prefs, null, 2), 'utf-8');
}

/**
 * 轮询等待 CDP 调试端口响应
 */
async function waitForCdpReady(port, maxWaitMs = 15000) {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - start < maxWaitMs) {
    const isReady = await new Promise((resolveResult) => {
      const req = http.get(url, (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          try {
            resolveResult(JSON.parse(rawData));
          } catch {
            resolveResult(null);
          }
        });
      });
      req.on('error', () => resolveResult(null));
      req.setTimeout(500, () => {
        req.destroy();
        resolveResult(null);
      });
    });

    if (isReady) return isReady;
    await new Promise((r) => setTimeout(r, 400));
  }

  return null;
}

/**
 * 简单的 CDP WebSocket 请求封装
 */
function sendCdpCommand(ws, method, params = {}, timeoutMs = 6000) {
  return new Promise((resolveResult, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      reject(new Error(`CDP 命令超时: ${method}`));
    }, timeoutMs);

    function handleMessage(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handleMessage);
          if (msg.error) {
            reject(new Error(msg.error.message || `CDP 调用失败: ${method}`));
          } else {
            resolveResult(msg.result);
          }
        }
      } catch {}
    }

    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * 通过 CDP 载入扩展并导航激活扩展主页
 */
async function loadExtensionViaCdp(browserWsUrl, extPath) {
  const ws = new WebSocket(browserWsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
    setTimeout(rej, 3000);
  });

  try {
    // 1. 调用 Extensions.loadUnpacked 注册加载扩展
    const loadRes = await sendCdpCommand(ws, 'Extensions.loadUnpacked', { path: extPath });
    const loadedId = loadRes?.id || EXT_ID;
    console.log(`\x1b[32m✔ 扩展加载成功！ID: ${loadedId}\x1b[0m`);

    // 2. 获取当前 Targets，将初始的空白页平滑导航至扩展主页
    const targetsRes = await sendCdpCommand(ws, 'Target.getTargets');
    const blankTarget = targetsRes?.targetInfos?.find(
      (t) => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith('chrome://newtab'))
    );

    if (blankTarget) {
      const attachRes = await sendCdpCommand(ws, 'Target.attachToTarget', {
        targetId: blankTarget.targetId,
        flatten: true,
      });
      const sessionId = attachRes?.sessionId;
      if (sessionId) {
        ws.send(
          JSON.stringify({
            id: 999,
            sessionId,
            method: 'Page.navigate',
            params: { url: HOME_URL },
          })
        );
      } else {
        await sendCdpCommand(ws, 'Target.createTarget', { url: HOME_URL });
      }
    } else {
      await sendCdpCommand(ws, 'Target.createTarget', { url: HOME_URL });
    }
  } finally {
    try { ws.close(); } catch {}
  }
}

/**
 * 主入口
 */
async function main() {
  // 1. 环境校验
  checkEnvironment();

  // 2. 跨平台探测浏览器路径
  const browserExecutable = findBrowserPath();
  console.log(`\x1b[36m[dev:debug]\x1b[0m 检测到浏览器: ${browserExecutable}`);
  console.log(`\x1b[36m[dev:debug]\x1b[0m 调试 Profile 目录: ${PROFILE_DIR}`);

  // 3. 清理历史调试进程与检测端口可用性
  cleanupStaleDebugProcesses(DEBUG_PORT);
  if (await isPortInUse(DEBUG_PORT)) {
    throw new Error(
      `调试端口 :${DEBUG_PORT} 正被系统其他程序占用。\n` +
      `请关闭占用端口的程序，或指定新端口重试，例如: REMOTE_DEBUG_PORT=9223 npm run dev:debug`
    );
  }

  // 4. 预置调试 Profile 配置（开发者模式跨平台永久生效）
  prepareProfilePreferences(PROFILE_DIR);

  // 5. 启动 WXT 开发编译器
  console.log(`\x1b[36m[dev:debug]\x1b[0m 启动 WXT 编译器并监听构建...`);
  const wxtBin = resolve(ROOT_DIR, 'node_modules/wxt/bin/wxt.mjs');
  const wxtProcess = spawn(process.execPath, [wxtBin], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      REMOTE_DEBUG: 'true',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  // 6. 监听初次构建就绪
  const buildReadyPromise = new Promise((resolveReady) => {
    let hasResolved = false;
    const checkLog = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (!hasResolved && (text.includes('Built extension') || text.includes('as an unpacked extension manually'))) {
        hasResolved = true;
        resolveReady();
      }
    };

    wxtProcess.stdout.on('data', checkLog);
    wxtProcess.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

    setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        resolveReady();
      }
    }, 15000);
  });

  await buildReadyPromise;
  console.log(`\x1b[32m✔ 扩展初次构建就绪: ${EXT_DIR}\x1b[0m`);

  // 7. 拉起隔离调试窗口
  console.log(`\x1b[36m[dev:debug]\x1b[0m 正在拉起 Chrome 浏览器 (调试端口 :${DEBUG_PORT})...`);
  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];

  const chromeProcess = spawn(browserExecutable, chromeArgs, {
    detached: false,
    stdio: 'ignore',
  });

  // 8. 等待 CDP 就绪
  const cdpInfo = await waitForCdpReady(DEBUG_PORT);
  if (!cdpInfo) {
    throw new Error(`无法连接 Chrome CDP 端口 :${DEBUG_PORT}，请检查启动日志。`);
  }

  // 9. 通过 CDP 载入扩展并直达主页
  console.log(`\x1b[36m[dev:debug]\x1b[0m 正在注入未打包扩展并激活主页...`);
  await loadExtensionViaCdp(cdpInfo.webSocketDebuggerUrl, EXT_DIR);

  // 10. 输出调试链接
  setTimeout(async () => {
    try {
      const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json());
      const uiTarget = targets.find((t) => t.url && t.url.includes(EXT_ID));
      const swTarget = targets.find((t) => t.type === 'service_worker' && t.url.includes(EXT_ID));

      console.log('\n============================================================');
      console.log(`\x1b[32m✔ Smart Bookmark 远程调试环境已完全就绪！\x1b[0m`);
      console.log(`\x1b[34m📡 CDP 根端点:\x1b[0m          http://127.0.0.1:${DEBUG_PORT}`);
      console.log(`\x1b[34m🏠 扩展前台 UI:\x1b[0m         ${HOME_URL}`);
      if (uiTarget?.devtoolsFrontendUrl) {
        console.log(`\x1b[35m🖥️  前台 UI DevTools:\x1b[0m     ${uiTarget.devtoolsFrontendUrl}`);
      }
      if (swTarget?.devtoolsFrontendUrl) {
        console.log(`\x1b[35m⚙️  后台 Service Worker:\x1b[0m   ${swTarget.devtoolsFrontendUrl}`);
      }
      console.log(`\x1b[33m💡 AI 现已可实时监听前后台控制台报错、网络请求与生命周期\x1b[0m`);
      console.log('============================================================\n');
    } catch {}
  }, 1000);

  // 11. 退出时清理联动
  let isCleaning = false;
  const cleanup = () => {
    if (isCleaning) return;
    isCleaning = true;
    console.log('\n\x1b[36m[dev:debug]\x1b[0m 正在退出并清理调试进程...');
    try {
      if (!chromeProcess.killed) chromeProcess.kill();
    } catch {}
    try {
      if (!wxtProcess.killed) wxtProcess.kill();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  chromeProcess.on('exit', () => {
    console.log('\x1b[36m[dev:debug]\x1b[0m Chrome 窗口已关闭');
    cleanup();
  });
  wxtProcess.on('exit', cleanup);
}

main().catch((err) => {
  console.error('\x1b[31m[dev:debug 错误]\x1b[0m', err.message || err);
  process.exit(1);
});
