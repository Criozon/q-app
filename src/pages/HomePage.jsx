import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import styles from './HomePage.module.css';
import Section from '../components/Section';
import Card from '../components/Card';
import ConfirmationModal from '../components/ConfirmationModal';
import Button from '../components/Button';
import Input from '../components/Input';
import NumberStepper from '../components/NumberStepper';
import ServiceRow from '../components/ServiceRow';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import { useMyQueues } from '../hooks/useMyQueues';
import { getActiveSession, clearActiveSession } from '../utils/session';

function HomePage() {
  const [queueName, setQueueName] = useState('');
  const [queueDescription, setQueueDescription] = useState('');
  const [windowCount, setWindowCount] = useState(1);
  const [services, setServices] = useState([{ id: uuidv4(), name: '', window_indices: [] }]);
  const [isLoading, setIsLoading] = useState(false);
  const [myQueues, setMyQueues] = useMyQueues();
  const navigate = useNavigate();
  
  const lastServiceInputRef = useRef(null);

  const [confirmation, setConfirmation] = useState({
      isOpen: false,
      title: '',
      message: null,
      onConfirm: () => {},
      onCancelAction: () => {},
      confirmText: 'Подтвердить',
      cancelText: 'Отмена',
      isDestructive: false,
  });

  useEffect(() => {
    const checkSession = async () => {
      const session = getActiveSession();
      if (session) {
        try {
            const { data: memberData } = await service.getMemberById(session.memberId);
            
            // Если участника нет (или обслужили), просто чистим сессию
            if (!memberData || memberData.status === 'serviced') {
              clearActiveSession();
              return;
            }

            // Если он все еще в очереди, показываем диалог
            if (['waiting', 'called', 'acknowledged'].includes(memberData.status)) {
              setConfirmation({
                isOpen: true,
                title: `Вы уже в очереди "${memberData.queues.name}"`,
                message: <p>Похоже, вы не вышли из своей предыдущей очереди. Что вы хотите сделать?</p>,
                confirmText: "Вернуться в очередь",
                cancelText: "Покинуть старую очередь",
                isDestructive: false,
                onConfirm: () => {
                  navigate(`/wait/${session.queueId}/${session.memberId}`);
                },
                onCancelAction: () => {
                    const toastId = toast.loading('Выходим из предыдущей очереди...');
                    service.deleteMember(session.memberId).then(({error}) => {
                        if (error) {
                            toast.error('Не удалось выйти из очереди.', { id: toastId });
                        } else {
                            toast.success('Вы успешно покинули очередь.', { id: toastId });
                        }
                        clearActiveSession();
                        setConfirmation({ isOpen: false });
                    });
                }
              });
            }
        } catch (err) {
            // Если при проверке сессии произошла ЛЮБАЯ ошибка,
            // это значит, что сессия невалидна. Просто чистим ее и идем дальше.
            log('HomePage', 'Ошибка при проверке сессии, сессия будет очищена:', err);
            clearActiveSession();
        }
      }
    };
    // Eslint-disable-next-line для navigate добавлен, т.к. он стабилен и не требует включения в массив зависимостей
    // eslint-disable-next-line
    checkSession();
  }, [navigate]);


  const handleAddService = () => {
    setServices(prevServices => [...prevServices, { id: uuidv4(), name: '', window_indices: [] }]);
    setTimeout(() => {
        lastServiceInputRef.current?.focus();
    }, 0);
  };

  const handleRemoveService = (idToRemove) => {
    if (services.length > 1) {
      setServices(services.filter(s => s.id !== idToRemove));
    } else {
      setServices([{ id: uuidv4(), name: '', window_indices: [] }]);
    }
  };

  const handleUpdateService = (updatedService) => {
    setServices(services.map(s => s.id === updatedService.id ? updatedService : s));
  };

  const handleCreateQueue = async () => {
    if (!queueName.trim()) {
      toast.error('Пожалуйста, введите название очереди.');
      return;
    }
    
    const validServices = services
        .filter(s => s.name.trim() !== '')
        .map(s => ({
            name: s.name.trim(),
            window_indices: s.window_indices || []
        }));
    
    setIsLoading(true);
    const toastId = toast.loading('Создаем очередь...');

    try {
      const { data, error } = await service.createQueue({
          name: queueName.trim(),
          description: queueDescription.trim(),
          window_count: windowCount,
          services_payload: validServices
      });
      
      if (error) throw error;
      
      toast.success('Очередь успешно создана!', { id: toastId });
      
      const newQueue = data[0]; 

      if (!newQueue || !newQueue.admin_secret_key) {
        throw new Error("Сервер не вернул данные о созданной очереди.");
      }

      setMyQueues([newQueue, ...myQueues]);
      
      navigate(`/admin/${newQueue.admin_secret_key}`, { state: { fromCreation: true } });

    } catch (error) {
        log('HomePage', 'Ошибка при создании очереди:', error);
        toast.error(`Не удалось создать очередь. ${error.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDeleteQueue = (queueToDelete) => {
      setConfirmation({
          isOpen: true,
          title: 'Удалить очередь?',
          message: <p>Вы уверены, что хотите удалить очередь <strong>"{queueToDelete.name}"</strong>? Это действие необратимо.</p>,
          confirmText: 'Да, удалить',
          cancelText: 'Отмена',
          isDestructive: true,
          onConfirm: () => {
              const originalQueues = [...myQueues];
              const updatedQueues = myQueues.filter(q => q.id !== queueToDelete.id);
              setMyQueues(updatedQueues);
              
              const toastId = toast.loading(`Удаляем очередь "${queueToDelete.name}"...`);
              service.deleteQueue(queueToDelete.id).then(({error}) => {
                  toast.dismiss(toastId);
                  if (error) {
                      toast.error(`Не удалось удалить очередь "${queueToDelete.name}".`);
                      setMyQueues(originalQueues);
                  } else {
                      toast.success(`Очередь "${queueToDelete.name}" успешно удалена.`);
                  }
              });
          },
          onCancelAction: () => setConfirmation({ isOpen: false })
      });
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !isLoading) handleCreateQueue();
  };

  return (
    <div className={`container ${styles.pageContainer}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>Q-App</h1>
        <p className={styles.subtitle}>Создайте электронную очередь для любого события за 10 секунд.</p>
      </div>
      <Card>
        <div className={styles.form}>
            <Input 
              placeholder="Название очереди (обязательно)"
              value={queueName}
              onChange={(e) => setQueueName(e.target.value)}
              onKeyPress={handleKeyPress}
              className={styles.leftAlignInput}
            />
            <textarea
              className={styles.textarea}
              placeholder="Краткое описание (необязательно)"
              value={queueDescription}
              onChange={(e) => setQueueDescription(e.target.value)}
              rows="3"
            />
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Количество окон</label>
              <NumberStepper 
                value={windowCount}
                onChange={setWindowCount}
                min={1}
                max={20}
              />
            </div>
            
            <div className={styles.serviceSection}>
              <p className={styles.serviceHelpText}>
                Добавьте услуги для разделения потоков (необязательно). Если не выбрать окна, услуга будет доступна во всех.
              </p>
              <div className={styles.serviceRowsContainer}>
                  {services.map((service, index) => (
                    <ServiceRow 
                      key={service.id}
                      service={service}
                      onUpdate={handleUpdateService}
                      onRemove={() => handleRemoveService(service.id)}
                      windowCount={windowCount}
                      ref={index === services.length - 1 ? lastServiceInputRef : null}
                      className={styles.leftAlignInput}
                    />
                  ))}
              </div>
              <Button onClick={handleAddService} className={styles.addButton}>
                <Plus size={18} /> Добавить услугу
              </Button>
            </div>

            <Button onClick={handleCreateQueue} isLoading={isLoading} disabled={!queueName.trim()} className={styles.createButton}>
              Создать очередь
            </Button>
        </div>
      </Card>
      
      {myQueues.length > 0 && (
        <Section title="Мои очереди">
          <div className={styles.myQueuesList}>
            {myQueues.map((queue) => (
              <div key={queue.id} className={styles.queueItemContainer}>
                <Link to={`/admin/${queue.admin_secret_key}`} className={styles.queueLink}>
                  <Card className={styles.queueLinkCard}>{queue.name}</Card>
                </Link>
                <button 
                    className={styles.deleteButton} 
                    onClick={() => handleDeleteQueue(queue)}
                    title={`Удалить очередь "${queue.name}"`}>
                    <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <ConfirmationModal 
          isOpen={confirmation.isOpen}
          onClose={() => {
              if (confirmation.onCancelAction) {
                  confirmation.onCancelAction();
              }
              setConfirmation({ ...confirmation, isOpen: false });
          }}
          onConfirm={confirmation.onConfirm}
          onCancelAction={confirmation.onCancelAction}
          title={confirmation.title}
          confirmText={confirmation.confirmText}
          cancelText={confirmation.cancelText}
          isDestructive={confirmation.isDestructive}
      >
          {confirmation.message}
      </ConfirmationModal>
    </div>
  );
}

export default HomePage;