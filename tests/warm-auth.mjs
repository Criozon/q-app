/**
 * Разово заводит анонимные личности для тестов и складывает их в кэш.
 *
 * Лимит запросов к auth у Supabase общий и на бесплатном тарифе
 * выбирается быстро, а всему набору тестов личностей нужно под два
 * десятка. Поэтому они заводятся один раз этим скриптом (упираясь
 * в лимит, он ждёт и продолжает), а прогоны потом живут на сохранённых
 * токенах и в auth не ходят вовсе, пока те не протухнут.
 *
 * Запуск:  npm run test:auth
 * Скрипт можно прерывать и запускать заново — годные не трогаются.
 */
import { loadCache, remember, toEntry, isFresh, signUp, refresh } from './auth.mjs';

// С запасом: если файлу тестов понадобится больше, signIn() заведёт сам.
const NEEDED = {
    'api.test.mjs': 16,
    'realtime.test.mjs': 4,
    'sessions.test.mjs': 5,
};

const WAIT_ON_LIMIT_MS = 5 * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let refreshed = 0, created = 0, kept = 0;

for (const [file, count] of Object.entries(NEEDED)) {
    for (let i = 0; i < count; i++) {
        const key = `#${i}`;

        for (;;) {
            const cached = loadCache(file)[key];
            if (isFresh(cached)) { kept++; break; }

            if (cached?.refresh_token) {
                const { status, json } = await refresh(cached.refresh_token);
                if (json.access_token) {
                    remember(file, key, toEntry(json));
                    refreshed++;
                    break;
                }
                if (status === 429) {
                    console.log(`лимит auth исчерпан, ждём ${WAIT_ON_LIMIT_MS / 60000} мин…`);
                    await sleep(WAIT_ON_LIMIT_MS);
                    continue;
                }
                // Протухший refresh — заводим личность заново ниже.
            }

            const { status, json } = await signUp();
            if (json.access_token) {
                remember(file, key, toEntry(json));
                created++;
                console.log(`заведена личность ${file} ${key}`);
                break;
            }
            if (status !== 429) {
                console.error(`не удалось завести ${file} ${key}: ${status} ${json.error_code || json.msg || ''}`);
                process.exit(1);
            }
            console.log(`лимит auth исчерпан, ждём ${WAIT_ON_LIMIT_MS / 60000} мин…`);
            await sleep(WAIT_ON_LIMIT_MS);
        }
    }
}

console.log(`готово: годных ${kept}, обновлено ${refreshed}, заведено новых ${created}`);
