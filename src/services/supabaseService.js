// src/services/supabaseService.js
//
// Слой доступа к данным. Все вызовы ждут анонимной сессии: без неё база
// не отдаёт ничего (см. миграцию 0002 и supabaseClient.js).
//
// Права администратора очереди и оператора окна держатся на секретной
// ссылке. Ссылка один раз обменивается на пропуск (claimQueueAdmin /
// claimWindowOperator), после чего RLS пускает к таблицам напрямую —
// это нужно, чтобы работал Realtime, он тоже подчиняется политикам.

import { supabase, ensureSession } from './supabaseClient';
import log from '../utils/logger';

const handleResponse = ({ data, error }, context) => {
    if (error) {
        log('Supabase Error', `[${context}] ${error.message}`, error);
        throw error;
    }
    return { data, error };
};

// Обёртка: дождаться сессии, выполнить запрос, разобрать ответ.
const withSession = (context, run) =>
    ensureSession().then(run).then(response => handleResponse(response, context));

// --- Realtime ---------------------------------------------------------

export const subscribe = (channelName, options, callback) => {
    const channel = supabase.channel(channelName);
    channel
        .on('postgres_changes', options, callback)
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                log('Realtime', `Успешно подписаны на ${options.table} в канале ${channelName}`);
            }
        });
    return channel;
};

export const removeSubscription = (channel) => { if (channel) { supabase.removeChannel(channel); } };

// --- Обмен ссылки на пропуск -----------------------------------------

export const claimQueueAdmin = (secretKey) =>
    withSession('claimQueueAdmin', () => supabase.rpc('claim_queue_admin', { p_secret_key: secretKey }));

export const claimWindowOperator = (shortKey) =>
    withSession('claimWindowOperator', () => supabase.rpc('claim_window_operator', { p_short_key: shortKey }));

// --- Очередь: создание и управление ------------------------------------

export const createQueue = (queueData) =>
    withSession('createQueue', () => supabase.rpc('create_queue_with_services_and_windows', {
        p_name: queueData.name,
        p_description: queueData.description,
        p_window_count: queueData.window_count,
        p_services: queueData.services_payload,
    }));

export const getQueueById = (queueId) =>
    withSession('getQueueById', () => supabase.from('queues').select('*').eq('id', queueId).maybeSingle());

export const updateQueueStatus = (queueId, status) =>
    withSession('updateQueueStatus', () => supabase.from('queues').update({ status }).eq('id', queueId));

export const deleteQueue = (queueId) =>
    withSession('deleteQueue', () => supabase.from('queues').delete().eq('id', queueId));

// --- Вход в очередь (публичная часть) ---------------------------------

export const getQueueForJoin = (shortId) =>
    withSession('getQueueForJoin', () => supabase.rpc('get_queue_for_join', { p_short_id: shortId }));

export const joinQueue = (shortId, memberName, serviceId) =>
    withSession('joinQueue', () => supabase.rpc('join_queue', {
        p_short_id: shortId,
        p_member_name: memberName,
        p_service_id: serviceId ?? null,
    }));

// --- Участник ---------------------------------------------------------

/**
 * Всё для страницы ожидания одним запросом: свой статус, сколько человек
 * впереди, прогноз времени и объявления организатора.
 *
 * Считать «перед вами N» на клиенте больше нельзя: участник по политикам
 * видит только собственную строку, чужие ему не отдаются.
 */
export const getMyQueueStatus = (memberId) =>
    withSession('getMyQueueStatus', () => supabase.rpc('get_my_queue_status', { p_member_id: memberId }));

export const acknowledgeCall = (memberId) =>
    withSession('acknowledgeCall', () =>
        supabase.from('queue_members').update({ status: 'acknowledged' }).eq('id', memberId));

export const deferMyCall = (memberId, skip = 3) =>
    withSession('deferMyCall', () => supabase.rpc('defer_my_call', { p_member_id: memberId, p_skip: skip }));

export const leaveQueue = (memberId) =>
    withSession('leaveQueue', () => supabase.from('queue_members').delete().eq('id', memberId));

// --- Администратор очереди --------------------------------------------

export const getMembersByQueueId = (queueId) =>
    withSession('getMembersByQueueId', () => supabase
        .from('queue_members')
        .select('*, service_name:services (name), window_name:windows (name)')
        .eq('queue_id', queueId)
        .order('sort_order', { ascending: true }));

export const deleteMember = (memberId) =>
    withSession('deleteMember', () => supabase.from('queue_members').delete().eq('id', memberId));

export const updateMemberStatus = (memberId, status) =>
    withSession('updateMemberStatus', () =>
        supabase.from('queue_members').update({ status }).eq('id', memberId));

export const getWindowsByQueueId = (queueId) =>
    withSession('getWindowsByQueueId', () => supabase
        .from('windows').select('*, window_services(*)').eq('queue_id', queueId)
        .order('created_at', { ascending: true }));

export const getServicesByQueueId = (queueId) =>
    withSession('getServicesByQueueId', () => supabase
        .from('services').select('*, window_services(window_id)').eq('queue_id', queueId).order('name'));

export const addService = (queueId, serviceName) =>
    withSession('addService', () =>
        supabase.from('services').insert({ queue_id: queueId, name: serviceName }).select().single());

export const removeService = (serviceId) =>
    withSession('removeService', () => supabase.from('services').delete().eq('id', serviceId));

export const updateServiceWindowAssignments = (serviceId, windowIds) =>
    withSession('updateServiceWindowAssignments', () => supabase.rpc('update_service_window_assignments', {
        p_service_id: serviceId, p_window_ids: windowIds,
    }));

export const addWindowsToQueue = (queueId, count) =>
    withSession('addWindowsToQueue', () =>
        supabase.rpc('add_windows_to_queue', { p_queue_id: queueId, p_new_window_count: count }));

export const getQueueStats = (queueId) =>
    withSession('getQueueStats', () => supabase.rpc('get_queue_stats', { p_queue_id: queueId }));

// --- Объявления организатора ------------------------------------------

export const getAnnouncements = (queueId) =>
    withSession('getAnnouncements', () => supabase
        .from('queue_announcements').select('*').eq('queue_id', queueId)
        .order('created_at', { ascending: false }));

export const postAnnouncement = (queueId, body) =>
    withSession('postAnnouncement', () => supabase
        .from('queue_announcements').insert({ queue_id: queueId, body }).select().single());

export const deleteAnnouncement = (id) =>
    withSession('deleteAnnouncement', () => supabase.from('queue_announcements').delete().eq('id', id));

// --- Оператор окна ----------------------------------------------------

export const getWindowAdminInitialData = (shortKey) =>
    withSession('getWindowAdminInitialData', () =>
        supabase.rpc('get_window_admin_initial_data', { p_short_key: shortKey }));

export const callNextMemberToWindow = (windowId) =>
    withSession('callNextMemberToWindow', () =>
        supabase.rpc('call_next_member_to_window', { p_window_id: windowId }));

export const callSpecificMember = (memberId, windowId) =>
    withSession('callSpecificMember', () => supabase
        .from('queue_members')
        .update({ status: 'called', assigned_window_id: windowId, called_at: new Date().toISOString() })
        .eq('id', memberId));

export const returnMemberToWaiting = (memberId) =>
    withSession('returnMemberToWaiting', () => supabase
        .from('queue_members')
        .update({ status: 'waiting', assigned_window_id: null, acknowledged_at: null })
        .eq('id', memberId));
