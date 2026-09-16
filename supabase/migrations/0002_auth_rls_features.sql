-- =====================================================================
-- Q-App — анонимная авторизация, разграничение доступа и новые функции
--
-- Проблема, которую закрываем: anon-ключ лежит в JS-бандле и доступен
-- любому, а политики из 0001 разрешают всё. Практически это значит, что
-- кто угодно из консоли браузера может прочитать имена всех участников
-- всех очередей и удалить чужую очередь.
--
-- Модель доступа после этой миграции — гибридная, потому что права здесь
-- двух разных природ:
--
--   ЛИЧНОСТЬ. Участник владеет своим талоном. Каждый посетитель получает
--   анонимный JWT (Supabase Anonymous Sign-In) со стабильным auth.uid();
--   для пользователя это невидимо и не добавляет ни одного действия.
--
--   КЛЮЧ-ПРОПУСК. Права администратора очереди и оператора окна держатся
--   на знании ссылки (admin_secret_key, short_key), и ссылку можно
--   переслать коллеге на другое устройство. Поэтому ключ обменивается
--   на запись в queue_access, привязанную к auth.uid(): ссылка работает
--   на любом устройстве, но прямой доступ к таблицам есть только у тех,
--   кто ключ предъявил.
--
-- Почему не всё через RPC: после обмена ключа RLS пускает админа и
-- оператора к таблицам напрямую — иначе не работает Realtime, он тоже
-- подчиняется RLS. Клиентский код от этого почти не меняется.
--
-- ВАЖНО: анонимные пользователи приходят с ролью authenticated
-- (не anon), поэтому политики навешиваются на authenticated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Схема: владение, пропуска, поля под новые функции
-- ---------------------------------------------------------------------

alter table public.queues
    add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.queue_members
    add column if not exists user_id uuid references auth.users(id) on delete set null,
    -- Порядок вызова. Изначально равен номеру талона, но «отложить вызов»
    -- двигает участника назад, не трогая его номер.
    add column if not exists sort_order integer,
    -- Момент завершения обслуживания. Вместе с called_at даёт фактическую
    -- длительность приёма — на ней строится прогноз времени ожидания.
    add column if not exists serviced_at timestamptz,
    add column if not exists defer_count integer not null default 0;

update public.queue_members set sort_order = ticket_number where sort_order is null;
alter table public.queue_members alter column sort_order set not null;

create index if not exists queue_members_sort_idx
    on public.queue_members (queue_id, status, sort_order);
create index if not exists queue_members_user_idx
    on public.queue_members (user_id);

