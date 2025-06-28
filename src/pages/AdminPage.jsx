import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { QrCode, Check, PhoneCall, UserX, ChevronRight, MoreVertical, Undo2, PauseCircle, PlayCircle } from 'lucide-react';

import Card from '../components/Card';
import Modal from '../components/Modal';
import Button from '../components/Button';
import styles from './AdminPage.module.css';
import log from '../utils/logger';

const PAGE_SOURCE = 'AdminPage';

function AdminPage() {
    const { secretKey } = useParams();
    const navigate = useNavigate();
    const [queue, setQueue] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [joinUrl, setJoinUrl] = useState('');
    const [isButtonLoading, setIsButtonLoading] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const listRef = useRef(null);
    const menuRef = useRef(null);

    const calledMember = members.find(m => m.status === 'called');
    const waitingMembersCount = members.filter(m => m.status === 'waiting').length;

    const fetchAllData = useCallback(async (showLoader = false) => {
        if (showLoader) setLoading(true);
        setError(null);
        log(PAGE_SOURCE, 'Загрузка всех данных...');
        try {
            const { data: qData, error: qError } = await supabase
                .from('queues').select('*').eq('admin_secret_key', secretKey).single();
            if (qError || !qData) throw new Error("Очередь не найдена или была удалена.");
            setQueue(qData);

            const { data: mData, error: mError } = await supabase
                .from('queue_members').select('*').eq('queue_id', qData.id).order('ticket_number');
            if (mError) throw new Error("Не удалось загрузить участников.");
            setMembers(mData || []);

            if (showLoader) {
                const currentJoinUrl = `${window.location.origin}/join/${qData.id}`;
                setJoinUrl(currentJoinUrl);
                const qrUrl = await QRCode.toDataURL(currentJoinUrl);
                setQrCodeUrl(qrUrl);
                if (mData.length === 0) setIsModalOpen(true);
            }
        } catch (err) {
            log(PAGE_SOURCE, 'Ошибка при загрузке:', err.message);
            setError(err.message);
            setQueue(null);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [secretKey]);

    useEffect(() => {
        if (!queue) {
            return;
        }
        const handleRealtimeEvent = (payload) => {
            log(PAGE_SOURCE, `Realtime событие для УЧАСТНИКА ${payload.eventType} получено`);
            if (payload.eventType === 'INSERT') {
                setMembers(currentMembers => [...currentMembers, payload.new].sort((a,b) => a.ticket_number - b.ticket_number));
            }
            if (payload.eventType === 'UPDATE') {
                setMembers(currentMembers => currentMembers.map(m => m.id === payload.new.id ? payload.new : m));
            }
            if (payload.eventType === 'DELETE') {
                setMembers(currentMembers => currentMembers.filter(m => m.id !== payload.old.id));
            }
        };

        const channel = supabase.channel(`admin-page-${queue.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, handleRealtimeEvent)
            .subscribe(status => log(PAGE_SOURCE, `Статус подписки на УЧАСТНИКОВ: ${status}`));
        
        return () => {
            supabase.removeChannel(channel);
        };
    }, [queue]);
    
    useEffect(() => {
        if (!queue) return;
        const handleQueueUpdate = (payload) => {
             log(PAGE_SOURCE, `Realtime событие для ОЧЕРЕДИ ${payload.eventType} получено`);
             setQueue(payload.new);
        };
        const queueChannel = supabase.channel(`admin-queue-status-${queue.id}`, { config: { broadcast: { self: true } } })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queues', filter: `id=eq.${queue.id}` }, handleQueueUpdate)
            .subscribe(status => log(PAGE_SOURCE, `Статус подписки на ОЧЕРЕДЬ: ${status}`));

        return () => {
            supabase.removeChannel(queueChannel);
        };
    }, [queue]);


    useEffect(() => {
        const handlePageShow = (event) => {
            if (event.persisted) {
                log(PAGE_SOURCE, 'Страница восстановлена из bfcache, принудительно обновляем.');
                fetchAllData(true);
            }
        };
        
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('mousedown', handleClickOutside);
        
        fetchAllData(true);
        
        return () => {
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [fetchAllData]);

    const autoScroll = useCallback(() => { /* ... */ }, [members]);
    useEffect(() => { autoScroll(); }, [members, autoScroll]);

    const handleMainButtonClick = async () => {
        setIsButtonLoading(true);
        const memberToUpdate = calledMember || members.find(m => m.status === 'waiting');
        if (memberToUpdate) {
            const newStatus = calledMember ? 'serviced' : 'called';
            await supabase.from('queue_members').update({ status: newStatus }).eq('id', memberToUpdate.id);
        }
        setIsButtonLoading(false);
    };
    
    const handleReturnToQueue = async () => {
        if (!calledMember) return;
        setIsButtonLoading(true);
        try {
            const { error } = await supabase
                .from('queue_members')
                .update({ status: 'waiting' })
                .eq('id', calledMember.id);
            if (error) throw error;
        } catch (err) {
            toast.error("Не удалось вернуть участника в очередь.");
        } finally {
            setIsButtonLoading(false);
        }
    };
    
    const handleToggleQueueStatus = async () => {
        if (!queue) return;
        const newStatus = queue.status === 'active' ? 'paused' : 'active';
        const actionText = newStatus === 'paused' ? 'приостановлена' : 'возобновлена';

        const { error } = await supabase
            .from('queues')
            .update({ status: newStatus })
            .eq('id', queue.id);
        
        if (error) {
            toast.error("Не удалось изменить статус очереди.");
        } else {
            toast.success(`Запись в очередь ${actionText}.`);
            setQueue(prevQueue => ({ ...prevQueue, status: newStatus }));
        }
    };


    const handleCallSpecific = async (memberId) => {
        if (calledMember) { toast.error('Завершите текущее обслуживание.'); return; }
        await supabase.from('queue_members').update({ status: 'called' }).eq('id', memberId);
    };
    
    const handleRemoveMember = async (memberId) => {
        if (window.confirm('Удалить участника?')) {
            await supabase.from('queue_members').delete().eq('id', memberId);
        }
    };

    const handleDeleteCurrentQueue = () => {
        setIsMenuOpen(false);
        if (!queue) return;

        toast((t) => (
            <div>
                <p style={{ fontWeight: 500, margin: 0 }}>Вы уверены, что хотите удалить очередь <strong style={{color: 'var(--text-primary)'}}>{queue.name}</strong>? Это действие необратимо.</p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <Button onClick={() => toast.dismiss(t.id)} className={styles.toastButtonCancel}>Отмена</Button>
                    <Button
                        className={styles.toastButtonConfirm}
                        onClick={() => {
                            toast.dismiss(t.id);
                            const toastId = toast.loading(`Удаляем очередь "${queue.name}"...`)
                            const performDelete = async () => {
                                const { error } = await supabase.rpc('delete_queue_and_members', {
                                    queue_id_to_delete: queue.id
                                });

                                if (error) {
                                    toast.error(`Не удалось удалить очередь "${queue.name}".`, { id: toastId });
                                } else {
                                    const savedQueuesRaw = localStorage.getItem('my-queues');
                                    if (savedQueuesRaw) {
                                        let myQueues = JSON.parse(savedQueuesRaw);
                                        myQueues = myQueues.filter(q => q.id !== queue.id);
                                        localStorage.setItem('my-queues', JSON.stringify(myQueues));
                                    }
                                    toast.success(`Очередь "${queue.name}" удалена.`, { id: toastId });
                                    navigate('/');
                                }
                            };
                            performDelete();
                        }}>
                        Да, удалить
                    </Button>
                </div>
            </div>
        ), { duration: 8000, position: 'top-center' });
    };
    
    const handleShare = () => { /* ... */ };

    if (loading) return <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>Загрузка...</div>;
    if (error) return <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>{error}</div>;

    return (
        <div className={styles.pageWrapper}>
            <header className={styles.header}>
                <div className={`container ${styles.headerContent}`}>
                    <div ref={menuRef} className={styles.adminMenuContainer}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={styles.menuButton} title="Открыть меню">
                            <MoreVertical size={24} color="var(--accent-blue)" />
                        </button>
                        {isMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <button onClick={handleDeleteCurrentQueue} className={`${styles.dropdownMenuItem} ${styles.dropdownMenuItemDelete}`}>
                                    <UserX size={16} /> Удалить очередь
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={styles.headerCenter}>
                        <h1 className={styles.headerTitle}>{queue?.name}</h1>
                        <div className={styles.queueCount}>
                            <div className={`${styles.statusIndicator} ${queue?.status === 'paused' ? styles.statusIndicatorPaused : ''}`}></div>
                            <span>{queue?.status === 'active' ? 'Активна' : 'Пауза'} | В очереди: {waitingMembersCount}</span>
                        </div>
                    </div>
                    
                    <div className={styles.headerActions}>
                        <button onClick={handleToggleQueueStatus} className={styles.controlButton} title={queue?.status === 'active' ? 'Приостановить запись' : 'Возобновить запись'}>
                            {queue?.status === 'active' ? <PauseCircle size={24} color="#ff9500" /> : <PlayCircle size={24} color="var(--accent-green)" />}
                        </button>
                        <button onClick={() => setIsModalOpen(true)} className={styles.controlButton} title="Показать QR-код и ссылку">
                            <QrCode size={24} color="var(--accent-blue)" />
                        </button>
                    </div>
                </div>
            </header>
            <main ref={listRef} className={`container ${styles.mainContent}`}>
                <div className={styles.memberList}>
                    {members.map(member => {
                        const memberCardClasses = [ styles.memberCard, member.status === 'called' && styles.called, member.status === 'serviced' && styles.serviced ].filter(Boolean).join(' ');
                        return (
                            <div id={`member-${member.id}`} key={member.id}>
                                <Card className={memberCardClasses}>
                                    <div className={styles.memberInfo}>
                                        <p className={styles.memberName}>{member.display_code || `#${member.ticket_number}`} - {member.member_name}</p>
                                        <p className={styles.memberStatus}>{member.status === 'called' ? 'Вызывается...' : (member.status === 'serviced' ? 'Обслужен' : 'Ожидает')}</p>
                                    </div>
                                    <div className={styles.memberActions}>
                                        {member.status === 'waiting' && <Button onClick={() => handleCallSpecific(member.id)} disabled={!!calledMember || isButtonLoading} className={`${styles.actionButton} ${styles.priorityCallButton}`} title="Приоритетный вызов"><ChevronRight size={20} /></Button>}
                                        <Button onClick={() => handleRemoveMember(member.id)} disabled={isButtonLoading} className={`${styles.actionButton} ${styles.removeButton}`} title="Удалить участника"><UserX size={20} /></Button>
                                    </div>
                                </Card>
                            </div>
                        )
                    })}
                    {members.length === 0 && <p className={styles.emptyQueueText}>В очереди пока никого нет.</p>}
                </div>
            </main>
            <footer className={styles.footer}>
                <div className={`container ${styles.footerActions}`}>
                    {calledMember ? (
                        <>
                            <Button onClick={handleReturnToQueue} disabled={isButtonLoading} className={styles.returnButton}>
                                <Undo2 size={20} /> Вернуть
                            </Button>
                            <Button onClick={handleMainButtonClick} disabled={isButtonLoading} className={styles.completeButton}>
                                <Check size={20} /> Завершить ({calledMember.display_code || calledMember.ticket_number})
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleMainButtonClick} disabled={waitingMembersCount === 0 || isButtonLoading} className={styles.callNextButton}>
                            {isButtonLoading ? '...' : <><PhoneCall size={20} /> Вызвать следующего</>}
                        </Button>
                    )}
                </div>
            </footer>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Покажите QR-код или отправьте ссылку">
                <div className={styles.modalContent}>
                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" className={styles.qrImage} />}
                    <p className={styles.joinLink}>{joinUrl}</p>
                    <Button>Поделиться</Button>
                </div>
            </Modal>
        </div>
    );
}

export default AdminPage;