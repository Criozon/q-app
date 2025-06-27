import React from 'react';

function Card({ children, style }) {
    const cardStyle = {
        backgroundColor: 'var(--card-background, white)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        ...style
    };
    return (
        <div style={cardStyle}>
            {children}
        </div>
    );
}

export default Card;