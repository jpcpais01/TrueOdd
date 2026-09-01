import WebSocket from "ws";
import { loadKalshiCredentials, signKalshiRequest } from "./auth";

export const KALSHI_WS_URL = process.env.KALSHI_WS_URL ?? "wss://api.elections.kalshi.com/trade-api/ws/v2";

const WS_PATH = "/trade-api/ws/v2";

export interface BrtiTick {
  timestamp: number; // epoch ms
  value: number;
}

/**
 * The exact CF Benchmarks websocket envelope isn't verifiable from this
 * build environment (docs.kalshi.com / docs.cfbenchmarks.com are not
 * reachable here), so this parses defensively across the field-name
 * variants Kalshi's docs and third-party integration guides describe,
 * preferring the raw instantaneous index value over any pre-averaged one —
 * the settlement-window simulation needs genuine per-second observations,
 * not a smoothed value. If Kalshi's live schema differs, adjust the
 * candidate paths below; a startup warning fires once if nothing matches.
 */
export function parseBrtiMessage(raw: unknown): BrtiTick | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const type = obj.type;
  if (type !== undefined && typeof type === "string" && !/cfbenchmarks|brti|value/i.test(type)) {
    return null;
  }

  const msg = (obj.msg ?? obj.data ?? obj) as Record<string, unknown>;

  if (msg.index_id !== undefined && msg.index_id !== "BRTI") return null;

  const valueCandidates = [
    msg.value,
    msg.price,
    msg.index_value,
    (msg.avg_60s_data as Record<string, unknown> | undefined)?.value,
  ];
  const value = valueCandidates.find((v): v is number => typeof v === "number" && v > 0);
  if (value === undefined) return null;

  const tsCandidates = [msg.timestamp_ms, msg.timestamp, msg.ts, msg.time];
  let timestamp = tsCandidates.find((v): v is number => typeof v === "number");
  if (timestamp === undefined && typeof msg.timestamp === "string") {
    const parsed = Date.parse(msg.timestamp);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }
  // Heuristic: values below ~1e12 are almost certainly seconds, not ms.
  if (timestamp !== undefined && timestamp < 1e12) timestamp *= 1000;
  if (timestamp === undefined) timestamp = Date.now();

  return { timestamp, value };
}

export interface BrtiStreamHandle {
  close: () => void;
}

export interface BrtiStreamOptions {
  onTick: (tick: BrtiTick) => void;
  onError?: (err: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * Opens a persistent, auto-resubscribing connection to Kalshi's CF
 * Benchmarks value feed for BRTI. Intended for the long-running collector
 * worker (not for use inside a short-lived serverless function).
 */
export function openBrtiStream(opts: BrtiStreamOptions): BrtiStreamHandle {
  const creds = loadKalshiCredentials();
  if (!creds) {
    throw new Error(
      "KALSHI_API_KEY_ID / KALSHI_PRIVATE_KEY must be set — the CF Benchmarks websocket requires an authenticated handshake even for public index data.",
    );
  }

  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let reconnectDelayMs = 1000;
  let warnedUnparsed = false;

  const connect = () => {
    const headers = signKalshiRequest({
      method: "GET",
      path: WS_PATH,
      apiKeyId: creds.apiKeyId,
      privateKeyPem: creds.privateKeyPem,
    });

    ws = new WebSocket(KALSHI_WS_URL, { headers });

    ws.on("open", () => {
      reconnectDelayMs = 1000;
      ws?.send(
        JSON.stringify({
          id: 1,
          cmd: "subscribe",
          params: { channels: ["cfbenchmarks_value"], index_ids: ["BRTI"] },
        }),
      );
      opts.onOpen?.();
    });

    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const tick = parseBrtiMessage(parsed);
      if (tick) {
        opts.onTick(tick);
      } else if (!warnedUnparsed) {
        warnedUnparsed = true;
        console.warn(
          "[brti] received a websocket message that did not match any known BRTI schema; ignoring. First 300 chars:",
          data.toString().slice(0, 300),
        );
      }
    });

    ws.on("error", (err) => opts.onError?.(err));

    ws.on("close", () => {
      opts.onClose?.();
      if (closedByCaller) return;
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
    });
  };

  connect();

  return {
    close: () => {
      closedByCaller = true;
      ws?.close();
    },
  };
}

/**
 * One-shot BRTI read: connects, waits for the first valid tick, disconnects.
 * Suitable for a short-lived serverless invocation (e.g. the Vercel
 * `/api/tick` route) that can't hold a persistent socket open.
 */
export function fetchBrtiOnce(timeoutMs = 5000): Promise<BrtiTick> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const handle = openBrtiStream({
      onTick: (tick) => {
        if (settled) return;
        settled = true;
        resolve(tick);
        handle.close();
      },
      onError: (err) => {
        if (settled) return;
        settled = true;
        reject(err);
        handle.close();
      },
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      handle.close();
      reject(new Error("Timed out waiting for a BRTI tick from Kalshi's websocket"));
    }, timeoutMs);
  });
}
