#!/usr/bin/env node
/**
 * Smart Bookmark MCP (Model Context Protocol) bridge proxy server
 *
 * Architecture:
 * [External AI client (Cursor / Claude Desktop / Windsurf)]
 *        | Stdio (JSON-RPC)
 * [This script (mcp-bridge.js) - zero-dependency RFC 6455 WebSocket server]
 *        | WebSocket (ws://[HOST]:[PORT])
 * [Chrome extension (Smart Bookmark background / UI)]
 *
 * The script uses only Node.js built-in modules, so it can be installed and run
 * directly via `npx @ludengke95/smart-bookmark-mcp` with no extra dependencies.
 */

import http from 'http';
import crypto from 'crypto';
import readline from 'readline';

// Parse CLI flags and environment variables (supports --host 127.0.0.1 --port 8333)
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

// Active Chrome extension connection set
const extensionClients = new Set();

// Whether the external AI client has completed the MCP `initialized` handshake.
// `tools/list_changed` notifications are only emitted after this, so a client
// that has not finished initializing never receives a stray notification.
let clientInitialized = false;

/**
 * Encode text into an RFC 6455 WebSocket data frame (Server -> Client, unmasked)
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
 * Decode WebSocket data frames coming from the Client -> Server (masked)
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
      // Client initiated close
      return { offset: buffer.length, closed: true };
    }

    offset += totalFrameSize;
  }

  return { offset, closed: false };
}

/**
 * Start the HTTP server and handle WebSocket Upgrade handshakes
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

  // Compute Sec-WebSocket-Accept
  const hash = crypto.createHash('sha1').update(secKey + WS_GUID).digest('base64');
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`
  ];

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  // Register the connection in the extension client set
  const clientObj = { socket, buffer: Buffer.alloc(0) };
  const wasEmpty = extensionClients.size === 0;
  extensionClients.add(clientObj);
  if (wasEmpty) {
    // First extension just connected: tell the client to (re)fetch tools/list
    // so the model discovers the bookmark tools even if the browser opened
    // after the AI client had already started.
    emitToolsListChanged();
  }
  process.stderr.write(`[MCP Bridge] Chrome extension connected via WebSocket (active connections: ${extensionClients.size})\n`);

  socket.on('data', (chunk) => {
    clientObj.buffer = Buffer.concat([clientObj.buffer, chunk]);
    const { offset, closed } = decodeWebSocketFrames(clientObj.buffer, (textMsg) => {
      handleExtensionMessage(textMsg);
    });

    if (closed) {
      socket.destroy();
      removeExtensionClient(clientObj);
    } else if (offset > 0) {
      clientObj.buffer = clientObj.buffer.slice(offset);
    }
  });

  socket.on('close', () => {
    removeExtensionClient(clientObj);
    process.stderr.write(`[MCP Bridge] Chrome extension disconnected (active connections: ${extensionClients.size})\n`);
  });

  socket.on('error', (err) => {
    process.stderr.write(`[MCP Bridge] WebSocket error: ${err.message}\n`);
    removeExtensionClient(clientObj);
  });
});

/**
 * Handle responses sent back from the Chrome extension
 */
function handleExtensionMessage(textMsg) {
  try {
    const response = JSON.parse(textMsg);
    // Write to stdout for the external AI client to consume
    sendStdioJson(response);
  } catch (e) {
    process.stderr.write(`[MCP Bridge] Failed to forward extension message: ${e.message}\n`);
  }
}

/**
 * Write a standard JSON response to Stdio
 */
function sendStdioJson(obj) {
  const line = JSON.stringify(obj) + '\n';
  process.stdout.write(line);
}

/**
 * Notify the external AI client that the available tool set has changed.
 * Emitted only after the client has finished initialization, so a host that
 * has not completed the handshake is never pushed a notification it would drop.
 */
function emitToolsListChanged() {
  if (!clientInitialized) return;
  sendStdioJson({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
}

/**
 * Remove an extension connection. When the last one leaves, tell the client to
 * drop its cached tool list so the model does not call tools with no backing
 * extension. This also covers the case where the browser is closed after the
 * AI client has already cached the tool catalog.
 */
function removeExtensionClient(clientObj) {
  if (!extensionClients.has(clientObj)) return;
  extensionClients.delete(clientObj);
  if (extensionClients.size === 0) {
    emitToolsListChanged();
  }
}

/**
 * Listen for inbound MCP JSON-RPC requests from stdin
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
 * Core MCP request dispatcher
 */
function handleMcpRequest(request) {
  const { method, id } = request;

  // 1. Initialization handshake
  if (method === 'initialize') {
    sendStdioJson({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true }
        },
        serverInfo: {
          name: 'smart-bookmark-mcp-server',
          version: '1.0.0'
        }
      }
    });
    return;
  }

  // 2. Initialized notification (no response required)
  if (method === 'notifications/initialized') {
    clientInitialized = true;
    return;
  }

  // 3. Ping probe
  if (method === 'ping') {
    sendStdioJson({
      jsonrpc: '2.0',
      id,
      result: {}
    });
    return;
  }

  // 4. Tool listing: if the extension is not connected yet, return an empty
  // catalog instead of an error. Many MCP clients treat a failing tools/list
  // as a server-level failure and close the connection. The empty catalog is
  // valid, and the client will be told to refetch via notifications/tools/list_changed
  // as soon as the browser extension connects.
  if (method === 'tools/list') {
    if (extensionClients.size === 0) {
      sendStdioJson({
        jsonrpc: '2.0',
        id,
        result: { tools: [] }
      });
      return;
    }

    const frame = encodeWebSocketFrame(JSON.stringify(request));
    for (const client of extensionClients) {
      try {
        client.socket.write(frame);
      } catch (e) {
        process.stderr.write(`[MCP Bridge] Failed to forward request to extension: ${e.message}\n`);
      }
    }
    return;
  }

  // 5. Tool execution: this actually needs the extension to do work, so an
  // unconnected extension is a real runtime error.
  if (method === 'tools/call') {
    if (extensionClients.size === 0) {
      sendStdioJson({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'Smart Bookmark Chrome extension is not connected. Please open the browser and keep the Smart Bookmark new tab page active.'
        }
      });
      return;
    }

    const frame = encodeWebSocketFrame(JSON.stringify(request));
    for (const client of extensionClients) {
      try {
        client.socket.write(frame);
      } catch (e) {
        process.stderr.write(`[MCP Bridge] Failed to forward request to extension: ${e.message}\n`);
      }
    }
    return;
  }

  // Default fallback for unknown methods
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
  process.stderr.write(`\n🚀 Smart Bookmark MCP bridge server started!\n`);
  process.stderr.write(`• WebSocket listener: ws://${HOST}:${PORT}\n`);
  process.stderr.write(`• MCP Stdio protocol: ready, waiting for Cursor / Claude Desktop commands...\n\n`);
});
