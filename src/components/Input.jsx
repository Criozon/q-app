import React from 'react';

function Input({ value, onChange, placeholder, type = 'text', onKeyPress }) {
  const [isFocused, setIsFocused] = React.useState(false);

  const style = {
    input: {
      width: '100%',
      padding: '16px',
      fontSize: '17px',
      backgroundColor: '#f0f2f5',
      border: '1px solid #d1d1d6',
      borderRadius: '12px',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    focus: {
      borderColor: 'var(--accent-blue, #007aff)',
    }
  };

  const inputStyle = {
    ...style.input,
    ...(isFocused ? style.focus : {}),
  };

  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={inputStyle}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyPress={onKeyPress}
    />
  );
}

export default Input;