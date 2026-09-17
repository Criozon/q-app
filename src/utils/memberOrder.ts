import type { MemberStatus } from '../types/domain';

interface Orderable {
    status: MemberStatus;
    timer_ends_at: string | null;
}

/**
 * Порядок групп в списке. Управление переехало на карточки, и список стал
 * единственным экраном работы — значит сверху должно быть то, что требует
 * внимания прямо сейчас.
 */
const RANK: Record<MemberStatus, number> = {
    in_service: 0,   // на руках: у кого-то время вот-вот кончится
    called: 1,       // вызван и идёт к стойке
    acknowledged: 1,
    waiting: 2,      // ждут своей очереди
    serviced: 3,     // закончили, пусть оседают внизу
};

/**
 * Внутри «на руках» — по остатку времени, просроченные первыми; без
 * таймера в конец группы, они никуда не горят. В остальных группах
 * порядок сохраняется как пришёл (сортировка в JS устойчива), то есть
 * по номеру талона.
 */
export const byWorkOrder = <T extends Orderable>(a: T, b: T): number => {
    const byRank = RANK[a.status] - RANK[b.status];
    if (byRank !== 0) return byRank;
    if (a.status !== 'in_service') return 0;

    if (!a.timer_ends_at) return b.timer_ends_at ? 1 : 0;
    if (!b.timer_ends_at) return -1;
    return Date.parse(a.timer_ends_at) - Date.parse(b.timer_ends_at);
};
