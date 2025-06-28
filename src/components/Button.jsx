import React from 'react';
import styles from './Button.module.css';

// 1. Добавляем `className` в список принимаемых пропсов
function Button({ children, disabled, onClick, style, title, className }) {
  
  // 2. Создаем строку с классами: базовый класс + любые внешние классы
  const combinedClassName = [styles.button, className].filter(Boolean).join(' ');

  return (
    <button
      // 3. Используем объединенные классы
      className={combinedClassName} 
      style={style}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export default Button;