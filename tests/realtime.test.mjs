/**
 * Проверки доставки событий участнику.
 *
 * Появились после жалобы: «отменяю человека в очереди, а у него статус не
 * меняется — только когда он сам что-то нажмёт». Корень был не в доставке
 * событий, а в том, что любая сетевая заминка роняла страницу ожидания
 * в экран ошибки (см. WaitPage). Но сама доставка — вещь хрупкая: она
 * зависит от политик доступа, потому что Realtime подчиняется им наравне
 * с обычными запросами. Сузили подписку участника до своей строки —
 * и эти тесты сторожат, что события до неё по-прежнему доходят.
 *
 * Запуск: npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeSignIn, URL_BASE, ANON } from './auth.mjs';
import { createClient } from '@supabase/supabase-js';

const signIn = makeSignIn(import.meta.url);

async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(URL_BASE + path, {
        method,
        headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
}


/** Ждёт события нужного типа не дольше таймаута. */
function waitFor(events, type, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            const found = events.find(e => e.type === type);
            if (found) return resolve(found);
            if (Date.now() - started > timeoutMs) return resolve(null);
            setTimeout(tick, 100);
        };
        tick();
    });
}

describe('Q-App: доставка событий участнику', () => {
    let organizer, queueId, shortId, memberToken, member, sb, channel;
    const events = [];

    before(async () => {
        organizer = await signIn();
        const { data } = await api('/rest/v1/rpc/create_queue_with_services_and_windows', {
            method: 'POST', token: organizer,
            body: { p_name: `Realtime ${Date.now()}`, p_description: '', p_window_count: 1, p_services: [] },
        });
        queueId = data[0].id;
        const q = await api(`/rest/v1/queues?id=eq.${queueId}&select=short_id`, { token: organizer });
        shortId = q.data[0].short_id;

        memberToken = await signIn();
        const joined = await api('/rest/v1/rpc/join_queue', {
            method: 'POST', token: memberToken,
            body: { p_short_id: shortId, p_member_name: 'Наблюдатель', p_service_id: null },
        });
        member = joined.data;

        // Подписываемся ровно так же, как это делает страница ожидания
        sb = createClient(URL_BASE, ANON);
        sb.realtime.setAuth(memberToken);
        channel = sb.channel(`test-${member.id}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'queue_members', filter: `id=eq.${member.id}` },
                (payload) => events.push({ type: payload.eventType, at: Date.now() }));
        await new Promise((resolve) => {
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(status);
            });
        });
    });

    after(async () => {
        if (channel) await sb.removeChannel(channel);
        if (queueId) await api(`/rest/v1/queues?id=eq.${queueId}`, { method: 'DELETE', token: organizer });
    });

    test('вызов участника доходит до него событием, а не только опросом', async () => {
        const sent = Date.now();
        await api(`/rest/v1/queue_members?id=eq.${member.id}`, {
            method: 'PATCH', token: organizer, body: { status: 'called' },
        });
        const event = await waitFor(events, 'UPDATE');
        assert.ok(event, 'событие UPDATE должно дойти до участника');
        assert.ok(event.at - sent < 8000, 'событие должно приходить сразу, а не по таймеру опроса');
    });

    test('удаление участника доходит до него событием', async () => {
        const sent = Date.now();
        await api(`/rest/v1/queue_members?id=eq.${member.id}`, { method: 'DELETE', token: organizer });
        const event = await waitFor(events, 'DELETE');
        assert.ok(event, 'событие DELETE должно дойти до участника — иначе он не узнает, что его убрали');
        assert.ok(event.at - sent < 8000, 'событие должно приходить сразу');
    });

    test('после удаления функция статуса честно отвечает member_not_found', async () => {
        const { data } = await api('/rest/v1/rpc/get_my_queue_status', {
            method: 'POST', token: memberToken, body: { p_member_id: member.id },
        });
        assert.equal(data.error, 'member_not_found',
            'страница ожидания опирается на этот ответ, чтобы показать «вас удалили»');
    });
});
