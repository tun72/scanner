import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { AccountSession } from '@food-scanner/contracts';

const SESSION_MS = 30 * 24 * 60 * 60_000;
const HASH_PARAMETERS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const EMPTY_SALT = Buffer.alloc(16);
const EMPTY_HASH = Buffer.alloc(32);
const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');

function passwordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, HASH_PARAMETERS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function seedMobileAccount(pool: Pool, { name, rollNumber, password }: { name: string; rollNumber: string; password: string }) {
  const salt = randomBytes(16);
  const passwordHash = await passwordKey(password, salt);
  await pool.query(
    'INSERT INTO mobile_accounts(id,name,roll_number,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(roll_number) DO NOTHING',
    [randomUUID(), name, rollNumber, `${salt.toString('hex')}:${passwordHash.toString('hex')}`],
  );
}

export function createAccounts(pool: Pool) {
  return {
    async login(rollNumber: string, password: string): Promise<AccountSession | null> {
      const { rows: [account] } = await pool.query<{ id: string; name: string; roll_number: string; password_hash: string }>(
        'SELECT id,name,roll_number,password_hash FROM mobile_accounts WHERE roll_number=$1', [rollNumber],
      );
      const [salt, hash] = account?.password_hash.split(':') ?? [];
      const expected = hash ? Buffer.from(hash, 'hex') : EMPTY_HASH;
      const actual = await passwordKey(password, salt ? Buffer.from(salt, 'hex') : EMPTY_SALT);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || !account) return null;

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
      await pool.query('INSERT INTO mobile_sessions(digest,account_id,expires_at) VALUES($1,$2,$3)', [digestToken(token), account.id, expiresAt]);
      return { user: { id: account.id, name: account.name, rollNumber: account.roll_number }, token, expiresAt };
    },
    async authenticate(token: string | undefined): Promise<string | null> {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const { rows: [row] } = await pool.query<{ account_id: string }>(
        'SELECT account_id FROM mobile_sessions WHERE digest=$1 AND expires_at>now()', [digestToken(token)],
      );
      return row?.account_id ?? null;
    },
    async revoke(token: string) {
      await pool.query('DELETE FROM mobile_sessions WHERE digest=$1', [digestToken(token)]);
    },
  };
}
