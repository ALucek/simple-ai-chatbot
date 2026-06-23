-- +goose Up
alter table refresh_tokens add column family_id text;
-- backfill
update refresh_tokens set family_id = token_hash where family_id is null;
alter table refresh_tokens alter column family_id set not null;

-- +goose Down
alter table refresh_tokens drop column family_id;