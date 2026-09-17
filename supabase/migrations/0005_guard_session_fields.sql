-- =====================================================================
-- Пометку и таймер меняет только персонал очереди
--
-- Политика «member updates own row» разрешает участнику править свою
-- строку целиком — так было и раньше. Но теперь в строке лежит время,
-- за которое лодочник берёт деньги, и участник мог бы отодвинуть его
-- себе сам, обратившись к API напрямую.
--
-- Колоночных ограничений в RLS нет, поэтому проверяем триггером.
-- Имя выбрано так, чтобы он сработал РАНЬШЕ
-- queue_members_track_status_timestamps (триггеры одного типа идут по
-- алфавиту): тот при возврате в очередь сам обнуляет пометку и таймер,
-- и проверять надо до него — иначе его же работа выглядела бы как
-- самовольная правка.
-- =====================================================================

create or replace function public.tg_guard_session_fields()
returns trigger
language plpgsql
as $$
begin
    if (new.note is distinct from old.note
        or new.timer_ends_at is distinct from old.timer_ends_at)
       and not public.has_queue_access(new.queue_id) then
        raise exception 'Only queue staff can change note or timer';
    end if;
    return new;
end;
$$;

drop trigger if exists queue_members_guard_session_fields on public.queue_members;
create trigger queue_members_guard_session_fields
    before update on public.queue_members
    for each row execute function public.tg_guard_session_fields();
