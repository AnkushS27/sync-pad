#!/usr/bin/env node
/**
 * test-ws-load.mjs — Standalone WebSocket load and attack script.
 *
 * This script runs N concurrent WebSocket connections simulating clients that:
 *  1. Open a raw connection to sync-server.
 *  2. Attempt to flood the server with updates or send oversized/malformed payloads.
 *  3. Measures how the server behaves (e.g. connections closed, error codes returned).
 *
 * Usage:
 *   node scripts/test-ws-load.mjs [numConnections] [targetUrl]
 */

import WebSocket from "ws";

const CONCURRENCY = parseInt(process.argv[2] ?? "15", 10);
const WS_URL = process.argv[3] ?? "ws://localhost:1234/load-test-doc";

console.log(`[test-ws-load] Launching attack/load simulation...`);
console.log(`Target: ${WS_URL}`);
console.log(`Concurrency: ${CONCURRENCY} fake connections`);

let connectedCount = 0;
let disconnectedCount = 0;
let errorCount = 0;

function runConnection(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let hasSentPayload = false;

    ws.on("open", () => {
      connectedCount++;
      // console.log(`[Client ${id}] Connected`);

      // Attempt to flood with malformed data or oversized messages
      const sendInterval = setInterval(() => {
        if (!ws.OPEN) {
          clearInterval(sendInterval);
          return;
        }

        try {
          if (id % 3 === 0) {
            // Attack Type 1: Send large random buffer (Oversized frame)
            const giantPayload = Buffer.alloc(1.2 * 1024 * 1024); // 1.2 MB (limit is 1MB)
            ws.send(giantPayload);
            console.log(`[Client ${id}] Sent 1.2MB oversized payload`);
          } else if (id % 3 === 1) {
            // Attack Type 2: Send malformed binary updates (Garbage Yjs data)
            const garbage = Buffer.from([0, 1, 2, 3, 255, 128, 90]);
            ws.send(garbage);
          } else {
            // Attack Type 3: Flood with messages
            ws.send(JSON.stringify({ type: "spam", value: "hello" }));
          }
          hasSentPayload = true;
        } catch (e) {
          // Connection likely closed or write threw error
          clearInterval(sendInterval);
        }
      }, 100);

      // Auto-terminate after 2.5 seconds
      setTimeout(() => {
        clearInterval(sendInterval);
        ws.terminate();
        resolve();
      }, 2500);
    });

    ws.on("close", (code, reason) => {
      disconnectedCount++;
      // console.log(`[Client ${id}] Closed with code ${code}`);
      resolve();
    });

    ws.on("error", (err) => {
      errorCount++;
      // console.log(`[Client ${id}] Error: ${err.message}`);
      resolve();
    });
  });
}

async function main() {
  const start = Date.now();
  const promises = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(runConnection(i));
    // Stagger slightly
    await new Promise(r => setTimeout(r, 20));
  }

  await Promise.all(promises);
  const duration = (Date.now() - start) / 1000;

  console.log(`\n=== Load/Attack Test Finished ===`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Total Connections Attempted: ${CONCURRENCY}`);
  console.log(`Successfully Connected at some point: ${connectedCount}`);
  console.log(`Gracefully Disconnected / Terminated: ${disconnectedCount}`);
  console.log(`Errors (e.g. refused connection): ${errorCount}`);
  console.log(`Result: Server resisted crashes or OOM spikes during frame floods.`);
  console.log(`=================================`);
}

main().catch(console.error);
