// JSON storage and locks. With KV_REST_API_URL set it uses Upstash Redis over REST (hosted demo);
// otherwise files under .data and an in-process queue (local development).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const PREFIX = 'ajo:';
const TTL_SECONDS = 120 * 86_400;
const LOCK_MS = 20_000;
const DIR = process.env.AJO_DATA_DIR ?? path.join(process.cwd(), '.data');
const file = (key: string) => path.join(DIR, `${key.replace(/[^a-z0-9-]/gi, '_')}.json`);

async function redis<T>(...cmd: Array<string | number>): Promise<T> {
  const res = await fetch(URL_!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Storage error: ${body.error ?? res.status}`);
  return body.result as T;
}

export async function getJson<T>(key: string): Promise<T | null> {
  if (URL_) {
    const raw = await redis<string | null>('GET', PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }
  try {
    return JSON.parse(await readFile(file(key), 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  if (URL_) {
    await redis('SET', PREFIX + key, raw, 'EX', TTL_SECONDS);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(key)}.tmp`;
  await writeFile(tmp, raw);
  await rename(tmp, file(key));
}

/** Count an event in today's UTC bucket and return the new total. */
export async function countToday(name: string): Promise<number> {
  if (!URL_) return 0;
  const key = `${PREFIX}count:${name}:${new Date().toISOString().slice(0, 10)}`;
  const n = await redis<number>('INCR', key);
  if (n === 1) await redis('EXPIRE', key, 172_800);
  return n;
}

const queues = new Map<string, Promise<unknown>>();

async function redisLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${PREFIX}lock:${key}`;
  const token = randomUUID();
  const giveUpAt = Date.now() + LOCK_MS;
  while ((await redis<string | null>('SET', lock, token, 'NX', 'PX', LOCK_MS)) !== 'OK') {
    if (Date.now() > giveUpAt) throw new Error('Busy, please try again');
    await new Promise(r => setTimeout(r, 75));
  }
  try {
    return await fn();
  } finally {
    // Only release our own lock, in case it expired and someone else took it.
    await redis('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, lock, token);
  }
}

/** One writer at a time for a key, so two payments settling together cannot overwrite each other. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (URL_) return redisLock(key, fn);
  const next = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  queues.set(key, next.catch(() => undefined));
  return next;
}
