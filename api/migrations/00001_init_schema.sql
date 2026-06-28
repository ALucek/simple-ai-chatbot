-- +goose Up
create table users (
  id          bigserial primary key,
  google_sub  text unique not null,
  email       text not null,
  created_at  timestamptz not null default now()
);

create table refresh_tokens (
  token_hash text primary key,
  user_id    bigint not null references users(id) on delete cascade,
  family_id  text not null,
  expires_at timestamptz not null,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

create table conversations (
  id         bigserial primary key,
  user_id    bigint not null references users(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create table token_usage (
  id                bigserial primary key,
  user_id           bigint not null references users(id) on delete cascade,
  prompt_tokens     int not null,
  completion_tokens int not null,
  created_at        timestamptz not null default now()
);

create index on conversations (user_id);
create index on messages (conversation_id);
create index on token_usage (user_id, created_at);

-- +goose Down
drop table token_usage;
drop table messages;
drop table conversations;
drop table refresh_tokens;
drop table users;
