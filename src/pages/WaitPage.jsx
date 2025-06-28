import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

import Button from '../components/Button';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal'; // <-- 1. ИМПОРТ
import styles from './WaitPage.module.css';
import log from '../utils/logger';

const PAGE_SOURCE = 'WaitPage';

function WaitPage() {
    const { queueId, memberId } = useParams();
    const navigate = useNavigate();
    const [myInfo, setMyInfo] = useState(null);
    const [queueName, setQueueName] = useState('');
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [isLeaving, setIsLeaving] = useState(false);

    const notificationTriggered = useRef(false);
    const audioPlayer = useRef(null);
    
    // 2. СОСТОЯНИЕ ДЛЯ МОДАЛЬНОГО ОКНА
    const [confirmation, setConfirmation] = useState({
        isOpen: false,
        title: '',
        message: null,
        onConfirm: () => {},
    });

    // 3. ОБНОВЛЕННАЯ ФУНКЦИЯ ВЫХОДА
    const handleLeaveQueue = () => {
        setConfirmation({
            isOpen: true,
            title: 'Выход из очереди',
            message: <p>Вы уверены, что хотите покинуть очередь <strong>"{queueName}"</strong>?</p>,
            confirmText: 'Да, выйти',
            onConfirm: async () => {
                setIsLeaving(true);
                const toastId = toast.loading('Выходим из очереди...');

                try {
                    const { error } = await supabase
                        .from('queue_members')
                        .delete()
                        .eq('id', memberId);

                    if (error) throw error;

                    localStorage.removeItem('my-queue-session');
                    toast.success('Вы успешно покинули очередь.', { id: toastId });
                    navigate('/');

                } catch (error) {
                    toast.error('Не удалось выйти из очереди.', { id: toastId });
                    setIsLeaving(false);
                }
            }
        });
    };
    
    const checkMyStatus = async () => {
        log(PAGE_SOURCE, 'Проверка статуса...');
        try {
            const { data, error } = await supabase
                .from('queue_members')
                .select(`*, queues(name)`)
                .eq('id', memberId)
                .single();
            
            if (error || !data || !data.queues) {
                localStorage.removeItem('my-queue-session');
                throw new Error('Очередь, в которой вы находились, была удалена.');
            }
            
            setMyInfo(data);
            setQueueName(data.queues.name);
            
            const { count } = await supabase.from('queue_members').select('*', { count: 'exact', head: true }).eq('queue_id', queueId).eq('status', 'waiting').lt('ticket_number', data.ticket_number);
            setPeopleAhead(count || 0);

            if (status !== 'ok') setStatus('ok');

        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при проверке статуса:', err.message);
            setStatus('error');
            setErrorMessage(err.message);
        }
    };

    useEffect(() => {
        const handleRealtimeEvent = (payload) => {
            log(PAGE_SOURCE, `Получено Realtime ${payload.eventType} событие`);
            
            if (payload.eventType === 'DELETE') {
                log(PAGE_SOURCE, 'Запись участника удалена.');
                localStorage.removeItem('my-queue-session');
                setStatus('error');
                setErrorMessage('Эта очередь была удалена администратором.');
                supabase.removeChannel(supabase.channel(`wait-page-${memberId}`));
            } else {
                checkMyStatus();
            }
        };

        const channel = supabase.channel(`wait-page-${memberId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `id=eq.${memberId}` }, handleRealtimeEvent)
            .subscribe(status => log(PAGE_SOURCE, `Статус Realtime подписки: ${status}`));
        
        const handlePageShow = (event) => {
            if (event.persisted) {
                log(PAGE_SOURCE, 'Страница восстановлена из кеша, принудительно обновляем.');
                checkMyStatus();
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        checkMyStatus();

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, [memberId, queueId]);

    useEffect(() => {
        if (myInfo) {
            if (myInfo.status === 'called' && !notificationTriggered.current) {
                log(PAGE_SOURCE, 'Статус изменился на "called", триггерим уведомление.');
                notificationTriggered.current = true;
                document.title = "ВАША ОЧЕРЕДЬ!";
                if (audioPlayer.current) audioPlayer.current.play().catch(e => log(PAGE_SOURCE, 'Ошибка воспроизведения аудио', e));
            }
            if (myInfo.status === 'serviced') {
                log(PAGE_SOURCE, 'Сессия завершена (serviced), очищаем localStorage.');
                localStorage.removeItem('my-queue-session');
            }
        }
    }, [myInfo]);
    
    if (status === 'loading') return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spinner />
        </div>
    );
    
    if (status === 'error') return (
        <div className={`container ${styles.errorContainer}`}>
            {errorMessage}
        </div>
    );
    
    return (
        <div className={`container ${styles.pageContainer} ${myInfo?.status === 'called' ? 'called-animation' : ''}`}>
             <div className={`${styles.waitCard} ${myInfo?.status === 'called' ? styles.called : ''}`}>
                <audio ref={audioPlayer} src="/notification.mp3" preload="auto" />
                <h2>Очередь: {queueName}</h2>
                <hr className={styles.divider}/>
                <p className={styles.greeting}>Здравствуйте, <strong>{myInfo?.member_name}</strong>!</p>
                <h1 className={styles.displayCodeLabel}>Ваш код: <span className={styles.displayCode}>{myInfo?.display_code}</span></h1>
                
                {myInfo?.status === 'waiting' && (<><p className={styles.peopleAhead}>Перед вами: <strong>{peopleAhead}</strong> чел.</p><p className={styles.autoUpdateText}>Эта страница будет обновляться автоматически.</p></>)}
                {myInfo?.status === 'called' && (<div className={`${styles.statusBox} ${styles.statusCalled}`}><h2>Вас вызывают!</h2></div>)}
                {myInfo?.status === 'serviced' && (<div className={`${styles.statusBox} ${styles.statusServiced}`}><h2>Ваше обслуживание завершено.</h2></div>)}
                
                {(myInfo?.status === 'waiting' || myInfo?.status === 'called') && (
                    <Button 
                        onClick={handleLeaveQueue}
                        disabled={isLeaving}
                        className={styles.leaveButton}
                    >
                        {isLeaving ? 'Выходим...' : 'Выйти из очереди'}
                    </Button>
                )}
            </div>
            
            {/* 4. ДОБАВЛЯЕМ КОМПОНЕНТ В РЕНДЕР */}
            <ConfirmationModal 
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                confirmText={confirmation.confirmText}
            >
                {confirmation.message}
            </ConfirmationModal>
        </div>
    );
}

export default WaitPage;