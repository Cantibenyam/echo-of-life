// The graveyard: a Neon Function that draws every life and keeps the names and ages of finished ones.
//
//   POST /lives?env=release                { lifeId, name }        -> { seal, born }
//   GET  /graves?env=release&before=<id>   newest first, 60 at a time, plus the total count
//   POST /graves?env=release               { lifeId, age, ended }
//
// A life's lifespan is drawn here, at birth, and kept. A grave is laid only for a life drawn here,
// at the age drawn, and only once as much real time has passed as living that long takes; its name
// and age come from this record, never from the request. So no one can lay a grave without living
// the life. The name rules are the same module the page uses, but this is the authority.
// Deployed with scripts/backend/build-graveyard.mjs and the Neon deploy_function tool.
import { createHash } from 'node:crypto';
import { sampleLifespan } from '../../src/life/mortality';
import { sealLifespan } from '../../src/life/record';
import { cryptoUniform } from '../../src/life/rng';
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
const GRAVES_PER_HOUR = 12;
const LIVES_PER_HOUR = 20;
/** The fastest a year can be lived is one press per 3.2 s cooldown; allow a little less. */
const MIN_MS_PER_YEAR = 3000;
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

/** The body as JSON (sent as text/plain, so the page needs no preflight), or null if unreadable. */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 2000) return null;
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function ipHashOf(req: Request): string {
  // The platform's proxy appends the address it saw; anything before it is whatever the client sent.
  const hops = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = hops[hops.length - 1] ?? 'unknown';
  return createHash('sha256').update(`${SALT}:${ip}`).digest('hex').slice(0, 32);
}

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

interface Life {
  name: string;
  lifespan: number;
  born: string;
  now: string;
}

const findLife = async (env: Env, lifeId: string): Promise<Life | undefined> =>
  (
    await query<Life>(
      `select name, lifespan, (extract(epoch from born_at) * 1000)::bigint as born, (extract(epoch from now()) * 1000)::bigint as now
         from lives where env = $1 and life_id = $2`,
      [env, lifeId],
    )
  )[0];

/** A life begins: its lifespan is drawn here, once. Asking again for the same life gives the same answer. */
async function birth(req: Request, url: URL, h: Record<string, string>): Promise<Response> {
  const env = envOf(url);
  const body = await readBody(req);
  if (!body) return json({ error: 'bad json' }, 400, h);
  const { lifeId, name } = body;
  if (typeof lifeId !== 'string' || !UUID.test(lifeId)) return json({ error: 'bad life' }, 400, h);
  const id = lifeId.toLowerCase();

  const known = await findLife(env, id);
  if (known) return json({ seal: sealLifespan(known.lifespan, id), born: Number(known.born) }, 200, h);

  const check = checkName(typeof name === 'string' ? name : '');
  if (!check.ok) return json({ error: 'name', problem: check.problem }, 422, h);
  const ipHash = ipHashOf(req);
  const [{ recent }] = await query<{ recent: number }>(
    "select count(*)::int as recent from lives where ip_hash = $1 and born_at > now() - interval '1 hour'",
    [ipHash],
  );
  if (recent >= LIVES_PER_HOUR) return json({ error: 'slow down' }, 429, h);

  await query(
    `insert into lives (env, life_id, name, lifespan, ip_hash) values ($1, $2, $3, $4, $5) on conflict (env, life_id) do nothing`,
    [env, id, check.name, sampleLifespan(cryptoUniform()), ipHash],
  );
  const life = (await findLife(env, id))!; // the row just written, or one written a moment earlier
  return json({ seal: sealLifespan(life.lifespan, id), born: Number(life.born) }, 201, h);
}

/** A life has ended: its grave, if it was drawn here and lived through. */
async function lay(req: Request, url: URL, h: Record<string, string>): Promise<Response> {
  const env = envOf(url);
  const body = await readBody(req);
  if (!body) return json({ error: 'bad json' }, 400, h);
  const { lifeId, age, ended } = body;
  if (typeof lifeId !== 'string' || !UUID.test(lifeId)) return json({ error: 'bad life' }, 400, h);
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 0 || age > 122) return json({ error: 'bad age' }, 400, h);
  const id = lifeId.toLowerCase();

  const life = await findLife(env, id);
  if (!life) return json({ error: 'unknown life' }, 409, h);
  if (age !== life.lifespan) return json({ error: 'not this life' }, 409, h);
  const born = Number(life.born);
  const now = Number(life.now);
  const earliest = born + life.lifespan * MIN_MS_PER_YEAR;
  if (now < earliest) return json({ error: 'too soon' }, 409, h);

  const ipHash = ipHashOf(req);
  const [{ recent }] = await query<{ recent: number }>(
    "select count(*)::int as recent from graves where ip_hash = $1 and created_at > now() - interval '1 hour'",
    [ipHash],
  );
  if (recent >= GRAVES_PER_HOUR) return json({ error: 'slow down' }, 429, h);

  // When it ended, as the page saw it (a grave laid later, from the memorial, keeps its day).
  const endedAt = typeof ended === 'number' && ended >= earliest && ended <= now ? ended : now;
  await query(
    `insert into graves (life_id, env, name, age, born_at, ended_at, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (env, life_id) do nothing`,
    [id, env, life.name, life.lifespan, new Date(born).toISOString(), new Date(endedAt).toISOString(), ipHash],
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
      if (url.pathname === '/graves' && req.method === 'POST') return await lay(req, url, h);
      if (url.pathname === '/lives' && req.method === 'POST') return await birth(req, url, h);
      return json({ error: 'not found' }, 404, h);
    } catch (err) {
      console.error(err);
      return json({ error: 'unavailable' }, 503, h);
    }
  },
};
