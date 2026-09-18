-- =====================================================================
-- Измеренное отделено от подставленного
--
-- avg_service_minutes() при отсутствии данных возвращает 4 минуты —
-- это осознанная подстановка ради прогноза ожидания: первым участникам
-- надо что-то показать. Но на экране входа та же четвёрка выглядела как
-- измеренная величина: «приём занимает около 4 мин» у очереди, где ещё
-- никого не обслужили.
--
-- Разводим: measured_service_minutes() честно отдаёт null, когда мерить
-- нечего, а avg_service_minutes() остаётся прогнозной обёрткой над ним.
-- =====================================================================

create or replace function public.measured_service_minutes(p_queue_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select avg(extract(epoch from (serviced_at - called_at)) / 60.0)
      from (select serviced_at, called_at
              from public.queue_members
             where queue_id = p_queue_id
               and serviced_at is not null
               and called_at is not null
               and serviced_at > called_at
             order by serviced_at desc
             limit 20) t;
$$;

create or replace function public.avg_service_minutes(p_queue_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    -- Подстановка нужна прогнозу: без неё первым участникам нечего
    -- показать. Отсюда же её и видно — это не измерение.
    select coalesce(public.measured_service_minutes(p_queue_id), 4.0);
$$;

create or replace function public.get_queue_for_join(p_short_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  WITH q AS (
    SELECT id, name, description, status FROM public.queues WHERE short_id = p_short_id
  )
  SELECT json_build_object(
      'queue', (SELECT json_build_object('id', id, 'name', name,
                                         'description', description, 'status', status) FROM q),
      'services', (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::json)
                     FROM public.services s WHERE s.queue_id = (SELECT id FROM q)),
      'waiting_count', (SELECT count(*) FROM public.queue_members m
                         WHERE m.queue_id = (SELECT id FROM q) AND m.status = 'waiting'),
      -- Только измеренное: пока никого не обслужили, строки про время
      -- на экране входа просто не будет.
      'avg_service_minutes', (
        SELECT round(public.measured_service_minutes((SELECT id FROM q)))::int
         WHERE public.measured_service_minutes((SELECT id FROM q)) is not null)
  );
$$;

grant execute on function public.get_queue_for_join(text) to anon;
