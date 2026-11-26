begin;

grant usage on schema public to authenticated;
grant usage on schema public to anon;

create table if not exists public.fade_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_role text not null check (app_role in ('admin', 'sales_manager', 'sales')),
  sales_id text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fade_profiles_sales_role_check
    check ((app_role = 'sales' and sales_id is not null) or (app_role <> 'sales' and sales_id is null))
);

create table if not exists public.fade_sales (
  id text primary key,
  name text not null,
  username text not null unique,
  is_active boolean not null default true,
  target_monthly integer not null default 0 check (target_monthly >= 0),
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.fade_stores (
  id text primary key,
  name text not null,
  partner_type text,
  account_status text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.fade_invoices (
  id text primary key,
  sales_id text not null references public.fade_sales (id),
  store_id text references public.fade_stores (id),
  store_name text not null,
  invoice_date date not null,
  invoice_total numeric(14, 2) not null default 0 check (invoice_total >= 0),
  paid_total numeric(14, 2) not null default 0 check (paid_total >= 0),
  outstanding numeric(14, 2) not null default 0 check (outstanding >= 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fade_invoices_date_idx on public.fade_invoices (invoice_date desc);
create index if not exists fade_invoices_sales_date_idx on public.fade_invoices (sales_id, invoice_date desc);
create index if not exists fade_invoices_store_date_idx on public.fade_invoices (store_id, invoice_date desc);

create table if not exists public.fade_targets (
  sales_id text not null references public.fade_sales (id) on delete cascade,
  period date not null,
  target_qty integer not null default 0 check (target_qty >= 0),
  data jsonb not null default '{}'::jsonb,
  primary key (sales_id, period)
);

create table if not exists public.fade_rewards (
  id text primary key,
  store_id text not null references public.fade_stores (id) on delete cascade,
  period date not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fade_rewards_store_period_idx on public.fade_rewards (store_id, period desc);

create or replace function public.fade_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.app_role
  from public.fade_profiles as p
  where p.user_id = auth.uid()
$$;

create or replace function public.fade_current_sales_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.sales_id
  from public.fade_profiles as p
  where p.user_id = auth.uid()
$$;

revoke all on function public.fade_current_role() from public, anon;
revoke all on function public.fade_current_sales_id() from public, anon;
grant execute on function public.fade_current_role() to authenticated;
grant execute on function public.fade_current_sales_id() to authenticated;

alter table public.fade_profiles enable row level security;
alter table public.fade_sales enable row level security;
alter table public.fade_stores enable row level security;
alter table public.fade_invoices enable row level security;
alter table public.fade_targets enable row level security;
alter table public.fade_rewards enable row level security;

drop policy if exists fade_profiles_read_self_or_admin on public.fade_profiles;
create policy fade_profiles_read_self_or_admin on public.fade_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.fade_current_role() = 'admin');

drop policy if exists fade_sales_read_by_role on public.fade_sales;
create policy fade_sales_read_by_role on public.fade_sales
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or id = public.fade_current_sales_id()
  );

drop policy if exists fade_sales_admin_write on public.fade_sales;
create policy fade_sales_admin_write on public.fade_sales
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

drop policy if exists fade_stores_read_by_role on public.fade_stores;
create policy fade_stores_read_by_role on public.fade_stores
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or exists (
      select 1
      from public.fade_invoices as i
      where i.store_id = fade_stores.id
        and i.sales_id = public.fade_current_sales_id()
    )
  );

drop policy if exists fade_stores_admin_write on public.fade_stores;
create policy fade_stores_admin_write on public.fade_stores
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

drop policy if exists fade_invoices_read_by_role on public.fade_invoices;
create policy fade_invoices_read_by_role on public.fade_invoices
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or sales_id = public.fade_current_sales_id()
  );

drop policy if exists fade_invoices_admin_write on public.fade_invoices;
create policy fade_invoices_admin_write on public.fade_invoices
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

drop policy if exists fade_targets_read_by_role on public.fade_targets;
create policy fade_targets_read_by_role on public.fade_targets
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or sales_id = public.fade_current_sales_id()
  );

drop policy if exists fade_targets_admin_write on public.fade_targets;
create policy fade_targets_admin_write on public.fade_targets
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

drop policy if exists fade_rewards_read_by_role on public.fade_rewards;
create policy fade_rewards_read_by_role on public.fade_rewards
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or exists (
      select 1
      from public.fade_invoices as i
      where i.store_id = fade_rewards.store_id
        and i.sales_id = public.fade_current_sales_id()
    )
  );

drop policy if exists fade_rewards_admin_write on public.fade_rewards;
create policy fade_rewards_admin_write on public.fade_rewards
  for all to authenticated
  using (public.fade_current_role() = 'admin')
  with check (public.fade_current_role() = 'admin');

revoke all on public.fade_profiles, public.fade_sales, public.fade_stores,
  public.fade_invoices, public.fade_targets, public.fade_rewards from anon;
grant select on public.fade_profiles, public.fade_sales, public.fade_stores,
  public.fade_invoices, public.fade_targets, public.fade_rewards to authenticated;
grant insert, update, delete on public.fade_sales, public.fade_stores,
  public.fade_invoices, public.fade_targets, public.fade_rewards to authenticated;

commit;
