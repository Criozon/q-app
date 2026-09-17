/**
 * Часы сервера.
 *
 * Зачем: таймер выдачи хранится абсолютным моментом, а отсчёт на экране
 * считается вычитанием из него текущего времени устройства. Если часы
 * телефона убежали на пять минут, человек увидит неверный остаток —
 * и это важно, потому что по этому остатку он возвращает лодку.
 *
 * Поэтому запросы отдают своё now(), а здесь один раз запоминается
 * поправка. Дальше время берётся из локальных часов со сдвигом — это
 * работает и без связи, в отличие от похода на сервер за каждым тиком.
 *
 * Точность ограничена задержкой сети (ответ шёл какое-то время, и на
 * этот срок сервер уже «постарел»). Для минут это несущественно.
 */

let offsetMs = 0;

/** Запомнить поправку по ответу сервера. Неразобранное время игнорируем. */
export const syncClock = (serverNowIso: string | null | undefined): void => {
    if (!serverNowIso) return;
    const serverMs = Date.parse(serverNowIso);
    if (Number.isNaN(serverMs)) return;
    offsetMs = Date.now() - serverMs;
};

/** Текущий момент по часам сервера, в миллисекундах. */
export const serverNow = (): number => Date.now() - offsetMs;

/** Сколько осталось до момента. Отрицательное — время уже вышло. */
export const msUntil = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const target = Date.parse(iso);
    return Number.isNaN(target) ? null : target - serverNow();
};

/**
 * Длительность словами: «7 мин», «1 ч 20 мин», «40 сек».
 * Секунды показываем только на последней минуте — раньше они лишь
 * мельтешат, а на последней минуте это как раз то, что нужно видеть.
 */
export const formatDuration = (ms: number): string => {
    const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
    if (total < 60) return `${total} сек`;

    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes} мин`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
};

/** Таймер крупно: «12:04» — минуты и секунды, как на секундомере. */
export const formatClock = (ms: number): string => {
    const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};
