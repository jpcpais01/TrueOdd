import WebSocket from "ws";
import { loadKalshiCredentials, signKalshiRequest } from "./auth";
import type { BrtiTick } from "./brti";

export const KALSHI_WS_URL =
  process.env.KALSHI_WS_URL ?? "wss://api.elections.kalshi.com/trade-api/ws/v2";

const WS_PATH = "/trade-api/ws/v2";

/**
 * Persistent, auto-reconnecting websocket subscription to Kalshi's CF
 * Benchmarks BRTI value feed — genuine server push, not polling.
 *
 * Only viable from a long-running process (the standalone collector).
 * Vercel serverless functions don't reliably support outbound websocket
 * upgrades: an earlier one-shot connection attempt made from inside a
 * serverless invocation never fired `open`, `close`, or `error` at all
 * within an 8s window, which is why the stateless API-route path
 * (src/lib/kalshi/brti.ts's fetchBrtiWindow/fetchBrtiOnce) stays on REST
 * regardless of this module — that's a platform limitation on outbound
 * long-lived connections from short-lived functions, not something this
 * client can work around.
 *
 * The exact push-message envelope isn't verifiable from this build
 * environment (docs.kalshi.com / docs.cfbenchmarks.com unreachable here),
 * so parsing is defensive and mirrors the CONFIRMED REST payload shape
 * (`{ value: "78274.43", time: 1788228411000 }`, value as a numeric
 * string, time as epoch ms) across a few plausible wrapping conventions.
 * If nothing parses, the caller should keep falling back to REST (see
 * scripts/collector.ts) — this module never assumes success.
 */
export interface BrtiStreamOptions {
  onTick: (tick: BrtiTick) => void;
  onOpen?: () => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onError?: (err: Error) => void;
  /** Fires for every raw text frame, parsed or not — useful for debugging
   * a schema mismatch by inspecting what Kalshi actually sent. */
  onRawMessage?: (raw: string) => void;
}

export interface BrtiStreamHandle {
  close: () => void;
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function parseBrtiPushMessage(raw: unknown): BrtiTick | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const type = obj.type;
  if (typeof type === "string" && !/cfbenchmarks|brti|value/i.test(type)) return null;

  const msg = (obj.msg ?? obj.data ?? obj) as Record<string, unknown>;
  if (msg.index_id !== undefined && msg.index_id !== "BRTI" && msg.id !== "BRTI") return null;

  const valueCandidates = [
    msg.value,
    msg.price,
    msg.index_value,
    msg.indexValue,
    (msg.avg_60s_data as Record<string, unknown> | undefined)?.value,
  ];
  let value: number | undefined;
  for (const c of valueCandidates) {
    const n = coerceNumber(c);
    if (n !== undefined && n > 0) {
      value = n;
      break;
    }
  }
  if (value === undefined) return null;

  const tsCandidates: unknown[] = [msg.time, msg.timestamp_ms, msg.timestampMs, msg.ts, msg.timestamp];
  let timestamp: number | undefined;
  for (const c of tsCandidates) {
    if (typeof c === "number") {
      timestamp = c;
      break;
    }
    if (typeof c === "string") {
      const parsed = Date.parse(c);
      if (!Number.isNaN(parsed)) {
        timestamp = parsed;
        break;
      }
    }
  }
  if (timestamp === undefined) timestamp = Date.now();
  if (timestamp < 1e12) timestamp *= 1000; // seconds -> ms

  return { timestamp, value };
}

export function openBrtiStream(opts: BrtiStreamOptions): BrtiStreamHandle {
  const creds = loadKalshiCredentials();
  if (!creds) {
    throw new Error(
      "KALSHI_API_KEY_ID / KALSHI_PRIVATE_KEY must be set — the BRTI websocket requires an authenticated handshake even for public index data.",
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

    // Fires when the HTTP upgrade itself is rejected (401/403 from a bad
    // signature or key) — without this listener that just looks like a
    // generic connection error with no status code attached.
    ws.on("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        opts.onError?.(
          new Error(
            `Kalshi websocket handshake rejected: HTTP ${res.statusCode} ${res.statusMessage ?? ""} ${body.slice(0, 300)}`.trim(),
          ),
        );
      });
    });

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
      const raw = data.toString();
      opts.onRawMessage?.(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const tick = parseBrtiPushMessage(parsed);
      if (tick) {
        opts.onTick(tick);
      } else if (!warnedUnparsed) {
        warnedUnparsed = true;
        console.warn(
          "[brti-ws] received a message that did not match any known BRTI schema; ignoring. First 300 chars:",
          raw.slice(0, 300),
        );
      }
    });

    ws.on("error", (err) => opts.onError?.(err));

    ws.on("close", (code, reasonBuf) => {
      opts.onClose?.({ code, reason: reasonBuf.toString() });
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
