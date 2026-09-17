/**
 * Выдача под таймер: пометка, время и то, что участников на руках может
 * быть много. Гоняется против настоящего проекта Supabase из .env, каждый
 * прогон создаёт свою очередь и в конце её удаляет.
 *
 * Запуск:  npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeSignIn, URL_BASE, ANON } from './auth.mjs';

const signIn = makeSignIn(import.meta.url);

async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(URL_BASE + path, {
        method,
        headers: {
            apikey: ANON,
            Authorization: `Bearer ${token || ANON}`,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
}


describe('Q-App: выдача под таймер', () => {
    let organizer, guest, stranger, queueId, shortId, windowId, windowKey;

    /** Участник в очереди. Токен по умолчанию — организатора, см. signIn(). */
    async function join(name, token) {
        const { data } = await api('/rest/v1/rpc/join_queue', {
            method: 'POST', token: token || organizer,
            body: { p_short_id: shortId, p_member_name: name, p_service_id: null },
        });
        assert.ok(data?.id, `участник ${name} должен был войти в очередь`);
        return { id: data.id, name };
    }

    before(async () => {
        organizer = await signIn();
        guest = await signIn();
        stranger = await signIn();
        const { data } = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: {
                p_name: `Прокат ${Date.now()}`, p_description: 'автотест',
                p_window_count: 1, p_services: [],
            },
        });
        queueId = data[0].id;
        const q = await api(`/rest/v1/queues?id=eq.${queueId}&select=short_id`, { token: organizer });
        shortId = q.data[0].short_id;
        const wins = await api(`/rest/v1/windows?queue_id=eq.${queueId}&select=id,short_key`, { token: organizer });
        windowId = wins.data[0].id;
        windowKey = wins.data[0].short_key;
    });

    after(async () => {
        if (queueId) await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'DELETE', token: organizer });
    });

    test('приём ставит пометку и время, считая его на сервере', async () => {
        const guest = await join('Лодочник');
        const before = Date.now();
        const { data } = await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_note: 'Катамаран 3', p_minutes: 40 },
        });

        assert.equal(data.status, 'in_service');
        assert.equal(data.note, 'Катамаран 3');
        const ends = Date.parse(data.timer_ends_at);
        const expected = before + 40 * 60 * 1000;
        // Допуск на дорогу запроса и расхождение часов машины с сервером.
        assert.ok(Math.abs(ends - expected) < 5 * 60 * 1000,
            `время окончания должно быть примерно через 40 минут, получили ${data.timer_ends_at}`);
    });

    test('приём без минут — пометка есть, таймера нет', async () => {
        const guest = await join('Без часов');
        const { data } = await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_note: 'Жёлтый каяк', p_minutes: null },
        });
        assert.equal(data.status, 'in_service');
        assert.equal(data.note, 'Жёлтый каяк');
        assert.equal(data.timer_ends_at, null, 'без минут таймер заводиться не должен');
    });

    test('на руках может быть несколько человек одновременно', async () => {
        const first = await join('Катамаран раз');
        const second = await join('Катамаран два');
        const third = await join('Катамаран три');

        for (const guest of [first, second, third]) {
            await api('/rest/v1/rpc/start_member_session', {
                method: 'POST', token: organizer,
                body: { p_member_id: guest.id, p_note: guest.name, p_minutes: 30 },
            });
        }

        const active = await api(
            `/rest/v1/queue_members?queue_id=eq.${queueId}&status=eq.in_service&select=id`,
            { token: organizer });
        assert.ok(active.data.length >= 3,
            'три выданных катамарана — три человека на руках, а не один');
    });

    test('продление добавляет минуты к концу, а не укорачивает время', async () => {
        const guest = await join('Продлевается');
        const started = await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_note: 'Лодка 1', p_minutes: 60 },
        });
        const wasEnding = Date.parse(started.data.timer_ends_at);

        const extended = await api('/rest/v1/rpc/extend_member_timer', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_minutes: 15 },
        });
        const nowEnding = Date.parse(extended.data.timer_ends_at);

        const added = (nowEnding - wasEnding) / 60000;
        assert.ok(Math.abs(added - 15) < 1,
            `к часу должно прибавиться 15 минут, прибавилось ${added.toFixed(1)}`);
    });

    test('продление просроченного отсчитывается от текущего момента', async () => {
        const guest = await join('Просрочил');
        // Минус — время уже вышло: так проверяем просрочку, не выжидая её.
        await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_note: 'Сап', p_minutes: null },
        });
        await api(`/rest/v1/queue_members?id=eq.${guest.id}`, {
            method: 'PATCH', token: organizer,
            body: { timer_ends_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
        });

        const extended = await api('/rest/v1/rpc/extend_member_timer', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_minutes: 15 },
        });
        const left = (Date.parse(extended.data.timer_ends_at) - Date.now()) / 60000;
        assert.ok(left > 10 && left < 20,
            `просроченному дают 15 минут с этой секунды, а не с прошлого конца; осталось ${left.toFixed(1)}`);
    });

    test('панель окна показывает тех, кто на руках', async () => {
        const visitor = await join('Видимый');
        // Как в жизни: сначала вызвали к окну, потом приняли. Панель ищет
        // своих по привязке к окну, и она проставляется именно вызовом.
        await api(`/rest/v1/queue_members?id=eq.${visitor.id}`, {
            method: 'PATCH', token: organizer,
            body: { status: 'called', assigned_window_id: windowId, called_at: new Date().toISOString() },
        });
        await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: visitor.id, p_note: 'Кабина 2', p_minutes: 20 },
        });

        const { data } = await api('/rest/v1/rpc/get_window_admin_initial_data', {
            method: 'POST', token: organizer, body: { p_short_key: windowKey },
        });
        const seen = data.members.find(m => m.id === visitor.id);
        assert.ok(seen, 'участник с идущим таймером не должен пропадать из панели');
        assert.equal(seen.note, 'Кабина 2');
        assert.ok(seen.timer_ends_at, 'панели нужно время окончания, чтобы вести отсчёт');
        assert.ok(data.server_now, 'без server_now отсчёт поедет на кривых часах устройства');
    });

    test('участник видит свою пометку и своё время', async () => {
        const me = await join('Смотрящий', guest);
        await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: me.id, p_note: 'Катамаран 7', p_minutes: 25 },
        });

        const { data } = await api('/rest/v1/rpc/get_my_queue_status', {
            method: 'POST', token: guest, body: { p_member_id: me.id },
        });
        assert.equal(data.member.status, 'in_service');
        assert.equal(data.member.note, 'Катамаран 7');
        assert.ok(data.member.timer_ends_at, 'без времени окончания отсчёт на телефоне не построить');
        assert.ok(data.server_now);
    });

    test('возврат в очередь обнуляет пометку и таймер', async () => {
        const guest = await join('Вернувшийся');
        await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: guest.id, p_note: 'Лодка 9', p_minutes: 30 },
        });

        await api(`/rest/v1/queue_members?id=eq.${guest.id}`, {
            method: 'PATCH', token: organizer,
            body: { status: 'waiting', assigned_window_id: null },
        });

        const after = await api(
            `/rest/v1/queue_members?id=eq.${guest.id}&select=status,note,timer_ends_at`,
            { token: organizer });
        assert.equal(after.data[0].status, 'waiting');
        assert.equal(after.data[0].note, null,
            'вернувшийся в очередь не должен тащить за собой чужую лодку в карточке');
        assert.equal(after.data[0].timer_ends_at, null);
    });

    test('посторонний не может ни принять, ни продлить', async () => {
        const victim = await join('Чужой очереди');

        const started = await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: stranger,
            body: { p_member_id: victim.id, p_note: 'Взлом', p_minutes: 999 },
        });
        assert.ok(started.status >= 400, 'приём доступен только персоналу очереди');

        await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: victim.id, p_note: 'Лодка 2', p_minutes: 10 },
        });
        const extended = await api('/rest/v1/rpc/extend_member_timer', {
            method: 'POST', token: stranger,
            body: { p_member_id: victim.id, p_minutes: 999 },
        });
        assert.ok(extended.status >= 400, 'продление доступно только персоналу очереди');
    });

    test('участник не может отодвинуть себе время сам', async () => {
        const me = await join('Хитрый', guest);
        const started = await api('/rest/v1/rpc/start_member_session', {
            method: 'POST', token: organizer,
            body: { p_member_id: me.id, p_note: 'Лодка 5', p_minutes: 10 },
        });
        const honest = started.data.timer_ends_at;

        // Участник правит свою строку напрямую: политика это позволяет,
        // а вот триггер — нет. Время лодки стоит денег.
        const hack = await api(`/rest/v1/queue_members?id=eq.${me.id}`, {
            method: 'PATCH', token: guest,
            body: { timer_ends_at: new Date(Date.now() + 5 * 3600 * 1000).toISOString() },
        });
        assert.ok(hack.status >= 400, 'правка собственного таймера должна отклоняться');

        const after = await api(`/rest/v1/queue_members?id=eq.${me.id}&select=timer_ends_at,note`,
            { token: organizer });
        assert.equal(after.data[0].timer_ends_at, honest, 'время должно остаться прежним');

        const noteHack = await api(`/rest/v1/queue_members?id=eq.${me.id}`, {
            method: 'PATCH', token: guest, body: { note: 'Яхта' },
        });
        assert.ok(noteHack.status >= 400, 'пометку участник себе тоже не пишет');
    });

    test('вызов следующего не трогает тех, кто уже на руках', async () => {
        const waiting = await join('Ждёт своего');
        const { data: calledId } = await api('/rest/v1/rpc/call_next_member_to_window', {
            method: 'POST', token: organizer, body: { p_window_id: windowId },
        });
        assert.ok(calledId, 'в очереди есть кого вызвать');

        const called = await api(`/rest/v1/queue_members?id=eq.${calledId}&select=status`,
            { token: organizer });
        assert.equal(called.data[0].status, 'called');

        const active = await api(
            `/rest/v1/queue_members?queue_id=eq.${queueId}&status=eq.in_service&select=id`,
            { token: organizer });
        assert.ok(!active.data.some(m => m.id === calledId),
            'вызывать нужно ожидающих, а не тех, у кого уже идёт время');
        assert.ok(waiting.id, 'участник создан');
    });
});
