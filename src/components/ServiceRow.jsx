import React from 'react';
import { Trash2 } from 'lucide-react';
import styles from './ServiceRow.module.css';
import Input from './Input';

function ServiceRow({ service, onUpdate, onRemove, windowCount }) {

  const handleNameChange = (e) => {
    onUpdate({ ...service, name: e.target.value });
  };

  const handleWindowSelection = (windowIndex) => {
    const currentWindows = service.window_indices || [];
    const isSelected = currentWindows.includes(windowIndex);
    
    let newWindows;
    if (isSelected) {
      newWindows = currentWindows.filter(idx => idx !== windowIndex);
    } else {
      newWindows = [...currentWindows, windowIndex].sort((a, b) => a - b);
    }
    onUpdate({ ...service, window_indices: newWindows });
  };
  
  const windowOptions = Array.from({ length: windowCount }, (_, i) => i + 1);

  return (
    <div className={styles.row}>
      <div className={styles.inputWrapper}>
        <Input 
          placeholder="Название услуги"
          value={service.name}
          onChange={handleNameChange}
        />
      </div>
      <div className={styles.windowSelector}>
        {windowOptions.map(index => (
          <button 
            key={index}
            className={`${styles.windowChip} ${service.window_indices?.includes(index) ? styles.selected : ''}`}
            onClick={() => handleWindowSelection(index)}
            title={`Окно ${index}`}
          >
            {index}
          </button>
        ))}
      </div>
      <button 
        className={styles.removeButton} 
        onClick={onRemove}
        title="Удалить услугу"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

export default ServiceRow;