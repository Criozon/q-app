import React from 'react';
import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, children }) {
    // --- ДАТЧИК 1 ---
    console.log(`--- Modal: Состояние isOpen: ${isOpen}`);

    if (!isOpen) {
        return null;
    }

    // --- ДАТЧИК 2 ---
    console.log(`--- Modal: Рендерится с заголовком: "${title}"`);

    const backdropStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1000,
    };
    const modalStyle = {
        backgroundColor: 'var(--background, #f0f2f5)',
        padding: '20px', borderRadius: '16px', width: '90%', maxWidth: '400px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)', position: 'relative',
    };
    const closeButtonStyle = {
        position: 'absolute', top: '10px', right: '10px',
        background: '#e5e5e5', borderRadius: '50%', width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', border: 'none'
    };

    return (
        <div style={backdropStyle} onClick={() => { console.log('--- Modal: Клик по фону, закрываем...'); onClose(); }}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                <button style={closeButtonStyle} onClick={() => { console.log('--- Modal: Нажата кнопка X, закрываем...'); onClose(); }}>
                    <X size={18} />
                </button>
                <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '20px', textAlign: 'center' }}>{title}</h2>
                {children}
            </div>
        </div>
    );
}

export default Modal;