-- =====================================================================
-- Экран входа показывает, во что человек ввязывается
--
-- Раньше при сканировании QR-кода было видно только название очереди
-- и список услуг. Сколько людей впереди и сколько примерно длится
-- приём — неизвестно, а именно это решает, вставать сейчас или зайти
-- позже.
--
-- avg_service_minutes возвращает null, когда мерить ещё нечего, —
-- подставлять выдуманное число вместо измеренного не станем, клиент
-- просто не увидит эту строку.
-- =====================================================================

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
      -- Округляем до минуты: «около 12 минут» честнее, чем 11.7.
      'avg_service_minutes', (
        SELECT round(public.avg_service_minutes((SELECT id FROM q)))::int
         WHERE public.avg_service_minutes((SELECT id FROM q)) is not null)
  );
$$;

grant execute on function public.get_queue_for_join(text) to anon;
