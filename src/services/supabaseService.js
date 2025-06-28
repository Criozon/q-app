import { supabase } from '../supabaseClient';

// --- Функции для работы с ОЧЕРЕДЯМИ ---

/**
 * Получает данные очереди по ее секретному ключу администратора.
 * @param {string} secretKey - Секретный ключ.
 * @returns {Promise<object>} Данные очереди.
 */
export const getQueueBySecret = (secretKey) => {
    return supabase
        .from('queues')
        .select('*')
        .eq('admin_secret_key', secretKey)
        .single();
};

/**
 * Получает данные очереди по ее ID.
 * @param {string} queueId - ID очереди.
 * @returns {Promise<object>} Данные очереди (только name, description, status).
 */
export const getQueueById = (queueId) => {
    return supabase
        .from('queues')
        .select('name, description, status')
        .eq('id', queueId)
        .single();
};

/**
 * Создает новую очередь.
 * @param {{name: string, description: string}} queueData - Данные для новой очереди.
 * @returns {Promise<object>} Данные созданной очереди.
 */
export const createQueue = (queueData) => {
    return supabase
        .from('queues')
        .insert([queueData])
        .select()
        .single();
};

/**
 * Обновляет статус очереди (active/paused).
 * @param {string} queueId - ID очереди.
 * @param {'active' | 'paused'} newStatus - Новый статус.
 * @returns {Promise<object>} Результат обновления.
 */
export const updateQueueStatus = (queueId, newStatus) => {
    return supabase
        .from('queues')
        .update({ status: newStatus })
        .eq('id', queueId);
};

/**
 * Удаляет очередь и всех ее участников с помощью RPC.
 * @param {string} queueId - ID очереди для удаления.
 * @returns {Promise<object>} Результат выполнения процедуры.
 */
export const deleteQueue = (queueId) => {
    return supabase.rpc('delete_queue_and_members', {
        queue_id_to_delete: queueId
    });
};


// --- Функции для работы с УЧАСТНИКАМИ ---

/**
 * Получает всех участников для указанной очереди.
 * @param {string} queueId - ID очереди.
 * @returns {Promise<Array<object>>} Массив участников.
 */
export const getMembersByQueueId = (queueId) => {
    return supabase
        .from('queue_members')
        .select('*')
        .eq('queue_id', queueId)
        .order('ticket_number');
};

/**
 * Получает данные одного участника по его ID.
 * @param {string} memberId - ID участника.
 * @returns {Promise<object>} Данные участника.
 */
export const getMemberById = (memberId) => {
     // ----- ИЗМЕНЕНИЕ ЗДЕСЬ -----
     // Мы запрашиваем все поля участника (*), а также имя связанной очереди.
     return supabase
        .from('queue_members')
        .select('*, queues(name)') // Было: 'status, queues(name)'
        .eq('id', memberId)
        .single();
};

/**
 * Создает нового участника в очереди.
 * @param {{queue_id: string, member_name: string, display_code: string}} memberData - Данные нового участника.
 * @returns {Promise<object>} ID созданного участника.
 */
export const createMember = (memberData) => {
    return supabase
        .from('queue_members')
        .insert([memberData])
        .select('id')
        .single();
};

/**
 * Обновляет статус участника (waiting/called/serviced).
 * @param {string} memberId - ID участника.
 * @param {'waiting' | 'called' | 'serviced'} newStatus - Новый статус.
 * @returns {Promise<object>} Результат обновления.
 */
export const updateMemberStatus = (memberId, newStatus) => {
    return supabase
        .from('queue_members')
        .update({ status: newStatus })
        .eq('id', memberId);
};

/**
 * Удаляет участника из очереди.
 * @param {string} memberId - ID участника для удаления.
 * @returns {Promise<object>} Результат удаления.
 */
export const deleteMember = (memberId) => {
    return supabase
        .from('queue_members')
        .delete()
        .eq('id', memberId);
};

/**
 * Подсчитывает количество людей перед указанным участником.
 * @param {string} queueId - ID очереди.
 * @param {number} ticketNumber - Номер билета текущего участника.
 * @returns {Promise<{count: number}>} Количество людей впереди.
 */
export const getWaitingMembersCount = (queueId, ticketNumber) => {
    return supabase
        .from('queue_members')
        .select('*', { count: 'exact', head: true })
        .eq('queue_id', queueId)
        .eq('status', 'waiting')
        .lt('ticket_number', ticketNumber);
};

// --- Функции для работы с REALTIME ---

/**
 * Создает и подписывается на канал для отслеживания изменений.
 * @param {string} channelName - Уникальное имя канала.
 * @param {object} options - Опции для подписки (event, schema, table, filter).
 * @param {Function} callback - Функция, вызываемая при получении события.
 * @returns {object} Экземпляр канала Supabase.
 */
export const subscribe = (channelName, options, callback) => {
    const channel = supabase.channel(channelName);
    channel
        .on('postgres_changes', options, callback)
        .subscribe();
    return channel;
};

/**
 * Отписывается от указанного канала.
 * @param {object} channel - Экземпляр канала для отписки.
 */
export const removeSubscription = (channel) => {
    if (channel) {
        supabase.removeChannel(channel);
    }
};