-- Пропуска: результат обмена секретной ссылки на доступ.
create table if not exists public.queue_access (
    id         uuid primary key default gen_random_uuid(),
    queue_id   uuid not null references public.queues(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null check (role in ('admin', 'operator')),
    window_id  uuid references public.windows(id) on delete cascade,
    granted_at timestamptz not null default now()
);
create unique index if not exists queue_access_admin_uniq
    on public.queue_access (queue_id, user_id) where role = 'admin';
create unique index if not exists queue_access_operator_uniq
    on public.queue_access (queue_id, user_id, window_id) where role = 'operator';
create index if not exists queue_access_user_idx on public.queue_access (user_id);

-- Объявления организатора: односторонний канал ко всем ожидающим.
create table if not exists public.queue_announcements (
    id         uuid primary key default gen_random_uuid(),
    queue_id   uuid not null references public.queues(id) on delete cascade,
    body       text not null check (length(btrim(body)) between 1 and 500),
    created_at timestamptz not null default now()
);
create index if not exists queue_announcements_queue_idx
    on public.queue_announcements (queue_id, created_at desc);

-- ---------------------------------------------------------------------
-- Предикаты для политик
--
-- Все SECURITY DEFINER: такая функция выполняется от владельца и не
-- подчиняется RLS, иначе проверка доступа к таблице рекурсивно вызвала бы
-- саму себя при проверке доступа к таблице.
-- ---------------------------------------------------------------------

create or replace function public.has_queue_access(p_queue_id uuid, p_role text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.queue_access a
         where a.queue_id = p_queue_id
           and a.user_id = auth.uid()
           and (p_role is null or a.role = p_role)
    );
$$;

create or replace function public.is_queue_member(p_queue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.queue_members m
         where m.queue_id = p_queue_id
           and m.user_id = auth.uid()
    );
$$;

-- Окно, за которым закреплён текущий пользователь в этой очереди.
create or replace function public.my_window_id(p_queue_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select a.window_id from public.queue_access a
     where a.queue_id = p_queue_id and a.user_id = auth.uid() and a.role = 'operator'
     limit 1;
$$;

-- =====================================================================
-- Политики доступа
-- Сносим разрешительные политики из 0001 и ставим адресные.
-- =====================================================================

drop policy if exists "anon full access" on public.queues;
drop policy if exists "anon full access" on public.services;
drop policy if exists "anon full access" on public.windows;
drop policy if exists "anon full access" on public.window_services;
drop policy if exists "anon full access" on public.queue_members;

alter table public.queue_access        enable row level security;
alter table public.queue_announcements enable row level security;

-- Неаутентифицированная роль не получает ничего: до анонимного входа
-- приложение работать не должно, а всё публичное идёт через
-- SECURITY DEFINER-функции.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---- queues ----------------------------------------------------------
create policy "read for members and staff" on public.queues
    for select to authenticated
    using (public.has_queue_access(id) or public.is_queue_member(id));

create policy "admin manages queue" on public.queues
    for update to authenticated
    using (public.has_queue_access(id, 'admin'))
    with check (public.has_queue_access(id, 'admin'));

create policy "admin deletes queue" on public.queues
    for delete to authenticated
    using (public.has_queue_access(id, 'admin'));

-- ---- services / windows / window_services ----------------------------
-- Видны всем, кто имеет отношение к очереди; менять может только админ.
create policy "read for members and staff" on public.services
    for select to authenticated
    using (public.has_queue_access(queue_id) or public.is_queue_member(queue_id));
create policy "admin writes" on public.services
    for all to authenticated
    using (public.has_queue_access(queue_id, 'admin'))
    with check (public.has_queue_access(queue_id, 'admin'));

create policy "read for members and staff" on public.windows
    for select to authenticated
    using (public.has_queue_access(queue_id) or public.is_queue_member(queue_id));
create policy "admin writes" on public.windows
    for all to authenticated
    using (public.has_queue_access(queue_id, 'admin'))
    with check (public.has_queue_access(queue_id, 'admin'));

create policy "read for staff" on public.window_services
    for select to authenticated
    using (exists (select 1 from public.windows w
                    where w.id = window_id and public.has_queue_access(w.queue_id)));
create policy "admin writes" on public.window_services
    for all to authenticated
    using (exists (select 1 from public.windows w
                    where w.id = window_id and public.has_queue_access(w.queue_id, 'admin')))
    with check (exists (select 1 from public.windows w
                    where w.id = window_id and public.has_queue_access(w.queue_id, 'admin')));

-- ---- queue_members ---------------------------------------------------
-- Участник видит и меняет только свою строку. Это и закрывает главную
-- дыру: чужие имена больше не вычитать. Побочный эффект — Realtime
-- тоже подчиняется RLS, поэтому участнику приходят события только по
-- собственной строке, а «перед вами N» считается отдельной функцией.
create policy "member reads own row" on public.queue_members
    for select to authenticated
    using (user_id = auth.uid());

create policy "staff reads queue members" on public.queue_members
    for select to authenticated
    using (public.has_queue_access(queue_id));

create policy "member updates own row" on public.queue_members
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "staff updates queue members" on public.queue_members
    for update to authenticated
    using (public.has_queue_access(queue_id))
    with check (public.has_queue_access(queue_id));

create policy "member leaves queue" on public.queue_members
    for delete to authenticated
    using (user_id = auth.uid());

create policy "staff removes members" on public.queue_members
    for delete to authenticated
    using (public.has_queue_access(queue_id));

-- Вставка только через join_queue(): так user_id проставляется на сервере
-- и его нельзя подделать.

-- ---- queue_access ----------------------------------------------------
-- Пропуска выдаются только функциями обмена ключа; пользователю видны
-- лишь собственные.
create policy "read own grants" on public.queue_access
    for select to authenticated
    using (user_id = auth.uid());

-- ---- queue_announcements ---------------------------------------------
create policy "read for members and staff" on public.queue_announcements
    for select to authenticated
    using (public.has_queue_access(queue_id) or public.is_queue_member(queue_id));

create policy "admin writes" on public.queue_announcements
    for all to authenticated
    using (public.has_queue_access(queue_id, 'admin'))
    with check (public.has_queue_access(queue_id, 'admin'));

alter publication supabase_realtime add table public.queue_announcements;

-- =====================================================================
-- Обмен ключа на пропуск
--
-- Ссылку можно переслать на другое устройство — там будет другой
-- auth.uid(), и он точно так же обменяет ключ на свой пропуск.
-- Именно это сохраняет текущее поведение «ссылка работает у всех,
-- кому её дали».
-- =====================================================================

create or replace function public.claim_queue_admin(p_secret_key text)
returns public.queues
language plpgsql
security definer
set search_path = public
as $$
declare
    v_queue public.queues;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select * into v_queue from public.queues where admin_secret_key = p_secret_key;
    if not found then
        raise exception 'Queue not found';
    end if;

    insert into public.queue_access (queue_id, user_id, role)
    values (v_queue.id, auth.uid(), 'admin')
    on conflict do nothing;

    return v_queue;
end;
$$;

create or replace function public.claim_window_operator(p_short_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_window public.windows;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select * into v_window from public.windows where short_key = p_short_key;
    if not found then
        raise exception 'Window not found';
    end if;

    insert into public.queue_access (queue_id, user_id, role, window_id)
    values (v_window.queue_id, auth.uid(), 'operator', v_window.id)
    on conflict do nothing;

    return json_build_object('id', v_window.id, 'name', v_window.name, 'queue_id', v_window.queue_id);
end;
$$;

-- =====================================================================
-- Создание очереди: владелец и пропуск проставляются сразу
-- =====================================================================

create or replace function public.create_queue_with_services_and_windows(
    p_name text, p_description text, p_window_count integer, p_services jsonb
) returns table(id uuid, name text, admin_secret_key text)
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    new_queue_id uuid;
    new_window_id uuid;
    new_service_id uuid;
    service_record jsonb;
    window_index integer;
    window_ids_array uuid[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO public.queues (name, description, window_count, owner_id)
    VALUES (p_name, p_description, p_window_count, auth.uid())
    RETURNING public.queues.id INTO new_queue_id;

    INSERT INTO public.queue_access (queue_id, user_id, role)
    VALUES (new_queue_id, auth.uid(), 'admin');

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

-- =====================================================================
-- Публичная часть: вход в очередь
-- Доступна без пропуска — участник на этот момент ещё никто.
-- =====================================================================

create or replace function public.get_queue_for_join(p_short_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  SELECT json_build_object(
      'queue', (SELECT json_build_object('id', q.id, 'name', q.name,
                                         'description', q.description, 'status', q.status)
                  FROM public.queues q WHERE q.short_id = p_short_id),
      'services', (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::json)
                     FROM public.services s
                     JOIN public.queues q ON q.id = s.queue_id
                    WHERE q.short_id = p_short_id)
  );
$$;

create or replace function public.join_queue(
    p_short_id text, p_member_name text, p_service_id uuid default null
) returns public.queue_members
language plpgsql
security definer
set search_path = public
as $$
declare
    v_queue    public.queues;
    v_member   public.queue_members;
    v_code     text;
    v_chars    constant text := 'ACEHKMOPTX';
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if coalesce(btrim(p_member_name), '') = '' then
        raise exception 'Name is required';
    end if;

    select * into v_queue from public.queues where short_id = p_short_id;
    if not found then
        raise exception 'Queue not found';
    end if;
    -- Триггер prevent_joining_paused_queue отработает и здесь, но проверяем
    -- явно, чтобы не полагаться на порядок срабатывания.
    if v_queue.status = 'paused' then
        raise exception 'Queue is currently paused by the administrator';
    end if;
    if p_service_id is not null
       and not exists (select 1 from public.services s
                        where s.id = p_service_id and s.queue_id = v_queue.id) then
        raise exception 'Service does not belong to this queue';
    end if;

    v_code := substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1)
              || lpad(floor(10 + random() * 90)::text, 2, '0');

    insert into public.queue_members (queue_id, member_name, display_code, service_id, user_id)
    values (v_queue.id, btrim(p_member_name), v_code, p_service_id, auth.uid())
    returning * into v_member;

    return v_member;
end;
$$;

-- =====================================================================
-- Порядок вызова и отметки времени
-- =====================================================================

-- Нумерация талонов теперь заодно задаёт начальный порядок вызова.
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
    if new.sort_order is null then
        new.sort_order := new.ticket_number;
    end if;
    return new;
end;
$$;

-- Фиксируем момент завершения обслуживания — без него не посчитать
-- фактическую длительность приёма, а значит и прогноз ожидания.
create or replace function public.tg_track_status_timestamps()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'acknowledged' and old.status is distinct from 'acknowledged' then
        new.acknowledged_at := now();
    elsif new.status = 'serviced' and old.status is distinct from 'serviced' then
        new.serviced_at := now();
    elsif new.status = 'waiting' then
        new.acknowledged_at := null;
        new.called_at := null;
        new.serviced_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists queue_members_track_status_timestamps on public.queue_members;
create trigger queue_members_track_status_timestamps
    before update on public.queue_members
    for each row execute function public.tg_track_status_timestamps();

-- Вызов следующего — теперь по sort_order (учитывает отложенные)
-- и с проверкой, что вызывающий закреплён за этим окном.
create or replace function public.call_next_member_to_window(p_window_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_queue_id uuid;
    v_member_to_call_id uuid;
BEGIN
    SELECT queue_id INTO v_queue_id FROM public.windows WHERE id = p_window_id;
    IF v_queue_id IS NULL THEN
        RAISE EXCEPTION 'Window not found';
    END IF;
    IF NOT public.has_queue_access(v_queue_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT m.id INTO v_member_to_call_id
    FROM public.queue_members m
    WHERE m.queue_id = v_queue_id
      AND m.status = 'waiting'
      AND (
        m.service_id IS NULL OR
        m.service_id IN (SELECT ws.service_id FROM public.window_services ws WHERE ws.window_id = p_window_id) OR
        NOT EXISTS (SELECT 1 FROM public.window_services ws WHERE ws.service_id = m.service_id)
      )
    ORDER BY m.sort_order ASC
    LIMIT 1;

    IF v_member_to_call_id IS NOT NULL THEN
        UPDATE public.queue_members
        SET status = 'called',
            assigned_window_id = p_window_id,
            called_at = now(),
            acknowledged_at = NULL
        WHERE id = v_member_to_call_id;

        RETURN v_member_to_call_id;
    END IF;

    RETURN NULL;
END;
$$;

-- «Отложить вызов»: участник отходит и пропускает вперёд остальных,
-- не теряя очередь совсем. Одностороннее действие — контрагент не нужен,
-- договариваться не с кем, местами не торгуют.
create or replace function public.defer_my_call(p_member_id uuid, p_skip integer default 3)
returns public.queue_members
language plpgsql
security definer
set search_path = public
as $$
declare
    v_member  public.queue_members;
    v_target  integer;
begin
    select * into v_member from public.queue_members where id = p_member_id;
    if not found then
        raise exception 'Member not found';
    end if;
    if v_member.user_id is distinct from auth.uid() then
        raise exception 'Access denied';
    end if;
    if v_member.status not in ('waiting', 'called') then
        raise exception 'Cannot defer in status %', v_member.status;
    end if;
    if v_member.defer_count >= 3 then
        raise exception 'Defer limit reached';
    end if;

    -- Встаём после p_skip ближайших ожидающих; если их меньше — в конец.
    select coalesce(max(sort_order), v_member.sort_order)
      into v_target
      from (select sort_order
              from public.queue_members
             where queue_id = v_member.queue_id
               and status = 'waiting'
               and sort_order > v_member.sort_order
             order by sort_order
             limit p_skip) t;

    update public.queue_members
       set sort_order = v_target + 1,
           status = 'waiting',
           assigned_window_id = null,
           called_at = null,
           acknowledged_at = null,
           defer_count = v_member.defer_count + 1
     where id = p_member_id
    returning * into v_member;

    return v_member;
end;
$$;

-- =====================================================================
-- Страница ожидания: статус, прогноз, объявления — одним запросом
-- =====================================================================

-- Средняя длительность приёма в очереди, в минутах.
-- Берём последние 20 завершённых; пока статистики нет — 4 минуты
-- как нейтральная оценка, чтобы прогноз не прыгал на первых участниках.
create or replace function public.avg_service_minutes(p_queue_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select avg(extract(epoch from (serviced_at - called_at)) / 60.0)
           from (select serviced_at, called_at
                   from public.queue_members
                  where queue_id = p_queue_id
                    and serviced_at is not null
                    and called_at is not null
                    and serviced_at > called_at
                  order by serviced_at desc
                  limit 20) t),
        4.0);
$$;

create or replace function public.get_my_queue_status(p_member_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_member   public.queue_members;
    v_queue    public.queues;
    v_ahead    integer;
    v_windows  integer;
    v_avg      numeric;
begin
    select * into v_member from public.queue_members where id = p_member_id;
    if not found then
        return json_build_object('error', 'member_not_found');
    end if;
    -- Доступ: свой талон, либо персонал очереди.
    if v_member.user_id is distinct from auth.uid()
       and not public.has_queue_access(v_member.queue_id) then
        raise exception 'Access denied';
    end if;

    select * into v_queue from public.queues where id = v_member.queue_id;
    if not found then
        return json_build_object('error', 'queue_deleted');
    end if;

    select count(*) into v_ahead
      from public.queue_members m
     where m.queue_id = v_member.queue_id
       and m.status = 'waiting'
       and m.sort_order < v_member.sort_order;

    select greatest(count(*), 1) into v_windows
      from public.windows where queue_id = v_member.queue_id;

    v_avg := public.avg_service_minutes(v_member.queue_id);

    return json_build_object(
        'member', json_build_object(
            'id', v_member.id,
            'member_name', v_member.member_name,
            'display_code', v_member.display_code,
            'ticket_number', v_member.ticket_number,
            'status', v_member.status,
            'defer_count', v_member.defer_count,
            'service_name', (select name from public.services where id = v_member.service_id),
            'window_name', (select name from public.windows where id = v_member.assigned_window_id)
        ),
        'queue', json_build_object(
            'id', v_queue.id, 'name', v_queue.name,
            'status', v_queue.status, 'window_count', v_queue.window_count
        ),
        'people_ahead', v_ahead,
        -- Прогноз вместо позиции: человеку важно, успеет ли он выпить кофе,
        -- а не то, что перед ним семеро.
        'estimated_minutes', case
            when v_member.status <> 'waiting' then 0
            else greatest(1, ceil(v_ahead::numeric / v_windows * v_avg))::int
        end,
        'announcements', (
            select coalesce(json_agg(json_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at)
                                     order by a.created_at desc), '[]'::json)
              from public.queue_announcements a
             where a.queue_id = v_member.queue_id
        )
    );
end;
$$;

-- =====================================================================
-- Итоги для организатора
-- =====================================================================

create or replace function public.get_queue_stats(p_queue_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_result json;
begin
    if not public.has_queue_access(p_queue_id, 'admin') then
        raise exception 'Access denied';
    end if;

    select json_build_object(
        'served_total',   (select count(*) from public.queue_members
                            where queue_id = p_queue_id and status = 'serviced'),
        'waiting_now',    (select count(*) from public.queue_members
                            where queue_id = p_queue_id and status = 'waiting'),
        'avg_service_minutes', round(public.avg_service_minutes(p_queue_id), 1),
        'avg_wait_minutes', (
            select round(coalesce(avg(extract(epoch from (called_at - created_at)) / 60.0), 0)::numeric, 1)
              from public.queue_members
             where queue_id = p_queue_id and called_at is not null),
        'no_show_total',  (select count(*) from public.queue_members
                            where queue_id = p_queue_id and defer_count > 0),
        'peak_hour', (
            select to_char(date_trunc('hour', created_at), 'HH24:00')
              from public.queue_members
             where queue_id = p_queue_id
             group by date_trunc('hour', created_at)
             order by count(*) desc
             limit 1),
        'by_window', (
            select coalesce(json_agg(json_build_object(
                       'window_name', w.name,
                       'served', (select count(*) from public.queue_members m
                                   where m.assigned_window_id = w.id and m.status = 'serviced'),
                       'avg_minutes', (select round(coalesce(avg(extract(epoch from (m.serviced_at - m.called_at)) / 60.0), 0)::numeric, 1)
                                         from public.queue_members m
                                        where m.assigned_window_id = w.id and m.serviced_at is not null)
                   ) order by w.name), '[]'::json)
              from public.windows w where w.queue_id = p_queue_id)
    ) into v_result;

    return v_result;
end;
$$;

-- =====================================================================
-- Права на выполнение
-- Таблицы закрыты политиками, функции — явными проверками внутри.
-- =====================================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- anon нужен ровно один вызов — публичные данные страницы входа,
-- чтобы человек увидел название очереди до анонимного входа.
grant execute on function public.get_queue_for_join(text) to anon;
