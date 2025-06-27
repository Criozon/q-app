import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

function HomePage() {
  const [queueName, setQueueName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateQueue = async () => {
    if (!queueName.trim()) {
      toast.error('Пожалуйста, введите название очереди.');
      return;
    }
    const toastId = toast.loading('Создание...');
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('queues').insert([{ name: queueName }]).select().single();
      if (error) throw error;
      toast.success('Очередь создана!', { id: toastId });
      navigate(`/admin/${data.admin_secret_key}`);
    } catch (error) {
      toast.error('Ошибка при создании очереди.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Создать новую очередь</h1>
      <input 
        value={queueName}
        onChange={(e) => setQueueName(e.target.value)}
        placeholder="Название очереди"
        style={{ fontSize: '16px', padding: '8px' }}
      />
      <button onClick={handleCreateQueue} disabled={isLoading} style={{ fontSize: '16px', padding: '8px' }}>
        {isLoading ? 'Создание...' : 'Создать'}
      </button>
    </div>
  );
}

export default HomePage;