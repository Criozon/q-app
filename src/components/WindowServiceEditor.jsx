import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import styles from './WindowServiceEditor.module.css';
import * as service from '../services/supabaseService';
import Button from './Button';

function WindowServiceEditor({ windowData, allServices, onUpdate }) {
  const [selectedServices, setSelectedServices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Инициализируем выбранные услуги на основе данных, пришедших из БД
    const initiallySelected = windowData.window_services.map(ws => ws.service_id);
    setSelectedServices(initiallySelected);
  }, [windowData]);

  const handleToggleService = (serviceId) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleSaveChanges = async () => {
    setIsLoading(true);
    const { error } = await service.setServicesForWindow(windowData.id, selectedServices);
    if (error) {
      toast.error(`Не удалось обновить услуги для "${windowData.name}"`);
    } else {
      toast.success(`Услуги для "${windowData.name}" обновлены.`);
      onUpdate();
    }
    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.windowName}>{windowData.name}</h4>
      <div className={styles.serviceList}>
        {allServices.length > 0 ? (
          allServices.map(s => (
            <label key={s.id} className={styles.serviceLabel}>
              <input 
                type="checkbox" 
                checked={selectedServices.includes(s.id)}
                onChange={() => handleToggleService(s.id)}
              />
              {s.name}
            </label>
          ))
        ) : (
          <p className={styles.noServicesText}>Сначала добавьте услуги в список выше.</p>
        )}
      </div>
      <Button onClick={handleSaveChanges} isLoading={isLoading}>
        Сохранить
      </Button>
    </div>
  );
}

export default WindowServiceEditor;