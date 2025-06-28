import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

function HomePage() {
  const [queueName, setQueueName] = useState('');
  const [queueDescription, setQueueDescription] = useState(''); // Для описания
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

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
      navigate(`/admin/${data.admin_secret_key}`);
    } catch (error) {
      toast.error('Не удалось создать очередь.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleCreateQueue();
    }
  };

  return (
    // --- ВОТ ОН, ПРАВИЛЬНЫЙ КЛАСС КОНТЕЙНЕРА ---
    <div className="container" style={{ paddingTop: '60px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: '700' }}>Q-App</h1>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)', marginTop: '10px', maxWidth: '400px', margin: '10px auto 0' }}>
          Создайте электронную очередь для любого события за 10 секунд.
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--card-background)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input 
            placeholder="Название вашей очереди (обязательно)"
            value={queueName}
            onChange={(e) => setQueueName(e.target.value)}
            onKeyPress={handleKeyPress}
            style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', boxSizing: 'border-box' }}
          />
          <textarea
            placeholder="Описание или условия (необязательно)"
            value={queueDescription}
            onChange={(e) => setQueueDescription(e.target.value)}
            rows="3"
            style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <button 
            onClick={handleCreateQueue}
            disabled={isLoading || !queueName.trim()}
            style={{ 
              padding: '12px', fontSize: '16px', fontWeight: '600',
              backgroundColor: 'var(--accent-blue)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: 'pointer' 
            }}
          >
            {isLoading ? 'Создание...' : 'Создать очередь'}
          </button>
        </div>
      </div>
      
      <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px' }}>
        Бесплатно. Без регистрации. Просто.
      </p>
    </div>
  );
}

export default HomePage;