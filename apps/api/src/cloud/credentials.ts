import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_PARAMETERS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const EMPTY_SALT = Buffer.alloc(16);
const EMPTY_HASH = Buffer.alloc(32);

export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');

function passwordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, HASH_PARAMETERS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await passwordKey(password, salt);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function matchesPassword(password: string, stored: string | undefined) {
  const [salt, hash] = stored?.split(':') ?? [];
  const actual = await passwordKey(password, salt ? Buffer.from(salt, 'hex') : EMPTY_SALT);
  const expected = hash ? Buffer.from(hash, 'hex') : EMPTY_HASH;
  return expected.length === actual.length && timingSafeEqual(expected, actual) && Boolean(stored);
}
