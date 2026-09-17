-- =====================================================================
-- Приём под таймер привязывает участника к окну
--
-- Раньше start_member_session полагался на то, что человека сперва
-- вызвали: вызов проставляет assigned_window_id, а панель окна ищет
-- своих именно по нему. Управление переехало на карточки, и запустить
-- таймер можно кому угодно, минуя вызов, — без привязки такой участник
-- пропал бы из панели совсем.
--
-- Заодно проставляем called_at, если его не было: без него из пары
-- called_at/serviced_at не посчитать длительность, а значит и прогноз
-- ожидания для тех, кто ещё в очереди.
-- =====================================================================

-- Старая трёхаргументная версия именно УДАЛЯЕТСЯ, а не заменяется:
-- create or replace с другим списком аргументов заводит перегрузку, и
-- вызов с тремя именованными аргументами становится неоднозначным —
-- PostgREST в такой ситуации отвечает ошибкой, а не выбирает одну.
drop function if exists public.start_member_session(uuid, text, integer);

create or replace function public.start_member_session(
    p_member_id uuid,
    p_note      text default null,
    p_minutes   integer default null,
    p_window_id uuid default null
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

    if p_window_id is not null
       and not exists (select 1 from public.windows w
                        where w.id = p_window_id and w.queue_id = v_member.queue_id) then
        raise exception 'Window does not belong to this queue';
    end if;

    update public.queue_members
       set status             = 'in_service',
           -- null означает «не трогать»: пометку часто набирают до того,
           -- как запускают время, и запуск не должен её стирать.
           -- Пустая строка — осознанная очистка.
           note               = case when p_note is null then note
                                     else nullif(btrim(p_note), '') end,
           assigned_window_id = coalesce(p_window_id, assigned_window_id),
           called_at          = coalesce(called_at, now()),
           timer_ends_at = case
               when p_minutes is null or p_minutes <= 0 then null
               else now() + make_interval(mins => p_minutes)
           end
     where id = p_member_id
    returning * into v_member;

    return v_member;
end;
$$;

grant execute on function public.start_member_session(uuid, text, integer, uuid) to authenticated;
