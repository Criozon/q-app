import { useEffect, useState } from 'react';

/**
 * Перерисовка раз в секунду — чтобы шли обратные отсчёты.
 *
 * Один таймер на страницу, а не по одному на карточку: у лодочника
 * может быть открыто полтора десятка сеансов, и полтора десятка
 * интервалов там, где хватает одного, — лишняя работа для телефона.
 */
export function useTicker(intervalMs = 1000): number {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick(value => value + 1), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);

    return tick;
}
