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

    log(`--- JoinPage РЕНДЕР --- shortId из URL: ${shortId}`);

    useEffect(() => {
        log(`--- JoinPage ЭФФЕКТ --- Запускается для shortId: ${shortId}`);
        
        if (!shortId) {
            log('ЭФФЕКТ: shortId пустой, выходим.');
            return;
        }

        const loadPageData = async () => {
            log('1. loadPageData: Начало загрузки.');
            setIsLoading(true);
            setError('');
            try {
                log('2. loadPageData: Внутри try, ищем очередь...');
                const { data: queueData, error: queueError } = await service.getQueueByShortId(shortId);
                log('3. loadPageData: Ответ от getQueueByShortId', { queueData, queueError });

                if (queueError || !queueData) {
                    throw new Error('Очередь не найдена или была удалена.');
                }
                
                log('4. loadPageData: Очередь найдена, получаем детали...');
                const { data: pageData, error: pageError } = await service.getQueueDetailsForJoining(queueData.id);
                log('5. loadPageData: Ответ от getQueueDetailsForJoining', { pageData, pageError });
                
                if (pageError || !pageData || !pageData.queue) {
                    throw new Error('Не удалось загрузить детали очереди.');
                }
                
                log('6. loadPageData: Устанавливаем состояние queue и services.');
                setQueue(pageData.queue);
                setServices(pageData.services || []);

                log('7. loadPageData: Проверяем активную сессию в localStorage.');
                const session = getActiveSession();
                if (session) {
                    log('8. loadPageData: Сессия найдена, проверяем валидность участника...');
                    const { data: memberData } = await service.getMemberById(session.memberId);
                    if (memberData && ['waiting', 'called', 'acknowledged'].includes(memberData.status)) {
                        if (session.queueId === queueData.id) {
                            log('9. loadPageData: Валидная сессия для текущей очереди, показываем окно.');
                            setCurrentActiveSession(session);
                        }
                    } else {
                        log('9. loadPageData: Сессия невалидна, очищаем.');
                        clearActiveSession();
                    }
                }
            } catch (err) { 
                log('!!! КРИТИЧЕСКАЯ ОШИБКА в loadPageData:', err);
                setError(err.message); 
            } finally { 
                log('10. loadPageData: Блок finally, выключаем загрузку.');
                setIsLoading(false); 
            }
        };
        
        loadPageData();
    }, [shortId]);

    useEffect(() => {
        if (!queue) return;
        log(`--- JoinPage ЭФФЕКТ (Realtime) --- Подписка на очередь ID: ${queue.id}`);
        const channel = service.subscribe(`join-page-queue-status-${queue.id}`, {
            event: 'UPDATE', schema: 'public', table: 'queues', filter: `id=eq.${queue.id}`
        }, (payload) => {
            log('Realtime: Получен новый статус очереди', payload.new.status);
            setQueue(prevQueue => ({ ...prevQueue, ...payload.new }));
        });
        return () => {
            log(`--- JoinPage ЭФФЕКТ (Realtime) --- Отписка от очереди ID: ${queue.id}`);
            service.removeSubscription(channel);
        };
    }, [queue]);

    const handleJoinQueue = async () => {
        // ... (остальной код без изменений)
        if (!memberName.trim()) { toast.error('Пожалуйста, введите ваше имя.'); return; }
        if (services.length > 0 && !selectedServiceId) { toast.error('Пожалуйста, выберите услугу.'); return; }
        setIsJoining(true);
        const toastId = toast.loading('Встаем в очередь...');
        try {
            const chars = 'ACEHKMOPTX'; 
            const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
            const randomNumber = Math.floor(10 + Math.random() * 90);
            const displayCode = `${randomChar}${randomNumber}`;
            const memberData = { queue_id: queue.id, member_name: memberName.trim(), display_code: displayCode, service_id: selectedServiceId };
            const { data, error } = await service.createMember(memberData);
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
        const { error: deleteError } = await service.deleteMember(currentActiveSession.memberId);
        toast.dismiss(toastId);
        if (deleteError) { toast.error('Не удалось выйти из старой сессии.'); return; }
        clearActiveSession();
        setCurrentActiveSession(null);
        toast.success('Теперь вы можете войти как новый участник.');
    };
    
    log('--- Состояние перед рендером ---', { isLoading, error, currentActiveSession, hasQueue: !!queue });

    if (isLoading) {
        log('Рендерим: <Spinner />');
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    }
    
    if (error) {
        log(`Рендерим: Ошибка - "${error}"`);
        return <div className={`container ${styles.errorText}`}>{error}</div>;
    }
    
    if (currentActiveSession) {
        log('Рендерим: Компонент для активной сессии');
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

    log('Рендерим: Основная форма регистрации');
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