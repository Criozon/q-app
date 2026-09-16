-- =====================================================================
-- Q-App — исходная схема БД
--
-- Восстановлена из бэкапа оригинального проекта Supabase
-- (my-queue-project, orkpvyenyawrotzrfxeh, дамп от 16.07.2025).
-- Тела RPC-функций перенесены как есть — это рабочая логика, а не
-- реконструкция по клиенту.
--
-- Из оригинала НЕ переносятся:
--   * 29 брошенных вариантов функций (шесть версий create_queue_*,
--     четыре call_next_*, три get_queue_details_* и т.д.) — мёртвый код;
--   * таблица app_logs — пустая, клиентом не используется;
--   * колонка windows.admin_secret_key — вытеснена short_key;
--   * тестовые данные (261 очередь, 242 участника).
--
-- Отличия от оригинала помечены пометкой ИЗМЕНЕНО с объяснением.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Короткие идентификаторы для публичных ссылок
-- ---------------------------------------------------------------------
create or replace function public.generate_short_id(size integer default 5)
returns text
language sql
volatile
as $$
  -- Берем случайную MD5 хеш-сумму и отрезаем от нее size символов.
  select upper(substr(md5(random()::text), 0, size + 1));
$$;

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------

create table public.queues (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    description      text,
    status           text not null default 'active',
    admin_secret_key text not null unique default gen_random_uuid(),
    window_count     integer not null default 1,
    short_id         text not null unique default public.generate_short_id(5),
    created_at       timestamptz not null default timezone('utc', now()),
    updated_at       timestamptz default now(),
    -- ИЗМЕНЕНО: в оригинале ограничений не было, status и window_count
    -- могли принимать любое значение.
    constraint queues_status_check check (status in ('active', 'paused')),
    constraint queues_window_count_check check (window_count between 1 and 20)
);

create table public.services (
    id         uuid primary key default gen_random_uuid(),
    queue_id   uuid not null references public.queues(id) on delete cascade,
    name       text not null,
    created_at timestamptz not null default now()
);
create index services_queue_id_idx on public.services (queue_id);

create table public.windows (
    id         uuid primary key default gen_random_uuid(),
    queue_id   uuid not null references public.queues(id) on delete cascade,
    name       text not null,
    short_key  text not null unique,
    created_at timestamptz not null default now()
);
create index windows_queue_id_idx on public.windows (queue_id);

create table public.window_services (
    window_id  uuid not null references public.windows(id)  on delete cascade,
    service_id uuid not null references public.services(id) on delete cascade,
    -- ИЗМЕНЕНО: в оригинале первичного ключа не было, одна и та же пара
    -- могла продублироваться.
    primary key (window_id, service_id)
);
create index window_services_service_id_idx on public.window_services (service_id);

create table public.queue_members (
    id                 uuid primary key default gen_random_uuid(),
    queue_id           uuid not null references public.queues(id) on delete cascade,
    member_name        text not null,
    display_code       text,
    ticket_number      integer not null,
    service_id         uuid references public.services(id) on delete set null,
    assigned_window_id uuid references public.windows(id)  on delete set null,
    status             text not null default 'waiting',
    called_at          timestamptz,
    acknowledged_at    timestamptz,
    created_at         timestamptz not null default timezone('utc', now()),
    updated_at         timestamptz default now(),
    constraint queue_members_status_check
        check (status in ('waiting', 'called', 'acknowledged', 'serviced')),
    -- ИЗМЕНЕНО: следствие перехода на нумерацию внутри очереди (см. ниже).
    unique (queue_id, ticket_number)
);
create index idx_queue_members_for_waiting_list
    on public.queue_members (queue_id, status, ticket_number);
create index queue_members_assigned_window_idx
    on public.queue_members (assigned_window_id);

-- ---------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------

