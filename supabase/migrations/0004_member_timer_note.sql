-- =====================================================================
-- Таймер и заметка у участника
--
-- Зачем: есть случаи, где обслуживание не заканчивается за минуту у
-- стойки. Прокат лодок, солярий, картинг — человек уходит с чем-то на
-- время, и администратору нужно помнить, что именно он выдал и когда
-- это заканчивается. Раньше такой участник либо сразу закрывался
-- (и пропадал из виду), либо висел вызванным и блокировал окно.
--
-- Сознательно НЕ делаем: учёта самих единиц (какая лодка свободна,
-- какая на обработке, какая сломана). Администратор видит свои лодки
-- глазами, приложение здесь помощник, а не система учёта. Поэтому
-- заметка — свободный текст, а состояний ровно столько же, сколько
-- было плюс одно.
-- =====================================================================

alter table public.queue_members
    add column if not exists note          text,
    add column if not exists timer_ends_at timestamptz;

comment on column public.queue_members.note is
    'Свободная пометка администратора: «Катамаран 3», «Кабина 2». Видна и участнику.';
comment on column public.queue_members.timer_ends_at is
    'Когда истекает выданное время. null — таймер не заводили.';

-- Новый статус in_service: участник принят, у него идёт время.
-- В отличие от called/acknowledged таких может быть сколько угодно
-- на одно окно — в этом весь смысл.
alter table public.queue_members
    drop constraint if exists queue_members_status_check;
alter table public.queue_members
    add constraint queue_members_status_check
    check (status in ('waiting', 'called', 'acknowledged', 'in_service', 'serviced'));

-- Возврат в очередь обнуляет и пометку с таймером: иначе человек
-- вернётся в список ожидания с чужим катамараном в карточке.
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
        new.note := null;
        new.timer_ends_at := null;
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Выдача и продление
--
-- Время считает сервер, а не устройство администратора: иначе часы,
-- убежавшие на пять минут, сдвинут таймеры у всех участников сразу.
-- ---------------------------------------------------------------------

create or replace function public.start_member_session(
    p_member_id uuid,
    p_note      text default null,
    p_minutes   integer default null
) returns public.queue_members
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_member public.queue_members;
begin
    select * into v_member from public.queue_members where id = p_member_id;
    if not found then
        raise exception 'Member not found';
    end if;
    if not public.has_queue_access(v_member.queue_id) then
        raise exception 'Access denied';
    end if;

    update public.queue_members
       set status        = 'in_service',
           note          = nullif(btrim(coalesce(p_note, '')), ''),
           timer_ends_at = case
               when p_minutes is null or p_minutes <= 0 then null
               else now() + make_interval(mins => p_minutes)
           end
     where id = p_member_id
    returning * into v_member;

    return v_member;
end;
$$;

-- Продление: минуты добавляются к концу, а если время уже вышло —
-- отсчитываются заново от текущего момента. Администратор в обоих
-- случаях имеет в виду «даю ещё столько-то».
create or replace function public.extend_member_timer(
    p_member_id uuid,
    p_minutes   integer
) returns public.queue_members
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_member public.queue_members;
begin
    select * into v_member from public.queue_members where id = p_member_id;
    if not found then
        raise exception 'Member not found';
    end if;
    if not public.has_queue_access(v_member.queue_id) then
        raise exception 'Access denied';
    end if;
    if p_minutes is null or p_minutes <= 0 then
        raise exception 'Minutes must be positive';
    end if;

    update public.queue_members
       set timer_ends_at = greatest(now(), coalesce(timer_ends_at, now()))
                           + make_interval(mins => p_minutes)
     where id = p_member_id
    returning * into v_member;

    return v_member;
end;
$$;

grant execute on function public.start_member_session(uuid, text, integer) to authenticated;
grant execute on function public.extend_member_timer(uuid, integer)        to authenticated;

-- ---------------------------------------------------------------------
-- Панель окна: отдаём новые поля и серверное время
--
-- ВАЖНО: без 'in_service' в фильтре участники с идущим таймером просто
-- пропадают из панели — именно те, ради кого всё затевалось.
--
-- server_now нужен, чтобы отсчёт на экране не зависел от того, насколько
-- врут часы устройства: клиент один раз считает поправку и дальше
-- обходится своими силами, в том числе без связи.
-- ---------------------------------------------------------------------
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
    'server_now', now(),
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
            m.note, m.timer_ends_at,
            s.name as service_name
        FROM public.queue_members m
        LEFT JOIN public.services s ON m.service_id = s.id
        WHERE m.queue_id = (SELECT queue_id FROM window_data)
          AND m.status IN ('waiting', 'called', 'acknowledged', 'in_service', 'serviced')
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

-- ---------------------------------------------------------------------
-- Страница ожидания: своя пометка, свой таймер, серверное время
-- ---------------------------------------------------------------------
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
            'note', v_member.note,
            'timer_ends_at', v_member.timer_ends_at,
            'service_name', (select name from public.services where id = v_member.service_id),
            'window_name', (select name from public.windows where id = v_member.assigned_window_id)
        ),
        'queue', json_build_object(
            'id', v_queue.id, 'name', v_queue.name,
            'status', v_queue.status, 'window_count', v_queue.window_count
        ),
        'people_ahead', v_ahead,
        'server_now', now(),
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
