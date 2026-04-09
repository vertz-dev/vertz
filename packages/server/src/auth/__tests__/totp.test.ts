import { describe, expect, it } from '@vertz/test';
import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpCode,
} from '../totp';

describe('base32 encoding', () => {
  it('base32Encode + base32Decode round-trips', () => {
    const original = crypto.getRandomValues(new Uint8Array(20));
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it('base32Decode handles padding correctly', () => {
    // "f" = base32 "MY" (with padding "MY======")
    const input = new Uint8Array([102]); // 'f'
    const encoded = base32Encode(input);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(input);
  });
});

describe('TOTP generation', () => {
  it('generateTotpSecret produces 32-char base32 string (20 bytes)', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32); // 20 bytes = 32 base32 chars
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generateTotpCode produces 6-digit string', async () => {
    const secret = generateTotpSecret();
    const code = await generateTotpCode(secret);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('generateTotpCode is deterministic for same secret+timestamp', async () => {
    const secret = generateTotpSecret();
    const timestamp = 1700000000000;
    const code1 = await generateTotpCode(secret, timestamp);
    const code2 = await generateTotpCode(secret, timestamp);
    expect(code1).toBe(code2);
  });

  it('generateTotpCode changes every 30 seconds', async () => {
    const secret = generateTotpSecret();
    const t1 = 1700000000000;
    const t2 = t1 + 30_000; // 30 seconds later
    const code1 = await generateTotpCode(secret, t1);
    const code2 = await generateTotpCode(secret, t2);
    expect(code1).not.toBe(code2);
  });
});

describe('TOTP verification', () => {
  it('verifyTotpCode accepts current code', async () => {
    const secret = generateTotpSecret();
    const timestamp = 1700000000000;
    const code = await generateTotpCode(secret, timestamp);
    expect(await verifyTotpCode(secret, code, timestamp)).toBe(true);
  });

  it('verifyTotpCode accepts code from ±1 time step (drift tolerance)', async () => {
    const secret = generateTotpSecret();
    const timestamp = 1700000000000;
    // Generate code for previous time step
    const prevCode = await generateTotpCode(secret, timestamp - 30_000);
    // Generate code for next time step
    const nextCode = await generateTotpCode(secret, timestamp + 30_000);
    expect(await verifyTotpCode(secret, prevCode, timestamp, 1)).toBe(true);
    expect(await verifyTotpCode(secret, nextCode, timestamp, 1)).toBe(true);
  });

  it('verifyTotpCode rejects code from ±2 time steps', async () => {
    const secret = generateTotpSecret();
    const timestamp = 1700000000000;
    const farCode = await generateTotpCode(secret, timestamp + 60_000);
    expect(await verifyTotpCode(secret, farCode, timestamp, 1)).toBe(false);
  });

  it('verifyTotpCode rejects wrong code', async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotpCode(secret, '000000', 1700000000000)).toBe(false);
  });
});

describe('TOTP URI', () => {
  it('generateTotpUri produces valid otpauth:// URI', () => {
    const uri = generateTotpUri('JBSWY3DPEHPK3PXP', 'user@example.com', 'Vertz');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('generateTotpUri encodes issuer and email correctly', () => {
    const uri = generateTotpUri('SECRET', 'user@example.com', 'My App');
    expect(uri).toContain('otpauth://totp/My%20App:user%40example.com');
    expect(uri).toContain('issuer=My+App');
  });
});

describe('backup codes', () => {
  it('generateBackupCodes produces 10 codes by default', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
  });

  it('generateBackupCodes produces 8-char alphanumeric codes', () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect(/^[a-z0-9]+$/.test(code)).toBe(true);
    }
  });

  it('generateBackupCodes produces unique codes', () => {
    const codes = generateBackupCodes();
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('hashBackupCode + verifyBackupCode round-trips correctly', async () => {
    const code = 'abc12345';
    const hash = await hashBackupCode(code);
    expect(await verifyBackupCode(code, hash)).toBe(true);
  });

  it('verifyBackupCode rejects wrong code', async () => {
    const hash = await hashBackupCode('abc12345');
    expect(await verifyBackupCode('wrong123', hash)).toBe(false);
  });
});
