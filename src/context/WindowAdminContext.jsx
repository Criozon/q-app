import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
        setLoading(true);
        setError(null);
        try {
            const { data: wData, error: wError } = await service.getWindowBySecretKey(windowSecretKey);
            
            if (wError || !wData || !wData.queues) {
                if (wError) throw wError;
                throw new Error("Панель управления не найдена. Возможно, ссылка устарела или очередь была удалена.");
            }
            
            const currentWindowInfo = { id: wData.id, name: wData.name, queue_id: wData.queue_id };
            setWindowInfo(currentWindowInfo);
            setQueueInfo(wData.queues);
            
            const { data: mData, error: mError } = await service.getMembersForWindow(currentWindowInfo.id, currentWindowInfo.queue_id);
            if (mError) throw new Error("Не удалось загрузить список участников.");
            setMembers(mData || []);
            
            const clientJoinUrl = `${window.location.origin}/join/${wData.queue_id}`;
            setJoinUrl(clientJoinUrl);
            const qrUrl = await QRCode.toDataURL(clientJoinUrl);
            setQrCodeUrl(qrUrl);

        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при загрузке:', err);
            setError(err.message || 'Произошла неизвестная ошибка');
        } finally {
            setLoading(false);
        }
    }, [windowSecretKey]);
    
    useEffect(() => { loadInitialData(); }, [loadInitialData]);
    
    useEffect(() => {
        if (!queueInfo || !windowInfo) return;

        // --- НАЧАЛО ИСПРАВЛЕНИЯ: Правильная обработка Realtime событий ---
        const handleRealtimeEvent = async (payload) => {
            log(PAGE_SOURCE, `Получено Realtime событие: ${payload.eventType}`);
            
            const affectedMember = payload.new || payload.old;
            
            // Получаем актуальный список подходящих участников, чтобы не гадать
            const { data: currentMembers, error } = await service.getMembersForWindow(windowInfo.id, queueInfo.id);
            if (error) {
                log(PAGE_SOURCE, 'Ошибка при обновлении списка участников по Realtime:', error);
                return;
            }
            setMembers(currentMembers || []);
        };
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

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


    const callNext = async () => {
        if (!windowInfo) return;
        setIsProcessing(true);
        const { error } = await service.callNextMemberToWindow(windowInfo.id);
        if (error) toast.error("Не удалось вызвать участника.");
        setIsProcessing(false);
    };

    const callSpecific = async (memberId) => {
        if (assignedMember) {
            toast.error('Завершите текущее обслуживание, чтобы вызвать другого участника.');
            return;
        }
        setIsProcessing(true);
        const { error } = await service.assignAndCallMember(memberId, windowInfo.id);
        if (error) toast.error("Не удалось вызвать этого участника.");
        setIsProcessing(false);
    };

    const completeService = async (memberId) => {
        setIsProcessing(true);
        await service.updateMemberStatus(memberId, 'serviced');
        setIsProcessing(false);
    };

    const returnToQueue = async (memberId) => {
        setIsProcessing(true);
        await service.returnMemberToWaiting(memberId);
        setIsProcessing(false);
    };
    
    const assignedMember = members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged'));
    const waitingMembers = members.filter(m => m.status === 'waiting');
    
    const value = { windowInfo, queueInfo, members, assignedMember, waitingMembers, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, setIsJoinModalOpen, callNext, callSpecific, completeService, returnToQueue };
    
    return (<WindowAdminContext.Provider value={value}>{children}</WindowAdminContext.Provider>);
}

export function useWindowAdmin() {
    const context = useContext(WindowAdminContext);
    if (context === null) throw new Error('useWindowAdmin должен использоваться внутри WindowAdminProvider');
    return context;
}