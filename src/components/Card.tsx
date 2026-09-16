import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
    children?: ReactNode;
    /** Нужен, чтобы прокручивать список к конкретному участнику. */
    id?: string;
    style?: CSSProperties;
    className?: string;
}

function Card({ children, style, className, id }: CardProps) {
    const combinedClassName = [styles.card, className].filter(Boolean).join(' ');

    return (
        <div id={id} className={combinedClassName} style={style}>
            {children}
        </div>
    );
}

export default Card;
