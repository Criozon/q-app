-- =====================================================================
-- Правки статистики
--
-- 1. Пик нагрузки считался через date_trunc по timestamptz и выдавался
--    строкой 'HH24:00' — то есть в UTC. Организатор в Минске видел 15:00
--    там, где наплыв был в 18:00. Теперь возвращаем момент времени, а
--    форматирует его клиент в часовом поясе того, кто смотрит.
--
-- 2. avg_service_minutes подставляла 4 минуты, когда обслуженных ещё нет.
--    Для прогноза участнику это разумно — нужно хоть какое-то число.
--    Но в итогах это выдача выдуманного значения за измеренное, поэтому
--    здесь возвращаем null, а интерфейс показывает прочерк.
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
        -- null, если мерить ещё нечего
        'avg_service_minutes', (
            select round(avg(extract(epoch from (serviced_at - called_at)) / 60.0)::numeric, 1)
              from public.queue_members
             where queue_id = p_queue_id
               and serviced_at is not null and called_at is not null
               and serviced_at > called_at),
        'avg_wait_minutes', (
            select round(avg(extract(epoch from (called_at - created_at)) / 60.0)::numeric, 1)
              from public.queue_members
             where queue_id = p_queue_id and called_at is not null),
        'deferred_total', (select count(*) from public.queue_members
                            where queue_id = p_queue_id and defer_count > 0),
        -- Момент времени, а не готовая строка: часовой пояс знает клиент.
        'peak_hour_at', (
            select date_trunc('hour', created_at)
              from public.queue_members
             where queue_id = p_queue_id
             group by date_trunc('hour', created_at)
             order by count(*) desc, date_trunc('hour', created_at)
             limit 1),
        'by_window', (
            select coalesce(json_agg(json_build_object(
                       'window_name', w.name,
                       'served', (select count(*) from public.queue_members m
                                   where m.assigned_window_id = w.id and m.status = 'serviced'),
                       'avg_minutes', (select round(avg(extract(epoch from (m.serviced_at - m.called_at)) / 60.0)::numeric, 1)
                                         from public.queue_members m
                                        where m.assigned_window_id = w.id and m.serviced_at is not null)
                   ) order by w.name), '[]'::json)
              from public.windows w where w.queue_id = p_queue_id)
    ) into v_result;

    return v_result;
end;
$$;
