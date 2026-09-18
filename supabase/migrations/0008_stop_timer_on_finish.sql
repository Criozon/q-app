-- =====================================================================
-- Завершение приёма гасит таймер
--
-- Участника закрывали, он уходил в зачёркнутые — а отсчёт продолжал
-- идти и через минуту показывал просрочку. Для лодочника это прямая
-- ложь: лодку вернули раньше срока, закрыли досрочно, и напоминать
-- уже не о чем.
--
-- Пометку при этом НЕ трогаем: она говорит, что человеку выдавали,
-- и после закрытия остаётся полезной записью.
-- =====================================================================

create or replace function public.tg_track_status_timestamps()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'acknowledged' and old.status is distinct from 'acknowledged' then
        new.acknowledged_at := now();
    elsif new.status = 'serviced' and old.status is distinct from 'serviced' then
        new.serviced_at := now();
        -- Досрочно или вовремя — время вышло вместе с приёмом.
        new.timer_ends_at := null;
    elsif new.status = 'waiting' and old.status is distinct from 'waiting' then
        new.acknowledged_at := null;
        new.called_at := null;
        new.serviced_at := null;
        new.note := null;
        new.timer_ends_at := null;
    end if;
    return new;
end;
$$;

-- Те, кого успели закрыть с идущим таймером, до сих пор тикают.
--
-- Сторожевой триггер из 0005 пускает к таймеру только персонал очереди,
-- а у миграции нет auth.uid() — она и не участник, и не персонал. Гасим
-- его на время правки: это разовая починка данных, а не чей-то запрос.
alter table public.queue_members disable trigger queue_members_guard_session_fields;

update public.queue_members
   set timer_ends_at = null
 where status = 'serviced'
   and timer_ends_at is not null;

alter table public.queue_members enable trigger queue_members_guard_session_fields;
