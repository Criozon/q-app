/**
 * Проверки слоя доступа к данным: политики безопасности и логика в БД.
 *
 * Гоняются против настоящего проекта Supabase из .env — локального стека
 * нет и не планируется, проект некоммерческий. Каждый прогон создаёт свою
 * очередь и в конце её удаляет, поэтому тесты не мешают друг другу и не
 * оставляют мусора.
 *
 * Запуск:  npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeSignIn, URL_BASE, ANON } from './auth.mjs';

const signIn = makeSignIn(import.meta.url);

async function api(path, { method = 'GET', body, token, prefer } = {}) {
    const res = await fetch(URL_BASE + path, {
        method,
        headers: {
            apikey: ANON,
            Authorization: `Bearer ${token || ANON}`,
            'Content-Type': 'application/json',
            ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Новый анонимный пользователь — отдельная «личность» для теста. */

describe('Q-App: доступ к данным', () => {
    let organizer, queueId, secretKey, shortId, services;

    before(async () => {
        organizer = await signIn();
        const { data } = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: {
                p_name: `Тест ${Date.now()}`, p_description: 'автотест', p_window_count: 2,
                p_services: [
                    { name: 'Первая', window_indices: [1] },
                    { name: 'Вторая', window_indices: [2] },
                ],
            },
        });
        queueId = data[0].id;
        secretKey = data[0].admin_secret_key;
        const q = await api(`/rest/v1/queues?id=eq.${queueId}&select=short_id`, { token: organizer });
        shortId = q.data[0].short_id;
        const pub = await api('/rest/v1/rpc/get_queue_for_join', {
            method: 'POST', body: { p_short_id: shortId },
        });
        services = Object.fromEntries(pub.data.services.map(s => [s.name, s.id]));
    });

    after(async () => {
        if (queueId) await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'DELETE', token: organizer });
    });

    test('экран входа показывает очередь и только измеренное время', async () => {
        // Своя очередь: этот тест заводит участника, а общая очередь
        // набора нужна соседним проверкам с предсказуемой нумерацией.
        //
        // Сколько людей впереди и сколько длится приём — это решает,
        // вставать сейчас или зайти позже. Среднее показываем, только
        // когда его есть из чего считать: подставное число (4 минуты
        // в прогнозе) на экране входа выглядело бы как измеренное.
        const own = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: { p_name: `Вход ${Date.now()}`, p_description: '', p_window_count: 1, p_services: [] } });
        const ownId = own.data[0].id;
        try {
            const q = await api(`/rest/v1/queues?id=eq.${ownId}&select=short_id`, { token: organizer });
            const ownShort = q.data[0].short_id;

            const fresh = await api('/rest/v1/rpc/get_queue_for_join', {
                method: 'POST', body: { p_short_id: ownShort } });
            assert.equal(fresh.data.waiting_count, 0);
            assert.equal(fresh.data.avg_service_minutes, null,
                'пока никого не обслужили, среднего времени быть не должно');

            const me = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: organizer,
                body: { p_short_id: ownShort, p_member_name: 'Считаемый', p_service_id: null } });

            const waiting = await api('/rest/v1/rpc/get_queue_for_join', {
                method: 'POST', body: { p_short_id: ownShort } });
            assert.equal(waiting.data.waiting_count, 1, 'вошедший должен попасть в счётчик');

            // Приём как будто длился восемь минут.
            await api(`/rest/v1/queue_members?id=eq.${me.data.id}`, {
                method: 'PATCH', token: organizer,
                body: { status: 'called', called_at: new Date(Date.now() - 8 * 60000).toISOString() } });
            await api(`/rest/v1/queue_members?id=eq.${me.data.id}`, {
                method: 'PATCH', token: organizer, body: { status: 'serviced' } });

            const after = await api('/rest/v1/rpc/get_queue_for_join', {
                method: 'POST', body: { p_short_id: ownShort } });
            assert.equal(after.data.avg_service_minutes, 8,
                `ожидали 8 минут, получили ${after.data.avg_service_minutes}`);
            assert.equal(after.data.waiting_count, 0, 'обслуженный из ожидающих выбывает');
        } finally {
            await api(`/rest/v1/queues?id=eq.${ownId}`, { method: 'DELETE', token: organizer });
        }
    });

    test('прогноз ожидания сохраняет подстановку, когда мерить нечего', async () => {
        // avg_service_minutes остаётся прогнозной обёрткой с 4 минутами:
        // без неё первым участникам нечего показать. Проверяем, что
        // разделение measured/avg не сломало страницу ожидания.
        const token = await signIn();
        const fresh = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token,
            body: { p_name: `Пустая ${Date.now()}`, p_description: '', p_window_count: 1, p_services: [] } });
        const freshId = fresh.data[0].id;
        try {
            const q = await api(`/rest/v1/queues?id=eq.${freshId}&select=short_id`, { token });
            const member = await api('/rest/v1/rpc/join_queue', { method: 'POST', token,
                body: { p_short_id: q.data[0].short_id, p_member_name: 'Первый', p_service_id: null } });
            const status = await api('/rest/v1/rpc/get_my_queue_status', {
                method: 'POST', token, body: { p_member_id: member.data.id } });
            assert.ok(status.data.estimated_minutes >= 1,
                'первому участнику прогноз всё равно должен что-то показать');
        } finally {
            await api(`/rest/v1/queues?id=eq.${freshId}`, { method: 'DELETE', token });
        }
    });

    test('закончённого можно вернуть, и он встаёт впереди поздних', async () => {
        // «Закончить» жмут не только по факту обслуживания: если человек
        // не услышал вызова, его закрывают, чтобы не держал очередь.
        // Объявился позже — возвращаем, и он должен оказаться впереди
        // тех, кто записался после него. Приоритет даёт номер талона.
        const own = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: { p_name: `Возврат ${Date.now()}`, p_description: '', p_window_count: 1, p_services: [] } });
        const ownId = own.data[0].id;
        try {
            const q = await api(`/rest/v1/queues?id=eq.${ownId}&select=short_id`, { token: organizer });
            const short = q.data[0].short_id;

            const ранний = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: organizer,
                body: { p_short_id: short, p_member_name: 'Опоздавший', p_service_id: null } });
            const поздний = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: organizer,
                body: { p_short_id: short, p_member_name: 'Пришёл после', p_service_id: null } });
            assert.ok(ранний.data.ticket_number < поздний.data.ticket_number);

            // Не услышал вызова — закрыли, чтобы не держал очередь.
            await api(`/rest/v1/queue_members?id=eq.${ранний.data.id}`, {
                method: 'PATCH', token: organizer, body: { status: 'serviced' } });

            // Объявился. Возвращаем.
            await api(`/rest/v1/queue_members?id=eq.${ранний.data.id}`, {
                method: 'PATCH', token: organizer,
                body: { status: 'waiting', assigned_window_id: null, acknowledged_at: null } });

            const ждут = await api(
                `/rest/v1/queue_members?queue_id=eq.${ownId}&status=eq.waiting&select=id,member_name,ticket_number,called_at,serviced_at&order=ticket_number`,
                { token: organizer });

            assert.equal(ждут.data.length, 2, 'оба должны ждать');
            assert.equal(ждут.data[0].member_name, 'Опоздавший',
                'вернувшийся встаёт впереди тех, кто записался после него');
            // Триггер обязан стереть следы прошлого захода: иначе человек
            // вернётся в список с чужим временем вызова.
            assert.equal(ждут.data[0].called_at, null);
            assert.equal(ждут.data[0].serviced_at, null);
        } finally {
            await api(`/rest/v1/queues?id=eq.${ownId}`, { method: 'DELETE', token: organizer });
        }
    });

    test('отменённый не портит среднее время приёма', async () => {
        // Раньше неподошедшего закрывали через «Закончить», и он уходил
        // в measured_service_minutes выдуманным сеансом: вызвали в 14:00,
        // махнули рукой в 14:05 — в среднее ушли пять минут приёма,
        // которых не было. Эту же цифру видят люди на экране входа.
        const own = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: { p_name: `Отмена ${Date.now()}`, p_description: '', p_window_count: 1, p_services: [] } });
        const ownId = own.data[0].id;
        try {
            const q = await api(`/rest/v1/queues?id=eq.${ownId}&select=short_id`, { token: organizer });
            const short = q.data[0].short_id;

            // Один честный приём на четыре минуты.
            const честный = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: organizer,
                body: { p_short_id: short, p_member_name: 'Обслужен', p_service_id: null } });
            await api(`/rest/v1/queue_members?id=eq.${честный.data.id}`, {
                method: 'PATCH', token: organizer,
                body: { status: 'called', called_at: new Date(Date.now() - 4 * 60000).toISOString() } });
            await api(`/rest/v1/queue_members?id=eq.${честный.data.id}`, {
                method: 'PATCH', token: organizer, body: { status: 'serviced' } });

            // И один, которого вызвали полчаса назад и не дождались.
            const неподошёл = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: organizer,
                body: { p_short_id: short, p_member_name: 'Не подошёл', p_service_id: null } });
            await api(`/rest/v1/queue_members?id=eq.${неподошёл.data.id}`, {
                method: 'PATCH', token: organizer,
                body: { status: 'called', called_at: new Date(Date.now() - 30 * 60000).toISOString() } });
            await api(`/rest/v1/queue_members?id=eq.${неподошёл.data.id}`, {
                method: 'PATCH', token: organizer, body: { status: 'cancelled' } });

            const отменённый = await api(
                `/rest/v1/queue_members?id=eq.${неподошёл.data.id}&select=status,serviced_at`,
                { token: organizer });
            assert.equal(отменённый.data[0].status, 'cancelled');
            assert.equal(отменённый.data[0].serviced_at, null,
                'отмена не должна ставить время окончания — на этом держится статистика');

            const вход = await api('/rest/v1/rpc/get_queue_for_join', {
                method: 'POST', body: { p_short_id: short } });
            assert.equal(вход.data.avg_service_minutes, 4,
                `в среднее просочился несостоявшийся приём: ${вход.data.avg_service_minutes}`);

            // И вернуть отменённого можно так же, как закончённого.
            await api(`/rest/v1/queue_members?id=eq.${неподошёл.data.id}`, {
                method: 'PATCH', token: organizer,
                body: { status: 'waiting', assigned_window_id: null, acknowledged_at: null } });
            const вернулся = await api(
                `/rest/v1/queue_members?id=eq.${неподошёл.data.id}&select=status,called_at`,
                { token: organizer });
            assert.equal(вернулся.data[0].status, 'waiting');
            assert.equal(вернулся.data[0].called_at, null, 'следы прошлого захода должны стереться');
        } finally {
            await api(`/rest/v1/queues?id=eq.${ownId}`, { method: 'DELETE', token: organizer });
        }
    });

    test('негодный токен даёт именно PGRST301', async () => {
        // На этот код опирается повтор запроса со свежей сессией
        // (supabaseService.isAuthFailure). Если Supabase сменит код,
        // приложение перестанет чинить себя само и вернётся к «иногда
        // не удаётся вызвать участника» до перезагрузки страницы.
        const broken = organizer.slice(0, -4) + 'AAAA';
        const res = await api('/rest/v1/queues?select=id', { token: broken });
        assert.equal(res.status, 401);
        assert.equal(res.data.code, 'PGRST301',
            `ожидался PGRST301, пришло ${JSON.stringify(res.data)}`);
    });

    test('срок жизни токена — час, значит его надо обновлять', async () => {
        // Приложение живёт во вкладке дольше часа. Проверка на срок в
        // ensureSession() опирается на то, что токен конечен.
        const [, payload] = organizer.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64').toString());
        const minutes = Math.round((claims.exp - claims.iat) / 60);
        assert.ok(minutes > 0 && minutes <= 120,
            `неожиданный срок жизни токена: ${minutes} мин`);
    });

    test('без входа таблицы закрыты полностью', async () => {
        const queues = await api('/rest/v1/queues?select=*');
        const members = await api('/rest/v1/queue_members?select=member_name');
        assert.ok(queues.status >= 400, 'очереди не должны отдаваться без сессии');
        assert.ok(members.status >= 400, 'имена участников не должны отдаваться без сессии');
    });

    test('посторонний не видит и не удаляет чужую очередь', async () => {
        const stranger = await signIn();
        const seen = await api(`/rest/v1/queues?id=eq.${queueId}&select=name`, { token: stranger });
        assert.deepEqual(seen.data, [], 'чужая очередь не должна быть видна');

        await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'DELETE', token: stranger });
        const still = await api(`/rest/v1/queues?id=eq.${queueId}&select=id`, { token: organizer });
        assert.equal(still.data.length, 1, 'очередь не должна быть удалена посторонним');
    });

    test('секретная ссылка работает на другом устройстве', async () => {
        const colleague = await signIn();
        const claim = await api('/rest/v1/rpc/claim_queue_admin', {
            method: 'POST', token: colleague, body: { p_secret_key: secretKey },
        });
        assert.equal(claim.status, 200);
        const seen = await api(`/rest/v1/queues?id=eq.${queueId}&select=name`, { token: colleague });
        assert.equal(seen.data.length, 1, 'после обмена ключа очередь должна стать видна');
    });

    test('талоны нумеруются внутри очереди, а не сквозь все', async () => {
        const tokens = await Promise.all([signIn(), signIn()]);
        const first = await api('/rest/v1/rpc/join_queue', {
            method: 'POST', token: tokens[0],
            body: { p_short_id: shortId, p_member_name: 'Первый', p_service_id: services['Первая'] },
        });
        assert.equal(first.data.ticket_number, 1, 'первый участник очереди получает талон №1');
        const second = await api('/rest/v1/rpc/join_queue', {
            method: 'POST', token: tokens[1],
            body: { p_short_id: shortId, p_member_name: 'Второй', p_service_id: services['Вторая'] },
        });
        assert.equal(second.data.ticket_number, 2);
    });

    test('участник видит только свою строку', async () => {
        const token = await signIn();
        await api('/rest/v1/rpc/join_queue', {
            method: 'POST', token,
            body: { p_short_id: shortId, p_member_name: 'Одинокий', p_service_id: null },
        });
        const all = await api('/rest/v1/queue_members?select=member_name', { token });
        assert.equal(all.data.length, 1, 'чужие талоны участнику не отдаются');
        assert.equal(all.data[0].member_name, 'Одинокий');
    });

    test('вызов учитывает привязку услуги к окну', async () => {
        const tokenA = await signIn();
        const tokenB = await signIn();
        // Б идёт раньше по времени, но с услугой второго окна
        await api('/rest/v1/rpc/join_queue', { method: 'POST', token: tokenB,
            body: { p_short_id: shortId, p_member_name: 'ВтороеОкно', p_service_id: services['Вторая'] } });
        await api('/rest/v1/rpc/join_queue', { method: 'POST', token: tokenA,
            body: { p_short_id: shortId, p_member_name: 'ПервоеОкно', p_service_id: services['Первая'] } });

        const wins = await api(`/rest/v1/windows?queue_id=eq.${queueId}&select=id,name&order=created_at`, { token: organizer });
        const w2 = wins.data[1];
        // Тянем, пока не дойдём до наших — в очереди уже есть участники из других тестов
        let found = null;
        for (let i = 0; i < 10 && !found; i++) {
            const called = await api('/rest/v1/rpc/call_next_member_to_window', {
                method: 'POST', token: organizer, body: { p_window_id: w2.id } });
            if (!called.data) break;
            const who = await api(`/rest/v1/queue_members?id=eq.${called.data}&select=member_name,called_at`, { token: organizer });
            if (who.data[0].member_name === 'ВтороеОкно') found = who.data[0];
            assert.notEqual(who.data[0].member_name, 'ПервоеОкно',
                'второе окно не должно вызывать участника с услугой первого окна');
        }
        assert.ok(found, 'участник со «Второй» услугой должен быть вызван вторым окном');
        assert.ok(found.called_at, 'called_at должен проставляться при вызове');
    });

    test('«отложить вызов» двигает участника назад и ограничен тремя разами', async () => {
        const token = await signIn();
        const me = await api('/rest/v1/rpc/join_queue', { method: 'POST', token,
            body: { p_short_id: shortId, p_member_name: 'Отлучившийся', p_service_id: null } });
        const before = await api('/rest/v1/rpc/get_my_queue_status', {
            method: 'POST', token, body: { p_member_id: me.data.id } });

        await api('/rest/v1/rpc/defer_my_call', { method: 'POST', token,
            body: { p_member_id: me.data.id, p_skip: 3 } });
        const after = await api('/rest/v1/rpc/get_my_queue_status', {
            method: 'POST', token, body: { p_member_id: me.data.id } });
        assert.ok(after.data.people_ahead >= before.data.people_ahead,
            'после откладывания впереди должно стать не меньше народу');

        for (let i = 0; i < 2; i++) {
            await api('/rest/v1/rpc/defer_my_call', { method: 'POST', token, body: { p_member_id: me.data.id } });
        }
        const over = await api('/rest/v1/rpc/defer_my_call', { method: 'POST', token, body: { p_member_id: me.data.id } });
        assert.ok(over.status >= 400, 'четвёртое откладывание должно отклоняться');
    });

    test('чужой талон отложить нельзя', async () => {
        const victim = await signIn();
        const attacker = await signIn();
        const m = await api('/rest/v1/rpc/join_queue', { method: 'POST', token: victim,
            body: { p_short_id: shortId, p_member_name: 'Жертва', p_service_id: null } });
        const res = await api('/rest/v1/rpc/defer_my_call', { method: 'POST', token: attacker,
            body: { p_member_id: m.data.id } });
        assert.ok(res.status >= 400, 'чужой талон недоступен');
    });

    test('объявления: организатор пишет, участник читает, но не пишет', async () => {
        const token = await signIn();
        const m = await api('/rest/v1/rpc/join_queue', { method: 'POST', token,
            body: { p_short_id: shortId, p_member_name: 'Читатель', p_service_id: null } });

        const posted = await api('/rest/v1/queue_announcements', { method: 'POST', token: organizer,
            body: { queue_id: queueId, body: 'Задержка 10 минут' }, prefer: 'return=representation' });
        assert.equal(posted.status, 201);

        const status = await api('/rest/v1/rpc/get_my_queue_status', {
            method: 'POST', token, body: { p_member_id: m.data.id } });
        assert.ok(status.data.announcements.some(a => a.body === 'Задержка 10 минут'),
            'объявление должно доходить до участника');

        const spam = await api('/rest/v1/queue_announcements', { method: 'POST', token,
            body: { queue_id: queueId, body: 'спам' } });
        assert.ok(spam.status >= 400, 'участник не должен писать объявления');
    });

    test('итоги доступны только администратору и не выдумывают чисел', async () => {
        const outsider = await signIn();
        const denied = await api('/rest/v1/rpc/get_queue_stats', {
            method: 'POST', token: outsider, body: { p_queue_id: queueId } });
        assert.ok(denied.status >= 400, 'посторонний не должен видеть итоги');

        const stats = await api('/rest/v1/rpc/get_queue_stats', {
            method: 'POST', token: organizer, body: { p_queue_id: queueId } });
        assert.equal(stats.status, 200);
        assert.ok('served_total' in stats.data);
        // Час пика приходит моментом времени, а не строкой 'HH:00' в UTC
        if (stats.data.peak_hour_at !== null) {
            assert.ok(!Number.isNaN(Date.parse(stats.data.peak_hour_at)),
                'peak_hour_at должен разбираться как момент времени');
        }
    });

    test('пауза блокирует запись в очередь', async () => {
        await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'PATCH', token: organizer, body: { status: 'paused' } });
        const token = await signIn();
        const res = await api('/rest/v1/rpc/join_queue', { method: 'POST', token,
            body: { p_short_id: shortId, p_member_name: 'Опоздавший', p_service_id: null } });
        assert.ok(res.status >= 400);
        assert.match(JSON.stringify(res.data), /Queue is currently paused/,
            'текст ошибки важен: JoinPage.jsx ищет в нём эту подстроку');
        await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'PATCH', token: organizer, body: { status: 'active' } });
    });
});

describe('Q-App: защита от зависаний', () => {
    test('таймаут превращает вечное ожидание в ошибку', async () => {
        // Повторяем поведение withTimeout из src/utils/timeout.ts: важно,
        // что никогда не завершающийся промис не может заморозить интерфейс.
        const never = new Promise(() => {});
        const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label}: таймаут`)), ms);
            Promise.resolve(promise).then(
                (v) => { clearTimeout(timer); resolve(v); },
                (e) => { clearTimeout(timer); reject(e); },
            );
        });

        const started = Date.now();
        await assert.rejects(() => withTimeout(never, 300, 'проверка'), /таймаут/);
        assert.ok(Date.now() - started < 2000, 'ожидание должно прерваться, а не длиться вечно');
    });

    test('медленный ответ всё же доходит, если укладывается в срок', async () => {
        const slow = new Promise((resolve) => setTimeout(() => resolve('ок'), 100));
        const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('таймаут')), ms);
            Promise.resolve(promise).then(
                (v) => { clearTimeout(timer); resolve(v); },
                (e) => { clearTimeout(timer); reject(e); },
            );
        });
        assert.equal(await withTimeout(slow, 1000), 'ок');
    });
});
