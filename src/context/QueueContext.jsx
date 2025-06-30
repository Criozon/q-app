import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';

const PAGE_SOURCE = 'QueueContext';
const QueueContext = createContext(null);

export function QueueProvider({ children }) {
  const { secretKey } = useParams();
  const [queue, setQueue] = useState(null);
  const [members, setMembers] = useState([]);
  const [windows, setWindows] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const loadQueueData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setError(null);
    try {
      const { data: qData, error: qError } = await service.getQueueBySecret(secretKey);
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
          const currentJoinUrl = `${window.location.origin}/join/${qData.id}`;
          setJoinUrl(currentJoinUrl);
          const qrUrl = await QRCode.toDataURL(currentJoinUrl);
          setQrCodeUrl(qrUrl);
      }
    } catch (err) {
      log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
      if (isInitialLoad) {
        setError(err.message || 'Произошла неизвестная ошибка');
        setQueue(null);
      }
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [secretKey, joinUrl]);

  useEffect(() => {
    loadQueueData(true);
  }, [loadQueueData]);
  
  useEffect(() => {
    if (!queue) return;
    const handleRealtimeUpdate = (payload) => {
      log(PAGE_SOURCE, `Realtime (${payload.table}): ${payload.eventType}, перезагружаем данные.`);
      loadQueueData(false);
    };

    const memberChannel = service.subscribe(`context-admin-members-${queue.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, handleRealtimeUpdate);
    // Исправлено: отдельная подписка для других таблиц
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

export function useQueue() {
  const context = useContext(QueueContext);
  if (context === null) throw new Error('useQueue должен использоваться внутри QueueProvider');
  return context;
}