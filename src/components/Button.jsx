import React from 'react';
import styles from './Button.module.css';
import Spinner from './Spinner'; // 1. Импортируем наш спиннер

// 2. Добавляем isLoading в пропсы
function Button({ children, disabled, onClick, style, title, className, isLoading = false }) {
  
  // 3. Объединяем классы, добавляя класс для состояния загрузки
  const combinedClassName = [
    styles.button, 
    isLoading ? styles.loadingState : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={combinedClassName} 
      style={style}
      // 4. Кнопка неактивна, пока идет загрузка
      disabled={disabled || isLoading}
      onClick={onClick}
      title={title}
    >
      {/* 5. Показываем спиннер или контент */}
      {isLoading ? <Spinner /> : children}
    </button>
  );
}

export default Button;