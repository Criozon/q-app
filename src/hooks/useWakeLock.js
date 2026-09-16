import { useCallback, useEffect, useRef, useState } from 'react';
import log from '../utils/logger';

const SOURCE = 'useWakeLock';

/**
 * Удерживает экран включённым, пока активна страница ожидания.
 *
 * Зачем: на iPhone при блокировке экрана страница выгружается — рвётся
 * Realtime-сокет, останавливаются таймеры, не играет звук. Событие «вас
 * вызвали» до устройства просто не доходит, а полноценный Web Push в обычной
 * вкладке Safari недоступен. Если экран не гаснет — страница остаётся жива.
 *
 * Safari (iOS 16.4+) требует пользовательский жест для первого запроса,
 * поэтому: пробуем сразу при монтировании, а если браузер отказал —
 * вешаемся на первое касание. Блокировка снимается системой при уходе
 * страницы в фон, поэтому её нужно переполучать по visibilitychange.
 *
 * @param {boolean} enabled - нужно ли удерживать экран прямо сейчас
 * @returns {{ isSupported: boolean, isActive: boolean }}
 */
export function useWakeLock(enabled) {
    const sentinelRef = useRef(null);
    const [isActive, setIsActive] = useState(false);

    const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

    const release = useCallback(async () => {
        const sentinel = sentinelRef.current;
        sentinelRef.current = null;
        setIsActive(false);
        if (sentinel && !sentinel.released) {
            try {
                await sentinel.release();
                log(SOURCE, 'Блокировка экрана снята.');
            } catch (err) {
                log(SOURCE, 'Не удалось снять блокировку экрана', err);
            }
        }
    }, []);

    const request = useCallback(async () => {
        if (!isSupported || sentinelRef.current) return false;
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            sentinelRef.current = sentinel;
            setIsActive(true);
            log(SOURCE, 'Экран удерживается включённым.');

            // Система снимает блокировку сама (уход в фон, разряд батареи).
            sentinel.addEventListener('release', () => {
                if (sentinelRef.current === sentinel) {
                    sentinelRef.current = null;
                    setIsActive(false);
                }
            });
            return true;
        } catch (err) {
            // Штатная ситуация: Safari отказывает вне пользовательского жеста.
            log(SOURCE, 'Запрос блокировки экрана отклонён', err);
            return false;
        }
    }, [isSupported]);

    useEffect(() => {
        if (!isSupported || !enabled) {
            release();
            return;
        }

        let cancelled = false;

        // Слушатели ставим заранее: если первый запрос отклонят из-за
        // отсутствия жеста, повторим на первое же касание.
        const onFirstGesture = () => request();
        const gestureEvents = ['pointerdown', 'touchstart', 'keydown'];
        const addGestureListeners = () => {
            gestureEvents.forEach(e => window.addEventListener(e, onFirstGesture, { once: true }));
        };
        const removeGestureListeners = () => {
            gestureEvents.forEach(e => window.removeEventListener(e, onFirstGesture));
        };

        request().then(granted => {
            if (!cancelled && !granted) addGestureListeners();
        });

        // Вернулись из фона — блокировка уже снята системой, берём заново.
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') request();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            cancelled = true;
            removeGestureListeners();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            release();
        };
    }, [isSupported, enabled, request, release]);

    return { isSupported, isActive };
}
