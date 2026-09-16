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
}
