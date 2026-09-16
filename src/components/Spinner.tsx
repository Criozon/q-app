import styles from './Spinner.module.css';

interface SpinnerProps {
  className?: string;
}

// Компонент работает сам по себе, но его можно настроить через className
function Spinner({ className }: SpinnerProps) {
  // Мы объединяем базовый класс контейнера с любым классом, переданным извне
  const combinedClassName = [styles.spinnerContainer, className].filter(Boolean).join(' ');

  return (
    <div className={combinedClassName}>
      <div className={styles.ring}></div>
    </div>
  );
}

export default Spinner;
