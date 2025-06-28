import React from 'react';
import styles from './Card.module.css';

// 1. Добавляем `className` в пропсы
function Card({ children, style, className }) {

    // 2. Объединяем классы
    const combinedClassName = [styles.card, className].filter(Boolean).join(' ');

    return (
        <div className={combinedClassName} style={style}>
            {children}
        </div>
    );
}

export default Card;