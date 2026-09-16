import { useContext } from 'react';
import { QueueContext } from '../context/QueueContext';

export function useQueue() {
  const context = useContext(QueueContext);
  if (context === null) throw new Error('useQueue должен использоваться внутри QueueProvider');
  return context;
}
