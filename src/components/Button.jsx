import React from 'react';

function Button({ children, disabled, onClick, style, title }) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '16px',
    fontSize: '17px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: 'var(--accent-blue)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'transform 0.1s ease-in-out, background-color 0.2s, opacity 0.2s',
  };

  const disabledStyle = {
    backgroundColor: '#a0a0a0',
    cursor: 'not-allowed',
    opacity: 0.5,
  };

  const buttonStyle = {
    ...baseStyle,
    ...(disabled ? disabledStyle : {}),
    ...style,
  };

  const handleMouseDown = (e) => {
    if (!disabled) e.currentTarget.style.transform = 'scale(0.98)';
  };
  const handleMouseUp = (e) => {
    if (!disabled) e.currentTarget.style.transform = 'scale(1)';
  };

  return (
    <button
      style={buttonStyle}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      title={title}
    >
      {children}
    </button>
  );
}

export default Button;