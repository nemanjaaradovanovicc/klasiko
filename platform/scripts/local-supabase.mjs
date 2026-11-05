// Lokalna testna baza bez Dockera: pravi Postgres (PGlite) sa svim migracijama i RLS-om, iza malog servera
// koji govori isti HTTP jezik kao Supabase (REST i Auth) za pozive koje ova aplikacija koristi.
// Samo za testiranje na svom računaru. Podaci nestaju kad se server ugasi.
// Pokretanje: node scripts/local-supabase.mjs   (zatim koristi .env.test koji ova skripta napiše)
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
const SECRET = 'lokalna-tajna-samo-za-testiranje-klasiko';
const root = path.resolve(import.meta.dirname, '..');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function verify(token) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp && p.exp * 1000 < Date.now() ? null : p;
}
const year = () => Math.floor(Date.now() / 1000) + 31536000;
const ANON = sign({ role: 'anon', exp: year() });
const SERVICE = sign({ role: 'service_role', exp: year() });

// ---------- Baza ----------
const db = new PGlite();
await db.exec(`
  create role authenticated nologin; create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
const dir = path.join(root, 'supabase/migrations');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(path.join(dir, f), 'utf8').replace(/create extension[^;]*;/g, ''));
await db.exec('grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;');

const columns = new Map();
for (const r of (await db.query("select table_name t, column_name c from information_schema.columns where table_schema = 'public' order by ordinal_position")).rows) columns.set(r.t, [...(columns.get(r.t) ?? []), r.c]);
const fks = (await db.query(`
  select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as ref, b.attname as refcol
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] join pg_attribute b on b.attrelid = c.confrelid and b.attnum = c.confkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)).rows;
const pkeys = new Map();
for (const r of (await db.query(`select c.conrelid::regclass::text t, array_agg(a.attname::text) cols from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.contype = 'p' and c.connamespace = 'public'::regnamespace group by 1`)).rows) pkeys.set(r.t, r.cols);

// ---------- Prevod PostgREST upita u SQL ----------
class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const id = (s) => { if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new ApiError(400, `Neispravan naziv: ${s}`, 'PGRST100'); return `"${s}"`; };

