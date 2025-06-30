import React from 'react';
import styles from './InstructionCard.module.css';

// Этот компонент будет принимать иконку, заголовок и текст
function InstructionCard({ icon, title, children }) {
  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper}>
        {icon}
      </div>
      <div className={styles.contentWrapper}>
        <h4 className={styles.title}>{title}</h4>
        <p className={styles.text}>{children}</p>
      </div>
    </div>
  );
}

export default InstructionCard;