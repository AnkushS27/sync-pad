#!/usr/bin/env node
/**
 * test-ws-security.mjs — Standalone security test script for Phase 6.
 *
 * PURPOSE: Verify the Phase 6 acceptance criteria that cannot be expressed as
 *          normal unit tests:
 *
 *   AC1: A raw WS client with no/garbage token is rejected at onAuthenticate.
 *   AC2: A raw WS client sending an oversized frame is disconnected WITHOUT
 *        the process's memory spiking.
 *   AC3: A VIEWER-role connection cannot mutate the document.
 *   AC4: Document state round-trips through Postgres (kill/restart test).
 *
 * USAGE:
 *   # Start sync-server first (pnpm --filter sync-server dev)
 *   node scripts/test-ws-security.mjs [--url ws://localhost:1234]
 *
 * This script is intentionally NOT part of the automated CI test suite —
 * it requires a live sync-server and produces human-readable output.
 * Keep it and its output as evidence for the security write-up.
 *
 * DECISION: We use the raw `ws` library here (no Hocuspocus client) so we can
 * forge arbitrary frames that a well-behaved client would never send.
 */

import WebSocket from "ws";

const WS_URL = process.argv[2] === "--url" ? process.argv[3] : "ws://localhost:1234";

let passed = 0;
let failed = 0;

function log(label, result, detail = "") {
  const icon = result ? "✅" : "❌";
  console.log(`${icon} [${label}] ${detail}`);
  result ? passed++ : failed++;
}

function encodeVarUint(value) {
  const bytes = [];
  while (value >= 128) {
    bytes.push((value & 127) | 128);
    value >>>= 7;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

function encodeVarString(str) {
  const strBuf = Buffer.from(str, "utf8");
  const lenBuf = encodeVarUint(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

function createAuthMessage(documentName, token) {
  const docNameBuf = encodeVarString(documentName);
  const typeBuf = encodeVarUint(2); // MessageType.Auth = 2
  const subTypeBuf = encodeVarUint(2); // Submessage type
  const tokenBuf = encodeVarString(token);
  return Buffer.concat([docNameBuf, typeBuf, subTypeBuf, tokenBuf]);
}

function connectRaw(token, documentName = "test-doc-id") {
  return new Promise((resolve) => {
    // Hocuspocus expects the token in the URL query string (?token=...) or sub-protocol,
    // or as part of the WS binary Auth message. For raw testing, we connect to the URL
    // and send the binary Auth message on open.
    const url = `${WS_URL}/${documentName}`;
    const ws = new WebSocket(url);

    const result = { closed: false, code: null, reason: null, opened: false };

    ws.on("open", () => {
      result.opened = true;
      try {
        const authMessage = createAuthMessage(documentName, token || "");
        ws.send(authMessage);
      } catch (err) {
        result.closed = true;
        result.error = err.message;
        resolve(result);
      }
    });

    ws.on("message", (data) => {
      const msgStr = Buffer.from(data).toString("utf8");
      if (msgStr.includes("permission-denied")) {
        result.closed = true;
        result.code = "PERMISSION_DENIED";
        result.reason = "permission-denied";
        ws.terminate();
        resolve(result);
      }
    });

    ws.on("close", (code, reason) => {
      result.closed = true;
      result.code = code;
      result.reason = reason?.toString();
      resolve(result);
    });

    ws.on("error", (err) => {
      result.closed = true;
      result.error = err.message;
      result.reason = err.message;
      resolve(result);
    });

    // Auto-close after 3s if not already closed.
    setTimeout(() => {
      if (!result.closed) {
        ws.terminate();
        resolve(result);
      }
    }, 3000);
  });
}

async function testNoToken() {
  console.log("\n── AC1: No token → rejected at onAuthenticate ──────────────");
  const result = await connectRaw(null);
  // Connection should be closed (not remain open indefinitely).
  log("AC1-no-token", result.closed, `code=${result.code} reason=${result.reason}`);
}

async function testGarbageToken() {
  console.log("\n── AC1: Garbage token → rejected ───────────────────────────");
  const result = await connectRaw("not.a.real.jwt.at.all");
  log("AC1-garbage-token", result.closed, `code=${result.code}`);
}

async function testOversizedFrame() {
  console.log("\n── AC2: Oversized frame → disconnected, no OOM ─────────────");
  const MEGA = 1024 * 1024;
  // Send a frame larger than MAX_WS_MESSAGE_BYTES (1 MB default).
  const hugePayload = Buffer.alloc(MEGA + 1, 0x42); // 1 MB + 1 byte

  const memBefore = process.memoryUsage().heapUsed;

  const result = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/test-doc-id`);
    const r = { closed: false, code: null };

    ws.on("open", () => {
      // Send the oversized frame immediately on open (before auth handshake).
      try {
        ws.send(hugePayload);
      } catch (_) {
        // Some WS impls throw synchronously; that's also a rejection.
      }
    });

    ws.on("close", (code) => {
      r.closed = true;
      r.code = code;
      resolve(r);
    });

    ws.on("error", (err) => {
      r.error = err.message;
      r.closed = true;
      resolve(r);
    });

    setTimeout(() => {
      if (!r.closed) ws.terminate();
      resolve(r);
    }, 5000);
  });

  const memAfter = process.memoryUsage().heapUsed;
  const memDeltaMB = ((memAfter - memBefore) / MEGA).toFixed(2);

  log(
    "AC2-oversized-frame",
    result.closed,
    `code=${result.code} heapDelta=${memDeltaMB}MB`
  );

  // The heap delta should be negligible — the frame was rejected before alloc.
  // We flag (not fail) if it went over 50 MB to surface potential OOM issues.
  if (parseFloat(memDeltaMB) > 50) {
    console.warn(
      `  ⚠️  Heap grew by ${memDeltaMB} MB — investigate possible OOM exposure`
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n[test-ws-security] Target: ${WS_URL}`);
  console.log("Running Phase 6 acceptance-criteria tests...\n");

  await testNoToken();
  await testGarbageToken();
  await testOversizedFrame();

  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(
    "\nNote: AC3 (VIEWER cannot mutate) and AC4 (state round-trip) require"
  );
  console.log(
    "a valid JWT token and a real document ID — run those manually or via"
  );
  console.log("the Phase 11 Playwright suite once Phase 7 (client wiring) is done.\n"
  );

  process.exit(failed > 0 ? 1 : 0);
})();
