/**
 * Текст ошибки из чего угодно, что прилетело в catch.
 *
 * В TypeScript пойманное значение имеет тип unknown — бросить можно что
 * угодно, не только Error. Ошибки Supabase приходят объектами с полем
 * message, поэтому проверяем и его.
 */
export function errorMessage(error: unknown, fallback = 'Произошла неизвестная ошибка'): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message: unknown }).message;
        if (typeof message === 'string') return message;
    }
    return fallback;
}

/** Содержит ли текст ошибки заданную подстроку. */
export function errorIncludes(error: unknown, needle: string): boolean {
    return errorMessage(error, '').includes(needle);
}
