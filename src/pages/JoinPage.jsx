import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function JoinPage() {
    const { queueId } = useParams();
    const navigate = useNavigate();
    const [queue, setQueue] = useState(null);
    const [memberName, setMemberName] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchQueueInfo = async () => {
            const { data, error } = await supabase.from('queues').select('name').eq('id', queueId).single();
            if (error || !data) { setIsLoading(false); return; }
            setQueue(data);
            setIsLoading(false);
        };
        fetchQueueInfo();
    }, [queueId]);

    const handleJoinQueue = async () => {
        if (!memberName.trim()) { alert('Введите имя'); return; }
        setIsLoading(true);
        try {
            await supabase.from('queue_members').insert([{ queue_id: queueId, member_name: memberName }]);
            navigate(`/wait/${queueId}/${memberName}`);
        } catch (error) {
            alert('Ошибка');
            setIsLoading(false);
        }
    };

    if (isLoading) return <div>Загрузка...</div>;
    if (!queue) return <div>Очередь не найдена.</div>;

    return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
            <h1>Встать в очередь: {queue.name}</h1>
            <input 
                placeholder="Ваше имя"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
            />
            <button onClick={handleJoinQueue} disabled={isLoading}>
                {isLoading ? '...' : 'Присоединиться'}
            </button>
        </div>
    );
}

export default JoinPage;