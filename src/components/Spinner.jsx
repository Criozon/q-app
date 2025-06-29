import React from 'react';
import styles from './Spinner.module.css';

// Компонент теперь работает сам по себе, но его можно настроить через className
function Spinner({ className }) {
  // Мы объединяем базовый класс контейнера с любым классом, переданным извне
  const combinedClassName = [styles.spinnerContainer, className].filter(Boolean).join(' ');

  return (
    <div className={combinedClassName}>
      <div className={styles.ring}></div>
    </div>
  );
}

export default Spinner;