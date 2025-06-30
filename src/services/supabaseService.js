import { createClient } from '@supabase/supabase-js';

// Инициализация клиента Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Realtime Subscriptions ---

export const subscribe = (channelName, options, callback) => {
  const channel = supabase.channel(channelName);
  channel
    .on('postgres_changes', options, callback)
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Успешно подписан на канал ${channelName}`);
      }
      if (status === 'CHANNEL_ERROR') {
        console.error(`Ошибка канала ${channelName}:`, err);
      }
    });
  return channel;
};

export const removeSubscription = (channel) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};


// --- Queue Management ---

export const createQueue = (queueData) => {
  return supabase.rpc('create_new_queue', queueData);
};

export const getQueueDetailsForJoining = (queueId) => {
    return supabase.rpc('get_queue_details_for_join_page', { p_queue_id: queueId });
}

export const getQueueById = (queueId) => {
  return supabase
    .from('queues')
    .select('*')
    .eq('id', queueId)
    .single();
};

export const getQueueBySecret = (secretKey) => {
  return supabase
    .from('queues')
    .select('*')
    .eq('admin_secret_key', secretKey)
    .single();
};

export const updateQueueStatus = (queueId, newStatus) => {
  return supabase
    .from('queues')
    .update({ status: newStatus, updated_at: new Date() })
    .eq('id', queueId);
};

export const deleteQueue = (queueId) => {
    return supabase.rpc('delete_queue_and_dependents', { p_queue_id: queueId });
}


// --- Member Management ---

export const createMember = (memberData) => {
  return supabase
    .from('queue_members')
    .insert(memberData)
    .select()
    .single();
};

export const getMemberById = (memberId) => {
  return supabase
    .from('queue_members')
    .select(`
      *,
      queues(*),
      windows(*),
      services(*)
    `)
    .eq('id', memberId)
    .single();
};

export const getMembersByQueueId = (queueId) => {
  return supabase
    .from('queue_members')
    .select('*, services(name), windows(name)')
    .eq('queue_id', queueId)
    .order('ticket_number', { ascending: true });
};

export const updateMemberStatus = (memberId, newStatus) => {
  return supabase
    .from('queue_members')
    .update({ status: newStatus, updated_at: new Date() })
    .eq('id', memberId);
};

export const returnMemberToWaiting = async (memberId) => {
    return supabase
        .from('queue_members')
        .update({ status: 'waiting', assigned_window_id: null, updated_at: new Date() })
        .eq('id', memberId);
};

export const deleteMember = (memberId) => {
  return supabase
    .from('queue_members')
    .delete()
    .eq('id', memberId);
};

export const getWaitingMembersCount = (queueId, myTicketNumber) => {
  return supabase
    .from('queue_members')
    .select('*', { count: 'exact', head: true })
    .eq('queue_id', queueId)
    .eq('status', 'waiting')
    .lt('ticket_number', myTicketNumber);
};


// --- Window & Service Management ---

export const getWindowsByQueueId = (queueId) => {
  return supabase
    .from('windows')
    .select('*, window_services(service_id)')
    .eq('queue_id', queueId)
    .order('name', { ascending: true });
};

export const getWindowBySecretKey = (secretKey) => {
  return supabase
    .from('windows')
    .select('*, queues(*)')
    .eq('admin_secret_key', secretKey)
    .single();
};

export const getMembersForWindow = (windowId, queueId) => {
    return supabase.rpc('get_members_for_window', { p_window_id: windowId, p_queue_id: queueId });
};

export const getServicesByQueueId = (queueId) => {
    return supabase
        .from('services')
        .select('*')
        .eq('queue_id', queueId)
        .order('name');
}

export const addService = (queueId, serviceName) => {
    return supabase.from('services').insert({ queue_id: queueId, name: serviceName });
}

export const removeService = (serviceId) => {
    return supabase.from('services').delete().eq('id', serviceId);
}

export const setServicesForWindow = async (windowId, serviceIds) => {
    await supabase.from('window_services').delete().eq('window_id', windowId);
    if (serviceIds.length > 0) {
        const relations = serviceIds.map(service_id => ({ window_id: windowId, service_id }));
        return supabase.from('window_services').insert(relations);
    }
    return { error: null };
};


// --- Operator Actions (RPC) ---

export const callNextMemberToWindow = (windowId) => {
    return supabase.rpc('call_next_member', { p_window_id: windowId });
};

// --- НАЧАЛО ИЗМЕНЕНИЙ ---
// Заменяем старую функцию на вызов новой RPC
export const callSpecificMember = (memberId, windowId) => {
    return supabase.rpc('call_specific_member', {
        p_member_id: memberId,
        p_window_id: windowId,
    });
};
// --- КОНЕЦ ИЗМЕНЕНИЙ ---