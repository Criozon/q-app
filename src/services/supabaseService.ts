// src/services/supabaseService.ts
//
// Слой доступа к данным. Все вызовы ждут анонимной сессии: без неё база
// не отдаёт ничего (см. миграцию 0002 и supabaseClient.ts).
//
// Права администратора очереди и оператора окна держатся на секретной
// ссылке. Ссылка один раз обменивается на пропуск (claimQueueAdmin /
// claimWindowOperator), после чего RLS пускает к таблицам напрямую —
// это нужно, чтобы работал Realtime, он тоже подчиняется политикам.

import type { PostgrestError, RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureSession } from './supabaseClient';
import log from '../utils/logger';
import { withTimeout, TIMEOUTS, TimeoutError } from '../utils/timeout';
import type {
    Queue, QueueMember, Service, Announcement,
    AdminMember, WindowWithServices, ServiceWithWindows,
    JoinDetails, MyQueueStatus, QueueStats, WindowAdminData,
} from '../types/domain';

/** Единая форма ответа: данные плюс ошибка, как их отдаёт supabase-js. */
interface Result<T> {
    data: T;
    error: PostgrestError | null;
}

type Pending<T> = PromiseLike<{ data: T; error: PostgrestError | null }>;

const handleResponse = <T,>(response: Result<T>, context: string): Result<T> => {
    if (response.error) {
        log('Supabase Error', `[${context}] ${response.error.message}`, response.error);
        throw response.error;
    }
    return response;
};

// Обёртка: дождаться сессии, выполнить запрос, разобрать ответ.
const withSession = <T,>(context: string, run: () => Pending<T>): Promise<Result<T>> =>
    withTimeout(
        ensureSession().then(run),
        TIMEOUTS.request,
        context,
    ).catch((error: unknown) => {
        if (error instanceof TimeoutError) {
            log('Supabase', `Операция не уложилась во время: ${error.operation}`);
        }
        throw error;
    }).then(response => handleResponse(response, context));

/**
 * Функции в базе, возвращающие json, генератор типов описывает как Json.
 * Конкретная форма ответа зафиксирована в SQL и описана в types/domain.ts,
 * поэтому приводим явно — вывести её автоматически неоткуда.
 */
const asShape = <T,>(query: PromiseLike<unknown>) => query as Pending<T>;

// --- Realtime ---------------------------------------------------------

interface SubscribeOptions {
    event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
    schema: string;
    table: string;
    filter?: string;
}

export interface RealtimePayload {
    eventType: string;
    table: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
}

export const subscribe = (
    channelName: string,
    options: SubscribeOptions,
    callback: (payload: RealtimePayload) => void,
): RealtimeChannel => {
    const channel = supabase.channel(channelName);
    channel
        // Перегрузка в supabase-js завязана на конкретную таблицу из схемы,
        // а здесь имя таблицы приходит строкой в рантайме.
        .on('postgres_changes', options as never, callback as never)
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                log('Realtime', `Успешно подписаны на ${options.table} в канале ${channelName}`);
            }
        });
    return channel;
};

export const removeSubscription = (channel: RealtimeChannel | null | undefined) => {
    if (channel) { void supabase.removeChannel(channel); }
};

// --- Обмен ссылки на пропуск -----------------------------------------

export const claimQueueAdmin = (secretKey: string) =>
    withSession<Queue>('claimQueueAdmin', () =>
        asShape<Queue>(supabase.rpc('claim_queue_admin', { p_secret_key: secretKey } as never)));

export const claimWindowOperator = (shortKey: string) =>
    withSession<WindowAdminData['windowInfo']>('claimWindowOperator', () =>
        asShape<WindowAdminData['windowInfo']>(supabase.rpc('claim_window_operator', { p_short_key: shortKey } as never)));

// --- Очередь: создание и управление ------------------------------------

export interface NewQueue {
    name: string;
    description: string;
    window_count: number;
    services_payload: { name: string; window_indices: number[] }[];
}

/** Результат создания: клиент читает data[0].admin_secret_key. */
export type CreatedQueue = Pick<Queue, 'id' | 'name' | 'admin_secret_key'>;

