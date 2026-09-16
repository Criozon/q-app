import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import type { RealtimePayload } from '../services/supabaseService';
import type { Queue, AdminMember, WindowWithServices, ServiceWithWindows } from '../types/domain';
import { errorMessage } from '../utils/errors';
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
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const loadQueueData = useCallback(async (isInitialLoad = false) => {
    if (!secretKey) {
        return;
    }
    if (isInitialLoad) setError(null);
    try {
      // Секретная ссылка обменивается на пропуск, привязанный к анонимной
      // сессии. Поэтому ссылка по-прежнему работает на любом устройстве,
      // но прямой доступ к таблицам есть только у предъявившего ключ.
      const { data: qData, error: qError } = await service.claimQueueAdmin(secretKey);
      if (qError || !qData) throw new Error("Очередь не найдена или была удалена.");
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
  
  useEffect(() => {
    if (!queue) return;
    const handleRealtimeUpdate = (payload: RealtimePayload) => {
      log(PAGE_SOURCE, `Realtime (${payload.table}): ${payload.eventType}, перезагружаем данные.`);
      void loadQueueData(false);
    };

    const memberChannel = service.subscribe(`context-admin-members-${queue.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, handleRealtimeUpdate);
    const otherTablesChannel = service.subscribe(`context-admin-other-${queue.id}`, { event: '*', schema: 'public', table: 'queues,services,window_services' }, handleRealtimeUpdate);

    return () => {
      service.removeSubscription(memberChannel);
      service.removeSubscription(otherTablesChannel);
    };
  }, [queue, loadQueueData]);

  const waitingMembersCount = useMemo(() => members.filter(m => m.status === 'waiting').length, [members]);

  const value = useMemo(() => ({
    queue,
    members,
    windows,
    services,
    loading,
    error,
    qrCodeUrl,
    joinUrl,
    waitingMembersCount,
    setQueue,
    loadQueueData
  }), [queue, members, windows, services, loading, error, qrCodeUrl, joinUrl, waitingMembersCount, loadQueueData]);

  return (
    <QueueContext.Provider value={value}>
      {children}
    </QueueContext.Provider>
  );
}
