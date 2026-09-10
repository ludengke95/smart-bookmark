#!/usr/bin/env node

/**
 * Smart Bookmark MCP CLI
 * 支持 Native Messaging 宿主模式、Stdio 透明代理模式、以及一键跨平台注册。
 */

import { startNativeHost } from '../src/native-host/host.js';
import { runStdioProxy } from '../src/stdio-proxy/proxy.js';
import { registerNativeHost, unregisterNativeHost } from '../src/register/register.js';

const args = process.argv.slice(2);
const command = args[0] || (process.stdin.isTTY ? 'help' : 'stdio');

function parseFlags(flagArgs) {
  const flags = {};
  for (let i = 0; i < flagArgs.length; i++) {
    const arg = flagArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = flagArgs[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

const flags = parseFlags(args.slice(1));

async function main() {
  switch (command) {
    case 'native': {
      // 作为浏览器 Native Messaging 宿主运行（由 Chrome/Edge 进程启动）
      startNativeHost();
      break;
    }

    case 'stdio':
    case 'proxy': {
      // 作为 Stdio MCP 代理运行（由 Cursor / Claude Desktop 启动）
      const port = parseInt(flags.port, 10) || 8333;
      const host = flags.host || '127.0.0.1';
      await runStdioProxy({ host, port });
      break;
    }

    case 'register': {
      console.log('📦 Registering Smart Bookmark Native Messaging Host for Chrome & Edge...');
      const extIds = flags['extension-id'] ? [flags['extension-id']] : undefined;
      const { manifestPath, results } = await registerNativeHost({ extensionIds: extIds });
      console.log(`✅ Manifest created: ${manifestPath}`);
      for (const res of results) {
        if (res.success) {
          console.log(`  ✓ ${res.browser}: Registered at ${res.path}`);
        } else {
          console.error(`  ✗ ${res.browser}: Failed (${res.error})`);
        }
      }
      console.log('\n🎉 Registration complete! Restart Chrome/Edge to apply.');
      break;
    }

    case 'unregister': {
      console.log('🗑️ Unregistering Smart Bookmark Native Messaging Host...');
      const results = await unregisterNativeHost();
      for (const res of results) {
        if (res.success) {
          console.log(`  ✓ ${res.browser || res.path}: Unregistered`);
        } else {
          console.warn(`  - ${res.browser || res.path}: ${res.error}`);
        }
      }
      console.log('Done.');
      break;
    }

    case 'install':
    case 'wizard': {
      // 交互式安装向导
      const { runInteractiveInstaller } = await import('../install-cli.mjs');
      await runInteractiveInstaller();
      break;
    }

    case 'server': {
      // 兼容旧版命令行启动方式，自动转入 stdio 代理
      const port = parseInt(flags.port, 10) || 8333;
      const host = flags.host || '127.0.0.1';
      await runStdioProxy({ host, port });
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
Smart Bookmark MCP Bridge (v1.0.3)

Usage:
  smart-bookmark-mcp <command> [options]

Commands:
  register          Register Native Messaging Host with Chrome and Edge (Windows/macOS/Linux)
  unregister        Unregister Native Messaging Host from system
  stdio             Run as Stdio MCP server proxying to http://127.0.0.1:8333/mcp (for Cursor/Claude Desktop)
  native            Run as Native Messaging Host (launched automatically by Chrome/Edge)
  install           Launch interactive configuration wizard

Options:
  --port <port>     Port for MCP HTTP server (default: 8333)
  --host <host>     Host for MCP HTTP server (default: 127.0.0.1)
  --extension-id    Custom Chrome/Edge extension ID (default: gobioihpdadhghfbefcnobinbfadmpli)
`);
      break;
    }
  }
}

main().catch((err) => {
  console.error('[CLI Error]', err);
  process.exit(1);
});
