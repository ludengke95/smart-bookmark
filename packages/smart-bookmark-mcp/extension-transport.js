/**
 * MCP Transport that wraps a single `ws` WebSocket connection to a Chrome
 * extension. The extension runs an MCP server; this bridge runs an MCP client
 * over this transport.
 *
 * Implements the SDK `Transport` interface:
 *   - start(): Promise<void>            -> bind ws message/close listeners
 *   - send(message): Promise<void>      -> ws.send(JSON.stringify(message))
 *   - close(): Promise<void>            -> ws.close()
 *   - onmessage / onclose               -> set by the SDK client
 *
 * Messages are JSON-RPC objects; this transport is responsible only for the
 * wire framing (stringify on send, parse on receive).
 */
export class ExtensionClientTransport {
  /**
   * @param {import('ws').WebSocket} wsConnection A connected `ws` socket.
   */
  constructor(wsConnection) {
    this.ws = wsConnection;
    this.onmessage = null;
    this.onclose = null;
  }

  async start() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (this.onmessage) this.onmessage(message);
      } catch (e) {
        process.stderr.write(`[MCP Bridge] Failed to parse extension message: ${e.message}\n`);
      }
    });

    this.ws.on('close', () => {
      if (this.onclose) this.onclose();
    });

    this.ws.on('error', (err) => {
      process.stderr.write(`[MCP Bridge] Extension WS error: ${err.message}\n`);
    });
  }

  async send(message) {
    this.ws.send(JSON.stringify(message));
  }

  async close() {
    try {
      this.ws.close();
    } catch {
      // ignore close errors
    }
  }
}
