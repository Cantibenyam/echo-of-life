// The graveyard: a Neon Function that keeps the names and ages of finished lives.
//
//   GET  /graves?env=release&before=<id>   newest first, 60 at a time, plus the total count
//   POST /graves?env=release               { lifeId, name, age, born, ended }
//
// The name rules (and the filter for unkind names) are the same module the page uses, but this is
// the authority: nothing is stored that it refuses. Deployed with scripts/backend/deploy-graveyard.mjs.
import { createHash } from 'node:crypto';
import { checkName } from '../../src/shared/names';

const DATABASE_URL = process.env.DATABASE_URL!;
const SQL_ENDPOINT = `https://${new URL(DATABASE_URL).hostname}/sql`;

/** Neon's SQL-over-HTTPS endpoint: one parameterised statement, rows back as objects. */
async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(SQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Neon-Connection-String': DATABASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: text, params }),
  });
  if (!res.ok) throw new Error(`sql ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { rows: T[] }).rows;
}
const SALT = process.env.GRAVE_SALT ?? 'echo-of-life';
const ORIGINS = ['https://cantibenyam.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:4174'];
const PAGE = 60;
const HOURLY_LIMIT = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = 'release' | 'preview' | 'dev';
const envOf = (url: URL): Env => {
  const e = url.searchParams.get('env');
  return e === 'release' || e === 'dev' ? e : 'preview';
};

function headers(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0]!,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

const json = (body: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: h });

async function list(url: URL, h: Record<string, string>): Promise<Response> {
  const env = envOf(url);
  const before = Number(url.searchParams.get('before'));
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER;
  const rows = await query<{ id: string; name: string; age: number; ended: string }>(
    `select id, name, age, (extract(epoch from ended_at) * 1000)::bigint as ended
       from graves where env = $1 and not hidden and id < $2 order by id desc limit $3`,
    [env, cursor, PAGE],
  );
  const [{ total }] = await query<{ total: number }>('select count(*)::int as total from graves where env = $1 and not hidden', [env]);
  const graves = rows.map((r) => ({ id: Number(r.id), name: r.name, age: r.age, ended: Math.round(Number(r.ended)) }));
  const next = graves.length === PAGE ? graves[graves.length - 1]!.id : null;
  return json({ graves, total, next }, 200, { ...h, 'Cache-Control': 'public, max-age=20' });
}

async function add(req: Request, url: URL, h: Record<string, string>): Promise<Response> {
  const env = envOf(url);
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 2000) return json({ error: 'too large' }, 413, h);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad json' }, 400, h);
  }
  const { lifeId, name, age, born, ended } = body;
  if (typeof lifeId !== 'string' || !UUID.test(lifeId)) return json({ error: 'bad life' }, 400, h);
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 0 || age > 122) return json({ error: 'bad age' }, 400, h);
  const check = checkName(typeof name === 'string' ? name : '');
  if (!check.ok) return json({ error: 'name', problem: check.problem }, 422, h);
  const now = Date.now();
  const endedAt = typeof ended === 'number' && ended > 1.6e12 && ended <= now + 300_000 ? ended : now;
  const bornAt = typeof born === 'number' && born > 1.6e12 && born <= endedAt ? born : null;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  const ipHash = createHash('sha256').update(`${SALT}:${ip}`).digest('hex').slice(0, 32);
  const [{ recent }] = await query<{ recent: number }>(
    "select count(*)::int as recent from graves where ip_hash = $1 and created_at > now() - interval '1 hour'",
    [ipHash],
  );
  if (recent >= HOURLY_LIMIT) return json({ error: 'slow down' }, 429, h);

  await query(
    `insert into graves (life_id, env, name, age, born_at, ended_at, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (env, life_id) do nothing`,
    [lifeId, env, check.name, age, bornAt === null ? null : new Date(bornAt).toISOString(), new Date(endedAt).toISOString(), ipHash],
  );
  return json({ ok: true }, 201, h);
}

export default {
  async fetch(req: Request): Promise<Response> {
    const h = headers(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/graves' && req.method === 'GET') return await list(url, h);
      if (url.pathname === '/graves' && req.method === 'POST') return await add(req, url, h);
      return json({ error: 'not found' }, 404, h);
    } catch (err) {
      console.error(err);
      return json({ error: 'unavailable' }, 503, h);
    }
  },
};
