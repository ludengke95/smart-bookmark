#!/usr/bin/env node
// Shim kept for the extension repo. The real, publishable implementation lives in
// packages/smart-bookmark-mcp/mcp-bridge.js. Re-exporting it keeps `npm run mcp`
// and the extension's spawn path working with a single source of truth.
import '../packages/smart-bookmark-mcp/mcp-bridge.js';
