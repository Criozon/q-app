import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import { ArrowRight } from 'lucide-react';

function HomePage() {
  const [queueName, setQueueName] = useState('');
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
        .from('queues').insert([{ name: queueName, description: '' }]).select().single();
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
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '40px', paddingTop: '60px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: '700' }}>Q-App</h1>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)', marginTop: '10px', maxWidth: '400px', margin: '10px auto 0' }}>
          Создайте электронную очередь для любого события за 10 секунд.
        </p>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Input 
            placeholder="Название вашей очереди"
            value={queueName}
            onChange={(e) => setQueueName(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <Button 
            onClick={handleCreateQueue}
            disabled={isLoading || !queueName.trim()}
            style={{ width: 'auto', padding: '0 20px' }}
          >
            {isLoading ? '...' : <ArrowRight size={24} />}
          </Button>
        </div>
      </Card>
      
      <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px' }}>
        Бесплатно. Без регистрации. Просто.
      </p>
    </div>
  );
}

export default HomePage;