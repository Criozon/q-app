import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import log from '../utils/logger';
import { withTimeout, TIMEOUTS } from '../utils/timeout';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
});

/**
 * Анонимный вход.
 *
 * Каждый посетитель получает настоящий JWT со стабильным auth.uid(), на
 * который опираются политики доступа: участник владеет своим талоном,
 * администратор и оператор обменивают секретную ссылку на пропуск.
 * Для пользователя это полностью невидимо — ни одного лишнего действия,
 * что и было главным требованием к продукту.
 *
 * Без сессии база не отдаёт ничего, поэтому любой запрос к данным должен
 * дождаться этого промиса. Промис один на всё приложение: параллельные
 * вызовы не плодят сессии.
 */
let sessionPromise: Promise<Session | null> | null = null;

export function ensureSession() {
    if (!sessionPromise) {
        sessionPromise = (async () => {
            // getSession() внутри берёт navigator.locks и при занятой
            // блокировке ждёт вечно — отсюда обязательный таймаут.
            const { data: { session } } = await withTimeout(
                supabase.auth.getSession(), TIMEOUTS.session, 'чтение сессии');
            if (session) {
                log('auth', 'Сессия восстановлена из localStorage');
                return session;
            }
            const { data, error } = await withTimeout(
                supabase.auth.signInAnonymously(), TIMEOUTS.session, 'вход');
            if (error) {
                // Сбрасываем, чтобы следующая попытка могла повториться —
                // иначе одна сетевая ошибка при старте убивает приложение навсегда.
                sessionPromise = null;
                log('auth', 'Анонимный вход не удался', error);
                throw error;
            }
            log('auth', 'Анонимный вход выполнен');
            return data.session;
        })().catch((error: unknown) => {
            // Любая неудача не должна замораживать приложение навсегда:
            // обнуляем промис, чтобы следующий вызов попробовал заново.
            sessionPromise = null;
            throw error;
        });
    }
    return sessionPromise;
}

/** Текущий auth.uid(), если сессия уже есть. */
export async function currentUserId(): Promise<string | null> {
    const session = await ensureSession();
    return session?.user?.id ?? null;
}
