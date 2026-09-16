import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface SectionProps {
    title: ReactNode;
    children?: ReactNode;
}

function Section({ title, children }: SectionProps) {
    return (
        <div className={styles.section}>
            <h2 className={styles.title}>{title}</h2>
            {children}
        </div>
    );
}

export default Section;
