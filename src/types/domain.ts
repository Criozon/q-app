import type { ReactNode } from 'react';
import type { Database } from './database';

type Tables = Database['public']['Tables'];

export type QueueRow = Tables['queues']['Row'];
export type QueueMemberRow = Tables['queue_members']['Row'];
export type Service = Tables['services']['Row'];
export type QueueWindow = Tables['windows']['Row'];
export type Announcement = Tables['queue_announcements']['Row'];

export type MemberStatus = 'waiting' | 'called' | 'acknowledged' | 'in_service' | 'serviced';
export type QueueStatus = 'active' | 'paused';

/**
 * В базе status — это text с CHECK-ограничением, и генератор типов видит
 * просто string. Сужаем вручную: набор значений задан в миграции 0001
 * и меняется только вместе с ней.
 */
type WithMemberStatus<T> = Omit<T, 'status'> & { status: MemberStatus };
type WithQueueStatus<T> = Omit<T, 'status'> & { status: QueueStatus };

export type Queue = WithQueueStatus<QueueRow>;
export type QueueMember = WithMemberStatus<QueueMemberRow>;

/**
 * Услуга в форме создания или настройки очереди — ещё не сохранённая.
 * `id` здесь временный (uuid с клиента), `window_indices` — номера окон
 * с ЕДИНИЦЫ: ровно в таком виде их ждёт SQL, массивы в Postgres тоже 1-based.
 */
export interface ServiceDraft {
    id: string;
    name: string;
    window_indices: number[];
}

/** Ответ get_queue_for_join: то немногое, что видно до вступления в очередь. */
export interface JoinDetails {
    queue: Pick<Queue, 'id' | 'name' | 'description' | 'status'> | null;
    services: Pick<Service, 'id' | 'name'>[];
    /** Сколько человек ждёт прямо сейчас. */
    waiting_count: number;
    /** Средняя длительность приёма. null — мерить ещё нечего. */
    avg_service_minutes: number | null;
}

/**
 * Ответ get_my_queue_status — всё для страницы ожидания одним запросом.
 * Считать «перед вами N» на клиенте нельзя: участник по политикам доступа
 * видит только собственную строку.
 */
export interface MyQueueStatus {
    error?: 'member_not_found' | 'queue_deleted';
    member: {
        id: string;
        member_name: string;
        display_code: string | null;
        ticket_number: number;
        status: MemberStatus;
        defer_count: number;
        /** Заметка администратора: «Катамаран 3». Показывается участнику. */
        note: string | null;
        /** Когда истекает выданное время. null — таймера нет. */
        timer_ends_at: string | null;
        service_name: string | null;
        window_name: string | null;
    };
    queue: Pick<Queue, 'id' | 'name' | 'status' | 'window_count'>;
    people_ahead: number;
    estimated_minutes: number;
    /** Момент на сервере: по нему выправляется отсчёт, см. utils/clock.ts. */
    server_now: string;
    announcements: Pick<Announcement, 'id' | 'body' | 'created_at'>[];
}

/** Ответ get_queue_stats. null означает «мерить ещё нечего», а не ноль. */
export interface QueueStats {
    served_total: number;
    waiting_now: number;
    avg_service_minutes: number | null;
    avg_wait_minutes: number | null;
    deferred_total: number;
    /** Момент времени, а не строка: часовой пояс подставляет клиент. */
    peak_hour_at: string | null;
    by_window: { window_name: string; served: number; avg_minutes: number | null }[];
}

/** Ответ get_window_admin_initial_data для панели оператора. */
export interface WindowAdminData {
    windowInfo: { id: string; name: string; queue_id: string } | null;
    queueInfo: Pick<Queue, 'id' | 'name' | 'short_id' | 'status'> | null;
    /**
     * ВНИМАНИЕ: service_name здесь ПЛОСКАЯ СТРОКА — панель окна рендерит её
     * напрямую как текст. В AdminPage то же поле приходит объектом {name},
     * потому что там данные идут из PostgREST-embed. Формы намеренно разные,
     * см. комментарий в миграции 0001.
     */
    members: (Pick<QueueMember,
        'id' | 'created_at' | 'queue_id' | 'member_name' | 'status' | 'ticket_number' |
        'display_code' | 'service_id' | 'assigned_window_id' | 'acknowledged_at' |
        'note' | 'timer_ends_at'
    > & { service_name: string | null })[];
    /** Момент на сервере: по нему выправляется отсчёт, см. utils/clock.ts. */
    server_now: string;
}

/** Участник в общей админке: поля-связи приходят объектами из PostgREST-embed. */
export type AdminMember = QueueMember & {
    service_name: { name: string } | null;
    window_name: { name: string } | null;
};

/** Окно вместе с привязанными услугами. */
export type WindowWithServices = QueueWindow & {
    window_services: { window_id: string; service_id: string }[];
};

/** Услуга вместе с окнами, в которых она доступна. */
export type ServiceWithWindows = Service & {
    window_services: { window_id: string }[];
};

/** Очередь в списке «мои очереди» — хранится в localStorage. */
export interface SavedQueue {
    id: string;
    name: string;
    admin_secret_key: string;
}

/** Сессия участника в localStorage. */
export interface ActiveSession {
    memberId: string;
    queueId: string;
}

/**
 * Состояние модального подтверждения. Открывается заполненным объектом,
 * закрывается через { isOpen: false } — поэтому всё, кроме isOpen,
 * необязательно.
 */
export interface ConfirmationState {
    isOpen: boolean;
    title?: string;
    message?: ReactNode;
    onConfirm?: () => void;
    onCancelAction?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}