-- ИЗМЕНЕНО. В оригинале ticket_number брался из ОДНОЙ ГЛОБАЛЬНОЙ
-- последовательности queue_members_ticket_number_seq, общей для всех
-- очередей: первый участник новой очереди мог получить талон №487,
-- потому что столько талонов выдали во всех очередях за всё время.
-- Нумерация теперь ведётся внутри очереди, как и обещает комментарий
-- к колонке в оригинале («Порядковый номер, генерируется автоматически»).
-- Блокировка строки очереди сериализует одновременные вставки — без неё
-- два участника получат один номер.
create or replace function public.tg_assign_ticket_number()
returns trigger
language plpgsql
as $$
begin
    if new.ticket_number is null then
        perform 1 from public.queues where id = new.queue_id for update;
        select coalesce(max(ticket_number), 0) + 1
          into new.ticket_number
          from public.queue_members
         where queue_id = new.queue_id;
    end if;
    return new;
end;
$$;

create trigger queue_members_assign_ticket_number
    before insert on public.queue_members
    for each row execute function public.tg_assign_ticket_number();

-- Запрет записи в приостановленную очередь.
-- Текст исключения важен: JoinPage.jsx ищет в нём 'Queue is currently paused'.
create or replace function public.check_queue_status_before_insert()
returns trigger
language plpgsql
security definer
as $$
DECLARE
  q_status TEXT;
BEGIN
  SELECT status INTO q_status FROM public.queues WHERE id = NEW.queue_id;

  IF q_status = 'paused' THEN
    RAISE EXCEPTION 'Queue is currently paused by the administrator';
  END IF;

  RETURN NEW;
END;
$$;

create trigger prevent_joining_paused_queue
    before insert on public.queue_members
    for each row execute function public.check_queue_status_before_insert();

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger queues_touch_updated_at
    before update on public.queues
    for each row execute function public.tg_touch_updated_at();

create trigger queue_members_touch_updated_at
    before update on public.queue_members
    for each row execute function public.tg_touch_updated_at();

-- =====================================================================
-- RPC-функции
-- Тела перенесены из оригинального проекта. Сигнатуры и имена параметров
-- совпадают с вызовами supabase.rpc() в клиенте — менять нельзя.
--
-- Правило подбора участника под окно (встречается в трёх функциях):
--   услуга не указана           -> подходит любому окну
--   услуга привязана к окну     -> подходит этому окну
--   услуга не привязана никуда  -> подходит всем окнам
-- Последнее и есть подсказка в интерфейсе: «Если не выбрать окна,
-- услуга будет доступна во всех».
-- =====================================================================

create or replace function public.create_queue_with_services_and_windows(
    p_name text, p_description text, p_window_count integer, p_services jsonb
) returns table(id uuid, name text, admin_secret_key text)
language plpgsql
as $$
DECLARE
    new_queue_id uuid;
    new_window_id uuid;
    new_service_id uuid;
    service_record jsonb;
    window_index integer;
    window_ids_array uuid[];
