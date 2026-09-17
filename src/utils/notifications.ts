import log from './logger';

/**
 * Показ системного уведомления.
 *
 * Главная причина существования этого файла: Chrome на Android запрещает
 * `new Notification()` со страницы и бросает исключение. Раньше этот вызов
 * стоял прямо в useEffect страницы ожидания, поэтому в момент вызова
 * участника React сносил всё дерево и человек видел белый экран — ровно
 * тогда, когда экран был нужнее всего.
 *
 * Поэтому: сначала пробуем через service worker (так работает Android,
 * в том числе на заблокированном экране), при отсутствии — обычный
 * конструктор, и всё это под try/catch. Не показать уведомление —
 * терпимо; уронить страницу — нет.
 */

const SOURCE = 'notifications';

export const isNotificationSupported = () => typeof Notification !== 'undefined';

export const getNotificationPermission = (): NotificationPermission | 'unsupported' =>
    isNotificationSupported() ? Notification.permission : 'unsupported';

/** Регистрирует service worker. Ошибки не считаются фатальными. */
export async function registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register('/sw.js');
        log(SOURCE, 'Service worker зарегистрирован');
    } catch (error) {
        log(SOURCE, 'Не удалось зарегистрировать service worker', error);
    }
}

interface ShowOptions {
    body: string;
    tag?: string;
    icon?: string;
    url?: string;
}

/**
 * Показывает уведомление наиболее надёжным доступным способом.
 * Никогда не бросает исключений.
 */
export async function showNotification(title: string, options: ShowOptions): Promise<boolean> {
    if (!isNotificationSupported() || Notification.permission !== 'granted') return false;

    const payload: NotificationOptions = {
        body: options.body,
        icon: options.icon ?? '/vite.svg',
        tag: options.tag,
        data: { url: options.url },
    };

    // Путь через service worker: единственный рабочий на Android
    // и единственный, который переживает блокировку экрана.
    try {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                await registration.showNotification(title, {
                    ...payload,
                    // renotify нестандартный, в типах его нет, но без него
                    // повторное уведомление с тем же tag не звучит.
                    renotify: Boolean(options.tag),
                } as NotificationOptions & { renotify: boolean });
                return true;
            }
        }
    } catch (error) {
        log(SOURCE, 'Уведомление через service worker не показалось', error);
    }

    // Запасной путь для браузеров, где конструктор разрешён (десктоп).
    try {
        new Notification(title, payload);
        return true;
    } catch (error) {
        log(SOURCE, 'Уведомление показать не удалось', error);
        return false;
    }
}
