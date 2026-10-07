-- @icos/llm: one row per Claude call, written by logCall(). Apply once per Supabase project.
-- Service-role only: RLS is on and no policy is created, so the anon and authenticated roles
-- can neither read nor write it. Read spend through v_llm_cost_month from the SQL editor.

create table if not exists llm_call (
  id                 bigserial primary key,
  app                text not null,          -- vantage | compass | herb | fundraise | lp
  ref                text,                   -- deal:123 | company:45 | upload:9
  kind               text not null,          -- fit | summary | ai_suggest | memo …
  phase              text,                   -- research | structure | (null = single call)
  model              text not null,          -- the model that answered
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches       int not null default 0,
  -- USD per million tokens, as billed at the time of the call.
  price_in_per_mtok  numeric not null,
  price_out_per_mtok numeric not null,
  -- Mirrors costUsd() in the package: cache reads 0.1x input, cache writes 1.25x input, searches $0.01.
  cost_usd           numeric generated always as (
                       (input_tokens + cache_write_tokens * 1.25) * price_in_per_mtok / 1000000.0
                       + output_tokens * price_out_per_mtok / 1000000.0
                       + cache_read_tokens * price_in_per_mtok * 0.1 / 1000000.0
                       + web_searches * 0.01
                     ) stored,
  stop_reason        text,
  ms                 int,
  ok                 boolean not null default true,
  error              text,
  created_at         timestamptz not null default now()
);

create index if not exists llm_call_created_idx on llm_call (created_at desc);
create index if not exists llm_call_app_kind_idx on llm_call (app, kind, created_at desc);

alter table llm_call enable row level security;

create or replace view v_llm_cost_month with (security_invoker = true) as
select
  app,
  kind,
  model,
  date_trunc('month', created_at)::date                         as month,
  count(*)                                                      as calls,
  count(*) filter (where not ok)                                as failed,
  sum(input_tokens + cache_read_tokens + cache_write_tokens)    as tokens_in,
  sum(output_tokens)                                            as tokens_out,
  sum(web_searches)                                             as web_searches,
  round(sum(cost_usd)::numeric, 2)                              as cost_usd
from llm_call
group by 1, 2, 3, 4;
