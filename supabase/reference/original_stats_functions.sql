-- Функции статистики из оригинального проекта Supabase (бэкап от 16.07.2025).
-- В миграцию 0001 НЕ включены: клиент их не вызывает и интерфейса под них нет.
-- Сохранены потому, что это готовая основа под «итоги для организатора»:
-- сколько обслужено, сколько ждёт, в разрезе окон. Когда дойдут руки до этой
-- фичи — брать отсюда, а не писать заново.

CREATE FUNCTION public.get_window_stats(p_queue_id uuid) RETURNS TABLE(window_id uuid, window_name text, serviced_count bigint, waiting_count bigint)
    LANGUAGE plpgsql
    AS $$
declare
    waiting_no_service_count bigint;
begin
    -- 1. Считаем, сколько человек ожидает БЕЗ услуги
    select count(*)
    into waiting_no_service_count
    from queue_members qm
    where qm.queue_id = p_queue_id
      and qm.status = 'waiting'
      and qm.service_id is null;

    -- 2. Основной запрос
    return query
    with windows_in_queue as (
        -- Получаем все окна для данной очереди
        select id, name from windows where queue_id = p_queue_id
    ),
    serviced_counts as (
        -- Считаем обслуженных клиентов для каждого окна
        select
            assigned_window_id,
            count(id) as total
        from queue_members
        where queue_id = p_queue_id
          and status = 'serviced'
          and updated_at >= date_trunc('day', now())
          and assigned_window_id is not null
        group by assigned_window_id
    ),
    waiting_with_service_counts as (
        -- Считаем ожидающих клиентов, ВЫБРАВШИХ услугу, для каждого окна
        select
            ws.window_id,
            count(distinct qm.id) as total
        from window_services ws
        join queue_members qm on ws.service_id = qm.service_id
        where qm.queue_id = p_queue_id and qm.status = 'waiting' and qm.service_id is not null
        group by ws.window_id
    )
    -- Финальное объединение
    select
        w.id as window_id,
        w.name as window_name,
        coalesce(sc.total, 0)::bigint as serviced_count,
        -- К "услужливым" очередникам прибавляем "безуслужных", т.к. их может вызвать любое окно
        (coalesce(wc.total, 0) + waiting_no_service_count)::bigint as waiting_count
    from windows_in_queue w
    left join serviced_counts sc on w.id = sc.assigned_window_id
    left join waiting_with_service_counts wc on w.id = wc.window_id
    order by w.name;
end;
$$;

CREATE FUNCTION public.get_serviced_today_by_window(p_queue_id uuid) RETURNS TABLE(window_id uuid, window_name text, serviced_count bigint, waiting_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS window_id,
        w.name AS window_name,
        COALESCE(s.serviced_count, 0) AS serviced_count,
        COALESCE(waiting.count, 0) AS waiting_count
    FROM
        windows w
    LEFT JOIN (
        -- Subquery for serviced members
        SELECT
            assigned_window_id,
            COUNT(*) AS serviced_count
        FROM
            queue_members
        WHERE
            queue_id = p_queue_id
            AND status = 'serviced'
            AND updated_at >= date_trunc('day', now() AT TIME ZONE 'utc')
            AND updated_at < date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day'
        GROUP BY
            assigned_window_id
    ) s ON w.id = s.assigned_window_id
    LEFT JOIN (
        -- Subquery for waiting members
        SELECT
            ws.window_id,
            COUNT(qm.id) as count
        FROM
            window_services ws
        JOIN
            queue_members qm ON ws.service_id = qm.service_id
        WHERE
            qm.queue_id = p_queue_id
            AND qm.status = 'waiting'
        GROUP BY
            ws.window_id
    ) waiting ON w.id = waiting.window_id
    WHERE
        w.queue_id = p_queue_id
    ORDER BY
        w.name;
END;
$$;

CREATE FUNCTION public.get_serviced_today_count(p_queue_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    today_count integer;
BEGIN
    SELECT COUNT(*)
    INTO today_count
    FROM queue_members
    WHERE
        queue_id = p_queue_id
        AND status = 'serviced'
        -- Считаем "сегодня" по времени UTC
        AND updated_at >= date_trunc('day', now() AT TIME ZONE 'utc')
        AND updated_at < date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day';

    RETURN today_count;
END;
$$;

CREATE FUNCTION public.get_serviced_today_count_for_window(p_window_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    serviced_count integer;
BEGIN
    SELECT COUNT(*)
    INTO serviced_count
    FROM queue_members
    WHERE
        assigned_window_id = p_window_id
        AND status = 'serviced'
        AND updated_at >= date_trunc('day', now() AT TIME ZONE 'utc')
        AND updated_at < date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day';

    RETURN COALESCE(serviced_count, 0);
END;
$$;
