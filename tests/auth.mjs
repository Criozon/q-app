/**
 * Анонимные личности для тестов — с переиспользованием между прогонами.
 *
 * Зачем: тесты ходят в настоящий проект Supabase, а лимит там общий на
 * все запросы к /auth/v1 и на бесплатном тарифе выбирается быстро. Трём
 * файлам тестов нужно около двух десятков личностей — и второй запуск
 * `npm test` подряд падал с 429, причём падал в чужих местах, где про
 * лимит не подумаешь.
 *
 * Поэтому в кэше лежит не только refresh_token, но и сам доступ вместе
 * со сроком годности. Пока он не протух (около часа), прогон не делает
 * к auth НИ ОДНОГО запроса. Протух — меняем по refresh_token. И только
 * если и это не вышло — заводим новую личность.
 *
 * Кэш можно спокойно удалить: личности заведутся заново, см.
 * `npm run test:auth`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n').filter(l => l.includes('=')).map(l => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
);

export const URL_BASE = env.VITE_SUPABASE_URL;
export const ANON = env.VITE_SUPABASE_ANON_KEY;

/** Запас до истечения: чтобы токен не протух посреди прогона. */
const EXPIRY_MARGIN_SEC = 5 * 60;

// Кэш у каждого файла тестов свой: node --test запускает их параллельно,
// и на общий файл они наступали бы друг другу на запись.
const cachePath = file => new URL(`./.auth-cache-${file}.json`, import.meta.url);

export const loadCache = (file) => {
    const path = cachePath(file);
    if (!existsSync(path)) return {};
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch { return {}; }
};

export const remember = (file, key, entry) => {
    const cache = loadCache(file);
    cache[key] = entry;
    writeFileSync(cachePath(file), JSON.stringify(cache, null, 2));
};

const post = async (path, body) => {
    const res = await fetch(URL_BASE + path, {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
};

const nowSec = () => Math.floor(Date.now() / 1000);

/** Ответ Supabase → запись кэша. expires_at приходит не всегда. */
export const toEntry = json => ({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at ?? (nowSec() + (json.expires_in ?? 3600)),
});

export const isFresh = entry =>
    entry?.access_token && entry.expires_at > nowSec() + EXPIRY_MARGIN_SEC;

export const signUp = () => post('/auth/v1/signup', {});
export const refresh = refreshToken =>
    post('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });

/**
 * Возвращает signIn() для одного файла тестов. Личности внутри файла
 * нумеруются по порядку вызова, так что каждый вызов — своё «лицо»,
 * и «посторонний» остаётся посторонним от прогона к прогону.
 *
 *     const signIn = makeSignIn(import.meta.url);
 */
export function makeSignIn(fileUrl) {
    const file = fileUrl.split('/').pop();
    let issued = 0;

    return async function signIn() {
        const key = `#${issued++}`;
        const cached = loadCache(file)[key];

        // Самый частый путь: токен ещё живой, в сеть не идём вовсе.
        if (isFresh(cached)) return cached.access_token;

        if (cached?.refresh_token) {
            const { json } = await refresh(cached.refresh_token);
            if (json.access_token) {
                remember(file, key, toEntry(json));
                return json.access_token;
            }
        }

        const { status, json } = await signUp();
        assert.ok(json.access_token,
            `анонимный вход не удался (${status}): ${json.error_code || json.msg || 'причина неизвестна'}. `
            + 'Если это over_request_rate_limit — общий лимит auth у Supabase. '
            + 'Выполните «npm run test:auth» (он подождёт и заполнит кэш) и повторите.');
        remember(file, key, toEntry(json));
        return json.access_token;
    };
}
