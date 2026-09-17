import type { Dispatch, SetStateAction } from 'react';
import type { Queue, AdminMember, WindowWithServices, ServiceWithWindows } from '../types/domain';

/** Что отдаёт QueueProvider общей админке очереди. */
export interface QueueContextValue {
    queue: Queue | null;
    members: AdminMember[];
    windows: WindowWithServices[];
    services: ServiceWithWindows[];
    loading: boolean;
    error: string | null;
    /**
     * Природа ошибки. Сетевой сбой и «очереди нет» выглядят для кода
     * одинаково, но человеку нужно сказать разное: в первом случае —
     * «попробуйте ещё раз», во втором — «ссылка неверна».
     */
    errorKind: 'not-found' | 'network' | null;
    qrCodeUrl: string;
    joinUrl: string;
    waitingMembersCount: number;
    setQueue: Dispatch<SetStateAction<Queue | null>>;
    loadQueueData: (isInitialLoad?: boolean) => Promise<void>;
}
