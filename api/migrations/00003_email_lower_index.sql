-- +goose Up
update users set email = lower(email);
create unique index users_email_lower_idx on users (lower(email));

-- +goose Down
drop index users_email_lower_idx;