BEGIN
    INSERT INTO public.queues (name, description, window_count)
    VALUES (p_name, p_description, p_window_count)
    RETURNING public.queues.id INTO new_queue_id;

    FOR i IN 1..p_window_count LOOP
        INSERT INTO public.windows (queue_id, name, short_key)
        VALUES (new_queue_id, 'Окно ' || i, substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
        RETURNING public.windows.id INTO new_window_id;
        window_ids_array := array_append(window_ids_array, new_window_id);
    END LOOP;

    IF p_services IS NOT NULL AND jsonb_array_length(p_services) > 0 THEN
        FOR service_record IN SELECT * FROM jsonb_array_elements(p_services)
        LOOP
            INSERT INTO public.services (queue_id, name)
            VALUES (new_queue_id, service_record->>'name')
            RETURNING public.services.id INTO new_service_id;

            IF jsonb_array_length(service_record->'window_indices') > 0 THEN
                 -- window_indices приходят от клиента 1-based (ServiceRow.jsx),
                 -- массивы в Postgres тоже 1-based — индексы совпадают.
                 FOR window_index IN SELECT * FROM jsonb_array_elements_text(service_record->'window_indices')
                 LOOP
                    INSERT INTO public.window_services (window_id, service_id)
                    VALUES (window_ids_array[window_index], new_service_id)
                    ON CONFLICT DO NOTHING;
                 END LOOP;
            END IF;
        END LOOP;
    END IF;

    RETURN QUERY
    SELECT q.id, q.name, q.admin_secret_key
    FROM public.queues q
    WHERE q.id = new_queue_id;
END;
$$;

create or replace function public.get_queue_details_for_joining(p_queue_id uuid)
returns json
language sql
stable
as $$
  SELECT json_build_object(
      'queue', (
        SELECT json_build_object('id', q.id, 'name', q.name, 'description', q.description, 'status', q.status)
        FROM public.queues q WHERE q.id = p_queue_id
      ),
      'services', (
        SELECT COALESCE(
            json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name),
            '[]'::json)
        FROM public.services s WHERE s.queue_id = p_queue_id
      )
    );
$$;

create or replace function public.get_window_admin_initial_data(p_short_key text)
returns json
language sql
stable
as $$
  WITH window_data AS (
    SELECT id, queue_id FROM public.windows WHERE short_key = p_short_key
  )
  SELECT json_build_object(
    'windowInfo', (
      SELECT json_build_object('id', id, 'name', name, 'queue_id', queue_id)
      FROM public.windows WHERE id = (SELECT id FROM window_data)
    ),
    'queueInfo', (
      SELECT json_build_object('id', id, 'name', name, 'short_id', short_id, 'status', status)
      FROM public.queues WHERE id = (SELECT queue_id FROM window_data)
    ),
    'members', (
      -- service_name здесь ПЛОСКАЯ СТРОКА: WindowAdminPage рендерит
      -- {member.service_name} прямо как текст. Объект уронит React.
      -- В AdminPage то же поле приходит объектом {name} — там данные идут
      -- из PostgREST-embed, а не отсюда. Формы намеренно разные.
      SELECT COALESCE(json_agg(t.* ORDER BY ticket_number), '[]'::json)
      FROM (
        SELECT
            m.id, m.created_at, m.queue_id, m.member_name, m.status, m.ticket_number,
            m.display_code, m.service_id, m.assigned_window_id, m.acknowledged_at,
            s.name as service_name
        FROM public.queue_members m
        LEFT JOIN public.services s ON m.service_id = s.id
        WHERE m.queue_id = (SELECT queue_id FROM window_data)
          AND m.status IN ('waiting', 'called', 'acknowledged', 'serviced')
          AND (
              m.assigned_window_id = (SELECT id FROM window_data) OR
              (m.status = 'waiting' AND (
                  m.service_id IS NULL OR
                  m.service_id IN (SELECT ws.service_id FROM public.window_services ws WHERE ws.window_id = (SELECT id FROM window_data)) OR
                  NOT EXISTS (SELECT 1 FROM public.window_services ws WHERE ws.service_id = m.service_id)
              ))
          )
      ) t
    )
  )
$$;

create or replace function public.call_next_member_to_window(p_window_id uuid)
returns uuid
language plpgsql
as $$
DECLARE
    v_queue_id uuid;
    v_member_to_call_id uuid;
