import { useContext } from 'react';
import { WindowAdminContext } from '../context/WindowAdminContext';
import type { WindowAdminContextValue } from '../context/windowAdminContextValue';

export function useWindowAdmin(): WindowAdminContextValue {
    const context = useContext(WindowAdminContext);
    if (context === null) throw new Error('useWindowAdmin должен использоваться внутри WindowAdminProvider');
    return context;
}
