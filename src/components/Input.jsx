import React from 'react';
import styles from './Input.module.css'; // 1. Импортируем CSS-модуль

function Input({ value, onChange, placeholder, type = 'text', onKeyPress, style }) {
  // 2. Убираем стейт `isFocused` и все объекты стилей (style, focus, inputStyle).
  // Логика фокуса теперь полностью в CSS-файле.

  return (
    <input
      // 3. Используем `className` вместо `style`
      className={styles.input}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      // 4. Убираем onFocus и onBlur, они больше не нужны для стилизации
      onKeyPress={onKeyPress}
      style={style} // Добавляем проброс style для кастомизации
    />
  );
}

export default Input;