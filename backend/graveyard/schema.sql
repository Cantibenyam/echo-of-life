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

-- Moderation: hide a grave without deleting it.
--   update graves set hidden = true where id = <id>;