export const createQueue = (queueData: NewQueue) =>
    withSession<CreatedQueue[]>('createQueue', () =>
        asShape<CreatedQueue[]>(supabase.rpc('create_queue_with_services_and_windows', {
            p_name: queueData.name,
            p_description: queueData.description,
            p_window_count: queueData.window_count,
            p_services: queueData.services_payload,
        } as never)));

export const getQueueById = (queueId: string) =>
    withSession<Queue | null>('getQueueById', () =>
        supabase.from('queues').select('*').eq('id', queueId).maybeSingle());

export const updateQueueStatus = (queueId: string, status: string) =>
    withSession('updateQueueStatus', () => supabase.from('queues').update({ status }).eq('id', queueId));

export const deleteQueue = (queueId: string) =>
    withSession('deleteQueue', () => supabase.from('queues').delete().eq('id', queueId));

// --- Вход в очередь (публичная часть) ---------------------------------

export const getQueueForJoin = (shortId: string) =>
    withSession<JoinDetails>('getQueueForJoin', () =>
        asShape<JoinDetails>(supabase.rpc('get_queue_for_join', { p_short_id: shortId } as never)));

export const joinQueue = (shortId: string, memberName: string, serviceId: string | null) =>
    withSession<QueueMember>('joinQueue', () =>
        asShape<QueueMember>(supabase.rpc('join_queue', {
            p_short_id: shortId,
            p_member_name: memberName,
            p_service_id: serviceId ?? null,
        } as never)));

// --- Участник ---------------------------------------------------------

/**
 * Всё для страницы ожидания одним запросом: свой статус, сколько человек
 * впереди, прогноз времени и объявления организатора.
 *
 * Считать «перед вами N» на клиенте больше нельзя: участник по политикам
 * видит только собственную строку, чужие ему не отдаются.
 */
export const getMyQueueStatus = (memberId: string) =>
    withSession<MyQueueStatus>('getMyQueueStatus', () =>
        asShape<MyQueueStatus>(supabase.rpc('get_my_queue_status', { p_member_id: memberId } as never)));

export const acknowledgeCall = (memberId: string) =>
    withSession('acknowledgeCall', () =>
        supabase.from('queue_members').update({ status: 'acknowledged' }).eq('id', memberId));

export const deferMyCall = (memberId: string, skip = 3) =>
    withSession<QueueMember>('deferMyCall', () =>
        asShape<QueueMember>(supabase.rpc('defer_my_call', { p_member_id: memberId, p_skip: skip } as never)));

export const leaveQueue = (memberId: string) =>
    withSession('leaveQueue', () => supabase.from('queue_members').delete().eq('id', memberId));

// --- Администратор очереди --------------------------------------------

export const getMembersByQueueId = (queueId: string) =>
    withSession<AdminMember[]>('getMembersByQueueId', () => asShape<AdminMember[]>(supabase
        .from('queue_members')
        .select('*, service_name:services (name), window_name:windows (name)')
        .eq('queue_id', queueId)
        .order('sort_order', { ascending: true })));

export const deleteMember = (memberId: string) =>
    withSession('deleteMember', () => supabase.from('queue_members').delete().eq('id', memberId));

export const updateMemberStatus = (memberId: string, status: string) =>
    withSession('updateMemberStatus', () =>
        supabase.from('queue_members').update({ status }).eq('id', memberId));

export const getWindowsByQueueId = (queueId: string) =>
    withSession<WindowWithServices[]>('getWindowsByQueueId', () => asShape<WindowWithServices[]>(supabase
        .from('windows').select('*, window_services(*)').eq('queue_id', queueId)
        .order('created_at', { ascending: true })));

export const getServicesByQueueId = (queueId: string) =>
    withSession<ServiceWithWindows[]>('getServicesByQueueId', () => asShape<ServiceWithWindows[]>(supabase
        .from('services').select('*, window_services(window_id)').eq('queue_id', queueId).order('name')));

export const addService = (queueId: string, serviceName: string) =>
    withSession<Service>('addService', () => asShape<Service>(supabase
        .from('services').insert({ queue_id: queueId, name: serviceName }).select().single()));

