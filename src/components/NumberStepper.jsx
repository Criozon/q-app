import React from 'react';
import { Minus, Plus } from 'lucide-react';
import styles from './NumberStepper.module.css';

function NumberStepper({ value, onChange, min = 1, max = 20 }) {
  
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className={styles.stepperContainer}>
      <button 
        className={styles.button} 
        onClick={handleDecrement} 
        disabled={value <= min}
        aria-label="Уменьшить количество"
      >
        <Minus size={20} />
      </button>
      <span className={styles.value} aria-live="polite">{value}</span>
      <button 
        className={styles.button} 
        onClick={handleIncrement} 
        disabled={value >= max}
        aria-label="Увеличить количество"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}

export default NumberStepper;