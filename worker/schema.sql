
create table if not exists writer_accounts (
  id bigserial primary key,
  provider text not null check (provider = 'google'),
  provider_subject text not null,
  email text,
  name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists writer_sessions (
  id bigserial primary key,
  account_id bigint not null references writer_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists writer_sessions_token on writer_sessions(token_hash);

create table if not exists writer_cloud_state (
  account_id bigint primary key references writer_accounts(id) on delete cascade,
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists writer_analytics_outbox (
  event_key text primary key,
  account_id bigint not null references writer_accounts(id) on delete cascade,
  event_name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists writer_analytics_outbox_pending on writer_analytics_outbox(created_at) where delivered_at is null;
