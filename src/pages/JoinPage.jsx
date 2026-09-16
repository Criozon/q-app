import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PauseCircle } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import styles from './JoinPage.module.css';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import { setActiveSession, clearActiveSession, getActiveSession } from '../utils/session';

function JoinPage() {
    const { shortId } = useParams();
    const navigate = useNavigate();
    
    const [queue, setQueue] = useState(null);
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState(null);
    const [memberName, setMemberName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState('');
    const [currentActiveSession, setCurrentActiveSession] = useState(null);

    useEffect(() => {
        const loadPageData = async () => {
            setIsLoading(true);
            setError('');
            try {
                // Человек на этот момент ещё никто: ни талона, ни пропуска.
                // Поэтому данные отдаёт отдельная публичная функция, которая
                // показывает только название, описание и список услуг.
                const { data: detailsData, error: detailsError } = await service.getQueueForJoin(shortId);
                if (detailsError) throw detailsError;

                const { queue: detailsQueue, services: detailsServices } = detailsData || {};
                if (!detailsQueue) {
                    throw new Error('Очередь не найдена или была удалена.');
                }

                setQueue(detailsQueue);
                setServices(detailsServices || []);

                const session = getActiveSession();
                if (session) {
                    const { data: status } = await service.getMyQueueStatus(session.memberId);
                    const member = status?.member;
                    if (member && ['waiting', 'called', 'acknowledged'].includes(member.status)) {
                        if (session.queueId === detailsQueue.id) {
                            setCurrentActiveSession(session);
                        }
                    } else {
                        clearActiveSession();
                    }
                }
            } catch (err) { 
                log('!!! КРИТИЧЕСКАЯ ОШИБКА в loadPageData:', err);
                setError(err.message || 'Не удалось загрузить данные. Попробуйте обновить страницу.'); 
            } finally { 
                setIsLoading(false); 
            }
        };
        
        if (shortId) {
            loadPageData();
        }
    }, [shortId]);

    // Realtime здесь не подходит: он подчиняется тем же политикам доступа,
    // а человек до входа в очередь её строку не видит. Поэтому опрашиваем —
    // нужно всего лишь заметить, что запись поставили на паузу.
    useEffect(() => {
        if (!shortId) return;
        const timer = setInterval(async () => {
            try {
                const { data } = await service.getQueueForJoin(shortId);
                if (data?.queue) setQueue(prev => ({ ...prev, ...data.queue }));
            } catch {
                // молча: временная сетевая ошибка не должна ломать страницу
            }
        }, 20000);
        return () => clearInterval(timer);
    }, [shortId]);

    const handleJoinQueue = async () => {
        if (!memberName.trim()) { toast.error('Пожалуйста, введите ваше имя.'); return; }
        if (services.length > 0 && !selectedServiceId) { toast.error('Пожалуйста, выберите услугу.'); return; }
        setIsJoining(true);
        const toastId = toast.loading('Встаем в очередь...');
        try {
            // Вставка идёт через функцию на сервере: она же проставляет
            // user_id из сессии, так что чужой талон не подделать.
            const { data, error } = await service.joinQueue(shortId, memberName.trim(), selectedServiceId);
            if (error) throw error; 
            const session = { memberId: data.id, queueId: queue.id };
            setActiveSession(session);
            toast.success(`Вы успешно встали в очередь!`, { id: toastId });
            navigate(`/wait/${queue.id}/${data.id}`);
        } catch (err) {
            log('JoinPage', 'ОШИБКА в handleJoinQueue:', err.message, 'error');
            if (err.message.includes('Queue is currently paused')) { toast.error("Запись в очередь приостановлена администратором.", { id: toastId });
            } else { toast.error('Не удалось встать в очередь. Попробуйте снова.', { id: toastId }); }
        } finally { setIsJoining(false); }
    };
    
    const handleReturnToWaitPage = () => navigate(`/wait/${currentActiveSession.queueId}/${currentActiveSession.memberId}`);
    const handleJoinAsNew = async () => {
        if (!currentActiveSession) return;
        const toastId = toast.loading('Выходим из предыдущей сессии...');
        const { error: deleteError } = await service.leaveQueue(currentActiveSession.memberId);
        toast.dismiss(toastId);
        if (deleteError) { toast.error('Не удалось выйти из старой сессии.'); return; }
        clearActiveSession();
        setCurrentActiveSession(null);
        toast.success('Теперь вы можете войти как новый участник.');
    };
    
    if (isLoading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    }
    
    if (error) {
        return <div className={`container ${styles.errorText}`}>{error}</div>;
    }
    
    if (currentActiveSession) {
        return (
            <div className={`container ${styles.pageContainer}`}>
                <div className={styles.header}>
                    <p className={styles.subheading}>Вы уже находитесь в очереди:</p>
                    <h1 className={styles.title}>{queue?.name}</h1>
                </div>
                <Card>
                    <div className={styles.formContainer}>
                        <Button onClick={handleReturnToWaitPage}>Вернуться на страницу ожидания</Button>
                        <Button onClick={handleJoinAsNew} className={styles.secondaryButton}>Войти как другой человек</Button>
                    </div>
                </Card>
            </div>
        );
    }

    const canJoin = !isJoining && memberName.trim() && (services.length === 0 || !!selectedServiceId);
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
                        {services.length > 0 && (
                            <div className={styles.serviceSelection}>
                                <h3 className={styles.sectionTitle}>1. Выберите услугу:</h3>
                                <div className={styles.serviceButtons}>
                                    {services.map(service => (
                                        <button 
                                            key={service.id}
                                            className={`${styles.serviceButton} ${selectedServiceId === service.id ? styles.selected : ''}`}
                                            onClick={() => setSelectedServiceId(service.id)}
                                        >
                                            {service.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                           <h3 className={styles.sectionTitle}>{services.length > 0 ? '2. Введите ваше имя:' : 'Введите ваше имя:'}</h3>
                           <Input 
                                placeholder="Ваше имя или псевдоним"
                                value={memberName}
                                onChange={(e) => setMemberName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && canJoin && handleJoinQueue()}
                           />
                        </div>
                        <Button onClick={handleJoinQueue} isLoading={isJoining} disabled={!canJoin}>
                            Встать в очередь
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}

export default JoinPage;