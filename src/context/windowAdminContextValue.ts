import type { WindowAdminData } from '../types/domain';

type Member = WindowAdminData['members'][number];

/** Что отдаёт WindowAdminProvider панели оператора окна. */
export interface WindowAdminContextValue {
    windowInfo: WindowAdminData['windowInfo'];
    queueInfo: WindowAdminData['queueInfo'];
    members: Member[];
    assignedMember: Member | undefined;
    loading: boolean;
    error: string | null;
    errorKind: 'not-found' | 'network' | null;
    isProcessing: boolean;
    isJoinModalOpen: boolean;
    joinUrl: string;
    qrCodeUrl: string;
    isQueueDeleted: boolean;
    setIsJoinModalOpen: (open: boolean) => void;
    loadInitialData: (isInitialLoad?: boolean) => Promise<void>;
    callNext: () => Promise<void>;
    callSpecific: (memberId: string) => Promise<void>;
    completeService: (memberId: string) => Promise<void>;
    returnToQueue: (memberId: string) => Promise<void>;
    /** Запустить время участнику. Заметку не трогает, минуты считает сервер. */
    startTimer: (memberId: string, minutes: number) => Promise<void>;
    /** Добавить времени тому, у кого оно уже идёт. */
    extendTimer: (memberId: string, minutes: number) => Promise<void>;
    /** Поправить заметку, не трогая таймер. */
    saveNote: (memberId: string, note: string | null) => Promise<void>;
}
