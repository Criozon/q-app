import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './ServiceManager.module.css';
import * as service from '../services/supabaseService';
import Input from './Input';
import Button from './Button';

function ServiceManager({ queueId, services, onUpdate }) {
  const [newServiceName, setNewServiceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddService = async () => {
    if (!newServiceName.trim()) {
      toast.error('Название услуги не может быть пустым.');
      return;
    }
    setIsLoading(true);
    const { error } = await service.addService(queueId, newServiceName.trim());
    if (error) {
      toast.error('Не удалось добавить услугу. Возможно, она уже существует.');
    } else {
      toast.success('Услуга добавлена!');
      setNewServiceName('');
      onUpdate(); // Обновляем данные в родительском компоненте
    }
    setIsLoading(false);
  };

  const handleRemoveService = async (serviceId) => {
    const { error } = await service.removeService(serviceId);
    if (error) {
      toast.error('Не удалось удалить услугу.');
    } else {
      toast.success('Услуга удалена.');
      onUpdate();
    }
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Список услуг</h3>
      <div className={styles.addServiceForm}>
        <Input
          placeholder="Название новой услуги"
          value={newServiceName}
          onChange={(e) => setNewServiceName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddService()}
        />
        <Button onClick={handleAddService} isLoading={isLoading}>
          <Plus size={18} />
        </Button>
      </div>

      <div className={styles.serviceList}>
        {services.length > 0 ? (
          services.map(s => (
            <div key={s.id} className={styles.serviceItem}>
              <span>{s.name}</span>
              <button className={styles.deleteButton} onClick={() => handleRemoveService(s.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className={styles.noServicesText}>Услуги еще не добавлены.</p>
        )}
      </div>
    </div>
  );
}

export default ServiceManager;