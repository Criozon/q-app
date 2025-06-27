import React from 'react';

function Section({ title, children }) {
    const sectionStyle = {
        marginTop: '32px',
    };
    const titleStyle = {
        fontSize: '22px',
        fontWeight: '600',
        marginBottom: '16px',
    };
    return (
        <div style={sectionStyle}>
            <h2 style={titleStyle}>{title}</h2>
            {children}
        </div>
    );
}

export default Section;