function splitTop(s) {
  const out = []; let depth = 0, cur = '', inq = false;
  for (const ch of s) {
    if (ch === '"') inq = !inq;
    if (!inq && ch === '(') depth++;
    if (!inq && ch === ')') depth--;
    if (!inq && ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function parseSelect(s) {
  return splitTop((s ?? '*').trim() || '*').map((part) => {
    part = part.trim();
    const m = part.match(/^([a-zA-Z_][\w]*)(![\w]+)?\((.*)\)$/s);
    if (m) return { rel: m[1], inner: m[2] === '!inner', children: parseSelect(m[3]), filters: [], orderBy: [] };
    return { col: part };
  });
}
function relation(from, rel) {
  const m2o = fks.filter((f) => f.tbl === from && f.ref === rel);
  const o2m = fks.filter((f) => f.tbl === rel && f.ref === from);
  if (m2o.length + o2m.length === 0) throw new ApiError(400, `Nema veze između '${from}' i '${rel}'`, 'PGRST200');
  if (m2o.length + o2m.length > 1) throw new ApiError(300, `Više veza između '${from}' i '${rel}'`, 'PGRST201');
  return m2o.length ? { many: false, on: (a, b) => `${b}.${id(m2o[0].refcol)} = ${a}.${id(m2o[0].col)}` } : { many: true, on: (a, b) => `${b}.${id(o2m[0].col)} = ${a}.${id(o2m[0].refcol)}` };
}
function checkColumn(table, col) {
  if (!columns.get(table)?.includes(col)) throw new ApiError(400, `Kolona ${table}.${col} ne postoji`, '42703');
}
function condition(alias, table, col, expr) {
  checkColumn(table, col);
  const c = `${alias}.${id(col)}`;
  let not = false;
  if (expr.startsWith('not.')) { not = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot), val = expr.slice(dot + 1);
  let sql;
  const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  if (ops[op]) sql = `${c} ${ops[op]} ${q(val)}`;
  else if (op === 'like' || op === 'ilike') sql = `${c} ${op} ${q(val.replace(/\*/g, '%'))}`;
  else if (op === 'is') sql = `${c} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
  else if (op === 'in') {
    const list = splitTop(val.replace(/^\(|\)$/g, '')).map((x) => q(x.replace(/^"|"$/g, '')));
    sql = list.length ? `${c} in (${list.join(',')})` : 'false';
  } else throw new ApiError(400, `Nepoznat operator ${op}`, 'PGRST100');
  return not ? `not (${sql})` : sql;
}
function orCondition(alias, table, expr, joiner = ' or ') {
  const parts = splitTop(expr.replace(/^\(|\)$/g, '')).map((p) => {
    p = p.trim();
    const m = p.match(/^(and|or)\((.*)\)$/s);
    if (m) return orCondition(alias, table, m[2], m[1] === 'and' ? ' and ' : ' or ');
    const d = p.indexOf('.');
    return condition(alias, table, p.slice(0, d), p.slice(d + 1));
  });
  return `(${parts.join(joiner)})`;
}
let aliasNo = 0;
function jsonOf(table, alias, nodes, where) {
  const pairs = [];
  for (const n of nodes) {
    if (n.col === '*') { for (const c of columns.get(table) ?? []) pairs.push(`${q(c)}, ${alias}.${id(c)}`); continue; }
    if (n.col) { checkColumn(table, n.col); pairs.push(`${q(n.col)}, ${alias}.${id(n.col)}`); continue; }
    if (!columns.has(n.rel)) throw new ApiError(400, `Tabela ${n.rel} ne postoji`, 'PGRST200');
    const r = relation(table, n.rel);
    const a = `a${++aliasNo}`;
    const conds = [r.on(alias, a), ...n.filters.map(([c, e]) => condition(a, n.rel, c, e))];
    const innerWhere = [];
    const inner = jsonOf(n.rel, a, n.children, innerWhere);
    const all = [...conds, ...innerWhere].join(' and ');
    pairs.push(`${q(n.rel)}, ${r.many ? `coalesce((select json_agg(${inner}) from ${id(n.rel)} ${a} where ${all}), '[]'::json)` : `(select ${inner} from ${id(n.rel)} ${a} where ${all} limit 1)`}`);
    if (n.inner) where.push(`exists (select 1 from ${id(n.rel)} ${a} where ${all})`);
  }
  // json_build_object prima najviše 100 argumenata, pa se veliki redovi spajaju.
  const chunks = [];
  for (let i = 0; i < pairs.length; i += 40) chunks.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(', ')})`);
  return chunks.length ? `(${chunks.join(' || ')})` : `'{}'::jsonb`;
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
function parseFilters(table, params, alias, tree) {
  const where = [];
  for (const [key, val] of params) {
    if (RESERVED.has(key)) continue;
    if (key.includes('.')) {
      const parts = key.split('.');
      let nodes = tree, node;
      for (const seg of parts.slice(0, -1)) { node = nodes.find((n) => n.rel === seg); if (!node) throw new ApiError(400, `Filter na ${seg} bez embed-a`, 'PGRST108'); nodes = node.children; }
      node.filters.push([parts[parts.length - 1], val]);
    } else where.push(condition(alias, table, key, val));
  }
  if (params.get('or')) where.push(orCondition(alias, table, params.get('or')));
  return where;
}
function orderSql(table, alias, params) {
  const o = params.get('order');
  if (!o) return '';
  return ' order by ' + o.split(',').map((p) => { const [c, dir, nulls] = p.split('.'); checkColumn(table, c); return `${alias}.${id(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`; }).join(', ');
}

async function inRole(auth, fn) {
  return db.transaction(async (tx) => {
    if (auth.role === 'service_role') {
      await tx.query("select set_config('request.jwt.claim.sub', '', true)");
    } else {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [auth.sub ?? '']);
      await tx.exec(`set local role ${auth.role === 'authenticated' ? 'authenticated' : 'anon'}`);
    }
    return fn(tx);
  });
}

async function rest(req, res, table, url, body, auth) {
  if (!columns.has(table)) throw new ApiError(404, `Tabela ${table} ne postoji`, 'PGRST205');
  const params = url.searchParams;
  const prefer = req.headers.prefer ?? '';
  const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const a0 = 'a0';
  const tree = parseSelect(params.get('select'));
  const send = (status, rows, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
    res.end(rows === null ? undefined : JSON.stringify(rows));
  };

  if (req.method === 'GET' || req.method === 'HEAD') {
    const where = parseFilters(table, params, a0, tree);
    const json = jsonOf(table, a0, tree, where);
    const whereSql = where.length ? ` where ${where.join(' and ')}` : '';
    const limit = Math.min(Number(params.get('limit') ?? 1000), 1000); // Isti limit od 1000 redova kao na Supabase-u.
    const offset = Number(params.get('offset') ?? 0);
    const { count, rows } = await inRole(auth, async (tx) => {
      const c = prefer.includes('count=exact') ? (await tx.query(`select count(*)::int n from ${id(table)} ${a0}${whereSql}`)).rows[0].n : null;
      const r = req.method === 'HEAD' ? [] : (await tx.query(`select ${json} j from ${id(table)} ${a0}${whereSql}${orderSql(table, a0, params)} limit ${limit} offset ${offset}`)).rows.map((x) => x.j);
      return { count: c, rows: r };
    });
    const range = { 'Content-Range': `${offset}-${offset + Math.max(rows.length - 1, 0)}/${count ?? '*'}` };
    if (req.method === 'HEAD') return send(200, null, range);
    if (wantsObject) {
      if (rows.length !== 1) throw new ApiError(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116');
      return send(200, rows[0], range);
    }
    return send(200, rows, range);
  }

  const returning = prefer.includes('return=representation');
  const finish = (rows) => {
    const picked = rows.map((row) => {
      const flat = tree.filter((n) => n.col);
      if (flat.some((n) => n.col === '*') || !params.get('select')) return row;
      return Object.fromEntries(flat.map((n) => [n.col, row[n.col]]));
    });
    if (!returning) return send(req.method === 'POST' ? 201 : 204, null);
    if (wantsObject) {
      if (picked.length !== 1) throw new ApiError(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116');
      return send(req.method === 'POST' ? 201 : 200, picked[0]);
    }
    return send(req.method === 'POST' ? 201 : 200, picked);
  };

  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    if (list.length === 0) return finish([]);
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    cols.forEach((c) => checkColumn(table, c));
    const colSql = cols.map(id).join(', ');
    let conflict = '';
    if (prefer.includes('resolution=')) {
      const target = (params.get('on_conflict')?.split(',') ?? pkeys.get(table) ?? []).map(id).join(', ');
      const update = cols.filter((c) => !(params.get('on_conflict')?.split(',') ?? pkeys.get(table) ?? []).includes(c)).map((c) => `${id(c)} = excluded.${id(c)}`).join(', ');
      conflict = prefer.includes('ignore-duplicates') || !update ? ` on conflict (${target}) do nothing` : ` on conflict (${target}) do update set ${update}`;
    }
    const insertOne = (rows, names) => {
      const n = names.map(id).join(', ');
      return `insert into ${id(table)} (${n}) select ${n} from json_populate_recordset(null::${id(table)}, ${q(JSON.stringify(rows))}::json)${conflict} returning to_jsonb(${id(table)}.*) j`;
    };
    // Bez Prefer: missing=default kolona koja nedostaje u nekom redu postaje NULL, isto kao na Supabase-u.
    const statements = prefer.includes('missing=default') ? list.map((r) => insertOne([r], Object.keys(r))) : [insertOne(list, cols)];
    return finish(await inRole(auth, async (tx) => {
      const out = [];
      for (const sql of statements) out.push(...(await tx.query(sql)).rows.map((x) => x.j));
      return out;
    }));
  }

  const where = parseFilters(table, params, id(table), tree);
  if (where.length === 0) throw new ApiError(400, 'Izmena bez filtera nije dozvoljena', 'PGRST100');
  if (req.method === 'PATCH') {
    const cols = Object.keys(body);
    cols.forEach((c) => checkColumn(table, c));
    if (cols.length === 0) return finish([]);
    const sql = `update ${id(table)} set (${cols.map(id).join(', ')}) = (select ${cols.map(id).join(', ')} from json_populate_record(null::${id(table)}, ${q(JSON.stringify(body))}::json)) where ${where.join(' and ')} returning to_jsonb(${id(table)}.*) j`;
    return finish((await inRole(auth, (tx) => tx.query(sql))).rows.map((x) => x.j));
  }
  if (req.method === 'DELETE') {
    const sql = `delete from ${id(table)} where ${where.join(' and ')} returning to_jsonb(${id(table)}.*) j`;
    return finish((await inRole(auth, (tx) => tx.query(sql))).rows.map((x) => x.j));
  }
  throw new ApiError(405, 'Metoda nije podržana', 'PGRST100');
}

// ---------- Auth ----------
const users = new Map(); // id -> { id, email, password, banned, metadata, factors }
const refreshTokens = new Map();
const recovery = new Map();
const emails = [];

const publicUser = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: u.metadata ?? {}, factors: u.factors, created_at: new Date().toISOString() });
function session(u, aal = 'aal1') {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = sign({ sub: u.id, email: u.email, role: 'authenticated', aal, exp, session_id: randomUUID() });
  const refresh_token = randomUUID();
  refreshTokens.set(refresh_token, { id: u.id, aal });
  return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, user: publicUser(u) };
}
async function authRoute(req, res, url, body, token) {
  const p = url.pathname.replace('/auth/v1', '');
  const json = (status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const fail = (status, code, msg) => json(status, { code, error_code: code, msg, message: msg });
  const claims = verify(token);
  const me = claims?.sub ? users.get(claims.sub) : null;
  if (p === '/admin/users' && req.method === 'POST') {
    if ([...users.values()].some((u) => u.email === body.email)) return fail(422, 'email_exists', 'A user with this email address has already been registered');
    const u = { id: randomUUID(), email: body.email, password: body.password, metadata: body.user_metadata, factors: [] };
    users.set(u.id, u);
    await db.query('insert into auth.users (id) values ($1)', [u.id]);
    return json(200, publicUser(u));
  }
  const adminUser = p.match(/^\/admin\/users\/([\w-]+)$/);
  if (adminUser) {
    const u = users.get(adminUser[1]);
    if (!u) return fail(404, 'user_not_found', 'User not found');
    if (req.method === 'DELETE') { users.delete(u.id); await db.query('delete from auth.users where id = $1', [u.id]); return json(200, {}); }
    if (body.password) u.password = body.password;
    if (body.ban_duration) u.banned = body.ban_duration !== 'none';
    return json(200, publicUser(u));
  }
  if (p === '/admin/generate_link') {
    const u = [...users.values()].find((x) => x.email === body.email);
    if (!u) return fail(404, 'user_not_found', 'User not found');
    const hash = randomUUID();
    recovery.set(hash, u.id);
    return json(200, { ...publicUser(u), action_link: '', email_otp: '', hashed_otp: hash, hashed_token: hash, redirect_to: '', verification_type: 'recovery' });
  }
  if (p === '/verify') {
    const u = users.get(recovery.get(body.token_hash));
    if (!u) return fail(403, 'otp_expired', 'Token has expired or is invalid');
    recovery.delete(body.token_hash);
    return json(200, session(u));
  }
  if (p === '/token') {
    if (url.searchParams.get('grant_type') === 'password') {
      const u = [...users.values()].find((x) => x.email === body.email);
      if (!u || u.password !== body.password) return fail(400, 'invalid_credentials', 'Invalid login credentials');
      if (u.banned) return fail(400, 'user_banned', 'User is banned');
      return json(200, session(u));
    }
    const r = refreshTokens.get(body.refresh_token);
    const u = r && users.get(r.id);
    if (!u || u.banned) return fail(400, 'refresh_token_not_found', 'Invalid Refresh Token');
    return json(200, session(u, r.aal));
  }
  if (p === '/logout') return json(204, {});
  if (!me) return fail(403, 'bad_jwt', 'invalid JWT');
  if (me.banned) return fail(403, 'user_banned', 'User is banned');
  if (p === '/user' && req.method === 'GET') return json(200, publicUser(me));
  if (p === '/user' && req.method === 'PUT') { if (body.password) me.password = body.password; return json(200, publicUser(me)); }
  if (p === '/factors' && req.method === 'POST') {
    const f = { id: randomUUID(), factor_type: 'totp', friendly_name: body.friendly_name, status: 'unverified', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    me.factors.push(f);
    return json(200, { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'LOKALNITESTSECRET', uri: 'otpauth://totp/klasiko' } });
  }
  const fac = p.match(/^\/factors\/([\w-]+)(\/challenge|\/verify)?$/);
  if (fac) {
    const f = me.factors.find((x) => x.id === fac[1]);
    if (!f) return fail(404, 'mfa_factor_not_found', 'Factor not found');
    if (!fac[2]) { me.factors = me.factors.filter((x) => x.id !== f.id); return json(200, { id: f.id }); }
    if (fac[2] === '/challenge') return json(200, { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (body.code !== '123456') return fail(422, 'mfa_verification_failed', 'Invalid TOTP code');
    f.status = 'verified';
    return json(200, session(me, 'aal2'));
  }
  return fail(404, 'not_found', `Nije podržano: ${req.method} ${p}`);
}

// ---------- Server ----------
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  const body = raw ? JSON.parse(raw) : {};
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '') || req.headers.apikey;
  try {
    if (url.pathname === '/__emails') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(emails)); }
    if (url.pathname === '/emails') { emails.push(body); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: randomUUID() })); }
    if (url.pathname.startsWith('/auth/v1')) return await authRoute(req, res, url, body, token);
    const m = url.pathname.match(/^\/rest\/v1\/([\w]+)$/);
    if (!m) { res.writeHead(404); return res.end(); }
    const auth = verify(token);
    if (!auth) throw new ApiError(401, 'JWT expired', 'PGRST301');
    await rest(req, res, m[1], url, body, auth);
  } catch (e) {
    const status = e.status ?? (e.code === '23505' ? 409 : e.code === '42501' ? 403 : 400);
    if (status >= 500 || e.status === 300 || e.code === 'PGRST200' || e.code === '42703' || e.code === '42P10') console.error('GREŠKA UPITA', req.method, req.url, e.message);
    if (!res.headersSent) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: e.message, code: e.code ?? 'XX000' })); }
  }
}).listen(PORT, () => {
  writeFileSync(path.join(root, '.env.test'), [`NEXT_PUBLIC_SUPABASE_URL=http://localhost:${PORT}`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON}`, `SUPABASE_SERVICE_ROLE_KEY=${SERVICE}`, 'SMOKE_TEST_OK=1', 'CRON_SECRET=lokalni-cron', 'RESEND_API_KEY=lokalni', `RESEND_API_URL=http://localhost:${PORT}`, 'EMAIL_FROM="Klasiko <test@klasiko.test>"'].join('\n') + '\n');
  console.log(`Lokalna testna baza radi na http://localhost:${PORT}. Podešavanja su u .env.test.`);
});
