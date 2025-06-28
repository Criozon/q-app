import { useEffect, useRef, useState } from 'react';
import { getActiveSession, clearActiveSession } from '../utils/session';
import log from '../utils/logger';
import * as service from '../services/supabaseService'; // Импортируем сервис

/**
 * Хук для проверки наличия и валидности активной сессии участника.
 * @returns {{session: object | null, status: 'checking' | 'valid' | 'invalid' | 'not-found', queueName: string}}
 */
export function useCheckActiveSession() {
  const [sessionInfo, setSessionInfo] = useState({
    session: null,
    status: 'checking',
    queueName: '',
  });

  const checkPerformed = useRef(false);

  useEffect(() => {
    if (checkPerformed.current) return;
    checkPerformed.current = true;
    
    const checkSession = async () => {
      const session = getActiveSession();
      if (!session) {
        setSessionInfo({ session: null, status: 'not-found', queueName: '' });
        return;
      }
      
      try {
        log('useCheckActiveSession', 'Найдена сессия, проверяем актуальность...');
        // Используем сервис вместо прямого вызова
        const { data, error } = await service.getMemberById(session.memberId);

        if (error || !data || data.status === 'serviced') {
          log('useCheckActiveSession', 'Сессия неактуальна, очищаем.');
          clearActiveSession();
          setSessionInfo({ session: null, status: 'invalid', queueName: '' });
          return;
        }

        if (data.status === 'waiting' || data.status === 'called') {
          log('useCheckActiveSession', 'Сессия валидна.');
          setSessionInfo({
            session,
            status: 'valid',
            queueName: data.queues?.name || '...',
          });
        }
      } catch (e) {
        log('useCheckActiveSession', 'Ошибка при проверке сессии', e);
        clearActiveSession();
        setSessionInfo({ session: null, status: 'invalid', queueName: '' });
      }
    };
    
    checkSession();
  }, []);

  return sessionInfo;
}