BEGIN
    SELECT queue_id INTO v_queue_id FROM public.windows WHERE id = p_window_id;

    SELECT m.id INTO v_member_to_call_id
    FROM public.queue_members m
    WHERE m.queue_id = v_queue_id
      AND m.status = 'waiting'
      AND (
        m.service_id IS NULL OR
        m.service_id IN (SELECT ws.service_id FROM public.window_services ws WHERE ws.window_id = p_window_id) OR
        NOT EXISTS (SELECT 1 FROM public.window_services ws WHERE ws.service_id = m.service_id)
      )
    ORDER BY m.ticket_number ASC
    LIMIT 1;

    IF v_member_to_call_id IS NOT NULL THEN
        UPDATE public.queue_members
        SET status = 'called',
            assigned_window_id = p_window_id,
            -- ИЗМЕНЕНО: в оригинале колонка called_at существовала, но её
            -- никто не заполнял. Без неё не посчитать фактическое время
            -- обслуживания, а значит и прогноз ожидания.
            called_at = now(),
            acknowledged_at = NULL
        WHERE id = v_member_to_call_id;

        RETURN v_member_to_call_id;
    END IF;

    RETURN NULL;
END;
$$;

create or replace function public.set_services_for_window(
    p_window_id uuid, p_service_ids uuid[]
) returns void
language plpgsql
as $$
BEGIN
    DELETE FROM public.window_services WHERE window_id = p_window_id;

    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        INSERT INTO public.window_services (window_id, service_id)
        SELECT p_window_id, unnest(p_service_ids)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

create or replace function public.update_service_window_assignments(
    p_service_id uuid, p_window_ids uuid[]
) returns void
language plpgsql
as $$
BEGIN
    DELETE FROM public.window_services WHERE service_id = p_service_id;

    IF p_window_ids IS NOT NULL AND array_length(p_window_ids, 1) > 0 THEN
        INSERT INTO public.window_services (window_id, service_id)
        SELECT unnest(p_window_ids), p_service_id
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

create or replace function public.add_windows_to_queue(
    p_queue_id uuid, p_new_window_count integer
) returns void
language plpgsql
as $$
DECLARE
    v_current integer;
    i integer;
BEGIN
    SELECT count(*) INTO v_current FROM public.windows WHERE queue_id = p_queue_id;

    IF p_new_window_count > v_current THEN
        FOR i IN (v_current + 1)..p_new_window_count LOOP
            INSERT INTO public.windows (queue_id, name, short_key)
            VALUES (p_queue_id, 'Окно ' || i, substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        END LOOP;

        UPDATE public.queues SET window_count = p_new_window_count WHERE id = p_queue_id;
    END IF;
END;
$$;

-- =====================================================================
-- Realtime
-- Клиент подписывается на queue_members, queues, services, window_services.
-- DELETE-события приходят с заполненным payload.old только при
-- replica identity full — код читает payload.old.id при удалении очереди.
-- =====================================================================

alter publication supabase_realtime add table public.queues;
alter publication supabase_realtime add table public.queue_members;
alter publication supabase_realtime add table public.services;
alter publication supabase_realtime add table public.windows;
alter publication supabase_realtime add table public.window_services;

alter table public.queues        replica identity full;
alter table public.queue_members replica identity full;

-- =====================================================================
-- RLS
--
-- ВНИМАНИЕ: это воспроизведение оригинальной модели доступа, и она дырявая.
-- Приложение работает без аутентификации, anon-ключ лежит в JS-бандле,
-- политики разрешают всё. Практически это значит, что любой может прочитать
-- имена всех участников всех очередей и удалить чужую очередь.
-- В оригинале было 20+ дублирующих друг друга политик вида USING (true) —
-- здесь они сведены к одной на таблицу, смысл тот же.
--
-- Схема приведена в исходное рабочее состояние намеренно: сначала
-- убеждаемся, что приложение живо на новой базе, и только потом
-- переводим доступ на анонимную авторизацию и проверку ключей
-- внутри SECURITY DEFINER-функций (миграция 0002).
-- =====================================================================

alter table public.queues          enable row level security;
alter table public.services        enable row level security;
alter table public.windows         enable row level security;
alter table public.window_services enable row level security;
alter table public.queue_members   enable row level security;

create policy "anon full access" on public.queues
    for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.services
    for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.windows
    for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.window_services
    for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.queue_members
    for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
