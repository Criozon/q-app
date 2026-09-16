import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import styles from './Button.module.css';
import Spinner from './Spinner';

interface ButtonProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
  title?: string;
  className?: string;
  isLoading?: boolean;
}

function Button({ children, disabled, onClick, style, title, className, isLoading = false }: ButtonProps) {

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
