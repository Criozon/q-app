import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import log from '../utils/logger';
import { useWakeRefresh } from '../hooks/useWakeRefresh';
import * as service from '../services/supabaseService';
import type { RealtimePayload } from '../services/supabaseService';
import type { WindowAdminData } from '../types/domain';
import { errorMessage } from '../utils/errors';
import { withRetry } from '../utils/retry';
import { syncClock } from '../utils/clock';

/** Панели с таким ключом нет — в отличие от «не смогли дозвониться». */
class WindowNotFound extends Error {
    constructor() { super('Панель управления не найдена. Неверный ключ доступа.'); this.name = 'WindowNotFound'; }
}
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
    const [errorKind, setErrorKind] = useState<'not-found' | 'network' | null>(null);
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
            setErrorKind(null);
        }
        try {
            // Сначала обмениваем ключ окна на пропуск — без него политики
            // не пустят ни к таблицам, ни к Realtime-событиям очереди.
            if (!shortKey) throw new WindowNotFound();

            // Первая загрузка повторяется: одна сетевая заминка не должна
            // оставлять оператора наедине с экраном ошибки.
            const data = await withRetry(async () => {
                const { error: claimError } = await service.claimWindowOperator(shortKey);
                if (claimError) throw new WindowNotFound();
                const { data: payload, error: rpcError } = await service.getWindowAdminInitialData(shortKey);
                if (rpcError) throw rpcError;
                return payload;
            }, { attempts: isInitialLoad ? 3 : 1, label: 'загрузка панели окна' });
            
            const { windowInfo: wData, queueInfo: qData, members: mData } = data;

            // Поправка часов: отсчёт на экране считается от неё, а не от
            // того, что показывает устройство оператора.
            syncClock(data.server_now);

            if (!wData) throw new WindowNotFound();
            
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
            if (isInitialLoad) {
                setErrorKind(err instanceof WindowNotFound ? 'not-found' : 'network');
                setError(errorMessage(err));
            }
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

    // Планшет у окна засыпает так же, как телефон в кармане.
    const wakeGeneration = useWakeRefresh(useCallback(() => {
        void loadInitialDataRef.current(false);
    }, []));

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
    }, [queueId, isQueueDeleted, wakeGeneration]);

    const callNext = useCallback(async () => { if (!windowInfo || !queueInfo) return; setIsProcessing(true); try { await service.callNextMemberToWindow(windowInfo.id); } catch (err) { log(PAGE_SOURCE, "Не удалось вызвать участника.", err); toast.error(`Не удалось вызвать участника. ${errorMessage(err, '')}`.trim()); } finally { setIsProcessing(false); } }, [windowInfo, queueInfo]);
    // Запрета «сначала закончите с текущим» больше нет: по очереди может
    // идти лодка, а освободиться катамаран — и позвать нужно того, кто
    // дальше в списке.
    const callSpecific = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.callSpecificMember(memberId, windowInfo!.id); } catch (err) { log(PAGE_SOURCE, "Не удалось вызвать этого участника.", err); toast.error(`Не удалось вызвать этого участника. ${errorMessage(err, '')}`.trim()); } finally { setIsProcessing(false); } }, [windowInfo]);
    const completeService = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.updateMemberStatus(memberId, 'serviced'); } catch (err) { log(PAGE_SOURCE, 'Не удалось завершить обслуживание.', err); toast.error(`Не удалось завершить обслуживание. ${errorMessage(err, '')}`.trim()); } finally { setIsProcessing(false); } }, []);

    const startTimer = useCallback(async (memberId: string, minutes: number) => {
        setIsProcessing(true);
        // Окно передаём явно: иначе принятый без вызова участник не
        // попадёт в эту панель — она ищет своих по привязке.
        try { await service.startMemberSession(memberId, null, minutes, windowInfo?.id ?? null); }
        catch (err) { log(PAGE_SOURCE, 'Не удалось запустить время.', err); toast.error(`Не удалось запустить время. ${errorMessage(err, '')}`.trim()); }
        finally { setIsProcessing(false); }
    }, [windowInfo]);

    const extendTimer = useCallback(async (memberId: string, minutes: number) => {
        setIsProcessing(true);
        try { await service.extendMemberTimer(memberId, minutes); }
        catch (err) { log(PAGE_SOURCE, 'Не удалось продлить время.', err); toast.error(`Не удалось продлить время. ${errorMessage(err, '')}`.trim()); }
        finally { setIsProcessing(false); }
    }, []);

    // Без setIsProcessing: заметку правят прямо в карточке, и блокировать
    // из-за неё остальные кнопки незачем.
    const saveNote = useCallback(async (memberId: string, note: string | null) => {
        try { await service.updateMemberNote(memberId, note); }
        catch (err) { log(PAGE_SOURCE, 'Не удалось сохранить заметку.', err); toast.error(`Не удалось сохранить заметку. ${errorMessage(err, '')}`.trim()); }
    }, []);
    // Отмена: вызвали, а человек не подошёл. Не «Закончить» — тот подмешал
    // бы несостоявшийся приём в среднюю длительность.
    const cancelMember = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.cancelMember(memberId); } catch (err) { log(PAGE_SOURCE, "Не удалось отменить обслуживание.", err); toast.error(`Не удалось отменить обслуживание. ${errorMessage(err, '')}`.trim()); } finally { setIsProcessing(false); } }, []);
    const returnToQueue = useCallback(async (memberId: string) => { setIsProcessing(true); try { await service.returnMemberToWaiting(memberId); } catch (err) { log(PAGE_SOURCE, 'Не удалось вернуть участника в очередь.', err); toast.error(`Не удалось вернуть участника в очередь. ${errorMessage(err, '')}`.trim()); } finally { setIsProcessing(false); } }, []);
    
    const assignedMember = useMemo(() => members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged')), [members, windowInfo]);
    
    const value = useMemo(() => ({ 
        windowInfo, queueInfo, members, assignedMember, loading, error, errorKind, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, setIsJoinModalOpen, loadInitialData, callNext, callSpecific, completeService, returnToQueue, cancelMember, startTimer, extendTimer, saveNote 
    }), [windowInfo, queueInfo, members, assignedMember, loading, error, errorKind, isProcessing, isJoinModalOpen, joinUrl, qrCodeUrl, isQueueDeleted, loadInitialData, callNext, callSpecific, completeService, returnToQueue, cancelMember, startTimer, extendTimer, saveNote]);
    
    return (<WindowAdminContext.Provider value={value}>{children}</WindowAdminContext.Provider>);
}
