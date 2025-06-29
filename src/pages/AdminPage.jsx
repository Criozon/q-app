import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QrCode, Check, PhoneCall, UserX, ChevronRight, MoreVertical, Undo2, PauseCircle, PlayCircle, Users, Share2 } from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import * as service from '../services/supabaseService'; 

import Card from '../components/Card';
import Modal from '../components/Modal';
import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import styles from './AdminPage.module.css';
import log from '../utils/logger';

const PAGE_SOURCE = 'AdminPage';

function AdminPage() {
    const { 
      queue, 
      members, 
      loading, 
      error, 
      qrCodeUrl, 
      joinUrl, 
      calledMember, 
      waitingMembersCount,
      setQueue
    } = useQueue();
    
    const navigate = useNavigate();
    const location = useLocation();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isButtonLoading, setIsButtonLoading] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const [confirmation, setConfirmation] = useState({
        isOpen: false,
        title: '',
        message: null,
        onConfirm: () => {},
        confirmText: 'Подтвердить',
        isDestructive: false,
    });
    
    const [isCopied, setIsCopied] = useState(false);
    
    const menuRef = useRef(null);

    useEffect(() => {
        if (!loading && location.state?.fromCreation) {
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true });
        }
    }, [loading, location, navigate]);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleMainButtonClick = async () => {
        setIsButtonLoading(true);
        const memberToUpdate = calledMember || members.find(m => m.status === 'waiting');
        if (memberToUpdate) {
            const newStatus = calledMember ? 'serviced' : 'called';
            await service.updateMemberStatus(memberToUpdate.id, newStatus);
        }
        setIsButtonLoading(false);
    };
    
    const handleReturnToQueue = async () => {
        if (!calledMember) return;
        setIsButtonLoading(true);
        try {
            await service.updateMemberStatus(calledMember.id, 'waiting');
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
        const { error } = await service.updateQueueStatus(queue.id, newStatus);
        if (error) {
            toast.error("Не удалось изменить статус очереди.");
        } else {
            toast.success(`Запись в очередь ${actionText}.`);
            setQueue(prevQueue => ({ ...prevQueue, status: newStatus }));
        }
    };

    const handleCallSpecific = async (memberId) => {
        if (calledMember) { toast.error('Завершите текущее обслуживание.'); return; }
        await service.updateMemberStatus(memberId, 'called');
    };
    
    const handleRemoveMember = (member) => {
        setConfirmation({
            isOpen: true,
            title: 'Удалить участника?',
            message: <p>Вы уверены, что хотите удалить <strong>{member.member_name} ({member.display_code})</strong> из очереди?</p>,
            confirmText: 'Да, удалить',
            isDestructive: true,
            onConfirm: async () => {
                await service.deleteMember(member.id);
                toast.success(`Участник ${member.member_name} удален.`);
            },
        });
    };

    const handleDeleteCurrentQueue = () => {
        setIsMenuOpen(false);
        if (!queue) return;

        setConfirmation({
            isOpen: true,
            title: 'Удалить очередь?',
            message: <p>Вы уверены, что хотите удалить очередь <strong>"{queue.name}"</strong>? Это действие необратимо.</p>,
            confirmText: 'Да, удалить',
            isDestructive: true,
            onConfirm: () => {
                const toastId = toast.loading(`Удаляем очередь "${queue.name}"...`);
                const performDelete = async () => {
                    const { error } = await service.deleteQueue(queue.id);

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
            }
        });
    };

    const handleShare = async () => {
        if (isCopied) return;
        const shareData = {
            title: `Присоединяйтесь к очереди: ${queue.name}`,
            text: `Ссылка для входа в очередь "${queue.name}"`,
            url: joinUrl,
        };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
                log(PAGE_SOURCE, 'Успешно поделились через Web Share API');
            } catch (err) {
                log(PAGE_SOURCE, 'Ошибка Web Share API:', err);
            }
        } else {
            try {
                await navigator.clipboard.writeText(joinUrl);
                setIsCopied(true);
                toast.success('Ссылка на очередь скопирована!');
                setTimeout(() => setIsCopied(false), 2000);
            } catch (err) {
                toast.error('Не удалось скопировать ссылку.');
                log(PAGE_SOURCE, 'Ошибка копирования в буфер:', err);
            }
        }
    };
    
    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spinner />
        </div>
    );
    
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
            <main className={`container ${styles.mainContent}`}>
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
                                        <Button onClick={() => handleRemoveMember(member)} disabled={isButtonLoading} className={`${styles.actionButton} ${styles.removeButton}`} title="Удалить участника"><UserX size={20} /></Button>
                                    </div>
                                </Card>
                            </div>
                        )
                    })}
                    {members.length === 0 && (
                        <div className={styles.emptyState}>
                            <Users size={48} className={styles.emptyStateIcon} />
                            <h3 className={styles.emptyStateTitle}>В очереди пока никого нет</h3>
                            <p className={styles.emptyStateText}>
                                Поделитесь QR-кодом или ссылкой, чтобы люди могли присоединиться.
                            </p>
                            <Button 
                                onClick={() => setIsModalOpen(true)} 
                                className={styles.emptyStateButton}
                            >
                                <QrCode size={18} />
                                Показать QR-код
                            </Button>
                        </div>
                    )}
                </div>
            </main>
            <footer className={styles.footer}>
                <div className={`container ${styles.footerActions}`}>
                    {calledMember ? (
                        <>
                            <Button onClick={handleReturnToQueue} isLoading={isButtonLoading} className={styles.returnButton}>
                                <Undo2 size={20} /> Вернуть
                            </Button>
                            <Button onClick={handleMainButtonClick} isLoading={isButtonLoading} className={styles.completeButton}>
                                <Check size={20} /> Завершить ({calledMember.display_code || calledMember.ticket_number})
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleMainButtonClick} isLoading={isButtonLoading} disabled={waitingMembersCount === 0} className={styles.callNextButton}>
                            <PhoneCall size={20} /> Вызвать следующего
                        </Button>
                    )}
                </div>
            </footer>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Покажите QR-код или отправьте ссылку">
                <div className={styles.modalContent}>
                    {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className={styles.qrImage} /> : <Spinner />}
                    <p className={styles.joinLink}>{joinUrl || 'Генерация ссылки...'}</p>
                    <Button onClick={handleShare} disabled={!joinUrl || isCopied}>
                        {isCopied ? (<><Check size={18} /> Скопировано!</>) : (<><Share2 size={18} /> Поделиться</>)}
                    </Button>
                </div>
            </Modal>
            
            <ConfirmationModal 
                isOpen={confirmation.isOpen} 
                onClose={() => setConfirmation({ ...confirmation, isOpen: false })} 
                onConfirm={confirmation.onConfirm} 
                title={confirmation.title} 
                confirmText={confirmation.confirmText}
                isDestructive={confirmation.isDestructive}
            >
                {confirmation.message}
            </ConfirmationModal>
        </div>
    );
}

export default AdminPage;