// src/services/supabaseService.js

import { createClient } from '@supabase/supabase-js';
import log from '../utils/logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const handleResponse = ({ data, error }, context) => {
    if (error) {
        log('Supabase Error', `[${context}] ${error.message}`, error);
        throw error;
    }
    return { data, error };
};

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
export const createQueue = (queueData) => supabase.rpc('create_queue_with_services_and_windows', { p_name: queueData.name, p_description: queueData.description, p_window_count: queueData.window_count, p_services: queueData.services_payload }).then(response => handleResponse(response, 'createQueue'));
export const getQueueBySecret = (secretKey) => supabase.from('queues').select('*').eq('admin_secret_key', secretKey).single().then(response => handleResponse(response, 'getQueueBySecret'));
export const getQueueById = (queueId) => supabase.from('queues').select('*').eq('id', queueId).single().then(response => handleResponse(response, 'getQueueById'));
export const getQueueByShortId = (shortId) => supabase.from('queues').select('*').eq('short_id', shortId).single().then(response => handleResponse(response, 'getQueueByShortId'));
export const getQueueDetailsForJoining = (queueId) => supabase.rpc('get_queue_details_for_joining', { p_queue_id: queueId }).then(response => handleResponse(response, 'getQueueDetailsForJoining'));
export const updateQueueStatus = (queueId, status) => supabase.from('queues').update({ status }).eq('id', queueId).then(response => handleResponse(response, 'updateQueueStatus'));
export const deleteQueue = (queueId) => supabase.from('queues').delete().eq('id', queueId).then(response => handleResponse(response, 'deleteQueue'));
export const createMember = (memberData) => supabase.from('queue_members').insert([memberData]).select().single().then(response => handleResponse(response, 'createMember'));
export const getMembersByQueueId = (queueId) => supabase.from('queue_members').select(`*, service_name:services (name), window_name:windows (name)`).eq('queue_id', queueId).order('ticket_number', { ascending: true }).then(response => handleResponse(response, 'getMembersByQueueId'));
export const getMemberById = (memberId) => supabase.from('queue_members').select(`*, queues (*), services (*), windows (*)`).eq('id', memberId).maybeSingle().then(response => handleResponse(response, 'getMemberById'));
export const getWaitingMembersCount = async (queueId, ticketNumber) => { const { count, error } = await supabase.from('queue_members').select('*', { count: 'exact', head: true }).eq('queue_id', queueId).eq('status', 'waiting').lt('ticket_number', ticketNumber); return { count, error }; };
export const updateMemberStatus = (memberId, status) => supabase.from('queue_members').update({ status }).eq('id', memberId).then(response => handleResponse(response, 'updateMemberStatus'));
export const deleteMember = (memberId) => supabase.from('queue_members').delete().eq('id', memberId).then(response => handleResponse(response, 'deleteMember'));
export const getWindowsByQueueId = (queueId) => supabase.from('windows').select('*, window_services(*)').eq('queue_id', queueId).order('name', { ascending: true }).then(response => handleResponse(response, 'getWindowsByQueueId'));
export const getWindowByShortKey = (shortKey) => supabase.from('windows').select('*, queues(*)').eq('short_key', shortKey).single().then(response => handleResponse(response, 'getWindowByShortKey'));
export const getMembersForWindow = (windowId) => supabase.rpc('get_members_for_window', { p_window_id: windowId }).then(response => handleResponse(response, 'getMembersForWindow'));
export const callNextMemberToWindow = (windowId) => supabase.rpc('call_next_member_to_window', { p_window_id: windowId }).then(response => handleResponse(response, 'callNextMemberToWindow'));
export const callSpecificMember = (memberId, windowId) => supabase.from('queue_members').update({ status: 'called', assigned_window_id: windowId }).eq('id', memberId).then(response => handleResponse(response, 'callSpecificMember'));
export const returnMemberToWaiting = (memberId) => supabase.from('queue_members').update({ status: 'waiting', assigned_window_id: null, acknowledged_at: null }).eq('id', memberId).then(response => handleResponse(response, 'returnMemberToWaiting'));
export const getServicesByQueueId = (queueId) => supabase.from('services').select('*, window_services(window_id)').eq('queue_id', queueId).order('name').then(response => handleResponse(response, 'getServicesByQueueId'));
export const addService = (queueId, serviceName) => supabase.from('services').insert({ queue_id: queueId, name: serviceName }).select().single().then(response => handleResponse(response, 'addService'));
export const removeService = (serviceId) => supabase.from('services').delete().eq('id', serviceId).then(response => handleResponse(response, 'removeService'));
export const setServicesForWindow = (windowId, serviceIds) => supabase.rpc('set_services_for_window', { p_window_id: windowId, p_service_ids: serviceIds }).then(response => handleResponse(response, 'setServicesForWindow'));
export const updateServiceWindowAssignments = (serviceId, windowIds) => supabase.rpc('update_service_window_assignments', { p_service_id: serviceId, p_window_ids: windowIds }).then(response => handleResponse(response, 'updateServiceWindowAssignments'));
export const addWindowsToQueue = (queueId, count) => { return supabase.rpc('add_windows_to_queue', { p_queue_id: queueId, p_new_window_count: count }).then(response => handleResponse(response, 'addWindowsToQueue')); };
export const checkQueueExists = async (queueId) => { const { count, error } = await supabase.from('queues').select('*', { count: 'exact', head: true }).eq('id', queueId); if (error) return false; return count > 0; };

// --- НОВАЯ ФУНКЦИЯ ---
export const getWindowAdminInitialData = (shortKey) => {
    return supabase.rpc('get_window_admin_initial_data', { 
        p_short_key: shortKey
    }).then(response => handleResponse(response, 'getWindowAdminInitialData'));
};
// --- КОНЕЦ НОВОЙ ФУНКЦИИ ---