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

/**
 * Создает новую очередь, окна для нее и услуги.
 * Использует RPC-функцию в Supabase.
 */
export const createQueue = (queueData) => {
  return supabase.rpc('create_new_queue', queueData);
};

/**
 * Получает публичные данные об очереди для страницы вступления.
 * Использует RPC-функцию для обхода RLS.
 */
export const getQueueDetailsForJoining = (queueId) => {
    return supabase.rpc('get_queue_details_for_join_page', { p_queue_id: queueId });
}

/**
 * Получает очередь по ее публичному ID.
 */
export const getQueueById = (queueId) => {
  return supabase
    .from('queues')
    .select('*')
    .eq('id', queueId)
    .single();
};

/**
 * Получает очередь по ее секретному ключу администратора.
 */
export const getQueueBySecret = (secretKey) => {
  return supabase
    .from('queues')
    .select('*')
    .eq('admin_secret_key', secretKey)
    .single();
};

/**
 * Обновляет статус очереди (active/paused).
 */
export const updateQueueStatus = (queueId, newStatus) => {
  return supabase
    .from('queues')
    .update({ status: newStatus, updated_at: new Date() })
    .eq('id', queueId);
};

/**
 * Удаляет очередь и все связанные с ней данные.
 * Использует RPC-функцию в Supabase для безопасного каскадного удаления.
 */
export const deleteQueue = (queueId) => {
    return supabase.rpc('delete_queue_and_dependents', { p_queue_id: queueId });
}


// --- Member Management ---

/**
 * Создает нового участника в очереди.
 * Использует RPC для проверки статуса очереди перед созданием.
 */
export const createMember = (memberData) => {
  return supabase
    .from('queue_members')
    .insert(memberData)
    .select()
    .single();
};

/**
 * Получает участника по его ID со всеми связанными данными.
 */
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

/**
 * Получает всех участников для конкретной очереди.
 */
export const getMembersByQueueId = (queueId) => {
  return supabase
    .from('queue_members')
    .select('*, services(name), windows(name)')
    .eq('queue_id', queueId)
    .order('ticket_number', { ascending: true });
};

/**
 * Обновляет статус участника.
 */
export const updateMemberStatus = (memberId, newStatus) => {
  return supabase
    .from('queue_members')
    .update({ status: newStatus, updated_at: new Date() })
    .eq('id', memberId);
};

/**
 * Возвращает участника в состояние ожидания.
 */
export const returnMemberToWaiting = async (memberId) => {
    return supabase
        .from('queue_members')
        .update({ status: 'waiting', assigned_window_id: null, updated_at: new Date() })
        .eq('id', memberId);
};

/**
 * Удаляет участника из очереди.
 */
export const deleteMember = (memberId) => {
  return supabase
    .from('queue_members')
    .delete()
    .eq('id', memberId);
};

/**
 * Получает количество ожидающих впереди.
 */
export const getWaitingMembersCount = (queueId, myTicketNumber) => {
  return supabase
    .from('queue_members')
    .select('*', { count: 'exact', head: true })
    .eq('queue_id', queueId)
    .eq('status', 'waiting')
    .lt('ticket_number', myTicketNumber);
};


// --- Window & Service Management ---

/**
 * Получает все окна для конкретной очереди.
 */
export const getWindowsByQueueId = (queueId) => {
  return supabase
    .from('windows')
    .select('*, window_services(service_id)')
    .eq('queue_id', queueId)
    .order('name', { ascending: true });
};

/**
 * Получает окно по его секретному ключу администратора.
 */
export const getWindowBySecretKey = (secretKey) => {
  return supabase
    .from('windows')
    .select('*, queues(*)')
    .eq('admin_secret_key', secretKey)
    .single();
};

/**
 * Получает всех участников, подходящих для обслуживания в данном окне.
 */
export const getMembersForWindow = (windowId, queueId) => {
    return supabase.rpc('get_members_for_window', { p_window_id: windowId, p_queue_id: queueId });
};

/**
 * Получает все услуги для очереди.
 */
export const getServicesByQueueId = (queueId) => {
    return supabase
        .from('services')
        .select('*')
        .eq('queue_id', queueId)
        .order('name');
}

/**
 * Добавляет новую услугу в очередь.
 */
export const addService = (queueId, serviceName) => {
    return supabase.from('services').insert({ queue_id: queueId, name: serviceName });
}

/**
 * Удаляет услугу.
 */
export const removeService = (serviceId) => {
    return supabase.from('services').delete().eq('id', serviceId);
}

/**
 * Устанавливает, какие услуги обслуживаются в данном окне.
 */
export const setServicesForWindow = async (windowId, serviceIds) => {
    // 1. Удаляем все текущие привязки для этого окна
    await supabase.from('window_services').delete().eq('window_id', windowId);
    
    // 2. Если есть что добавлять, создаем новые привязки
    if (serviceIds.length > 0) {
        const relations = serviceIds.map(service_id => ({ window_id: windowId, service_id }));
        return supabase.from('window_services').insert(relations);
    }
    
    return { error: null };
};


// --- Operator Actions (RPC) ---

/**
 * Вызывает следующего подходящего участника к окну.
 */
export const callNextMemberToWindow = (windowId) => {
    return supabase.rpc('call_next_member', { p_window_id: windowId });
};

/**
 * Вызывает конкретного участника к окну.
 */
export const assignAndCallMember = (memberId, windowId) => {
    return supabase
        .from('queue_members')
        .update({ status: 'called', assigned_window_id: windowId, updated_at: new Date() })
        .eq('id', memberId);
};