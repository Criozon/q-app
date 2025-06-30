import React from 'react';
import styles from './Input.module.css';

// --- НАЧАЛО ИЗМЕНЕНИЙ: Полностью переработанный компонент ---
const Input = React.forwardRef(({ value, onChange, placeholder, type = 'text', onKeyPress, style, className }, ref) => {
  
  // Объединяем внутренний класс компонента с внешним, если он передан
  const combinedClassName = [
    styles.input, // Наш базовый стиль
    className     // Внешний стиль (например, для выравнивания)
  ].filter(Boolean).join(' '); // .filter(Boolean) уберет null/undefined, если className не передан

  return (
    <input
      className={combinedClassName} // Применяем объединенные классы
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onKeyPress={onKeyPress}
      style={style}
      ref={ref} 
    />
  );
});
// --- КОНЕЦ ИЗМЕНЕНИЙ ---

export default Input;