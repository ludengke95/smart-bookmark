/**
 * MCP Transport that wraps the browser's native `WebSocket` connection from
 * the Chrome extension to the local bridge. The extension runs an MCP server
 * over this transport; the bridge runs an MCP client over the other end.
 *
 * Implements the SDK `Transport` interface:
 *   - start(): Promise<void>            -> bind ws onmessage/onclose
 *   - send(message): Promise<void>      -> ws.send(JSON.stringify(message))
 *   - close(): Promise<void>            -> ws.close()
 *   - onmessage / onclose               -> set by the SDK server
 *
 * Messages are JSON-RPC objects; this transport handles stringify/parse only.
 */
export class BrowserExtensionTransport {
  /**
   * @param {WebSocket} ws A connected browser WebSocket.
   */
  constructor(ws) {
    this.ws = ws;
    this.onmessage = null;
    this.onclose = null;
  }

  async start() {
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (this.onmessage) this.onmessage(message);
      } catch (e) {
        console.error('[MCP Client] Failed to parse bridge message:', e);
      }
    };

    this.ws.onclose = () => {
      if (this.onclose) this.onclose();
    };

    this.ws.onerror = (err) => {
      console.warn('[MCP Client] WebSocket error:', err);
    };
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
