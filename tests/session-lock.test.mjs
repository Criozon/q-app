import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Замок сессии: ждать чужой замок бесконечно нельзя.
 *
 * Логика живёт в src/utils/sessionLock.ts на TypeScript, а тесты здесь
 * гоняются голым node --test, без сборки. Поэтому проверяем ту же
 * функцию, скомпилировав файл на лету: так тест следит за настоящим
 * кодом, а не за его копией.
 */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/utils/sessionLock.ts', import.meta.url), 'utf8')
    // logger тянет за собой браузерное окружение, а здесь он не нужен.
    .replace(/^import log from '\.\/logger';$/m, 'const log = () => {};');

const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const { makeBoundedLock } = module;

/** Замок, который держат ровно столько, сколько попросили. */
const busyLocks = (heldMs) => ({
    async request(_name, options, callback) {
        const granted = new Promise(resolve => setTimeout(resolve, heldMs));
        const aborted = new Promise((_, reject) => {
            if (options.signal.aborted) return reject(abortError());
            options.signal.addEventListener('abort', () => reject(abortError()));
        });
        await Promise.race([granted, aborted]);
        return callback();
    },
});

const abortError = () => Object.assign(new Error('прервано'), { name: 'AbortError' });

test('свободный замок берётся сразу', async () => {
    const lock = makeBoundedLock(busyLocks(0), 200);
    const started = Date.now();
    const result = await lock('имя', -1, async () => 'готово');
    assert.equal(result, 'готово');
    assert.ok(Date.now() - started < 150, 'ждать было нечего');
});

test('занятый замок не держит приложение дольше отведённого', async () => {
    // Главное свойство: чужая зависшая вкладка не морозит нас навсегда.
    const lock = makeBoundedLock(busyLocks(10_000), 200);
    const started = Date.now();
    const result = await lock('имя', -1, async () => 'всё равно сделано');
    const waited = Date.now() - started;

    assert.equal(result, 'всё равно сделано', 'операция должна выполниться и без замка');
    assert.ok(waited >= 200, `сдались слишком рано: ${waited} мс`);
    assert.ok(waited < 2000, `ждали слишком долго: ${waited} мс`);
});

test('ошибка самой операции не выдаётся за занятый замок', async () => {
    // Иначе неудачный запрос молча повторялся бы вторым заходом.
    let calls = 0;
    const lock = makeBoundedLock(busyLocks(0), 200);
    await assert.rejects(
        () => lock('имя', -1, async () => { calls += 1; throw new Error('сервер отказал'); }),
        /сервер отказал/,
    );
    assert.equal(calls, 1, 'операция не должна повторяться');
});

test('без navigator.locks работаем напрямую', async () => {
    // Safari до 16 и любые нестандартные окружения.
    const lock = makeBoundedLock(undefined, 200);
    assert.equal(await lock('имя', -1, async () => 'ок'), 'ок');
});
