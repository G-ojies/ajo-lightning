import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { encodeBolt11 } from './bolt11';

const key = new Uint8Array(32).fill(7);
const hash = 'ab'.repeat(32);

describe('encodeBolt11', () => {
  it('uses the signet prefix and the amount in nano-bitcoin', () => {
    const s = encodeBolt11({ paymentHash: hash, amountSats: 5000, description: 'round 1', nodeSecretKey: key });
    expect(s.startsWith('lntbs50000n1')).toBe(true);
  });
  it('has a valid bech32 checksum', () => {
    const s = encodeBolt11({ paymentHash: hash, amountSats: 1, description: 'x', nodeSecretKey: key }) as `${string}1${string}`;
    expect(bech32.decode(s, false).prefix).toBe('lntbs10n');
  });
  it('changes when the payment hash changes', () => {
    const base = { amountSats: 1, description: 'x', nodeSecretKey: key, timestampSeconds: 1 };
    expect(encodeBolt11({ ...base, paymentHash: hash })).not.toBe(encodeBolt11({ ...base, paymentHash: 'cd'.repeat(32) }));
  });
});
