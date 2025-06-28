import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';

import styles from './HomePage.module.css';
import Section from '../components/Section';
import Card from '../components/Card';
import ConfirmationModal from '../components/ConfirmationModal'; // <-- 1. ИМПОРТ
import log from '../utils/logger';

function HomePage() {
  const [queueName, setQueueName] = useState('');
  const [queueDescription, setQueueDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [myQueues, setMyQueues] = useState([]);
  const navigate = useNavigate();

  const sessionCheckRef = useRef(false);
  
  // 2. СОСТОЯНИЕ ДЛЯ МОДАЛЬНОГО ОКНА
  const [confirmation, setConfirmation] = useState({
      isOpen: false,
      title: '',
      message: null,
      onConfirm: () => {},
  });

  useEffect(() => {
    try {
      const savedQueuesRaw = localStorage.getItem('my-queues');
      if (savedQueuesRaw) {
        setMyQueues(JSON.parse(savedQueuesRaw));
      }
    } catch (error) {
      log('HomePage', 'Ошибка загрузки очередей админа', 'error');
      localStorage.removeItem('my-queues');
    }

    const checkActiveSession = async () => {
      try {
        const sessionRaw = localStorage.getItem('my-queue-session');
        if (!sessionRaw) return;

        const { memberId, queueId } = JSON.parse(sessionRaw);
        log('HomePage', 'Найдена сессия участника, проверяем актуальность...');

        const { data, error } = await supabase
          .from('queue_members')
          .select('status, queues(name)')
          .eq('id', memberId)
          .single();

        if (error || !data || data.status === 'serviced') {
          log('HomePage', 'Сессия неактуальна, очищаем localStorage');
          localStorage.removeItem('my-queue-session');
          return;
        }

        if (data.status === 'waiting' || data.status === 'called') {
          const queueName = data.queues?.name || '...';
          
          toast((t) => (
            <div className={styles.toastContainer}>
              <span>У вас есть активное место в очереди <strong>"{queueName}"</strong>. Вернуться?</span>
              <div className={styles.toastButtons}>
                <button
                  className={`${styles.toastButton} ${styles.toastButtonConfirm}`}
                  onClick={() => {
                    navigate(`/wait/${queueId}/${memberId}`);
                    toast.dismiss(t.id);
                  }}>
                  Да, вернуться
                </button>
                <button
                  className={`${styles.toastButton} ${styles.toastButtonCancel}`}
                  onClick={async () => {
                    toast.dismiss(t.id);
                    const toastId = toast.loading('Выходим из очереди...');
                    
                    const { error: deleteError } = await supabase
                      .from('queue_members')
                      .delete()
                      .eq('id', memberId);

                    toast.dismiss(toastId);

                    if (deleteError) {
                      toast.error('Не удалось выйти из очереди.');
                    } else {
                      localStorage.removeItem('my-queue-session');
                      toast.success('Вы успешно вышли из очереди.');
                    }
                  }}>
                  Нет, выйти
                </button>
              </div>
            </div>
          ), { 
              id: 'restore-session-toast',
              duration: 15000, 
              position: "top-center" 
          });
        }
      } catch (e) {
        log('HomePage', 'Ошибка проверки сессии участника', 'error');
        localStorage.removeItem('my-queue-session');
      }
    };

    if (process.env.NODE_ENV === 'development') {
        if (sessionCheckRef.current) return;
        sessionCheckRef.current = true;
    }
    
    checkActiveSession();

  }, [navigate]);

  const handleCreateQueue = async () => {
    if (!queueName.trim()) {
      toast.error('Пожалуйста, введите название очереди.');
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading('Создаем очередь...');
    try {
      const { data, error } = await supabase
        .from('queues').insert([{ name: queueName, description: queueDescription }]).select().single();
      if (error) throw error;
      
      toast.success('Очередь создана!', { id: toastId });

      const newQueue = { 
        id: data.id, 
        name: data.name, 
        admin_secret_key: data.admin_secret_key 
      };
      const updatedQueues = [newQueue, ...myQueues];
      setMyQueues(updatedQueues);
      localStorage.setItem('my-queues', JSON.stringify(updatedQueues));
      
      navigate(`/admin/${data.admin_secret_key}`);
    } catch (error) {
      toast.error('Не удалось создать очередь.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 3. ОБНОВЛЕННАЯ ФУНКЦИЯ УДАЛЕНИЯ ОЧЕРЕДИ
  const handleDeleteQueue = (queueToDelete) => {
      setConfirmation({
          isOpen: true,
          title: 'Удалить очередь?',
          message: <p>Вы уверены, что хотите удалить очередь <strong>"{queueToDelete.name}"</strong>? Это действие необратимо, и все участники будут удалены.</p>,
          confirmText: 'Да, удалить',
          onConfirm: () => {
              const originalQueues = [...myQueues];
              const updatedQueues = myQueues.filter(q => q.id !== queueToDelete.id);
              setMyQueues(updatedQueues);
              localStorage.setItem('my-queues', JSON.stringify(updatedQueues));
              
              const toastId = toast.loading(`Удаляем очередь "${queueToDelete.name}"...`);

              const performDelete = async () => {
                  const { error } = await supabase.rpc('delete_queue_and_members', {
                      queue_id_to_delete: queueToDelete.id
                  });
                  
                  toast.dismiss(toastId);

                  if (error) {
                      toast.error(`Не удалось удалить очередь "${queueToDelete.name}".`);
                      setMyQueues(originalQueues);
                      localStorage.setItem('my-queues', JSON.stringify(originalQueues));
                  } else {
                      toast.success(`Очередь "${queueToDelete.name}" успешно удалена.`);
                  }
              };
              performDelete();
          }
      });
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleCreateQueue();
    }
  };

  return (
    <div className={`container ${styles.pageContainer}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>Q-App</h1>
        <p className={styles.subtitle}>
          Создайте электронную очередь для любого события за 10 секунд.
        </p>
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
          <button 
            className={styles.button}
            onClick={handleCreateQueue}
            disabled={isLoading || !queueName.trim()}
          >
            {isLoading ? 'Создание...' : 'Создать очередь'}
          </button>
        </div>
      </div>
      <p className={styles.footerText}>
        Бесплатно. Без регистрации. Просто.
      </p>
      {myQueues.length > 0 && (
        <Section title="Мои очереди">
          <div className={styles.myQueuesList}>
            {myQueues.map((queue) => (
              <div key={queue.id} className={styles.queueItemContainer}>
                <Link to={`/admin/${queue.admin_secret_key}`} className={styles.queueLink}>
                  <Card className={styles.queueLinkCard}>
                    {queue.name}
                  </Card>
                </Link>
                <button 
                    className={styles.deleteButton} 
                    onClick={() => handleDeleteQueue(queue)} // <-- Передаем весь объект queue
                    title={`Удалить очередь "${queue.name}"`}
                >
                    <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 4. ДОБАВЛЯЕМ КОМПОНЕНТ В РЕНДЕР */}
      <ConfirmationModal 
          isOpen={confirmation.isOpen}
          onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
          onConfirm={confirmation.onConfirm}
          title={confirmation.title}
          confirmText={confirmation.confirmText}
      >
          {confirmation.message}
      </ConfirmationModal>
    </div>
  );
}

export default HomePage;