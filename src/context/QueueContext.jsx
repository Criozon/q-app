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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const loadQueueData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: qData, error: qError } = await service.getQueueBySecret(secretKey);
      if (qError || !qData) throw new Error("Очередь не найдена или была удалена.");
      
      setQueue(qData);

      const { data: mData, error: mError } = await service.getMembersByQueueId(qData.id);
      if (mError) throw new Error("Не удалось загрузить участников.");
      
      setMembers(mData || []);

      const currentJoinUrl = `${window.location.origin}/join/${qData.id}`;
      setJoinUrl(currentJoinUrl);
      const qrUrl = await QRCode.toDataURL(currentJoinUrl);
      setQrCodeUrl(qrUrl);

    } catch (err) {
      log(PAGE_SOURCE, 'Ошибка при загрузке:', err.message);
      setError(err.message);
      setQueue(null);
    } finally {
      setLoading(false);
    }
  }, [secretKey]);

  useEffect(() => {
    loadQueueData();
  }, [loadQueueData]);
  
  useEffect(() => {
    if (!queue) return;

    const handleMemberUpdate = (payload) => {
        log(PAGE_SOURCE, `Realtime (Участники): ${payload.eventType}`);
        if (payload.eventType === 'INSERT') setMembers(current => [...current, payload.new].sort((a,b) => a.ticket_number - b.ticket_number));
        if (payload.eventType === 'UPDATE') setMembers(current => current.map(m => m.id === payload.new.id ? payload.new : m));
        if (payload.eventType === 'DELETE') setMembers(current => current.filter(m => m.id !== payload.old.id));
    };
    
    const handleQueueUpdate = (payload) => {
        log(PAGE_SOURCE, `Realtime (Очередь): ${payload.eventType}`);
        setQueue(payload.new);
    };

    const memberChannel = service.subscribe(`context-admin-members-${queue.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, handleMemberUpdate);
    const queueChannel = service.subscribe(`context-admin-queue-${queue.id}`, { event: 'UPDATE', schema: 'public', table: 'queues', filter: `id=eq.${queue.id}` }, handleQueueUpdate);
    
    return () => {
      service.removeSubscription(memberChannel);
      service.removeSubscription(queueChannel);
    };
  }, [queue]);

  const calledMember = members.find(m => m.status === 'called' || m.status === 'acknowledged');
  const waitingMembersCount = members.filter(m => m.status === 'waiting').length;

  const value = { queue, members, loading, error, qrCodeUrl, joinUrl, calledMember, waitingMembersCount, setQueue };

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