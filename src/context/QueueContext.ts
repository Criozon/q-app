import { createContext } from 'react';
import type { QueueContextValue } from './queueContextValue';

// Объект контекста вынесен в отдельный файл без компонентов:
// так Fast Refresh корректно работает и для провайдера, и для хука.
export const QueueContext = createContext<QueueContextValue | null>(null);
