import type { ReactNode } from 'react';
import styles from './InstructionCard.module.css';

interface InstructionCardProps {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
}

function InstructionCard({ icon, title, children }: InstructionCardProps) {
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
