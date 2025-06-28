import React from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css'; // 1. Импортируем модуль

function Modal({ isOpen, onClose, title, children }) {
    // Датчики для отладки можно оставить, они полезны
    console.log(`--- Modal: Состояние isOpen: ${isOpen}`);

    if (!isOpen) {
        return null;
    }

    console.log(`--- Modal: Рендерится с заголовком: "${title}"`);

    // 2. Все объекты стилей (backdropStyle, modalStyle и т.д.) удалены

    return (
        // 3. Заменяем `style` на `className`
        <div className={styles.backdrop} onClick={() => { console.log('--- Modal: Клик по фону, закрываем...'); onClose(); }}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={() => { console.log('--- Modal: Нажата кнопка X, закрываем...'); onClose(); }}>
                    <X size={18} />
                </button>
                {/* Для заголовка тоже используем класс */}
                <h2 className={styles.title}>{title}</h2>
                {children}
            </div>
        </div>
    );
}

export default Modal;