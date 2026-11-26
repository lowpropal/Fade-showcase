begin;

create table if not exists public.fade_consignment_balances (
  id text primary key,
  client_id text not null,
  store_name text not null,
  sales_id text,
  sales_name text not null default '',
  sku text not null,
  product_name text not null default '',
  category text not null default '',
  qty_consigned integer not null default 0 check (qty_consigned >= 0),
  qty_paid integer not null default 0 check (qty_paid >= 0),
  qty_returned integer not null default 0 check (qty_returned >= 0),
  qty_remaining integer not null default 0 check (qty_remaining >= 0),
  remaining_value numeric(14, 2) not null default 0 check (remaining_value >= 0),
  physical_qty integer check (physical_qty is null or physical_qty >= 0),
  stock_status text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists fade_consignment_store_idx
  on public.fade_consignment_balances (store_name, sku);
create index if not exists fade_consignment_sales_idx
  on public.fade_consignment_balances (sales_id, store_name, sku);

alter table public.fade_consignment_balances enable row level security;
revoke all on public.fade_consignment_balances from anon;
grant select on public.fade_consignment_balances to authenticated;

drop policy if exists fade_consignment_read_by_role on public.fade_consignment_balances;
create policy fade_consignment_read_by_role on public.fade_consignment_balances
  for select to authenticated
  using (
    public.fade_current_role() in ('admin', 'sales_manager')
    or sales_id = public.fade_current_sales_id()
  );

create or replace function public.fade_replace_consignment_balances(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.fade_current_role() is distinct from 'admin' then
    raise exception 'Only Admin can replace consignment balances';
  end if;

  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'Consignment payload must be an array';
  end if;

  delete from public.fade_consignment_balances;

  insert into public.fade_consignment_balances (
    id, client_id, store_name, sales_id, sales_name, sku, product_name,
    category, qty_consigned, qty_paid, qty_returned, qty_remaining,
    remaining_value, physical_qty, stock_status, data, updated_at
  )
  select
    row_data.id, row_data.client_id, row_data.store_name, row_data.sales_id,
    coalesce(row_data.sales_name, ''), row_data.sku, coalesce(row_data.product_name, ''),
    coalesce(row_data.category, ''), coalesce(row_data.qty_consigned, 0),
    coalesce(row_data.qty_paid, 0), coalesce(row_data.qty_returned, 0),
    coalesce(row_data.qty_remaining, 0), coalesce(row_data.remaining_value, 0),
    row_data.physical_qty, coalesce(row_data.stock_status, ''),
    coalesce(row_data.data, '{}'::jsonb), now()
  from jsonb_to_recordset(payload) as row_data(
    id text, client_id text, store_name text, sales_id text, sales_name text,
    sku text, product_name text, category text, qty_consigned integer,
    qty_paid integer, qty_returned integer, qty_remaining integer,
    remaining_value numeric, physical_qty integer, stock_status text, data jsonb
  );
end;
$$;

revoke all on function public.fade_replace_consignment_balances(jsonb) from public, anon;
grant execute on function public.fade_replace_consignment_balances(jsonb) to authenticated;

commit;
