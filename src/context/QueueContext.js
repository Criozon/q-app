import { createContext } from 'react';

// Объект контекста вынесен в отдельный файл без компонентов:
// так Fast Refresh корректно работает и для провайдера, и для хука.
export const QueueContext = createContext(null);
