import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { PauseCircle } from 'lucide-react';

import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import styles from './JoinPage.module.css';
import log from '../utils/logger';

function JoinPage() {
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
            try {
                const { data: queueData, error: queueError } = await supabase
                    .from('queues')
                    .select('name, description, status')
                    .eq('id', queueId)
                    .single();
                
                if (queueError || !queueData) {
                    throw new Error('Очередь не найдена или была удалена.');
                }
                
                setQueue(queueData);

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

    useEffect(() => {
        if (!queueId) return;

        const channel = supabase.channel(`join-page-queue-status-${queueId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'queues',
                filter: `id=eq.${queueId}`
            }, (payload) => {
                log('JoinPage', 'Получен realtime-статус очереди', payload.new.status);
                setQueue(prevQueue => ({ ...prevQueue, status: payload.new.status }));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queueId]);


    const handleJoinQueue = async () => {
        if (!memberName.trim()) {
            toast.error('Пожалуйста, введите ваше имя.');
            return;
        }
        setIsLoading(true);
        try {
            const chars = 'ACEHKMOPTX'; 
            const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
            const randomNumber = Math.floor(10 + Math.random() * 90);
            const displayCode = `${randomChar}${randomNumber}`;
            
            const { data, error } = await supabase
                .from('queue_members')
                .insert([{ queue_id: queueId, member_name: memberName, display_code: displayCode }])
                .select('id')
                .single();

            if (error) {
                throw error; 
            }

            const session = { memberId: data.id, queueId: queueId };
            localStorage.setItem('my-queue-session', JSON.stringify(session));
            
            toast.success(`Вы успешно встали в очередь!`);
            navigate(`/wait/${queueId}/${data.id}`);

        } catch (err) {
            log('JoinPage', 'ОШИБКА в handleJoinQueue:', err.message, 'error');
            
            if (err.message.includes('Queue is currently paused')) {
                toast.error("Запись в очередь приостановлена администратором.");
            } else {
                toast.error('Не удалось встать в очередь.');
            }
            setIsLoading(false);
        }
    };
    
    const handleReturnToWaitPage = () => {
        navigate(`/wait/${activeSession.queueId}/${activeSession.memberId}`);
    };

    const handleJoinAsNew = async () => {
        if (!activeSession) return;
        const toastId = toast.loading('Выходим из предыдущей сессии...');
        const { error: deleteError } = await supabase
            .from('queue_members')
            .delete()
            .eq('id', activeSession.memberId);
        if (deleteError) {
            toast.error('Не удалось выйти из старой сессии.', { id: toastId });
            return;
        }
        localStorage.removeItem('my-queue-session');
        setActiveSession(null);
        toast.success('Теперь вы можете войти как новый участник.', { id: toastId });
    };
    
    // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
    if (isLoading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spinner />
        </div>
    );
    
    if (error) return <div className={`container ${styles.errorText}`}>{error}</div>;
    
    if (activeSession) {
        return (
            <div className={`container ${styles.pageContainer}`}>
                <div className={styles.header}>
                    <p className={styles.subheading}>Вы уже находитесь в очереди:</p>
                    <h1 className={styles.title}>{queue?.name}</h1>
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

    return (
        <div className={`container ${styles.pageContainer}`}>
            <div className={styles.header}>
                <p className={styles.subheading}>Вы присоединяетесь к очереди:</p>
                <h1 className={styles.title}>{queue?.name}</h1>
                {queue?.description && <p className={styles.description}>{queue.description}</p>}
            </div>
            <Card>
                {queue?.status === 'paused' ? (
                    <div className={styles.pausedMessage}>
                        <PauseCircle size={24} color="#ff9500" />
                        <span>Регистрация в очередь временно приостановлена.</span>
                    </div>
                ) : (
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
                )}
            </Card>
        </div>
    );
}
export default JoinPage;