import React from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

function Modal({ isOpen, onClose, title, children, backdropClassName }) {
    if (!isOpen) {
        return null;
    }

    const backdropClasses = [
        styles.backdrop,
        backdropClassName
    ].filter(Boolean).join(' ');

    return (
        <div className={backdropClasses} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>
                    <X size={18} />
                </button>
                {/* --- ИЗМЕНЕНИЕ: Отображаем заголовок, только если он передан --- */}
                {title && <h2 className={styles.title}>{title}</h2>}
                {children}
            </div>
        </div>
    );
}

export default Modal;