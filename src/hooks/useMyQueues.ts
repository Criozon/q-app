import { useState, useEffect } from 'react';
import log from '../utils/logger';
import type { SavedQueue } from '../types/domain';

const QUEUES_KEY = 'my-queues';

/**
 * Список «моих очередей» в localStorage: читает при первом рендере и
 * сохраняет при каждом изменении.
 */
export function useMyQueues() {
  // 1. Используем ленивую инициализацию, чтобы localStorage читался только один раз
  const [myQueues, setMyQueues] = useState<SavedQueue[]>(() => {
    try {
      const item = window.localStorage.getItem(QUEUES_KEY);
      return item ? JSON.parse(item) : [];
    } catch (error) {
      log('useMyQueues', 'Ошибка при чтении очередей из localStorage', error);
      return [];
    }
  });

  // 2. Используем эффект, чтобы сохранять изменения в localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(QUEUES_KEY, JSON.stringify(myQueues));
    } catch (error) {
      log('useMyQueues', 'Ошибка при сохранении очередей в localStorage', error);
    }
  }, [myQueues]); // Этот эффект запускается каждый раз, когда myQueues изменяется

  return [myQueues, setMyQueues] as const;
}