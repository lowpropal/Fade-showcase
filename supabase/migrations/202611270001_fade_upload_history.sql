begin;

create table if not exists public.fade_upload_history (
  id text primary key,
  uploaded_at timestamptz not null,
  filename text not null,
  rows_ingested integer not null default 0 check (rows_ingested >= 0),
  valid_count integer not null default 0 check (valid_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  uploaded_by text not null default 'Admin',
  status text not null check (status in ('Success', 'Failed', 'RolledBack')),
  has_snapshot boolean not null default false,
  previous_count integer not null default 0 check (previous_count >= 0),
  previous_upload_id text,
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists fade_upload_history_uploaded_at_idx
  on public.fade_upload_history (uploaded_at desc);

alter table public.fade_upload_history enable row level security;
revoke all on public.fade_upload_history from anon;
grant select, insert, update, delete on public.fade_upload_history to authenticated;

drop policy if exists fade_upload_history_admin_only on public.fade_upload_history;
create policy fade_upload_history_admin_only on public.fade_upload_history
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

commit;
