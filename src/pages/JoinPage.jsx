import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';

// --- НАША НОВАЯ ФУНКЦИЯ-ГЕНЕРАТОР ---
function generateDisplayCode() {
    console.log('--- generateDisplayCode: Запущена генерация кода ---');
    const chars = 'ACEHKMOPTX'; // Буквы, одинаковые в латинице и кириллице
    const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
    const randomNumber = Math.floor(10 + Math.random() * 90); // Двузначное число от 10 до 99
    const code = `${randomChar}${randomNumber}`;
    console.log(`--- generateDisplayCode: Сгенерирован код: ${code}`);
    return code;
}

function JoinPage() {
    console.log('--- JoinPage: Компонент отрисован ---');
    const { queueId } = useParams();
    const navigate = useNavigate();
    const [queue, setQueue] = useState(null);
    const [memberName, setMemberName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        console.log('--- JoinPage: useEffect - Загружаем информацию об очереди...');
        const fetchQueueInfo = async () => {
            try {
                const { data, error } = await supabase.from('queues').select('name, description, status').eq('id', queueId).single();
                if (error || !data) throw new Error('Очередь не найдена.');
                if (data.status !== 'active') throw new Error(`Очередь сейчас неактивна.`);
                console.log('--- JoinPage: Информация об очереди получена:', data);
                setQueue(data);
            } catch (err) { setError(err.message); } 
            finally { setIsLoading(false); }
        };
        fetchQueueInfo();
    }, [queueId]);

    const handleJoinQueue = async () => {
        console.log('--- handleJoinQueue: Нажата кнопка "Встать в очередь" ---');
        if (!memberName.trim()) {
            toast.error('Пожалуйста, введите ваше имя.');
            return;
        }
        setIsLoading(true);
        try {
            const displayCode = generateDisplayCode();
            console.log(`--- handleJoinQueue: Отправляем в базу: имя - ${memberName}, код - ${displayCode}`);
            
            const { data, error } = await supabase
                .from('queue_members')
                .insert([{ 
                    queue_id: queueId, 
                    member_name: memberName,
                    display_code: displayCode 
                }])
                .select('id')
                .single();

            if (error) throw error;
            
            console.log(`--- handleJoinQueue: Успешно. ID нового участника: ${data.id}. Переходим на страницу ожидания...`);
            toast.success(`Вы успешно встали в очередь!`);
            navigate(`/wait/${queueId}/${data.id}`);

        } catch (error) {
            console.error("!!! ОШИБКА в handleJoinQueue:", error);
            toast.error('Не удалось встать в очередь.');
        } finally {
            setIsLoading(false);
        }
    };
    
    if (isLoading) return <div className="container" style={{textAlign: 'center', paddingTop: '40px'}}>Загрузка...</div>;
    if (error) return <div className="container" style={{color: 'red', textAlign: 'center', paddingTop: '40px'}}>{error}</div>;

    return (
        <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '30px', paddingTop: '40px' }}>
                <p style={{fontSize: '18px', color: 'var(--text-secondary)'}}>Вы присоединяетесь к очереди:</p>
                <h1 style={{ fontSize: '32px', marginTop: '5px' }}>{queue.name}</h1>
                {queue.description && <p style={{fontSize: '18px', color: 'var(--text-secondary)', marginTop: '10px'}}>{queue.description}</p>}
            </div>
            <Card>
                <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                    <Input 
                        placeholder="Ваше имя или псевдоним"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                    />
                    <Button onClick={handleJoinQueue} disabled={isLoading}>
                        {isLoading ? 'Входим...' : 'Встать в очередь'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
export default JoinPage;