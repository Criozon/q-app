import React from 'react';
import styles from './Button.module.css';
import Spinner from './Spinner';

function Button({ children, disabled, onClick, style, title, className, isLoading = false }) {
  
  const combinedClassName = [
    styles.button, 
    isLoading ? styles.loadingState : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={combinedClassName} 
      style={style}
      disabled={disabled || isLoading}
      onClick={onClick}
      title={title}
    >
      {/* Контент кнопки. Он будет скрываться через CSS */}
      <span className={styles.content}>
        {children}
      </span>

      {/* Спиннер будет появляться поверх контента */}
      {isLoading && <Spinner className={styles.spinner} />}
    </button>
  );
}

export default Button;