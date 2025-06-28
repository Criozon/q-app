import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import styles from './JoinPage.module.css';
import log from '../utils/logger';

function JoinPage() {
    log('JoinPage', 'Компонент отрисован');
    const { queueId } = useParams();
    const navigate = useNavigate();
    
    const [queue, setQueue] = useState(null);
    const [memberName, setMemberName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeSession, setActiveSession] = useState(null);

    useEffect(() => {
        const loadPageData = async () => {
            setIsLoading(true);
            
            // --- ИЗМЕНЕНИЕ 1: СНАЧАЛА всегда загружаем информацию об очереди ---
            // Она нужна для обоих экранов: и для формы входа, и для экрана восстановления.
            try {
                const { data: queueData, error: queueError } = await supabase
                    .from('queues')
                    .select('name, description, status')
                    .eq('id', queueId)
                    .single();
                
                if (queueError || !queueData) throw new Error('Очередь не найдена или была удалена.');
                if (queueData.status !== 'active') throw new Error(`Очередь сейчас неактивна.`);
                
                setQueue(queueData); // Сохраняем данные об очереди в любом случае

                // --- ШАГ 2: ТЕПЕРЬ проверяем сессию ---
                const sessionRaw = localStorage.getItem('my-queue-session');
                if (sessionRaw) {
                    const session = JSON.parse(sessionRaw);
                    if (session.queueId === queueId) {
                        const { data: memberData, error: memberError } = await supabase
                            .from('queue_members')
                            .select('status')
                            .eq('id', session.memberId)
                            .single();
                        
                        if (memberData && !memberError && (memberData.status === 'waiting' || memberData.status === 'called')) {
                            log('JoinPage', 'Найдена активная сессия, показываем экран восстановления.');
                            setActiveSession(session);
                        }
                    }
                }
            } catch (err) { 
                setError(err.message); 
            } finally { 
                setIsLoading(false); 
            }
        };

        loadPageData();
    }, [queueId]);

    const handleJoinQueue = async () => {
        log('JoinPage', 'Нажата кнопка "Встать в очередь"');
        if (!memberName.trim()) {
            toast.error('Пожалуйста, введите ваше имя.');
            return;
        }
        setIsLoading(true);
        try {
            // Генерация кода теперь внутри, как и должно быть
            const chars = 'ACEHKMOPTX'; 
            const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
            const randomNumber = Math.floor(10 + Math.random() * 90);
            const displayCode = `${randomChar}${randomNumber}`;
            
            const { data, error } = await supabase
                .from('queue_members')
                .insert([{ queue_id: queueId, member_name: memberName, display_code: displayCode }])
                .select('id')
                .single();

            if (error) throw error;
            
            const session = { memberId: data.id, queueId: queueId };
            localStorage.setItem('my-queue-session', JSON.stringify(session));
            log('JoinPage', 'Сессия участника сохранена в localStorage', session);
            
            toast.success(`Вы успешно встали в очередь!`);
            navigate(`/wait/${queueId}/${data.id}`);

        } catch (error) {
            log('JoinPage', '!!! ОШИБКА в handleJoinQueue:', error, 'error');
            toast.error('Не удалось встать в очередь.');
            setIsLoading(false);
        }
    };
    
    const handleReturnToWaitPage = () => {
        navigate(`/wait/${activeSession.queueId}/${activeSession.memberId}`);
    };

    // --- ИЗМЕНЕНИЕ 2: Полностью переработанная логика выхода ---
    const handleJoinAsNew = async () => {
        if (!activeSession) return;
        
        const toastId = toast.loading('Выходим из предыдущей сессии...');
        
        // Удаляем старую запись из базы данных
        const { error: deleteError } = await supabase
            .from('queue_members')
            .delete()
            .eq('id', activeSession.memberId);
            
        if (deleteError) {
            toast.error('Не удалось выйти из старой сессии.', { id: toastId });
            return;
        }
        
        // Только после успеха чистим всё остальное
        localStorage.removeItem('my-queue-session');
        setActiveSession(null); // Это переключит UI на форму входа
        toast.success('Теперь вы можете войти как новый участник.', { id: toastId });
    };
    
    if (isLoading) return <div className="container" style={{textAlign: 'center', paddingTop: '40px'}}>Загрузка...</div>;
    if (error) return <div className={`container ${styles.errorText}`}>{error}</div>;
    
    // Если найдена активная сессия, показываем специальный экран
    if (activeSession) {
        return (
            <div className={`container ${styles.pageContainer}`}>
                <div className={styles.header}>
                    <p className={styles.subheading}>Вы уже находитесь в очереди:</p>
                    <h1 className={styles.title}>{queue?.name}</h1> {/* Используем ? на случай если queue еще не загрузился */}
                </div>
                <Card>
                    <div className={styles.formContainer}>
                        <Button onClick={handleReturnToWaitPage}>
                            Вернуться на страницу ожидания
                        </Button>
                        <Button onClick={handleJoinAsNew} className={styles.secondaryButton}>
                            Войти как другой человек
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    // В противном случае, показываем стандартную форму входа
    return (
        <div className={`container ${styles.pageContainer}`}>
            <div className={styles.header}>
                <p className={styles.subheading}>Вы присоединяетесь к очереди:</p>
                <h1 className={styles.title}>{queue?.name}</h1>
                {queue?.description && <p className={styles.description}>{queue.description}</p>}
            </div>
            <Card>
                <div className={styles.formContainer}>
                    <Input 
                        placeholder="Ваше имя или псевдоним"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleJoinQueue()}
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