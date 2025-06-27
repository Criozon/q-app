import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

function JoinPage() {
    const { queueId } = useParams();
    const navigate = useNavigate();
    const [queue, setQueue] = useState(null);
    const [memberName, setMemberName] = useState('');
    const [isLoading, setIsLoading] = useState(true); // <-- Правильное имя переменной
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchQueueInfo = async () => {
            try {
                const { data, error } = await supabase
                    .from('queues')
                    .select('name, description, status')
                    .eq('id', queueId)
                    .single();

                if (error || !data) {
                    throw new Error('Не удалось найти такую очередь. Возможно, ссылка устарела.');
                }
                if (data.status !== 'active') {
                    throw new Error(`Эта очередь сейчас неактивна (статус: ${data.status}).`);
                }
                setQueue(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchQueueInfo();
    }, [queueId]);

    const handleJoinQueue = async () => {
        if (!memberName.trim()) {
            toast.error('Пожалуйста, введите ваше имя.');
            return;
        }
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('queue_members')
                .insert([{ queue_id: queueId, member_name: memberName }]);
            if (error) throw error;
            
            toast.success(`Вы успешно встали в очередь "${queue.name}"!`);
            
            navigate(`/wait/${queueId}/${memberName}`);

        } catch (error) {
            console.error('Ошибка:', error);
            toast.error('Не удалось встать в очередь.');
        } finally {
            setIsLoading(false);
        }
    };
  
    // --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
    if (isLoading) return <div>Загрузка информации об очереди...</div>;
    if (error) return <div style={{color: 'red', fontFamily: 'sans-serif', padding: '20px'}}>{error}</div>;

    return (
        <div style={{ maxWidth: '500px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h2>Вы входите в очередь:</h2>
            <h1>{queue.name}</h1>
            <p style={{ color: '#555' }}>{queue.description}</p>
            <hr style={{ margin: '20px 0' }} />
            <div style={{ marginBottom: '15px' }}>
                <label htmlFor="memberName" style={{ display: 'block', marginBottom: '5px' }}>Ваше имя или псевдоним*</label>
                <input
                    type="text"
                    id="memberName"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Например, Иван"
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box', fontSize: '16px' }}
                    disabled={isLoading}
                />
            </div>
            <button 
                onClick={handleJoinQueue} 
                disabled={isLoading}
                style={{ 
                    width: '100%', 
                    padding: '12px', 
                    background: '#28a745', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '5px', 
                    cursor: 'pointer', 
                    fontSize: '16px',
                    opacity: isLoading ? 0.7 : 1
                }}
            >
                {isLoading ? 'Добавляемся...' : 'Встать в очередь'}
            </button>
        </div>
    );
}

export default JoinPage;