export const removeService = (serviceId: string) =>
    withSession('removeService', () => supabase.from('services').delete().eq('id', serviceId));

export const updateServiceWindowAssignments = (serviceId: string, windowIds: string[]) =>
    withSession('updateServiceWindowAssignments', () => supabase.rpc('update_service_window_assignments', {
        p_service_id: serviceId, p_window_ids: windowIds,
    }));

export const addWindowsToQueue = (queueId: string, count: number) =>
    withSession('addWindowsToQueue', () =>
        supabase.rpc('add_windows_to_queue', { p_queue_id: queueId, p_new_window_count: count }));

export const getQueueStats = (queueId: string) =>
    withSession<QueueStats>('getQueueStats', () =>
        asShape<QueueStats>(supabase.rpc('get_queue_stats', { p_queue_id: queueId } as never)));

// --- Объявления организатора ------------------------------------------

export const getAnnouncements = (queueId: string) =>
    withSession<Announcement[]>('getAnnouncements', () => asShape<Announcement[]>(supabase
        .from('queue_announcements').select('*').eq('queue_id', queueId)
        .order('created_at', { ascending: false })));

export const postAnnouncement = (queueId: string, body: string) =>
    withSession<Announcement>('postAnnouncement', () => asShape<Announcement>(supabase
        .from('queue_announcements').insert({ queue_id: queueId, body }).select().single()));

export const deleteAnnouncement = (id: string) =>
    withSession('deleteAnnouncement', () => supabase.from('queue_announcements').delete().eq('id', id));

// --- Оператор окна ----------------------------------------------------

export const getWindowAdminInitialData = (shortKey: string) =>
    withSession<WindowAdminData>('getWindowAdminInitialData', () =>
        asShape<WindowAdminData>(supabase.rpc('get_window_admin_initial_data', { p_short_key: shortKey })));

export const callNextMemberToWindow = (windowId: string) =>
    withSession<string | null>('callNextMemberToWindow', () =>
        asShape<string | null>(supabase.rpc('call_next_member_to_window', { p_window_id: windowId })));

export const callSpecificMember = (memberId: string, windowId: string) =>
    withSession('callSpecificMember', () => supabase
        .from('queue_members')
        .update({ status: 'called', assigned_window_id: windowId, called_at: new Date().toISOString() })
        .eq('id', memberId));

// --- Выдача под таймер --------------------------------------------------
//
// Для мест, где обслуживание длится не минуту у стойки: прокат, солярий,
// картинг. Участник остаётся открытым, у него идёт время и висит заметка
// о том, что именно ему выдали. Время считает сервер — часы устройства
// администратора сдвинули бы таймеры сразу у всех.

/**
 * Принять участника: перевести в «на руках», задать время и окно.
 *
 * note === null означает «не трогать заметку»: её часто набирают до того,
 * как запускают время. Пустая строка очищает — так же, как в SQL.
 *
 * windowId нужен, потому что панель окна ищет своих именно по привязке,
 * а запустить таймер теперь можно и не вызывая человека.
 */
export const startMemberSession = (
    memberId: string,
    note: string | null,
    minutes: number | null,
    windowId?: string | null,
) =>
    withSession<QueueMember>('startMemberSession', () =>
        asShape<QueueMember>(supabase.rpc('start_member_session', {
            p_member_id: memberId,
            p_note: note ?? undefined,
            p_minutes: minutes ?? undefined,
            p_window_id: windowId ?? undefined,
        })));

export const extendMemberTimer = (memberId: string, minutes: number) =>
    withSession<QueueMember>('extendMemberTimer', () =>
        asShape<QueueMember>(supabase.rpc('extend_member_timer', {
            p_member_id: memberId,
            p_minutes: minutes,
        })));

export const updateMemberNote = (memberId: string, note: string | null) =>
    withSession('updateMemberNote', () => supabase
        .from('queue_members')
        .update({ note: note?.trim() || null })
        .eq('id', memberId));

export const returnMemberToWaiting = (memberId: string) =>
    withSession('returnMemberToWaiting', () => supabase
        .from('queue_members')
        .update({ status: 'waiting', assigned_window_id: null, acknowledged_at: null })
        .eq('id', memberId));
