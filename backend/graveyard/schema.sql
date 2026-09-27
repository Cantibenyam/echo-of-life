-- The graveyard table (Neon project "echo-of-life"). Applied once; kept here for reference.
create table if not exists graves (
  id bigint generated always as identity primary key,
  life_id uuid not null,
  env text not null check (env in ('release', 'preview', 'dev')),
  name text not null check (char_length(name) between 1 and 48),
  age smallint not null check (age between 0 and 122),
  born_at timestamptz,
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  ip_hash text,
  hidden boolean not null default false,
  unique (env, life_id)
);
create index if not exists graves_env_id on graves (env, id desc) where not hidden;
create index if not exists graves_ip_recent on graves (ip_hash, created_at);

-- Every life, drawn at birth (POST /lives). A grave is laid only for a life found here, at its lifespan.
create table if not exists lives (
  env text not null check (env in ('release', 'preview', 'dev')),
  life_id uuid not null,
  name text not null check (char_length(name) between 1 and 48),
  lifespan smallint not null check (lifespan between 0 and 122),
  born_at timestamptz not null default now(),
  ip_hash text,
  primary key (env, life_id)
);
create index if not exists lives_ip_recent on lives (ip_hash, born_at);

-- Moderation: hide a grave without deleting it.
--   update graves set hidden = true where id = <id>;
