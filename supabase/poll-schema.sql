-- DeckFlip IR 공개 투표/질문 저장소
-- Supabase SQL Editor에서 반복 실행해도 안전하도록 작성했습니다.
-- 공개 웹에는 publishable key(또는 legacy anon key)만 사용하고 secret/service_role key는 넣지 않습니다.

create table if not exists public.deck_votes (
  id uuid primary key default gen_random_uuid(),
  poll text not null,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now()
);

create table if not exists public.deck_questions (
  id uuid primary key default gen_random_uuid(),
  poll text not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists deck_votes_poll_created_at_idx
  on public.deck_votes (poll, created_at desc);

create index if not exists deck_questions_poll_created_at_idx
  on public.deck_questions (poll, created_at desc);

alter table public.deck_votes enable row level security;
alter table public.deck_questions enable row level security;

revoke all on table public.deck_votes from anon, authenticated;
revoke all on table public.deck_questions from anon, authenticated;
grant select, insert on table public.deck_votes to anon;
grant select, insert on table public.deck_questions to anon;

drop policy if exists "deck_votes_public_read" on public.deck_votes;
drop policy if exists "deck_votes_public_insert" on public.deck_votes;
drop policy if exists "deck_questions_public_read" on public.deck_questions;
drop policy if exists "deck_questions_public_insert" on public.deck_questions;
drop policy if exists "deck_votes_select_anon" on public.deck_votes;
drop policy if exists "deck_votes_insert_anon" on public.deck_votes;
drop policy if exists "deck_questions_select_anon" on public.deck_questions;
drop policy if exists "deck_questions_insert_anon" on public.deck_questions;

create policy "deck_votes_public_read"
  on public.deck_votes for select to anon
  using (true);

create policy "deck_votes_public_insert"
  on public.deck_votes for insert to anon
  with check (
    poll ~ '^[A-Za-z0-9_-]{1,80}$'
    and choice between 0 and 3
  );

create policy "deck_questions_public_read"
  on public.deck_questions for select to anon
  using (true);

create policy "deck_questions_public_insert"
  on public.deck_questions for insert to anon
  with check (
    poll ~ '^[A-Za-z0-9_-]{1,80}$'
    and char_length(btrim(body)) between 1 and 100
  );
