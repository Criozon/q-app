import log from './logger';

/**
 * Замок сессии с ограниченным ожиданием.
 *
 * supabase-js сериализует всю работу с сессией через navigator.locks и
 * ждёт замок БЕСКОНЕЧНО: во всех вызовах стоит acquireTimeout = -1.
 * А замок берётся на каждый запрос к данным — PostgREST спрашивает
 * текущий токен. Значит, пока замок держит кто-то другой, встаёт
 * ВСЁ приложение.
 *
 * Держит его, например, вкладка с погашенным экраном: система заморозила
 * её посреди обновления токена, отпустить замок некому. Человек будит
 * телефон, жмёт «Я иду!» — и двадцать секунд смотрит на «Подтверждаем…»,
 * после чего получает «не удалось». Проверено опытом: под удержанным
 * замком действие висит ровно столько, сколько замок держат.
 *
 * Поэтому ждём ограниченное время, а дальше работаем без замка. Худшее
 * последствие — две вкладки обновят токен одновременно; Supabase держит
 * прежний refresh-токен годным ещё некоторое время, так что это
 * переживаемо. Замереть на двадцать секунд и соврать «не удалось» — нет.
 */

/** Столько ждём чужой замок, прежде чем пойти без него. */
export const SESSION_LOCK_WAIT_MS = 5_000;

/** Ровно та часть LockManager, которая здесь нужна. */
export interface LockRequester {
    request<R>(
        name: string,
        options: { mode: 'exclusive'; signal: AbortSignal },
        callback: () => Promise<R>,
    ): Promise<R>;
}

export type LockFn = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

export function makeBoundedLock(
    locks: LockRequester | undefined,
    waitMs: number = SESSION_LOCK_WAIT_MS,
): LockFn {
    return async function boundedLock<R>(
        name: string,
        _acquireTimeout: number,
        fn: () => Promise<R>,
    ): Promise<R> {
        // Браузер без navigator.locks (и старый Safari) просто работает
        // без них — это штатный для supabase-js режим.
        if (!locks) return fn();

        const controller = new AbortController();
        const giveUp = setTimeout(() => controller.abort(), waitMs);

        try {
            return await locks.request(
                name,
                { mode: 'exclusive', signal: controller.signal },
                async () => {
                    // Замок взят — отменять уже нечего.
                    clearTimeout(giveUp);
                    return fn();
                },
            );
        } catch (error) {
            // AbortError — это наш собственный отказ ждать. Всё остальное
            // (в том числе ошибка самой операции) должно лететь дальше.
            if ((error as Error)?.name !== 'AbortError') throw error;
            log('auth', `Замок сессии занят дольше ${waitMs / 1000} с — работаем без него`);
            return fn();
        } finally {
            clearTimeout(giveUp);
        }
    };
}
