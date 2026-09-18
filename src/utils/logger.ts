// Проверяем, запущено ли приложение в режиме разработки.
// Vite автоматически устанавливает эту переменную.
const isDev = import.meta.env.DEV;

/**
 * Логгер с кольцевым буфером.
 *
 * В консоль пишем только в разработке, а в буфер — всегда. Иначе ловить
 * нечего: сбои случаются на телефоне, где консоли нет, и остаётся одно
 * «Не удалось вызвать участника» без причины.
 *
 * Буфер живёт в памяти вкладки и намеренно не пишется на диск: в записях
 * мелькают имена участников, и хранить их дольше сессии незачем.
 *
 * Посмотреть можно из «Итогов» организатора или из консоли — `qappLog()`.
 */

const LIMIT = 200;

interface Entry {
    at: string;
    source: string;
    message: string;
    detail?: string;
}

const buffer: Entry[] = [];

/** Ошибки не сериализуются в JSON — вытаскиваем из них хоть что-то. */
const describe = (data: unknown): string | undefined => {
    if (data === undefined) return undefined;
    if (data instanceof Error) return `${data.name}: ${data.message}`;
    if (typeof data === 'object' && data !== null) {
        const record = data as Record<string, unknown>;
        // PostgrestError и ответы supabase-js: message несёт суть.
        if (typeof record.message === 'string') {
            const code = typeof record.code === 'string' ? ` [${record.code}]` : '';
            return `${record.message}${code}`;
        }
        try { return JSON.stringify(data).slice(0, 300); } catch { return String(data); }
    }
    return String(data);
};

function log(source: string, message: string, data?: unknown) {
    buffer.push({
        at: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
        source,
        message,
        detail: describe(data),
    });
    if (buffer.length > LIMIT) buffer.shift();

    if (isDev) {
        const logMessage = `%c[${source}]%c ${message}`;
        const sourceStyle = 'color: #007aff; font-weight: bold;';
        const messageStyle = 'color: #1d1d1f;';

        if (data !== undefined) {
            console.log(logMessage, sourceStyle, messageStyle, data);
        } else {
            console.log(logMessage, sourceStyle, messageStyle);
        }
    }
}

/** Весь буфер одним текстом — чтобы скопировать и переслать. */
export const formatLog = (): string => buffer
    .map(e => `${e.at} [${e.source}] ${e.message}${e.detail ? ` — ${e.detail}` : ''}`)
    .join('\n');

export const logSize = (): number => buffer.length;

export const clearLog = (): void => { buffer.length = 0; };

// Для отладки с компьютера: qappLog() в консоли.
(globalThis as unknown as { qappLog?: () => string }).qappLog = formatLog;

export default log;
