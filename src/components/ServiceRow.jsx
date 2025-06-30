import React from 'react';
import { Trash2 } from 'lucide-react';
import styles from './ServiceRow.module.css';
import Input from './Input';

// --- НАЧАЛО ИЗМЕНЕНИЙ: Упрощаем проброс пропсов ---
// Меняем 'inputClassName' на просто 'className' для единообразия
const ServiceRow = React.forwardRef(({ service, onUpdate, onRemove, windowCount, className }, ref) => {

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
      <div className={styles.topRow}>
        <div className={styles.inputWrapper}>
          <Input 
            placeholder="Название услуги"
            value={service.name}
            onChange={handleNameChange}
            ref={ref} 
            // Передаем полученный класс напрямую в Input
            className={className}
          />
        </div>
        <button 
          className={styles.removeButton} 
          onClick={onRemove}
          title="Удалить услугу"
        >
          <Trash2 size={18} />
        </button>
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
    </div>
  );
});
// --- КОНЕЦ ИЗМЕНЕНИЙ ---

export default ServiceRow;