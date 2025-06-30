import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  const loadQueueData = useCallback(async () => {
    // Не устанавливаем setLoading(true) здесь, чтобы избежать моргания
    setError(null);
    try {
      const { data: qData, error: qError } = await service.getQueueBySecret(secretKey);
      if (qError || !qData) {
        if (qError) throw qError;
        throw new Error("Очередь не найдена или была удалена.");
      }
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

      const currentJoinUrl = `${window.location.origin}/join/${qData.id}`;
      setJoinUrl(currentJoinUrl);
      const qrUrl = await QRCode.toDataURL(currentJoinUrl);
      setQrCodeUrl(qrUrl);

    } catch (err) {
      log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
      setError(err.message || 'Произошла неизвестная ошибка');
      setQueue(null);
    } finally {
      setLoading(false); // Устанавливаем в false только после первой загрузки
    }
  }, [secretKey]);

  useEffect(() => {
    setLoading(true);
    loadQueueData();
  }, [loadQueueData]);
  
  useEffect(() => {
    if (!queue) return;

    // --- НАЧАЛО ИСПРАВЛЕНИЯ: Умный обработчик Realtime ---
    const handleRealtimeUpdate = (payload) => {
      log(PAGE_SOURCE, `Realtime (${payload.table}): ${payload.eventType}`);
      setMembers(currentMembers => {
        const memberMap = new Map(currentMembers.map(m => [m.id, m]));
        
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          // Обновляем или добавляем участника в Map, чтобы избежать дубликатов
          memberMap.set(payload.new.id, payload.new);
        } else if (payload.eventType === 'DELETE') {
          memberMap.delete(payload.old.id);
        }
        
        const newMembers = Array.from(memberMap.values());
        return newMembers.sort((a, b) => a.ticket_number - b.ticket_number);
      });
    };
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    const memberChannel = service.subscribe(`context-admin-members-${queue.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, handleRealtimeUpdate);
    // Остальные подписки могут перезагружать всю страницу, если нужно
    const queueChannel = service.subscribe(`context-admin-queue-${queue.id}`, { event: 'UPDATE', schema: 'public', table: 'queues', filter: `id=eq.${queue.id}` }, loadQueueData);
    const serviceChannel = service.subscribe(`context-admin-services-${queue.id}`, { event: '*', schema: 'public', table: 'services', filter: `queue_id=eq.${queue.id}` }, loadQueueData);
    const windowServiceChannel = service.subscribe(`context-admin-window-services-${queue.id}`, { event: '*', schema: 'public', table: 'window_services' }, loadQueueData);

    return () => {
      service.removeSubscription(memberChannel);
      service.removeSubscription(queueChannel);
      service.removeSubscription(serviceChannel);
      service.removeSubscription(windowServiceChannel);
    };
  }, [queue, loadQueueData]);

  const waitingMembersCount = members.filter(m => m.status === 'waiting').length;

  const value = { queue, members, windows, services, loading, error, qrCodeUrl, joinUrl, waitingMembersCount, setQueue, loadQueueData };

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