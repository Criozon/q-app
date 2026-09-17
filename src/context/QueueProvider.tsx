import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import type { RealtimePayload } from '../services/supabaseService';
import type { Queue, AdminMember, WindowWithServices, ServiceWithWindows } from '../types/domain';
import { errorMessage } from '../utils/errors';
import { withRetry } from '../utils/retry';

/** Очереди с таким ключом нет — в отличие от «не смогли дозвониться». */
class QueueNotFound extends Error {
  constructor() { super('Очередь не найдена или была удалена.'); this.name = 'QueueNotFound'; }
}
import { QueueContext } from './QueueContext';

const PAGE_SOURCE = 'QueueContext';

export function QueueProvider({ children }: { children: ReactNode }) {
  const { secretKey } = useParams();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [windows, setWindows] = useState<WindowWithServices[]>([]);
  const [services, setServices] = useState<ServiceWithWindows[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'not-found' | 'network' | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const loadQueueData = useCallback(async (isInitialLoad = false) => {
    if (!secretKey) {
        return;
    }
    if (isInitialLoad) { setError(null); setErrorKind(null); }
    try {
      // Секретная ссылка обменивается на пропуск, привязанный к анонимной
      // сессии. Поэтому ссылка по-прежнему работает на любом устройстве,
      // но прямой доступ к таблицам есть только у предъявившего ключ.
      //
      // Первая загрузка повторяется при сбое: раньше одна заминка в сети
      // оставляла администратора на экране ошибки до ручной перезагрузки.
      const qData = await withRetry(async () => {
        const { data, error } = await service.claimQueueAdmin(secretKey);
        if (error || !data) throw new QueueNotFound();
        return data;
      }, { attempts: isInitialLoad ? 3 : 1, label: 'загрузка очереди' });
      setQueue(qData);

      const [membersRes, windowsRes, servicesRes] = await Promise.all([
        service.getMembersByQueueId(qData.id),
        service.getWindowsByQueueId(qData.id),
        service.getServicesByQueueId(qData.id)
      ]);

      if (membersRes.error) throw new Error("Не удалось загрузить участников.");
      setMembers(membersRes.data || []);
      if (windowsRes.error) throw new Error("Не удалось загрузить данные об окнах.");
      setWindows(windowsRes.data || []);
      if (servicesRes.error) throw new Error("Не удалось загрузить список услуг.");
      setServices(servicesRes.data || []);

      if (!joinUrl) {
          // --- ИЗМЕНЕНИЕ: Убираем /#/ из URL ---
          const currentJoinUrl = `${window.location.origin}/join/${qData.short_id}`;
          // --- КОНЕЦ ИЗМЕНЕНИЯ ---
          setJoinUrl(currentJoinUrl);
          const qrUrl = await QRCode.toDataURL(currentJoinUrl);
          setQrCodeUrl(qrUrl);
      }
    } catch (err) {
      log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
      if (isInitialLoad) {
        setErrorKind(err instanceof QueueNotFound ? 'not-found' : 'network');
        setError(errorMessage(err));
        setQueue(null);
      }
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [secretKey, joinUrl]);

  useEffect(() => {
    void loadQueueData(true);
  }, [loadQueueData]);
  
  /**
   * Перезагрузка данных живёт в ref, а не в зависимостях подписки.
   *
   * Иначе получалась воронка: событие -> loadQueueData -> setQueue с новым
   * объектом -> зависимости эффекта изменились -> каналы снесены и созданы
   * заново. Замерили: шесть переподписок на три события. А всё, что
   * приходило в момент пересоздания канала, ТЕРЯЛОСЬ — отсюда «клиент
   * нажал „Я иду“, а у администратора не видно».
   */
  const loadQueueDataRef = useRef(loadQueueData);
  useEffect(() => { loadQueueDataRef.current = loadQueueData; }, [loadQueueData]);

  // Только идентификатор: строка меняется, лишь когда меняется сама очередь.
  const queueId = queue?.id;

  useEffect(() => {
    if (!queueId) return;
    const handleRealtimeUpdate = (payload: RealtimePayload) => {
      log(PAGE_SOURCE, `Realtime (${payload.table}): ${payload.eventType}, перезагружаем данные.`);
      void loadQueueDataRef.current(false);
    };

    const common = { event: '*', schema: 'public' } as const;
    // Раньше здесь был один канал с table: 'queues,services,window_services'.
    // Так нельзя: postgres_changes принимает ровно одно имя таблицы, и та
    // подписка молча не работала — изменения услуг и статуса очереди до
    // администратора не доходили вовсе.
    const channels = [
      service.subscribe(`admin-members-${queueId}`, { ...common, table: 'queue_members', filter: `queue_id=eq.${queueId}` }, handleRealtimeUpdate),
      service.subscribe(`admin-queue-${queueId}`, { ...common, table: 'queues', filter: `id=eq.${queueId}` }, handleRealtimeUpdate),
      service.subscribe(`admin-services-${queueId}`, { ...common, table: 'services', filter: `queue_id=eq.${queueId}` }, handleRealtimeUpdate),
      service.subscribe(`admin-windows-${queueId}`, { ...common, table: 'windows', filter: `queue_id=eq.${queueId}` }, handleRealtimeUpdate),
    ];

    return () => channels.forEach(service.removeSubscription);
  }, [queueId]);

  const waitingMembersCount = useMemo(() => members.filter(m => m.status === 'waiting').length, [members]);

  const value = useMemo(() => ({
    queue,
    members,
    windows,
    services,
    loading,
    error,
    errorKind,
    qrCodeUrl,
    joinUrl,
    waitingMembersCount,
    setQueue,
    loadQueueData
  }), [queue, members, windows, services, loading, error, errorKind, qrCodeUrl, joinUrl, waitingMembersCount, loadQueueData]);

  return (
    <QueueContext.Provider value={value}>
      {children}
    </QueueContext.Provider>
  );
}
