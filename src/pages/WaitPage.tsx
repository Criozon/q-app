import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check, X, Clock, Megaphone, PauseCircle, WifiOff } from 'lucide-react';
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
import { useTicker } from '../hooks/useTicker';
import { useWakeRefresh } from '../hooks/useWakeRefresh';
import { syncClock, msUntil, formatClock, formatDuration } from '../utils/clock';
// В Safari на iOS объекта Notification нет вообще — он появляется только
// в PWA, установленном на домашний экран. Прямое обращение
// Notification.permission на обычной вкладке iPhone роняет рендер,
// поэтому доступ к нему только через эти обёртки.
import {
    isNotificationSupported, getNotificationPermission,
    showNotification, registerServiceWorker,
} from '../utils/notifications';
import type { ConfirmationState, MyQueueStatus } from '../types/domain';
import type { RealtimePayload } from '../services/supabaseService';
import { errorMessage as toErrorMessage, errorIncludes } from '../utils/errors';

const PAGE_SOURCE = 'WaitPage';

/** За сколько до конца выданного времени предупреждать. */
const WARN_BEFORE_END_MS = 5 * 60 * 1000;


function WaitPage() {
    const { queueId, memberId } = useParams<{ queueId: string; memberId: string }>();
    const navigate = useNavigate();
    const [myInfo, setMyInfo] = useState<MyQueueStatus['member'] | null>(null);
    const [queueInfo, setQueueInfo] = useState<MyQueueStatus['queue'] | null>(null); 
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
    const [announcements, setAnnouncements] = useState<MyQueueStatus['announcements']>([]);
    const [isDeferring, setIsDeferring] = useState(false);
    const [connectionLost, setConnectionLost] = useState(false);
    /**
     * Успели ли хоть раз загрузить данные. Именно ref, а не состояние:
     * таймер опроса захватывает checkMyStatus из первого рендера, и любое
     * состояние внутри него навсегда останется тем, каким было на старте.
     * На этом уже обожглись — при ошибке таймер видел status === 'loading'
     * и стирал талон с экрана.
     */
    const hasLoadedOnce = useRef(false);
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

    // Идущий сеанс экран не держит намеренно: человек ушёл на сорок минут,
    // и всё это время гореть экраном — просто посадить батарею.
    useTicker(1000);

    const waitCardClasses = [
        styles.waitCard,
        myInfo?.status === 'called' ? styles.called : '',
        myInfo?.status === 'acknowledged' ? styles.acknowledged : '',
        myInfo?.status === 'called' ? 'called-animation' : ''
    ].filter(Boolean).join(' ');
    
    const soundStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopNotificationSound = () => {
        if (soundStopTimer.current) {
            clearTimeout(soundStopTimer.current);
            soundStopTimer.current = null;
        }
        if (audioPlayer.current) {
            audioPlayer.current.pause();
            audioPlayer.current.currentTime = 0;
        }
    };

    // Кнопка держит собственное состояние: со сна запрос уходит по
    // просыпающейся сети и может думать несколько секунд. Без этого
    // нажатие выглядело как непринятое — и человек жал ещё раз.
    const [isAcknowledging, setIsAcknowledging] = useState(false);

    const handleAcknowledgeCall = async () => {
        if (isAcknowledging) return;
        setIsAcknowledging(true);
        stopNotificationSound();
        const toastId = toast.loading('Подтверждаем...');
        try {
            const { error } = await service.acknowledgeCall(myInfo!.id);
            if (error) throw error;
            toast.success('Администратор уведомлен, что вы идете!', { id: toastId });
        } catch (err) {
            log(PAGE_SOURCE, 'Не удалось отправить подтверждение.', err);
            toast.error(`Не удалось отправить подтверждение. ${toErrorMessage(err, '')}`.trim(), { id: toastId });
        } finally {
            setIsAcknowledging(false);
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
            await registerServiceWorker();
            void showNotification('Уведомления для Q-App включены!', {
                body: 'Теперь вы не пропустите свой вызов.',
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
                } catch (err) {
                    log(PAGE_SOURCE, 'Не удалось выйти из очереди.', err);
                    toast.error(`Не удалось выйти из очереди. ${toErrorMessage(err, '')}`.trim(), { id: toastId });
                } finally {
                    setIsLeaving(false);
                }
            }
        });
    };
    
    // Статус, количество впереди, прогноз и объявления приходят одним
    // вызовом: считать «перед вами N» на клиенте больше нельзя — участник
    // по политикам доступа видит только собственную строку.
    /**
     * Обновление статуса.
     *
     * Важно различать два рода неудач. Ответ «вас удалили» или «очередь
     * удалена» — окончательный, показываем сообщение вместо талона.
     * А вот обрыв сети окончательным не является: приложением пользуются
     * с мобильного интернета в помещении, где связь скачет, и стирать
     * талон с экрана из-за одного неудачного запроса нельзя. В этом
     * случае оставляем последние известные данные и ждём следующей
     * попытки, показав ненавязчивую плашку.
     */
    const checkMyStatus = async () => {
        log(PAGE_SOURCE, 'Проверка статуса...');
        try {
            const { data } = await service.getMyQueueStatus(memberId!);

            if (data?.error === 'member_not_found') {
                clearActiveSession();
                setStatus('error');
                setErrorMessage('Вас удалили из этой очереди.');
                return;
            }
            if (data?.error === 'queue_deleted' || !data?.member) {
                clearActiveSession();
                setStatus('error');
                setErrorMessage('Очередь, в которой вы находились, была удалена администратором.');
                return;
            }

            // Поправка часов раньше данных: по ней считается остаток
            // времени, а он должен быть верным с первой же отрисовки.
            syncClock(data.server_now);

            setMyInfo(data.member);
            setQueueInfo(data.queue);
            setPeopleAhead(data.people_ahead ?? 0);
            setEstimatedMinutes(data.estimated_minutes ?? null);
            setAnnouncements(data.announcements ?? []);
            setConnectionLost(false);
            hasLoadedOnce.current = true;
            setStatus('ok');
        } catch (err) {
            log(PAGE_SOURCE, 'Не удалось обновить статус, попробуем ещё раз', err);
            setConnectionLost(true);
            // Показывать нечего только если данные не успели загрузиться ни разу.
            if (!hasLoadedOnce.current) {
                setStatus('error');
                setErrorMessage(toErrorMessage(err, 'Не удалось связаться с сервером. Проверьте соединение.'));
            }
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
    // Разрешение могло быть выдано в прошлый раз — воркер нужен и тогда.
    useEffect(() => {
        if (getNotificationPermission() === 'granted') void registerServiceWorker();
    }, []);

    useEffect(() => {
        // Создаем аудио-элемент при монтировании
        audioPlayer.current = new Audio('/notification.mp3');
        audioPlayer.current.loop = true;

        const unlockAudio = () => {
            log(PAGE_SOURCE, 'Первое взаимодействие с пользователем, "разблокировка" аудио.');
            // play() отклоняется, если браузер ещё не считает жест достаточным —
            // это штатно и не должно всплывать необработанным отказом.
            audioPlayer.current?.play().then(
                () => audioPlayer.current?.pause(),
                () => { /* звук разблокируем при следующем касании */ },
            );
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

    // Проверка статуса живёт в ref: её зовут и подписки, и пробуждение,
    // а зависеть от неё эффекту нельзя — она пересоздаётся каждый рендер.
    const checkMyStatusRef = useRef(checkMyStatus);
    useEffect(() => { checkMyStatusRef.current = checkMyStatus; });

    // Вернулись к человеку — переспрашиваем сервер, не дожидаясь опроса.
    const wakeGeneration = useWakeRefresh(useCallback(() => {
        setNotificationPermission(getNotificationPermission());
        void checkMyStatusRef.current();
    }, []));

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
        
        window.addEventListener('pageshow', handlePageShow);
        
        void checkMyStatus();

        return () => {
            clearInterval(pollTimer);
            service.removeSubscription(memberChannel);
            service.removeSubscription(queueChannel);
            service.removeSubscription(announcementChannel);
            window.removeEventListener('pageshow', handlePageShow);
        };
    // wakeGeneration: после сна каналы пересобираются — эффект снимает
    // старые и заводит новые.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberId, queueId, wakeGeneration]);

    /**
     * Предупреждения по выданному времени: за пять минут до конца и в сам
     * момент окончания.
     *
     * Честная граница: сработает, только пока страница жива. Запланировать
     * уведомление на будущий момент веб не умеет — API, который это делал
     * (Notification Triggers), дальше эксперимента в Chrome не ушёл, а
     * обычный таймер замораживается, когда вкладка уходит в фон. Зато сам
     * отсчёт на экране идёт и без связи: момент окончания известен заранее.
     *
     * Эффект перезапускается при продлении — timer_ends_at в зависимостях,
     * поэтому новое время даёт новые предупреждения.
     */
    useEffect(() => {
        if (myInfo?.status !== 'in_service' || !myInfo.timer_ends_at) return;

        const endsAt = myInfo.timer_ends_at;
        let warnedSoon = false;
        let warnedOver = false;

        const buzz = () => {
            // Вибрация — необязательная роскошь: на iOS её нет, а на части
            // Android она умеет бросаться исключением.
            try { navigator.vibrate?.([200, 100, 200]); }
            catch (err) { log(PAGE_SOURCE, 'Вибрация недоступна', err); }
        };

        const check = () => {
            const left = msUntil(endsAt);
            if (left === null) return;

            if (!warnedSoon && left > 0 && left <= WARN_BEFORE_END_MS) {
                warnedSoon = true;
                buzz();
                if (notificationPermission === 'granted') {
                    void showNotification('Время подходит к концу', {
                        body: `Осталось ${formatDuration(left)}.`,
                        tag: `queue-timer-${memberId}`,
                        url: window.location.pathname,
                    });
                }
            }

            if (!warnedOver && left <= 0) {
                warnedOver = true;
                buzz();
                if (notificationPermission === 'granted') {
                    void showNotification('Время вышло', {
                        body: 'Пора возвращаться.',
                        tag: `queue-timer-${memberId}`,
                        url: window.location.pathname,
                    });
                }
            }
        };

        check();
        const id = setInterval(check, 1000);
        return () => clearInterval(id);
    }, [myInfo?.status, myInfo?.timer_ends_at, notificationPermission, memberId]);

    useEffect(() => {
        if (myInfo) {
            if (myInfo.status === 'called' && !notificationTriggered.current) {
                notificationTriggered.current = true;
                document.title = "ВАША ОЧЕРЕДЬ!";
                
                // --- ИЗМЕНЕНИЕ 3/3: Используем уже "разблокированный" плеер ---
                if (audioPlayer.current) {
                    audioPlayer.current.play().catch(e => log(PAGE_SOURCE, 'Ошибка воспроизведения аудио', e));
                    // Звук зациклен, чтобы вызов не пропустили. Но если
                    // вкладку просто забыли открытой, он будет звенеть
                    // бесконечно — например, на компьютере организатора,
                    // где когда-то входили в очередь. Минуты достаточно:
                    // карточка вызова при этом остаётся на экране.
                    soundStopTimer.current = setTimeout(stopNotificationSound, 60_000);
                }
                
                if (notificationPermission === 'granted') {
                    const windowText = !isSimpleMode && myInfo.window_name ? ` в ${myInfo.window_name}` : '';
                    // Никаких прямых `new Notification` здесь: на Android
                    // это исключение, а исключение внутри useEffect сносит
                    // всё дерево и оставляет человека с белым экраном.
                    void showNotification('Ваша очередь подошла!', {
                        body: `Вас вызывают${windowText}. Ваш код: ${myInfo.display_code}`,
                        tag: `queue-notification-${queueId}`,
                        url: window.location.pathname,
                    });
                }
            }

            if (myInfo.status !== 'called') {
                stopNotificationSound();
            }

            // Кричащий заголовок гасим, как только вызов отработал — в любую
            // сторону. Раньше сбрасывали только на 'waiting', и принятый под
            // таймер человек сорок минут катался на лодке со вкладкой
            // «ВАША ОЧЕРЕДЬ!».
            if (myInfo.status !== 'called' && myInfo.status !== 'acknowledged'
                && notificationTriggered.current) {
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
                            <Button onClick={handleAcknowledgeCall} isLoading={isAcknowledging} className={styles.acknowledgeButton}>
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

                {/* Идёт выданное время: прокат, солярий, картинг. Отсчёт
                    считается от момента окончания, известного заранее, —
                    поэтому он идёт и когда связи нет. */}
                {myInfo?.status === 'in_service' && (() => {
                    const left = msUntil(myInfo.timer_ends_at);
                    const isOver = left !== null && left <= 0;
                    return (
                        <div className={`${styles.statusBox} ${isOver ? styles.statusTimeOver : styles.statusInService}`}>
                            {myInfo.note && <p className={styles.sessionNote}>{myInfo.note}</p>}
                            {left === null ? (
                                <h2>Идёт обслуживание</h2>
                            ) : isOver ? (
                                <>
                                    <h2>Время вышло</h2>
                                    <p className={styles.sessionSub}>{formatDuration(left)} назад</p>
                                </>
                            ) : (
                                <>
                                    <div className={styles.bigTimer}>{formatClock(left)}</div>
                                    <p className={styles.sessionSub}>осталось</p>
                                </>
                            )}
                        </div>
                    );
                })()}

                {myInfo?.status === 'serviced' && (<div className={`${styles.statusBox} ${styles.statusServiced}`}><h2>Ваше обслуживание завершено.</h2></div>)}
                
                {(myInfo?.status === 'waiting' || myInfo?.status === 'acknowledged') && (
                    <Button onClick={handleLeaveQueue} isLoading={isLeaving} className={styles.leaveButton}>
                        Выйти из очереди
                    </Button>
                )}
            </div>
            
            {connectionLost && (
                <div className={styles.connectionLost}>
                    <WifiOff size={16} />
                    <span>Нет связи с сервером. Данные могли устареть — пробуем восстановить.</span>
                </div>
            )}

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

            {/* Уведомлений в браузере нет вовсе — на практике это Safari на iPhone
                вне установленного на домашний экран приложения. Молчать здесь
                нельзя: человек должен понимать, на чём держится его вызов. */}
            {notificationPermission === 'unsupported' && myInfo?.status === 'waiting' && (
                <Card className={styles.notificationPrompt}>
                    <div className={styles.promptIcon}><BellOff size={24} /></div>
                    <div className={styles.promptText}>
                        <h4>Держите эту страницу открытой</h4>
                        <p>
                            Ваш браузер не умеет показывать уведомления. Мы не дадим экрану
                            погаснуть и покажем вызов прямо здесь. На iPhone уведомления
                            работают, только если добавить приложение на экран «Домой».
                        </p>
                    </div>
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