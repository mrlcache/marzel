import { neon } from "@neondatabase/serverless";

export const connect = (env) => neon(env.DATABASE_URL);

let schemaReady;

export function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists writer_accounts (
          id bigserial primary key,
          provider text not null check (provider = 'google'),
          provider_subject text not null,
          email text,
          name text,
          created_at timestamptz not null default now(),
          last_seen_at timestamptz not null default now(),
          unique (provider, provider_subject)
        )
      `;
      await sql`
        create table if not exists writer_sessions (
          id bigserial primary key,
          account_id bigint not null references writer_accounts(id) on delete cascade,
          token_hash text not null unique,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists writer_sessions_token on writer_sessions(token_hash)`;
      await sql`
        create table if not exists writer_cloud_state (
          account_id bigint primary key references writer_accounts(id) on delete cascade,
          data jsonb not null,
          revision integer not null default 1,
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists writer_analytics_outbox (
          event_key text primary key,
          account_id bigint not null references writer_accounts(id) on delete cascade,
          event_name text not null,
          payload jsonb not null,
          created_at timestamptz not null default now(),
          delivered_at timestamptz
        )
      `;
      await sql`create index if not exists writer_analytics_outbox_pending on writer_analytics_outbox(created_at) where delivered_at is null`;
    })();
    schemaReady.catch(() => { schemaReady = undefined; });
  }
  return schemaReady;
}

export async function upsertAccount(sql, profile) {
  const [account] = await sql`
    insert into writer_accounts (provider, provider_subject, email, name)
    values (${profile.provider}, ${profile.subject}, ${profile.email || null}, ${profile.name || null})
    on conflict (provider, provider_subject) do update set
      email = excluded.email, name = coalesce(excluded.name, writer_accounts.name), last_seen_at = now()
    returning id, email, name, (xmax = 0) as created
  `;
  return account;
}

export async function sessionAccount(sql, tokenHash) {
  const [account] = await sql`
    select a.id, a.email, a.name, a.provider
    from writer_sessions s join writer_accounts a on a.id = s.account_id
    where s.token_hash = ${tokenHash} and s.expires_at > now()
  `;
  return account || null;
}

export async function createSession(sql, accountId, tokenHash) {
  await sql`
    insert into writer_sessions (account_id, token_hash, expires_at)
    values (${accountId}, ${tokenHash}, now() + interval '30 days')
  `;
}

export async function deleteSession(sql, tokenHash) {
  await sql`delete from writer_sessions where token_hash = ${tokenHash}`;
}

export async function stateFor(sql, accountId) {
  const [state] = await sql`
    select data, revision, updated_at as "updatedAt" from writer_cloud_state where account_id = ${accountId}
  `;
  return state || null;
}

export async function saveState(sql, accountId, data, revision) {
  const current = await stateFor(sql, accountId);
  if (current && revision !== current.revision) return { conflict: true, current };
  const nextRevision = (current?.revision || 0) + 1;
  const [saved] = current
    ? await sql`update writer_cloud_state set data = ${JSON.stringify(data)}::jsonb, revision = ${nextRevision}, updated_at = now() where account_id = ${accountId} returning revision, updated_at as "updatedAt"`
    : await sql`insert into writer_cloud_state (account_id, data, revision) values (${accountId}, ${JSON.stringify(data)}::jsonb, ${nextRevision}) returning revision, updated_at as "updatedAt"`;
  return { ...saved, data, created: !current };
}

export async function enqueueOperationalEvent(sql, { eventKey, accountId, eventName, payload }) {
  const rows = await sql`
    insert into writer_analytics_outbox (event_key, account_id, event_name, payload)
    values (${eventKey}, ${accountId}, ${eventName}, ${JSON.stringify(payload)}::jsonb)
    on conflict (event_key) do nothing
    returning event_key
  `;
  return rows.length === 1;
}
