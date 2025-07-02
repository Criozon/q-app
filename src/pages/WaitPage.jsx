import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';
import Card from '../components/Card';
import styles from './WaitPage.module.css';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import { clearActiveSession } from '../utils/session';

const PAGE_SOURCE = 'WaitPage';

function WaitPage() {
    const { queueId, memberId } = useParams();
    const navigate = useNavigate();
    const [myInfo, setMyInfo] = useState(null);
    const [queueInfo, setQueueInfo] = useState(null); 
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [isLeaving, setIsLeaving] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
    const notificationTriggered = useRef(false);
    // --- ИЗМЕНЕНИЕ 1/3: Возвращаем useRef для аудио-плеера ---
    const audioPlayer = useRef(null);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: null, onConfirm: () => {} });
    
    const isSimpleMode = queueInfo?.window_count === 1;

    const waitCardClasses = [
        styles.waitCard,
        myInfo?.status === 'called' ? styles.called : '',
        myInfo?.status === 'acknowledged' ? styles.acknowledged : '',
        myInfo?.status === 'called' ? 'called-animation' : ''
    ].filter(Boolean).join(' ');
    
    const stopNotificationSound = () => {
        if (audioPlayer.current) {
            audioPlayer.current.pause();
            audioPlayer.current.currentTime = 0;
        }
    };

    const handleAcknowledgeCall = async () => {
        stopNotificationSound();
        const toastId = toast.loading('Подтверждаем...');
        try {
            const { error } = await service.updateMemberStatus(myInfo.id, 'acknowledged');
            if (error) throw error;
            toast.success('Администратор уведомлен, что вы идете!', { id: toastId });
        } catch (err) {
            toast.error('Не удалось отправить подтверждение.', { id: toastId });
        }
    };

    const handleDeclineCall = () => {
        stopNotificationSound();
        handleLeaveQueue();
    };
    
    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) {
            toast.error('Ваш браузер не поддерживает уведомления.');
            return;
        }
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
            toast.success('Отлично! Мы сообщим, когда подойдет ваша очередь.');
            new Notification('Уведомления для Q-App включены!', {
                body: 'Теперь вы не пропустите свой вызов.', icon: '/vite.svg'
            });
        } else {
            toast.error('Вы заблокировали уведомления. Вы можете включить их в настройках браузера.');
        }
    };

    const handleLeaveQueue = () => {
        setConfirmation({
            isOpen: true,
            title: 'Выход из очереди',
            message: <p>Вы уверены, что хотите покинуть очередь <strong>"{queueInfo?.name}"</strong>?</p>,
            confirmText: 'Да, выйти',
            isDestructive: true,
            onConfirm: async () => {
                setIsLeaving(true);
                const toastId = toast.loading('Выходим из очереди...');
                try {
                    const { error } = await service.deleteMember(memberId);
                    if (error) throw error;
                    clearActiveSession();
                    toast.success('Вы успешно покинули очередь.', { id: toastId });
                    navigate('/');
                } catch (error) {
                    toast.error('Не удалось выйти из очереди.', { id: toastId });
                } finally {
                    setIsLeaving(false);
                }
            }
        });
    };
    
    const checkMyStatus = async (isInitialLoad = false) => {
        log(PAGE_SOURCE, 'Проверка статуса...');
        try {
            const { data, error } = await service.getMemberById(memberId);
            if (!data && error) { const { data: queueData } = await service.getQueueById(queueId); if (queueData) { clearActiveSession(); throw new Error('Вас удалили из этой очереди.'); } }
            if (error || !data || !data.queues) { clearActiveSession(); throw new Error('Очередь, в которой вы находились, была удалена администратором.'); }
            
            setMyInfo(data);
            setQueueInfo(data.queues);
            const { count } = await service.getWaitingMembersCount(queueId, data.ticket_number);
            setPeopleAhead(count || 0);
            if (status !== 'ok') setStatus('ok');
        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при проверке статуса:', err.message);
            setStatus('error');
            setErrorMessage(err.message);
        }
    };

    // --- ИЗМЕНЕНИЕ 2/3: Добавляем новый useEffect для "разблокировки" звука ---
    useEffect(() => {
        // Создаем аудио-элемент при монтировании
        audioPlayer.current = new Audio('/notification.mp3');
        audioPlayer.current.loop = true;

        const unlockAudio = () => {
            log(PAGE_SOURCE, 'Первое взаимодействие с пользователем, "разблокировка" аудио.');
            audioPlayer.current.play();
            audioPlayer.current.pause();
            // Удаляем обработчики после первого же срабатывания
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
            window.removeEventListener('scroll', unlockAudio);
        };

        // Добавляем обработчики на разные типы первого взаимодействия
        window.addEventListener('click', unlockAudio);
        window.addEventListener('touchstart', unlockAudio);
        window.addEventListener('scroll', unlockAudio);

        // Функция очистки
        return () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
            window.removeEventListener('scroll', unlockAudio);
        };
    }, []);
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    useEffect(() => {
        const handleRealtimeEvent = (payload) => {
            log(PAGE_SOURCE, `Получено Realtime ${payload.eventType} событие для таблицы ${payload.table}`);
            if (payload.table === 'queues' && payload.eventType === 'DELETE') {
                 log(PAGE_SOURCE, 'Очередь была удалена.');
                 clearActiveSession();
                 setStatus('error');
                 setErrorMessage('Эта очередь была удалена администратором.');
                 service.removeSubscription(memberChannel);
                 service.removeSubscription(queueChannel);
                 return;
            }
            checkMyStatus();
        };

        const memberChannel = service.subscribe(`wait-page-members-${queueId}`, { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueId}` }, handleRealtimeEvent);
        const queueChannel = service.subscribe(`wait-page-queue-${queueId}`, { event: 'DELETE', schema: 'public', table: 'queues', filter: `id=eq.${queueId}`}, handleRealtimeEvent);
        
        const handlePageShow = (event) => {
            if (event.persisted) {
                log(PAGE_SOURCE, 'Страница восстановлена из кеша, принудительно обновляем данные.');
                checkMyStatus(true);
            }
            setNotificationPermission(Notification.permission);
        };
        
        const handleVisibilityChange = () => {
             if (document.visibilityState === 'visible') setNotificationPermission(Notification.permission);
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        checkMyStatus(true);

        return () => {
            service.removeSubscription(memberChannel);
            service.removeSubscription(queueChannel);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberId, queueId]);

    useEffect(() => {
        if (myInfo) {
            if (myInfo.status === 'called' && !notificationTriggered.current) {
                notificationTriggered.current = true;
                document.title = "ВАША ОЧЕРЕДЬ!";
                
                // --- ИЗМЕНЕНИЕ 3/3: Используем уже "разблокированный" плеер ---
                if (audioPlayer.current) {
                    audioPlayer.current.play().catch(e => log(PAGE_SOURCE, 'Ошибка воспроизведения аудио', e));
                }
                
                if (notificationPermission === 'granted') {
                    const windowText = !isSimpleMode && myInfo.windows?.name ? ` в ${myInfo.windows.name}` : '';
                    new Notification('Ваша очередь подошла!', {
                        body: `Вас вызывают${windowText}. Ваш код: ${myInfo.display_code}`,
                        icon: '/vite.svg',
                        tag: `queue-notification-${queueId}`,
                        renotify: true
                    });
                }
            }

            if (myInfo.status !== 'called') {
                stopNotificationSound();
            }

            if (myInfo.status === 'waiting' && notificationTriggered.current) {
                notificationTriggered.current = false;
                document.title = `Q-App - Ожидание в ${queueInfo?.name || ''}`;
            }
            
            if (myInfo.status === 'serviced') {
                log(PAGE_SOURCE, 'Сессия завершена (serviced), очищаем localStorage.');
                clearActiveSession();
            }
        }
    }, [myInfo, notificationPermission, queueInfo, queueId, isSimpleMode]);
    
    if (status === 'loading') return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    
    if (status === 'error') return (
        <div className={`container ${styles.pageContainer}`}>
            <div className={styles.errorContainer}>
                {errorMessage}
            </div>
        </div>
    );
    
    return (
        <div className={`container ${styles.pageContainer}`}>
             <div className={waitCardClasses}>
                <h2>Очередь: {queueInfo?.name}</h2>
                <hr className={styles.divider}/>
                <p className={styles.greeting}>Здравствуйте, <strong>{myInfo?.member_name}</strong>!</p>

                {myInfo?.services?.name && (
                    <p className={styles.serviceName}>Услуга: <strong>{myInfo.services.name}</strong></p>
                )}

                <h1 className={styles.displayCodeLabel}>Ваш код: <span className={styles.displayCode}>{myInfo?.display_code}</span></h1>
                
                {myInfo?.status === 'waiting' && (<><p className={styles.peopleAhead}>Перед вами: <strong>{peopleAhead}</strong> чел.</p><p className={styles.autoUpdateText}>Эта страница будет обновляться автоматически.</p></>)}
                
                {myInfo?.status === 'called' && (
                    <div className={`${styles.statusBox} ${styles.statusCalled}`}>
                        {isSimpleMode ? (
                            <h2>Вас вызывают!</h2>
                        ) : (
                            <h2>Вас вызывают в <span className={styles.windowName}>{myInfo.windows?.name || '...'}</span>!</h2>
                        )}
                        <div className={styles.actionButtons}>
                            <Button onClick={handleDeclineCall} className={styles.declineButton}>
                                <X size={20} /> Отказаться
                            </Button>
                            <Button onClick={handleAcknowledgeCall} className={styles.acknowledgeButton}>
                                <Check size={20} /> Я иду!
                            </Button>
                        </div>
                    </div>
                )}
                
                {myInfo?.status === 'acknowledged' && (
                    <div className={`${styles.statusBox} ${styles.statusAcknowledged}`}>
                         {isSimpleMode ? (
                            <h2>Администратор ожидает вас</h2>
                         ) : (
                            <h2>Администратор ожидает вас в <span className={styles.windowName}>{myInfo.windows?.name || '...'}</span></h2>
                         )}
                    </div>
                )}

                {myInfo?.status === 'serviced' && (<div className={`${styles.statusBox} ${styles.statusServiced}`}><h2>Ваше обслуживание завершено.</h2></div>)}
                
                {(myInfo?.status === 'waiting' || myInfo?.status === 'acknowledged') && (
                    <Button onClick={handleLeaveQueue} isLoading={isLeaving} className={styles.leaveButton}>
                        Выйти из очереди
                    </Button>
                )}
            </div>
            
            {notificationPermission === 'default' && myInfo?.status === 'waiting' && (
                <Card className={styles.notificationPrompt}>
                    <div className={styles.promptIcon}><Bell size={24} /></div>
                    <div className={styles.promptText}>
                        <h4>Не пропустите свою очередь!</h4>
                        <p>Разрешите нам присылать уведомления, и мы сообщим, когда вас вызовут.</p>
                    </div>
                    <Button onClick={requestNotificationPermission} className={styles.promptButton}>Включить</Button>
                </Card>
            )}

            {notificationPermission === 'denied' && myInfo?.status === 'waiting' && (
                 <Card className={`${styles.notificationPrompt} ${styles.notificationPromptDenied}`}>
                     <div className={styles.promptIcon}><BellOff size={24} /></div>
                     <div className={styles.promptText}>
                        <h4>Уведомления выключены</h4>
                        <p>Вы заблокировали уведомления. Чтобы включить их, измените настройки сайта.</p>
                    </div>
                </Card>
            )}
            
            <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation({ ...confirmation, isOpen: false })} onConfirm={confirmation.onConfirm} title={confirmation.title} confirmText={confirmation.confirmText} isDestructive={confirmation.isDestructive}>
                {confirmation.message}
            </ConfirmationModal>
        </div>
    );
}

export default WaitPage;