/**
 * Этот файл содержит набор утилит для управления сессией участника очереди
 * в localStorage. Это позволяет избежать прямого использования localStorage
 * в компонентах и инкапсулировать логику в одном месте.
 */
import log from './logger';

const SESSION_KEY = 'my-queue-session';

/**
 * Получает активную сессию из localStorage.
 * @returns { {memberId: string, queueId: string} | null } Разобранный объект сессии или null.
 */
export function getActiveSession() {
  try {
    const sessionRaw = localStorage.getItem(SESSION_KEY);
    return sessionRaw ? JSON.parse(sessionRaw) : null;
  } catch (error) {
    log('session.js', 'Ошибка при парсинге сессии из localStorage', error);
    // Если данные повреждены, очищаем их
    clearActiveSession();
    return null;
  }
}

/**
 * Сохраняет активную сессию в localStorage.
 * @param {{memberId: string, queueId: string}} session - Объект сессии для сохранения.
 */
export function setActiveSession(session) {
  try {
    const sessionRaw = JSON.stringify(session);
    localStorage.setItem(SESSION_KEY, sessionRaw);
  } catch (error) {
    log('session.js', 'Ошибка при сохранении сессии в localStorage', error);
  }
}

/**
 * Удаляет активную сессию из localStorage.
 */
export function clearActiveSession() {
  localStorage.removeItem(SESSION_KEY);
}