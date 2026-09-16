/**
 * Этот файл содержит набор утилит для управления сессией участника очереди
 * в localStorage. Это позволяет избежать прямого использования localStorage
 * в компонентах и инкапсулировать логику в одном месте.
 */
import log from './logger';
import type { ActiveSession } from '../types/domain';

const SESSION_KEY = 'my-queue-session';

/** Активная сессия участника или null, если её нет или данные повреждены. */
export function getActiveSession(): ActiveSession | null {
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

/** Сохраняет активную сессию в localStorage. */
export function setActiveSession(session: ActiveSession) {
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