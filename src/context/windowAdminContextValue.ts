import type { WindowAdminData } from '../types/domain';

type Member = WindowAdminData['members'][number];

/** Что отдаёт WindowAdminProvider панели оператора окна. */
export interface WindowAdminContextValue {
    windowInfo: WindowAdminData['windowInfo'];
    queueInfo: WindowAdminData['queueInfo'];
    members: Member[];
    assignedMember: Member | undefined;
    /**
     * Те, у кого идёт выданное время. В отличие от assignedMember их может
     * быть сколько угодно: лодочник выдал пять катамаранов и ждёт все пять.
     */
    activeMembers: Member[];
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
    callSpecific: (memberId: string, assignedMember: Member | undefined) => Promise<void>;
    completeService: (memberId: string) => Promise<void>;
    returnToQueue: (memberId: string) => Promise<void>;
    /** Принять участника: пометка и, если нужно, время. Минуты считает сервер. */
    startSession: (memberId: string, note: string | null, minutes: number | null) => Promise<void>;
    /** Добавить времени уже принятому участнику. */
    extendTimer: (memberId: string, minutes: number) => Promise<void>;
    /** Поправить пометку, не трогая таймер. */
    saveNote: (memberId: string, note: string | null) => Promise<void>;
}
