import React from 'react';
import styles from './Section.module.css';

function Section({ title, children }) {
    return (
        <div className={styles.section}>
            <h2 className={styles.title}>{title}</h2>
            {children}
        </div>
    );
}

export default Section;