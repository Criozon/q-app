import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import styles from './HomePage.module.css';
import Section from '../components/Section';
import Card from '../components/Card';
import ConfirmationModal from '../components/ConfirmationModal';
import Button from '../components/Button';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import { useMyQueues } from '../hooks/useMyQueues';
import { useCheckActiveSession } from '../hooks/useCheckActiveSession';
import { clearActiveSession } from '../utils/session';

function HomePage() {
  const [queueName, setQueueName] = useState('');
  const [queueDescription, setQueueDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [myQueues, setMyQueues] = useMyQueues();
  const navigate = useNavigate();
  const sessionInfo = useCheckActiveSession();

  const [confirmation, setConfirmation] = useState({
      isOpen: false,
      title: '',
      message: null,
      onConfirm: () => {},
      onCancelAction: () => {},
      confirmText: 'Подтвердить',
      cancelText: 'Отмена',
      isDestructive: false, // Добавляем свойство в состояние
  });

  useEffect(() => {
    if (sessionInfo.status === 'valid' && sessionInfo.session) {
      const { session, queueName } = sessionInfo;
      
      setConfirmation({
        isOpen: true,
        title: "Обнаружена активная сессия",
        message: <p>Вы уже находитесь в очереди <strong>"{queueName}"</strong>. Хотите вернуться или выйти?</p>,
        confirmText: "Да, вернуться",
        cancelText: "Нет, выйти",
        isDestructive: false, // Указываем, что это НЕ разрушительное действие
        onConfirm: () => {
          navigate(`/wait/${session.queueId}/${session.memberId}`);
        },
        onCancelAction: async () => {
          const toastId = toast.loading('Выходим из очереди...');
          const { error: deleteError } = await service.deleteMember(session.memberId);
          toast.dismiss(toastId);

          if (deleteError) {
            toast.error('Не удалось выйти из очереди.');
          } else {
            clearActiveSession();
            toast.success('Вы успешно вышли из очереди.');
          }
        }
      });
    }
  }, [sessionInfo, navigate]);

  const handleCreateQueue = async () => {
    if (!queueName.trim()) {
      toast.error('Пожалуйста, введите название очереди.');
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading('Создаем очередь... Это может занять до 30 секунд при первом запуске.');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 25000)
    );

    try {
      const { data, error } = await Promise.race([
          service.createQueue({ name: queueName, description: queueDescription }),
          timeoutPromise
      ]);

      if (error) throw error;
      
      toast.success('Очередь создана!', { id: toastId });

      const newQueue = { 
        id: data.id, 
        name: data.name, 
        admin_secret_key: data.admin_secret_key 
      };
      setMyQueues([newQueue, ...myQueues]);
      
      navigate(`/admin/${data.admin_secret_key}`, { state: { fromCreation: true } });

    } catch (error) {
      if (error.message === "Timeout") {
        toast.error('Сервер отвечает слишком долго. Попробуйте, пожалуйста, еще раз.', { id: toastId, duration: 6000 });
      } else {
        toast.error('Не удалось создать очередь.', { id: toastId });
      }
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
          isDestructive: true, // Указываем, что это РАЗРУШИТЕЛЬНОЕ действие
          onConfirm: () => {
              const originalQueues = [...myQueues];
              const updatedQueues = myQueues.filter(q => q.id !== queueToDelete.id);
              setMyQueues(updatedQueues);
              
              const toastId = toast.loading(`Удаляем очередь "${queueToDelete.name}"...`);
              const performDelete = async () => {
                  const { error } = await service.deleteQueue(queueToDelete.id);
                  toast.dismiss(toastId);
                  if (error) {
                      toast.error(`Не удалось удалить очередь "${queueToDelete.name}".`);
                      setMyQueues(originalQueues);
                  } else {
                      toast.success(`Очередь "${queueToDelete.name}" успешно удалена.`);
                  }
              };
              performDelete();
          },
          onCancelAction: () => setConfirmation({ isOpen: false })
      });
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') handleCreateQueue();
  };

  return (
    <div className={`container ${styles.pageContainer}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>Q-App</h1>
        <p className={styles.subtitle}>Создайте электронную очередь для любого события за 10 секунд.</p>
      </div>
      <div className={styles.creationCard}>
        <div className={styles.form}>
          <input 
            className={styles.input}
            placeholder="Название вашей очереди (обязательно)"
            value={queueName}
            onChange={(e) => setQueueName(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <textarea
            className={styles.textarea}
            placeholder="Описание или условия (необязательно)"
            value={queueDescription}
            onChange={(e) => setQueueDescription(e.target.value)}
            rows="3"
          />
          <Button onClick={handleCreateQueue} isLoading={isLoading} disabled={!queueName.trim()}>
            Создать очередь
          </Button>
        </div>
      </div>
      <p className={styles.footerText}>Бесплатно. Без регистрации. Просто.</p>
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
          onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
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