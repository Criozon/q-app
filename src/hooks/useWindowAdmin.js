import { useContext } from 'react';
import { WindowAdminContext } from '../context/WindowAdminContext';

export function useWindowAdmin() {
    const context = useContext(WindowAdminContext);
    if (context === null) throw new Error('useWindowAdmin должен использоваться внутри WindowAdminProvider');
    return context;
}
