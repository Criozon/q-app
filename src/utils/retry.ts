import log from './logger';

/**
 * Повтор операции с нарастающей паузой.
 *
 * Зачем: первая загрузка страницы администратора и панели окна делалась
 * ровно один раз. Одна сетевая заминка — и человек получал экран ошибки
 * навсегда, вернуть страницу можно было только перезагрузкой вручную.
 * А заминки случаются: приложением пользуются с мобильного интернета,
 * и вкладок одного приложения открывают помногу.
 *
 * Пауза растёт (1, 2, 4 секунды), чтобы не добивать и без того
 * неотвечающий сервер.
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    { attempts = 3, baseDelayMs = 1000, label = 'операция' }: {
        attempts?: number;
        baseDelayMs?: number;
        label?: string;
    } = {},
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === attempts) break;
            const delay = baseDelayMs * 2 ** (attempt - 1);
            log('retry', `${label}: попытка ${attempt} из ${attempts} не удалась, повтор через ${delay} мс`, error);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
