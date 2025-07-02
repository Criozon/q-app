import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';

const PAGE_SOURCE = 'WindowAdminContext';
const WindowAdminContext = createContext(null);

export function WindowAdminProvider({ children }) {
    const { shortKey } = useParams();
    const [windowInfo, setWindowInfo] = useState(null);
    const [queueInfo, setQueueInfo] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinUrl, setJoinUrl] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isQueueDeleted, setIsQueueDeleted] = useState(false);

    // --- НАЧАЛО ИЗМЕНЕНИЯ: Упрощенная функция загрузки ---
    const loadInitialData = useCallback(async (isInitialLoad = true) => {
        if (isInitialLoad) {
            setLoading(true);
            setError(null);
        }
        try {
            // Один запрос вместо нескольких!
            const { data, error: rpcError } = await service.getWindowAdminInitialData(shortKey);
            if (rpcError) throw rpcError;
            
            const { windowInfo: wData, queueInfo: qData, members: mData } = data;

            if (!wData) throw new Error("Панель управления не найдена. Неверный ключ доступа.");
            
            if (!qData) {
                setWindowInfo(wData);
                setQueueInfo(null);
                setMembers([]);
                setIsQueueDeleted(true);
                if (isInitialLoad) setLoading(false);
                return;
            }

            setWindowInfo(wData);
            setQueueInfo(qData);
            setMembers(mData || []);
            
            if (!joinUrl && qData) {
                const clientJoinUrl = `${window.location.origin}/join/${qData.short_id}`;
                setJoinUrl(clientJoinUrl);
                const qrUrl = await QRCode.toDataURL(clientJoinUrl);
                setQrCodeUrl(qrUrl);
            }
        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
            if (isInitialLoad) setError(err.message || 'Произошла неизвестная ошибка');
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    }, [shortKey, joinUrl]);
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    
    useEffect(() => { loadInitialData(true); }, [loadInitialData]);
    
    useEffect(() => {
        if (!queueInfo || !windowInfo || isQueueDeleted) return;

        const handleRealtimeEvent = (payload) => {
            log(PAGE_SOURCE, `Получено Realtime событие (${payload.table}), тип: ${payload.eventType}.`);
            if (payload.table === 'queues' && payload.eventType === 'DELETE' && payload.old.id === queueInfo.id) {
                log(PAGE_SOURCE, 'Обнаружено удаление очереди! Обновляем UI.');
                setIsQueueDeleted(true);
                service.removeSubscription(memberChannel);
                service.removeSubscription(queueChannel);
                service.removeSubscription(servicesChannel);
                return;
            }
            loadInitialData(false);
        };

        const memberChannel = service.subscribe(`window-admin-members-${queueInfo.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueInfo.id}` }, handleRealtimeEvent);
        const queueChannel = service.subscribe(`window-admin-queue-${queueInfo.id}`, { event: '*', schema: 'public', table: 'queues', filter: `id=eq.${queueInfo.id}`}, handleRealtimeEvent);
        const servicesChannel = service.subscribe(`window-admin-services-${queueInfo.id}`, { event: '*', schema: 'public', table: 'window_services' }, handleRealtimeEvent);

        return () => {
            service.removeSubscription(memberChannel);
            service.removeSubscription(queueChannel);
            service.removeSubscription(servicesChannel);
        };
    }, [queueInfo, windowInfo, isQueueDeleted, loadInitialData]);

    const callNext = useCallback(async () => { if (!windowInfo || !queueInfo) return; setIsProcessing(true); try { await service.callNextMemberToWindow(windowInfo.id); } catch (error) { toast.error("Не удалось вызвать участника."); } finally { setIsProcessing(false); } }, [windowInfo, queueInfo]);
    const callSpecific = useCallback(async (memberId, assignedMember) => { if (assignedMember) { toast.error('Завершите текущее обслуживание, чтобы вызвать другого участника.'); return; } setIsProcessing(true); try { await service.callSpecificMember(memberId, windowInfo.id); } catch(error) { toast.error("Не удалось вызвать этого участника."); } finally { setIsProcessing(false); } }, [windowInfo]);
    const completeService = useCallback(async (memberId) => { setIsProcessing(true); try { await service.updateMemberStatus(memberId, 'serviced'); } finally { setIsProcessing(false); } }, []);
    const returnToQueue = useCallback(async (memberId) => { setIsProcessing(true); try { await service.returnMemberToWaiting(memberId); } finally { setIsProcessing(false); } }, []);
    
    const assignedMember = useMemo(() => members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged')), [members, windowInfo]);
    
    const value = useMemo(() => ({ 
        windowInfo, queueInfo, members, assignedMember, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, setIsJoinModalOpen, loadInitialData, callNext, callSpecific, completeService, returnToQueue 
    }), [windowInfo, queueInfo, members, assignedMember, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, loadInitialData, callNext, callSpecific, completeService, returnToQueue]);
    
    return (<WindowAdminContext.Provider value={value}>{children}</WindowAdminContext.Provider>);
}

export function useWindowAdmin() {
    const context = useContext(WindowAdminContext);
    if (context === null) throw new Error('useWindowAdmin должен использоваться внутри WindowAdminProvider');
    return context;
}