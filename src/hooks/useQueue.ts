import { useContext } from 'react';
import { QueueContext } from '../context/QueueContext';
import type { QueueContextValue } from '../context/queueContextValue';

export function useQueue(): QueueContextValue {
  const context = useContext(QueueContext);
  if (context === null) throw new Error('useQueue должен использоваться внутри QueueProvider');
  return context;
}
