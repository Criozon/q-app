import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import type { RealtimePayload } from '../services/supabaseService';
import type { WindowAdminData } from '../types/domain';
import { errorMessage } from '../utils/errors';
import { WindowAdminContext } from './WindowAdminContext';

const PAGE_SOURCE = 'WindowAdminContext';

type Member = WindowAdminData['members'][number];

export function WindowAdminProvider({ children }: { children: ReactNode }) {
    const { shortKey } = useParams<{ shortKey: string }>();
    const [windowInfo, setWindowInfo] = useState<WindowAdminData['windowInfo']>(null);
    const [queueInfo, setQueueInfo] = useState<WindowAdminData['queueInfo']>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
            // Сначала обмениваем ключ окна на пропуск — без него политики
            // не пустят ни к таблицам, ни к Realtime-событиям очереди.
            if (!shortKey) throw new Error('Панель управления не найдена. Неверный ключ доступа.');
            const { error: claimError } = await service.claimWindowOperator(shortKey);
            if (claimError) throw new Error("Панель управления не найдена. Неверный ключ доступа.");

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
            if (isInitialLoad) setError(errorMessage(err));
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    }, [shortKey, joinUrl]);
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    
    useEffect(() => { void loadInitialData(true); }, [loadInitialData]);
    
    /**
     * Перезагрузка — через ref, а зависимости эффекта — только идентификатор
     * очереди. Иначе каждое событие меняло объект queueInfo, эффект
     * пересоздавал каналы, и события, пришедшие в этот момент, терялись.
     */
    const loadInitialDataRef = useRef(loadInitialData);
    useEffect(() => { loadInitialDataRef.current = loadInitialData; }, [loadInitialData]);

    const queueId = queueInfo?.id;

    useEffect(() => {
        if (!queueId || isQueueDeleted) return;

        const channels: ReturnType<typeof service.subscribe>[] = [];

        const handleRealtimeEvent = (payload: RealtimePayload) => {
            log(PAGE_SOURCE, `Получено Realtime событие (${payload.table}), тип: ${payload.eventType}.`);
            if (payload.table === 'queues' && payload.eventType === 'DELETE' && payload.old.id === queueId) {
                log(PAGE_SOURCE, 'Обнаружено удаление очереди! Обновляем UI.');
                setIsQueueDeleted(true);
                channels.forEach(service.removeSubscription);
                return;
            }
            void loadInitialDataRef.current(false);
        };

        const common = { event: '*', schema: 'public' } as const;
        channels.push(
            service.subscribe(`window-members-${queueId}`, { ...common, table: 'queue_members', filter: `queue_id=eq.${queueId}` }, handleRealtimeEvent),
            service.subscribe(`window-queue-${queueId}`, { ...common, table: 'queues', filter: `id=eq.${queueId}` }, handleRealtimeEvent),
            service.subscribe(`window-services-${queueId}`, { ...common, table: 'window_services' }, handleRealtimeEvent),
        );

        return () => channels.forEach(service.removeSubscription);
    }, [queueId, isQueueDeleted]);

    const callNext = useCallback(async () => { if (!windowInfo || !queueInfo) return; setIsProcessing(true); try { await service.callNextMemberToWindow(windowInfo.id); } catch { toast.error("Не удалось вызвать участника."); } finally { setIsProcessing(false); } }, [windowInfo, queueInfo]);
    const callSpecific = useCallback(async (memberId: string, assignedMember: Member | undefined) => { if (assignedMember) { toast.error('Завершите текущее обслуживание, чтобы вызвать другого участника.'); return; } setIsProcessing(true); try { await service.callSpecificMember(memberId, windowInfo!.id); } catch { toast.error("Не удалось вызвать этого участника."); } finally { setIsProcessing(false); } }, [windowInfo]);
    const completeService = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.updateMemberStatus(memberId, 'serviced'); } catch { toast.error('Не удалось завершить обслуживание.'); } finally { setIsProcessing(false); } }, []);
    const returnToQueue = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.returnMemberToWaiting(memberId); } catch { toast.error('Не удалось вернуть участника в очередь.'); } finally { setIsProcessing(false); } }, []);
    
    const assignedMember = useMemo(() => members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged')), [members, windowInfo]);
    
    const value = useMemo(() => ({ 
        windowInfo, queueInfo, members, assignedMember, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, setIsJoinModalOpen, loadInitialData, callNext, callSpecific, completeService, returnToQueue 
    }), [windowInfo, queueInfo, members, assignedMember, loading, error, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, loadInitialData, callNext, callSpecific, completeService, returnToQueue]);
    
    return (<WindowAdminContext.Provider value={value}>{children}</WindowAdminContext.Provider>);
}
