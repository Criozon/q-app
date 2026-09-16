import { forwardRef } from 'react';
import type { CSSProperties, ChangeEventHandler, KeyboardEventHandler } from 'react';
import styles from './Input.module.css';

interface InputProps {
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  onKeyPress?: KeyboardEventHandler<HTMLInputElement>;
  style?: CSSProperties;
  className?: string;
  maxLength?: number;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ value, onChange, placeholder, type = 'text', onKeyPress, style, className, maxLength }, ref) => {

    // Объединяем внутренний класс компонента с внешним, если он передан
    const combinedClassName = [styles.input, className].filter(Boolean).join(' ');

    return (
      <input
        className={combinedClassName}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onKeyPress={onKeyPress}
        style={style}
        maxLength={maxLength}
        ref={ref}
      />
    );
  }
);
Input.displayName = 'Input';

export default Input;
