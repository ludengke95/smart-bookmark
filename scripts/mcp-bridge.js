#!/usr/bin/env node
/**
 * Smart Bookmark MCP (Model Context Protocol) 桥接代理服务
 *
 * 架构：
 * [外部 AI 客户端 (Cursor / Claude Desktop / Windsurf)]
 *        │ Stdio (JSON-RPC)
 * [本脚本 (scripts/mcp-bridge.js) - 零外部依赖 RFC 6455 WebSocket Server]
 *        │ WebSocket (ws://[HOST]:[PORT])
 * [Chrome 插件端 (Smart Bookmark 扩展 Background / UI)]
 */

import http from 'http';
import crypto from 'crypto';
import readline from 'readline';

// 解析命令行参数与环境变量 (支持 --host 127.0.0.1 --port 8333)
const rawArgs = process.argv.slice(2);
let customHost = process.env.HOST || '127.0.0.1';
let customPort = parseInt(process.env.PORT || '8333', 10);

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--host' && rawArgs[i + 1]) {
    customHost = rawArgs[i + 1].trim();
    i++;
  } else if (arg === '--port' && rawArgs[i + 1]) {
    customPort = parseInt(rawArgs[i + 1], 10) || 8333;
    i++;
  } else if (arg.startsWith('--host=')) {
    customHost = arg.split('=')[1].trim();
  } else if (arg.startsWith('--port=')) {
    customPort = parseInt(arg.split('=')[1], 10) || 8333;
  }
}

const HOST = customHost || '127.0.0.1';
const PORT = customPort || 8333;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// 活跃的 Chrome 插件连接集合
const extensionClients = new Set();

/**
 * 将文本编码为 RFC 6455 WebSocket 数据帧 (Server -> Client 不需要掩码)
 */
function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode (0x1)
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * 解析来自 Client -> Server 的 WebSocket 数据帧 (带掩码)
 */
function decodeWebSocketFrames(buffer, onMessage) {
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;

    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    const opcode = byte1 & 0x0f;
    const isMasked = (byte2 & 0x80) !== 0;
    let payloadLength = byte2 & 0x7f;

    let headerSize = 2;
    if (payloadLength === 126) {
      if (buffer.length - offset < 4) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerSize = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) break;
      payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
      headerSize = 10;
    }

    const maskSize = isMasked ? 4 : 0;
    const totalFrameSize = headerSize + maskSize + payloadLength;
    if (buffer.length - offset < totalFrameSize) break;

    let maskKey = null;
    if (isMasked) {
      maskKey = buffer.slice(offset + headerSize, offset + headerSize + 4);
    }

    const payloadOffset = offset + headerSize + maskSize;
    const payload = buffer.slice(payloadOffset, payloadOffset + payloadLength);

    if (isMasked && maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    // opcode 0x1 = text, 0x8 = close, 0x9 = ping, 0xA = pong
    if (opcode === 0x1) {
      onMessage(payload.toString('utf8'));
    } else if (opcode === 0x8) {
      // 客户端主动关闭
      return { offset: buffer.length, closed: true };
    }

    offset += totalFrameSize;
  }

  return { offset, closed: false };
}

/**
 * 启动 HTTP Server 并处理 WebSocket Upgrade 握手
 */
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'smart-bookmark-mcp-bridge',
    status: 'running',
    connectedExtensions: extensionClients.size,
    host: HOST,
    port: PORT
  }));
});

server.on('upgrade', (req, socket, head) => {
  const secKey = req.headers['sec-websocket-key'];
  if (!secKey) {
    socket.destroy();
    return;
  }

  // 计算 Sec-WebSocket-Accept
  const hash = crypto.createHash('sha1').update(secKey + WS_GUID).digest('base64');
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`
  ];

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  // 将连接加入插件客户端集合
  const clientObj = { socket, buffer: Buffer.alloc(0) };
  extensionClients.add(clientObj);
  process.stderr.write(`[MCP Bridge] Chrome 插件已成功接入 WebSocket (当前连接数: ${extensionClients.size})\n`);

  socket.on('data', (chunk) => {
    clientObj.buffer = Buffer.concat([clientObj.buffer, chunk]);
    const { offset, closed } = decodeWebSocketFrames(clientObj.buffer, (textMsg) => {
      handleExtensionMessage(textMsg);
    });

    if (closed) {
      socket.destroy();
      extensionClients.delete(clientObj);
    } else if (offset > 0) {
      clientObj.buffer = clientObj.buffer.slice(offset);
    }
  });

  socket.on('close', () => {
    extensionClients.delete(clientObj);
    process.stderr.write(`[MCP Bridge] Chrome 插件断开连接 (剩余连接数: ${extensionClients.size})\n`);
  });

  socket.on('error', (err) => {
    process.stderr.write(`[MCP Bridge] WebSocket 异常: ${err.message}\n`);
    extensionClients.delete(clientObj);
  });
});

/**
 * 处理来自 Chrome 插件端发回的响应
 */
function handleExtensionMessage(textMsg) {
  try {
    const response = JSON.parse(textMsg);
    // 写入标准输出以供外部 AI 客户端消费
    sendStdioJson(response);
  } catch (e) {
    process.stderr.write(`[MCP Bridge] 转发插件消息失败: ${e.message}\n`);
  }
}

/**
 * 向 Stdio 输出标准 JSON 响应
 */
function sendStdioJson(obj) {
  const line = JSON.stringify(obj) + '\n';
  process.stdout.write(line);
}

/**
 * 监听来自标准输入的 MCP JSON-RPC 请求
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (e) {
    sendStdioJson({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    });
    return;
  }

  handleMcpRequest(request);
});

/**
 * 核心 MCP 请求分发器
 */
function handleMcpRequest(request) {
  const { method, id } = request;

  // 1. 初始化握手
  if (method === 'initialize') {
    sendStdioJson({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'smart-bookmark-mcp-server',
          version: '1.0.0'
        }
      }
    });
    return;
  }

  // 2. 初始化通知 (不需响应)
  if (method === 'notifications/initialized') {
    return;
  }

  // 3. Ping 检测
  if (method === 'ping') {
    sendStdioJson({
      jsonrpc: '2.0',
      id,
      result: {}
    });
    return;
  }

  // 4. 工具查询与执行 (转发至 Chrome 插件端)
  if (method === 'tools/list' || method === 'tools/call') {
    if (extensionClients.size === 0) {
      sendStdioJson({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'Smart Bookmark Chrome 插件未连接。请打开浏览器并保持智能书签新标签页处于开启状态。'
        }
      });
      return;
    }

    const frame = encodeWebSocketFrame(JSON.stringify(request));
    for (const client of extensionClients) {
      try {
        client.socket.write(frame);
      } catch (e) {
        process.stderr.write(`[MCP Bridge] 转发请求至插件失败: ${e.message}\n`);
      }
    }
    return;
  }

  // 默认兜底响应未知方法
  sendStdioJson({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method '${method}' not found`
    }
  });
}

server.listen(PORT, HOST, () => {
  process.stderr.write(`\n🚀 Smart Bookmark MCP 桥接服务已启动!\n`);
  process.stderr.write(`• WebSocket 监听地址: ws://${HOST}:${PORT}\n`);
  process.stderr.write(`• MCP Stdio 协议: 已就绪，等待 Cursor / Claude Desktop 指令...\n\n`);
});
