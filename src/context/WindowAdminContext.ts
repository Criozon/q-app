import { createContext } from 'react';
import type { WindowAdminContextValue } from './windowAdminContextValue';

export const WindowAdminContext = createContext<WindowAdminContextValue | null>(null);
