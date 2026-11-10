-- =====================================================================
-- Plataforma multi-professor - Esquema Supabase (rode no SQL Editor)
-- Papéis: ceo (dono da plataforma, acesso total) | trainer (professor) | student (aluno)
-- Se você já rodou uma versão anterior deste arquivo, apague as tabelas antigas antes
-- (ou crie um projeto novo).
-- =====================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null,
  role text not null default 'student' check (role in ('ceo','trainer','student')),
  active boolean not null default true,
  trainer_id uuid references profiles(id),          -- professor responsável (alunos)
  phone text,                                       -- telefone (opcional)
  age int, height int, weight numeric, goal text, injuries text, notes text, photo text
);
create table workouts  (id text primary key, uid text not null, pos int not null default 0, data jsonb not null);
create table templates (id text primary key, owner text, name text not null, days jsonb not null);
create table checkins  (id text primary key, uid text not null, date date not null, mood text, trained text);
create table water     (id text primary key, uid text not null, date date not null, ml int not null);
create table logs      (id text primary key, uid text not null, date date not null, workout_id text, name text);
create table cardio    (id text primary key, uid text not null, date date not null, type text, sec int, kcal int);
create table weights   (id text primary key, uid text not null, date date not null, kg numeric not null);
create table messages  (id text primary key, from_id text, to_id text not null, text text not null, date timestamptz not null default now(), read boolean not null default false);
create table posts     (id text primary key, uid text not null, author_name text, author_role text, author_photo text, text text, image text, likes jsonb not null default '[]', date timestamptz not null default now());
create table foods     (id text primary key, owner text, name text not null, cat text, kcal numeric, p numeric, c numeric, g numeric, port numeric);
create table tips      (id text primary key, owner text, title text not null, body text not null);
create table settings  (id text primary key, uid text not null, data jsonb not null default '{}');

create index on profiles(trainer_id);
create index on workouts(uid); create index on checkins(uid,date); create index on water(uid,date);
create index on logs(uid,date); create index on weights(uid,date); create index on messages(to_id);

-- ---------- Funções auxiliares (security definer evita recursão nas regras) ----------
create or replace function is_ceo() returns boolean language sql security definer stable set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'ceo' and active) $$;

create or replace function is_trainer() returns boolean language sql security definer stable set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'trainer' and active) $$;

create or replace function my_trainer() returns uuid language sql security definer stable set search_path = public as
$$ select trainer_id from profiles where id = auth.uid() $$;

-- CEO gerencia todos; professor gerencia só os alunos dele
create or replace function manages(target text) returns boolean language sql security definer stable set search_path = public as
$$ select is_ceo() or (is_trainer() and exists(select 1 from profiles p where p.id::text = target and p.trainer_id = auth.uid())) $$;

-- Só o CEO altera papel, status, e-mail e professor de alguém
create or replace function guard_profile() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_ceo() then
    new.role := old.role; new.active := old.active; new.email := old.email; new.trainer_id := old.trainer_id;
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on profiles for each row execute function guard_profile();

-- ---------- Row Level Security ----------
alter table profiles  enable row level security;
alter table workouts  enable row level security;
alter table templates enable row level security;
alter table checkins  enable row level security;
alter table water     enable row level security;
alter table logs      enable row level security;
alter table cardio    enable row level security;
alter table weights   enable row level security;
alter table messages  enable row level security;
alter table posts     enable row level security;
alter table foods     enable row level security;
alter table tips      enable row level security;
alter table settings  enable row level security;

-- perfis
create policy p_sel on profiles for select using (id = auth.uid() or is_ceo() or trainer_id = auth.uid());
create policy p_upd on profiles for update using (id = auth.uid() or is_ceo() or trainer_id = auth.uid());
create policy p_ins on profiles for insert with check (is_ceo());
create policy p_del on profiles for delete using (is_ceo());

-- treinos: aluno lê o próprio; CEO/professor responsável gerenciam
create policy w_stu on workouts for select using (uid = auth.uid()::text);
create policy w_mng on workouts for all using (manages(uid)) with check (manages(uid));

-- modelos de treino: privados de cada professor (CEO vê todos)
create policy t_all on templates for all using (owner = auth.uid()::text or is_ceo()) with check (owner = auth.uid()::text or is_ceo());

-- alimentos e dicas: globais (owner nulo, geridos pelo CEO) + os do professor
create policy f_sel on foods for select using (auth.role() = 'authenticated' and (owner is null or owner = auth.uid()::text or owner = my_trainer()::text or is_ceo()));
create policy f_wr  on foods for all using (is_ceo() or (is_trainer() and owner = auth.uid()::text)) with check (is_ceo() or (is_trainer() and owner = auth.uid()::text));
create policy tp_sel on tips for select using (auth.role() = 'authenticated' and (owner is null or owner = auth.uid()::text or owner = my_trainer()::text or is_ceo()));
create policy tp_wr  on tips for all using (is_ceo() or (is_trainer() and owner = auth.uid()::text)) with check (is_ceo() or (is_trainer() and owner = auth.uid()::text));

-- dados do aluno: ele mesmo, o professor responsável e o CEO
do $$ declare t text; begin
  foreach t in array array['checkins','water','logs','cardio','weights','settings'] loop
    execute format('create policy %I on %I for all using (uid = auth.uid()::text or manages(uid)) with check (uid = auth.uid()::text or manages(uid))', t || '_own', t);
  end loop;
end $$;

-- comunidade (posts): todos autenticados visualizam, criam seus posts e reagem com 💪; autor/CEO/professor excluem
create policy po_sel on posts for select using (auth.role() = 'authenticated');
create policy po_ins on posts for insert with check (uid = auth.uid()::text);
create policy po_upd on posts for update using (auth.role() = 'authenticated');
create policy po_del on posts for delete using (uid = auth.uid()::text or manages(uid));

-- mensagens: "all" = todos os alunos do professor que enviou
create policy m_sel on messages for select using (to_id = auth.uid()::text or (to_id = 'all' and from_id = my_trainer()::text) or from_id = auth.uid()::text or is_ceo());
create policy m_ins on messages for insert with check (is_ceo() or (is_trainer() and from_id = auth.uid()::text));
create policy m_upd on messages for update using (to_id = auth.uid()::text or from_id = auth.uid()::text or is_ceo());
create policy m_del on messages for delete using (from_id = auth.uid()::text or is_ceo());

-- =====================================================================
-- HABILITAR TEMPO REAL (SUPABASE REALTIME)
-- Permite que treinos, perfis, cargas e mensagens atualizem ao vivo
-- em todos os celulares e computadores conectados sem dar refresh.
-- =====================================================================
alter publication supabase_realtime add table workouts;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table settings;
alter publication supabase_realtime add table messages;

-- =====================================================================
-- SEU ACESSO DE CEO: crie seu usuário em Authentication > Users (e-mail+senha,
-- marque "Auto Confirm User") e rode, trocando o e-mail:
--
-- insert into profiles (id, email, name, role)
-- select id, email, 'CEO', 'ceo' from auth.users where email = 'SEU_EMAIL';
-- =====================================================================
