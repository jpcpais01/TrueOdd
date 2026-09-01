import crypto from "node:crypto";

export interface KalshiAuthHeaders {
  "KALSHI-ACCESS-KEY": string;
  "KALSHI-ACCESS-SIGNATURE": string;
  "KALSHI-ACCESS-TIMESTAMP": string;
  [key: string]: string;
}

/**
 * Kalshi signs every authenticated REST request with RSA-PSS over
 * `timestamp_ms + METHOD + path` (path includes the `/trade-api/v2` prefix,
 * excludes the query string). Market/orderbook reads don't strictly require
 * auth, but sending it raises the account's rate-limit tier and is required
 * for the CF Benchmarks (BRTI) passthrough.
 */
export function signKalshiRequest(params: {
  method: string;
  path: string;
  apiKeyId: string;
  privateKeyPem: string;
}): KalshiAuthHeaders {
  const timestamp = Date.now().toString();
  const message = `${timestamp}${params.method.toUpperCase()}${params.path}`;

  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: params.privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return {
    "KALSHI-ACCESS-KEY": params.apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature.toString("base64"),
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
  };
}

export interface KalshiCredentials {
  apiKeyId: string;
  privateKeyPem: string;
}

/** Reads credentials from env. Returns null if unset — REST market data
 * reads work fine without them; only the BRTI (CF Benchmarks) passthrough
 * strictly needs them. */
export function loadKalshiCredentials(): KalshiCredentials | null {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  let privateKeyPem = process.env.KALSHI_PRIVATE_KEY;
  if (!privateKeyPem && process.env.KALSHI_PRIVATE_KEY_BASE64) {
    privateKeyPem = Buffer.from(process.env.KALSHI_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  if (!apiKeyId || !privateKeyPem) return null;
  return { apiKeyId, privateKeyPem: privateKeyPem.replace(/\\n/g, "\n") };
}
