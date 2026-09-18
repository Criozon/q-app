import { useCallback, useEffect, useRef, useState } from 'react';
import { isRealtimeLive } from '../services/supabaseService';
import log from '../utils/logger';

const SOURCE = 'wake';

/**
 * Телефон со сна возвращается не туда, где уснул.
 *
 * Пока экран погашен, система морозит вкладку целиком: интервалы не
 * тикают, сокет реального времени висит или молча оборван, а браузер об
 * этом не сообщает. Поэтому страница, вернувшись к человеку, показывала
 * то же, что час назад, пока не подойдёт очередной опрос. На телефоне
 * это и выглядит как «вызов не пришёл»: он пришёл, просто никто не
 * слушал, и никто не переспросил.
 *
 * Хук зовёт onWake, когда вкладка снова видна, вернулась из кеша или
 * вернулась сеть. А ещё возвращает «поколение» подписок: после долгого
 * сна или при оборванном сокете оно растёт, и страница пересобирает
 * каналы.
 *
 * Пересобирать приходится именно пересозданием. Соблазнительное
 * realtime.disconnect() внутри сносит каналы (teardown), но не переводит
 * их в closed, а channel.subscribe() работает ТОЛЬКО из closed — то есть
 * после такой «пересборки» страница осталась бы с живым сокетом и без
 * единой подписки. Тихо и навсегда.
 */

/** Короткую отлучку сокет переживает; долгую — уже нет. */
const STALE_AFTER_MS = 30_000;

export function useWakeRefresh(onWake: () => void): number {
    const onWakeRef = useRef(onWake);
    useEffect(() => { onWakeRef.current = onWake; }, [onWake]);

    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        let hiddenAt: number | null =
            document.visibilityState === 'hidden' ? Date.now() : null;

        const wake = (reason: string) => {
            const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
            hiddenAt = null;

            const slept = hiddenMs > STALE_AFTER_MS;
            const broken = !isRealtimeLive();
            const away = hiddenMs ? `, не смотрели ${Math.round(hiddenMs / 1000)} с` : '';
            log(SOURCE, `Вкладка вернулась (${reason})${away}`);

            if (slept || broken) {
                log(SOURCE, broken
                    ? 'Сокет реального времени мёртв — пересобираем подписки'
                    : 'Спали слишком долго, сокету верить нельзя — пересобираем подписки');
                setGeneration(value => value + 1);
            }

            onWakeRef.current();
        };

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
                return;
            }
            wake('снова видна');
        };
        // persisted — возврат из bfcache: там вкладка была заморожена целиком.
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) wake('восстановлена из кеша');
        };
        const onOnline = () => wake('вернулась сеть');

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pageshow', onPageShow);
        window.addEventListener('online', onOnline);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pageshow', onPageShow);
            window.removeEventListener('online', onOnline);
        };
    }, []);

    return generation;
}

/** Обёртка для случая, когда обновлялка живёт в ref. */
export function useWakeRefreshRef(refresh: React.RefObject<() => void>): number {
    return useWakeRefresh(useCallback(() => { refresh.current?.(); }, [refresh]));
}
