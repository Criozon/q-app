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
    qrCodeUrl: string;
    joinUrl: string;
    waitingMembersCount: number;
    setQueue: Dispatch<SetStateAction<Queue | null>>;
    loadQueueData: (isInitialLoad?: boolean) => Promise<void>;
}
