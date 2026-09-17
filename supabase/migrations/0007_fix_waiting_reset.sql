-- =====================================================================
-- Обнулять пометку и таймер только при настоящем возврате в очередь
--
-- В 0004 к сбросу отметок времени добавились note и timer_ends_at, но
-- условие осталось прежним: «new.status = 'waiting'». Оно верно для
-- перехода и неверно для всего остального — триггер срабатывает на
-- КАЖДОЕ обновление строки, и у ожидающего участника пометка стиралась
-- сразу же, как её записали.
--
-- На отметках времени это не было заметно: called_at и остальные у
-- ожидающего и так пусты. А пометку организатор ставит заранее —
-- «катамаран для Ивана» — и она пропадала молча.
--
-- Проверяем именно смену статуса.
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
