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
 * дождаться этого промиса.
 */

/** Токен живёт час; обновляем заранее, чтобы не попасть в стык. */
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

let cached: Session | null = null;
let inFlight: Promise<Session | null> | null = null;
let renewInFlight: Promise<Session | null> | null = null;

const isUsable = (session: Session | null): session is Session =>
    !!session?.access_token
    && (session.expires_at ?? 0) * 1000 > Date.now() + EXPIRY_MARGIN_MS;

// Фоновое обновление токена supabase-js делает сам — подхватываем результат,
// иначе в кэше осталась бы копия уже заменённой сессии.
supabase.auth.onAuthStateChange((event, session) => {
    cached = session;
    if (event === 'TOKEN_REFRESHED') log('auth', 'Токен обновлён');
    if (event === 'SIGNED_OUT') log('auth', 'Сессия завершена');
});

async function establish(): Promise<Session | null> {
    // getSession() внутри берёт navigator.locks и при занятой блокировке
    // ждёт вечно — отсюда обязательный таймаут.
    const { data: { session } } = await withTimeout(
        supabase.auth.getSession(), TIMEOUTS.session, 'чтение сессии');

    if (isUsable(session)) {
        log('auth', 'Сессия восстановлена из localStorage');
        return session;
    }

    if (session) {
        // Сессия есть, но токен просрочен. Обновляем её, а НЕ входим заново:
        // новый анонимный вход — это новый auth.uid(), то есть участник
        // теряет доступ к собственному талону, а организатор к своей очереди.
        const { data, error } = await withTimeout(
            supabase.auth.refreshSession(), TIMEOUTS.session, 'обновление сессии');
        if (!error && data.session) {
            log('auth', 'Сессия обновлена');
            return data.session;
        }
        log('auth', 'Обновить сессию не удалось', error);
        throw error ?? new Error('Не удалось обновить сессию');
    }

    const { data, error } = await withTimeout(
        supabase.auth.signInAnonymously(), TIMEOUTS.session, 'вход');
    if (error) {
        log('auth', 'Анонимный вход не удался', error);
        throw error;
    }
    log('auth', 'Анонимный вход выполнен');
    return data.session;
}

/**
 * Годная сессия. Результат кэшируется, но с проверкой срока: раньше
 * промис запоминался навсегда, и стоило фоновому обновлению токена
 * сорваться — приложение до конца сессии слало запросы с мёртвым JWT
 * и получало 401 на каждое действие. Со стороны это выглядело как
 * «иногда не удаётся вызвать участника», а лечилось перезагрузкой.
 */
export function ensureSession(): Promise<Session | null> {
    if (isUsable(cached)) return Promise.resolve(cached);
    if (inFlight) return inFlight;

    inFlight = establish()
        .then(session => { cached = session; return session; })
        .finally(() => { inFlight = null; });

    return inFlight;
}

/**
 * Принудительно обменять refresh-токен на свежий доступ.
 *
 * Просто забыть кэш мало: getSession() вернёт ту же сохранённую сессию,
 * если по часам она ещё не просрочена. А негодной она бывает и раньше
 * срока — например, когда ключи проекта сменились. Поэтому обновляем
 * явно, а новый анонимный вход не делаем: это был бы другой auth.uid(),
 * то есть потеря доступа к своему талону или к своей очереди.
 */
export function renewSession(): Promise<Session | null> {
    // Обновление одно на всех: страница шлёт запросы пачками, и на мёртвом
    // токене они падают одновременно. Пять параллельных обновлений — это
    // пять запросов к auth, у которого свой лимит; так недолго сделать
    // хуже, чем было.
    if (renewInFlight) return renewInFlight;

    cached = null;
    inFlight = null;

    renewInFlight = withTimeout(
        supabase.auth.refreshSession(), TIMEOUTS.session, 'обновление сессии',
    ).then(({ data, error }) => {
        if (error) {
            log('auth', 'Обновить сессию не удалось', error);
            throw error;
        }
        cached = data.session;
        log('auth', 'Сессия обновлена принудительно');
        return data.session;
    }).finally(() => { renewInFlight = null; });

    return renewInFlight;
}

/** Текущий auth.uid(), если сессия уже есть. */
export async function currentUserId(): Promise<string | null> {
    const session = await ensureSession();
    return session?.user?.id ?? null;
}
