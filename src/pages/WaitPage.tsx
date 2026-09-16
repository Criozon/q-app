import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check, X, Clock, Megaphone, PauseCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';
import Card from '../components/Card';
import styles from './WaitPage.module.css';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import { clearActiveSession } from '../utils/session';
import { useWakeLock } from '../hooks/useWakeLock';
import type { ConfirmationState, MyQueueStatus } from '../types/domain';
import type { RealtimePayload } from '../services/supabaseService';
import { errorMessage as toErrorMessage, errorIncludes } from '../utils/errors';

const PAGE_SOURCE = 'WaitPage';

// В Safari на iOS объекта Notification нет вообще — он появляется только
// в PWA, установленном на домашний экран. Прямое обращение Notification.permission
// на обычной вкладке iPhone роняет рендер с ReferenceError, поэтому только так.
const isNotificationSupported = () => typeof Notification !== 'undefined';
const getNotificationPermission = () => (isNotificationSupported() ? Notification.permission : 'unsupported');

function WaitPage() {
    const { queueId, memberId } = useParams<{ queueId: string; memberId: string }>();
    const navigate = useNavigate();
    const [myInfo, setMyInfo] = useState<MyQueueStatus['member'] | null>(null);
    const [queueInfo, setQueueInfo] = useState<MyQueueStatus['queue'] | null>(null); 
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
    const [announcements, setAnnouncements] = useState<MyQueueStatus['announcements']>([]);
    const [isDeferring, setIsDeferring] = useState(false);
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [isLeaving, setIsLeaving] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);
    const notificationTriggered = useRef(false);
    // --- ИЗМЕНЕНИЕ 1/3: Возвращаем useRef для аудио-плеера ---
    const audioPlayer = useRef<HTMLAudioElement | null>(null);
    const [confirmation, setConfirmation] = useState<ConfirmationState>({ isOpen: false });
    
    const isSimpleMode = queueInfo?.window_count === 1;

    // Пока участник ждёт или его вызывают — не даём экрану гаснуть.
    // Это единственный способ не потерять вызов на iPhone: Web Push в обычной
    // вкладке Safari недоступен, а с погасшим экраном страница выгружается.
    const isAwaitingCall = myInfo?.status === 'waiting' || myInfo?.status === 'called';
    const { isActive: isScreenHeldAwake } = useWakeLock(isAwaitingCall);

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
            const { error } = await service.acknowledgeCall(myInfo!.id);
            if (error) throw error;
            toast.success('Администратор уведомлен, что вы идете!', { id: toastId });
        } catch {
            toast.error('Не удалось отправить подтверждение.', { id: toastId });
        }
    };

    const handleDeclineCall = () => {
        stopNotificationSound();
        handleLeaveQueue();
    };
    
    const requestNotificationPermission = async () => {
        if (!isNotificationSupported()) {
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
                    const { error } = await service.leaveQueue(memberId!);
                    if (error) throw error;
                    clearActiveSession();
                    toast.success('Вы успешно покинули очередь.', { id: toastId });
                    navigate('/');
                } catch {
                    toast.error('Не удалось выйти из очереди.', { id: toastId });
                } finally {
                    setIsLeaving(false);
                }
            }
        });
    };
    
    // Статус, количество впереди, прогноз и объявления приходят одним
    // вызовом: считать «перед вами N» на клиенте больше нельзя — участник
    // по политикам доступа видит только собственную строку.
    const checkMyStatus = async () => {
        log(PAGE_SOURCE, 'Проверка статуса...');
        try {
            const { data, error } = await service.getMyQueueStatus(memberId!);
            if (error) throw error;

            if (data?.error === 'member_not_found') {
                clearActiveSession();
                throw new Error('Вас удалили из этой очереди.');
            }
            if (data?.error === 'queue_deleted' || !data?.member) {
                clearActiveSession();
                throw new Error('Очередь, в которой вы находились, была удалена администратором.');
            }

            setMyInfo(data.member);
            setQueueInfo(data.queue);
            setPeopleAhead(data.people_ahead ?? 0);
            setEstimatedMinutes(data.estimated_minutes ?? null);
            setAnnouncements(data.announcements ?? []);
            if (status !== 'ok') setStatus('ok');
        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при проверке статуса', err);
            setStatus('error');
            setErrorMessage(toErrorMessage(err));
        }
    };

    // «Отложить вызов»: человек отходит, пропускает вперёд ближайших
    // и не теряет очередь совсем. Второй участник для этого не нужен —
    // договариваться не с кем и местами не торгуют.
    const handleDeferCall = async () => {
        setIsDeferring(true);
        const toastId = toast.loading('Откладываем вызов...');
        try {
            const { error } = await service.deferMyCall(memberId!, 3);
            if (error) throw error;
            stopNotificationSound();
            notificationTriggered.current = false;
            await checkMyStatus();
            toast.success('Вас пропустят вперёд. Мы позовём позже.', { id: toastId });
        } catch (err) {
            const limit = errorIncludes(err, 'Defer limit');
            toast.error(limit ? 'Откладывать больше нельзя.' : 'Не удалось отложить вызов.', { id: toastId });
        } finally {
            setIsDeferring(false);
        }
    };

    // --- ИЗМЕНЕНИЕ 2/3: Добавляем новый useEffect для "разблокировки" звука ---
    useEffect(() => {
        // Создаем аудио-элемент при монтировании
        audioPlayer.current = new Audio('/notification.mp3');
        audioPlayer.current.loop = true;

        const unlockAudio = () => {
            log(PAGE_SOURCE, 'Первое взаимодействие с пользователем, "разблокировка" аудио.');
            void audioPlayer.current?.play();
            audioPlayer.current?.pause();
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
        const handleRealtimeEvent = (payload: RealtimePayload) => {
            log(PAGE_SOURCE, `Получено Realtime ${payload.eventType} событие для таблицы ${payload.table}`);
            if (payload.table === 'queues' && payload.eventType === 'DELETE') {
                 log(PAGE_SOURCE, 'Очередь была удалена.');
                 clearActiveSession();
                 setStatus('error');
                 setErrorMessage('Эта очередь была удалена администратором.');
                 service.removeSubscription(memberChannel);
                 service.removeSubscription(queueChannel);
                 service.removeSubscription(announcementChannel);
                 return;
            }
            void checkMyStatus();
        };

        // Подписка сузилась до собственной строки: чужие события до участника
        // теперь не доходят — Realtime подчиняется тем же политикам доступа.
        // Поэтому «перед вами N» обновляем опросом: сам факт, что кого-то
        // обслужили впереди, приходит только так.
        const memberChannel = service.subscribe(`wait-page-me-${memberId}`, { event: '*', schema: 'public', table: 'queue_members', filter: `id=eq.${memberId}` }, handleRealtimeEvent);
        const queueChannel = service.subscribe(`wait-page-queue-${queueId}`, { event: 'DELETE', schema: 'public', table: 'queues', filter: `id=eq.${queueId}`}, handleRealtimeEvent);
        const announcementChannel = service.subscribe(`wait-page-announcements-${queueId}`, { event: '*', schema: 'public', table: 'queue_announcements', filter: `queue_id=eq.${queueId}` }, handleRealtimeEvent);
        const pollTimer = setInterval(() => { void checkMyStatus(); }, 15000);
        
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                log(PAGE_SOURCE, 'Страница восстановлена из кеша, принудительно обновляем данные.');
                void checkMyStatus();
            }
            setNotificationPermission(getNotificationPermission());
        };
        
        const handleVisibilityChange = () => {
             if (document.visibilityState === 'visible') setNotificationPermission(getNotificationPermission());
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        void checkMyStatus();

        return () => {
            clearInterval(pollTimer);
            service.removeSubscription(memberChannel);
            service.removeSubscription(queueChannel);
            service.removeSubscription(announcementChannel);
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
                    const windowText = !isSimpleMode && myInfo.window_name ? ` в ${myInfo.window_name}` : '';
                    // renotify нестандартный и в типах не описан, но нужен:
                    // без него повторное уведомление с тем же tag не звучит.
                    new Notification('Ваша очередь подошла!', {
                        body: `Вас вызывают${windowText}. Ваш код: ${myInfo.display_code}`,
                        icon: '/vite.svg',
                        tag: `queue-notification-${queueId}`,
                        renotify: true,
                    } as NotificationOptions & { renotify: boolean });
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

                {myInfo?.service_name && (
                    <p className={styles.serviceName}>Услуга: <strong>{myInfo.service_name}</strong></p>
                )}

                <h1 className={styles.displayCodeLabel}>Ваш код: <span className={styles.displayCode}>{myInfo?.display_code}</span></h1>
                
                {myInfo?.status === 'waiting' && (
                    <>
                        {/* Человеку важно, успеет ли он выпить кофе, а не то,
                            что перед ним семеро. Поэтому на первом месте время. */}
                        <div className={styles.estimateBox}>
                            <Clock size={20} />
                            <span className={styles.estimateValue}>
                                {peopleAhead === 0 ? 'Вы следующий' : `≈ ${estimatedMinutes} мин`}
                            </span>
                        </div>
                        <p className={styles.peopleAhead}>
                            {peopleAhead === 0 ? 'Ожидайте вызова' : <>Перед вами: <strong>{peopleAhead}</strong> чел.</>}
                        </p>
                        <p className={styles.autoUpdateText}>
                            Эта страница будет обновляться автоматически.
                            {isScreenHeldAwake && ' Экран не будет гаснуть, чтобы вы не пропустили вызов.'}
                        </p>
                        {myInfo.defer_count < 3 && peopleAhead >= 0 && (
                            <Button onClick={handleDeferCall} isLoading={isDeferring} className={styles.deferButton}>
                                <PauseCircle size={18} /> Мне нужно отойти
                            </Button>
                        )}
                    </>
                )}
                
                {myInfo?.status === 'called' && (
                    <div className={`${styles.statusBox} ${styles.statusCalled}`}>
                        {isSimpleMode ? (
                            <h2>Вас вызывают!</h2>
                        ) : (
                            <h2>Вас вызывают в <span className={styles.windowName}>{myInfo.window_name || '...'}</span>!</h2>
                        )}
                        <div className={styles.actionButtons}>
                            <Button onClick={handleDeclineCall} className={styles.declineButton}>
                                <X size={20} /> Отказаться
                            </Button>
                            <Button onClick={handleAcknowledgeCall} className={styles.acknowledgeButton}>
                                <Check size={20} /> Я иду!
                            </Button>
                        </div>
                        {myInfo.defer_count < 3 && (
                            <Button onClick={handleDeferCall} isLoading={isDeferring} className={styles.deferButton}>
                                <PauseCircle size={18} /> Не успеваю, пропустите вперёд
                            </Button>
                        )}
                    </div>
                )}
                
                {myInfo?.status === 'acknowledged' && (
                    <div className={`${styles.statusBox} ${styles.statusAcknowledged}`}>
                         {isSimpleMode ? (
                            <h2>Администратор ожидает вас</h2>
                         ) : (
                            <h2>Администратор ожидает вас в <span className={styles.windowName}>{myInfo.window_name || '...'}</span></h2>
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
            
            {announcements.length > 0 && (
                <Card className={styles.announcements}>
                    <div className={styles.announcementsHeader}>
                        <Megaphone size={18} />
                        <span>Сообщения организатора</span>
                    </div>
                    {announcements.map(a => (
                        <div key={a.id} className={styles.announcement}>
                            <p>{a.body}</p>
                            <time>{new Date(a.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                    ))}
                </Card>
            )}

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