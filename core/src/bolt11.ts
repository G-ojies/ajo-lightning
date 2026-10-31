// Encodes a signed BOLT11 invoice for the signet network (lntbs). Used by the embedded test-Lightning mode,
// so the hosted demo shows real invoice strings that any BOLT11 decoder accepts, while no real sats move.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';

// Required feature bits: var_onion_optin (8) and payment_secret (14).
const FEATURES = 2 ** 8 + 2 ** 14;

const num = (n: number, words: number): number[] =>
  Array.from({ length: words }, (_, i) => Math.floor(n / 32 ** (words - 1 - i)) % 32);

function tag(type: number, data: number[]): number[] {
  return [type, ...num(data.length, 2), ...data];
}

function trimmed(n: number): number[] {
  const out: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 32)) out.unshift(v % 32);
  return out.length ? out : [0];
}

function wordsToBytes(words: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil((words.length * 5) / 8));
  words.forEach((w, i) => {
    for (let b = 0; b < 5; b++) {
      const bit = i * 5 + b;
      if ((w >> (4 - b)) & 1) out[bit >> 3] |= 0x80 >> (bit & 7);
    }
  });
  return out;
}

export interface Bolt11Input {
  paymentHash: string;
  amountSats: number;
  description: string;
  nodeSecretKey: Uint8Array;
  timestampSeconds?: number;
  expirySeconds?: number;
}

export function encodeBolt11(i: Bolt11Input): string {
  const hrp = `lntbs${i.amountSats * 10}n`; // 1 sat = 10 nano-bitcoin
  const data = [
    ...num(i.timestampSeconds ?? Math.floor(Date.now() / 1000), 7),
    ...tag(1, bech32.toWords(hexToBytes(i.paymentHash))),
    ...tag(13, bech32.toWords(new TextEncoder().encode(i.description))),
    ...tag(6, trimmed(i.expirySeconds ?? 3600)),
    ...tag(16, bech32.toWords(randomBytes(32))), // payment secret
    ...tag(24, trimmed(18)), // min_final_cltv_expiry_delta
    ...tag(5, trimmed(FEATURES)),
  ];
  const hrpBytes = new TextEncoder().encode(hrp);
  const dataBytes = wordsToBytes(data);
  const msg = new Uint8Array(hrpBytes.length + dataBytes.length);
  msg.set(hrpBytes);
  msg.set(dataBytes, hrpBytes.length);
  // noble returns recovery id + r + s; BOLT11 wants r + s + recovery id.
  const sig = secp256k1.sign(sha256(msg), i.nodeSecretKey, { prehash: false, format: 'recovered' });
  const rsv = new Uint8Array(65);
  rsv.set(sig.slice(1));
  rsv[64] = sig[0];
  return bech32.encode(hrp, [...data, ...bech32.toWords(rsv)], false);
}
