import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';

const PAGE_SOURCE = 'WindowAdminContext';
const WindowAdminContext = createContext(null);

export function WindowAdminProvider({ children }) {
    const { windowSecretKey } = useParams();
    const [windowInfo, setWindowInfo] = useState(null);
    const [queueInfo, setQueueInfo] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinUrl, setJoinUrl] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const loadInitialData = useCallback(async () => {
        setError(null);
        try {
            const { data: wData, error: wError } = await service.getWindowBySecretKey(windowSecretKey);
            if (wError || !wData || !wData.queues) throw new Error("Панель управления не найдена.");
            
            const currentWindowInfo = { id: wData.id, name: wData.name, queue_id: wData.queue_id };
            setWindowInfo(currentWindowInfo);
            setQueueInfo(wData.queues);
            
            const { data: mData, error: mError } = await service.getMembersForWindow(currentWindowInfo.id, currentWindowInfo.queue_id);
            if (mError) throw new Error("Не удалось загрузить список участников.");
            setMembers(mData || []);
            
            if (!joinUrl) {
                const clientJoinUrl = `${window.location.origin}/join/${wData.queue_id}`;
                setJoinUrl(clientJoinUrl);
                const qrUrl = await QRCode.toDataURL(clientJoinUrl);
                setQrCodeUrl(qrUrl);
            }
        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
            setError(err.message || 'Произошла неизвестная ошибка');
        } finally {
            setLoading(false);
        }
    }, [windowSecretKey, joinUrl]);
    
    useEffect(() => { loadInitialData(); }, [loadInitialData]);
    
    useEffect(() => {
        if (!queueInfo || !windowInfo) return;
        const handleRealtimeEvent = () => {
            log(PAGE_SOURCE, `Получено Realtime событие, обновляем список участников`);
            service.getMembersForWindow(windowInfo.id, queueInfo.id).then(({ data, error }) => {
                if (error) {
                    log(PAGE_SOURCE, 'Ошибка при обновлении списка участников по Realtime:', error);
                    return;
                }
                setMembers(data || []);
            });
        };
        const memberChannel = service.subscribe(`window-admin-members-${queueInfo.id}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueInfo.id}` }, handleRealtimeEvent);
        const queueChannel = service.subscribe(`window-admin-queue-${queueInfo.id}`, { event: '*', schema: 'public', table: 'queues', filter: `id=eq.${queueInfo.id}` }, (payload) => {
            log(PAGE_SOURCE, `Realtime (Очередь): ${payload.eventType}`);
            setQueueInfo(payload.new);
            if (payload.eventType === 'DELETE') setError('Эта очередь была удалена главным администратором.');
        });
        return () => {
            service.removeSubscription(memberChannel);
            service.removeSubscription(queueChannel);
        };
    }, [queueInfo, windowInfo]);

    const callNext = useCallback(async () => {
        if (!windowInfo) return;
        setIsProcessing(true);
        const { error } = await service.callNextMemberToWindow(windowInfo.id);
        if (error) toast.error("Не удалось вызвать участника.");
        setIsProcessing(false);
    }, [windowInfo]);

    const callSpecific = useCallback(async (memberId) => {
        if (members.some(m => m.assigned_window_id === windowInfo.id && (m.status === 'called' || m.status === 'acknowledged'))) {
             toast.error('Завершите текущее обслуживание, чтобы вызвать другого участника.');
             return;
        }
        setIsProcessing(true);
        const { error } = await service.callSpecificMember(memberId, windowInfo.id);
        if (error) toast.error("Не удалось вызвать этого участника.");
        setIsProcessing(false);
    }, [windowInfo, members]);

    const completeService = useCallback(async (memberId) => {
        setIsProcessing(true);
        await service.updateMemberStatus(memberId, 'serviced');
        setIsProcessing(false);
    }, []);

    const returnToQueue = useCallback(async (memberId) => {
        setIsProcessing(true);
        await service.returnMemberToWaiting(memberId);
        setIsProcessing(false);
    }, []);
    
    const assignedMember = useMemo(() => members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged')), [members, windowInfo]);
    const waitingMembers = useMemo(() => members.filter(m => m.status === 'waiting'), [members]);
    
    const value = useMemo(() => ({ 
        windowInfo, queueInfo, members, assignedMember, waitingMembers, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, setIsJoinModalOpen, callNext, callSpecific, completeService, returnToQueue 
    }), [windowInfo, queueInfo, members, assignedMember, waitingMembers, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, callNext, callSpecific, completeService, returnToQueue, setIsJoinModalOpen]);
    
    return (<WindowAdminContext.Provider value={value}>{children}</WindowAdminContext.Provider>);
}

export function useWindowAdmin() {
    const context = useContext(WindowAdminContext);
    if (context === null) throw new Error('useWindowAdmin должен использоваться внутри WindowAdminProvider');
    return context;
}