import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { QrCode, UserX, MoreVertical, PauseCircle, PlayCircle, Users, Share2, Link2, Check, Info, PhoneCall, Undo2 } from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import * as service from '../services/supabaseService'; 

import Card from '../components/Card';
import Section from '../components/Section';
import Modal from '../components/Modal';
import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import InstructionCard from '../components/InstructionCard';
import styles from './AdminPage.module.css';
import log from '../utils/logger';

const PAGE_SOURCE = 'MasterAdminPage';

function AdminPage() {
    const { 
      queue, members, windows, loading, error, qrCodeUrl, joinUrl, waitingMembersCount, setQueue,
    } = useQueue();
    
    const navigate = useNavigate();
    const location = useLocation();
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [copiedKey, setCopiedKey] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedWindow, setSelectedWindow] = useState(null);
    const [windowQrCode, setWindowQrCode] = useState('');
    const [confirmation, setConfirmation] = useState({ isOpen: false });
    const menuRef = useRef(null);

    const isSimpleMode = useMemo(() => windows.length === 1, [windows]);

    useEffect(() => {
        if (location.state?.fromCreation && isSimpleMode && !loading) {
            setIsJoinModalOpen(true);
            navigate('.', { replace: true, state: {} });
        }
    }, [location.state, isSimpleMode, loading, navigate]);
    
    const callMember = useCallback(async (memberId, windowId) => {
        setIsProcessing(true);
        const { error } = await service.callSpecificMember(memberId, windowId);
        if (error) toast.error("Не удалось вызвать участника.");
        setIsProcessing(false);
    }, []);

    const completeService = useCallback(async (memberId) => {
        setIsProcessing(true);
        await service.updateMemberStatus(memberId, 'serviced');
        setIsProcessing(false);
    }, []);

    const returnToQueue = useCallback(async (memberId) => {
        setIsProcessing(true);
        await service.returnMemberToWaiting(memberId);
        setIsProcessing(false);
    }, []);
    
    const callNextInSimpleMode = useCallback(async () => {
        if (windows.length !== 1) return;
        const waitingMembers = members.filter(m => m.status === 'waiting');
        if (waitingMembers.length === 0) {
            toast('В очереди больше никого нет.', { icon: 'ℹ️' });
            return;
        }
        const nextMember = waitingMembers[0];
        await callMember(nextMember.id, windows[0].id);
    }, [members, windows, callMember]);

    const handleOpenWindowModal = useCallback(async (win) => {
        setSelectedWindow(win);
        const adminLink = `${window.location.origin}/window-admin/${win.admin_secret_key}`;
        try {
            const qr = await QRCode.toDataURL(adminLink, { width: 300, margin: 2 });
            setWindowQrCode(qr);
        } catch (err) {
            log(PAGE_SOURCE, "Ошибка генерации QR для админа окна", err);
            setWindowQrCode('');
        }
    }, []);

    const handleCloseWindowModal = useCallback(() => {
        setSelectedWindow(null);
        setWindowQrCode('');
    }, []);
    
    const handleToggleQueueStatus = useCallback(async () => {
        if (!queue) return;
        const newStatus = queue.status === 'active' ? 'paused' : 'active';
        const actionText = newStatus === 'paused' ? 'приостановлена' : 'возобновлена';
        const { error } = await service.updateQueueStatus(queue.id, newStatus);
        if (error) toast.error("Не удалось изменить статус очереди.");
        else {
            toast.success(`Запись в очередь ${actionText}.`);
            setQueue(prevQueue => ({ ...prevQueue, status: newStatus }));
        }
    }, [queue, setQueue]);
    
    const handleRemoveMember = useCallback((member) => {
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
    }, []);

    const handleDeleteCurrentQueue = useCallback(() => {
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
                service.deleteQueue(queue.id).then(({error}) => {
                    if (error) toast.error(`Не удалось удалить очередь "${queue.name}".`, { id: toastId });
                    else {
                        const savedQueuesRaw = localStorage.getItem('my-queues');
                        if (savedQueuesRaw) {
                            let myQueues = JSON.parse(savedQueuesRaw);
                            myQueues = myQueues.filter(q => q.id !== queue.id);
                            localStorage.setItem('my-queues', JSON.stringify(myQueues));
                        }
                        toast.success(`Очередь "${queue.name}" удалена.`, { id: toastId });
                        navigate('/');
                    }
                });
            }
        });
    }, [queue, navigate]);

    const handleShare = useCallback(async (shareData) => {
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                log(PAGE_SOURCE, 'Ошибка Web Share API:', err);
            }
        } else {
            navigator.clipboard.writeText(shareData.url).then(() => {
                setCopiedKey(shareData.key);
                setTimeout(() => setCopiedKey(null), 2000);
            }).catch(err => {
                log(PAGE_SOURCE, "Ошибка копирования", err);
                toast.error("Не удалось скопировать ссылку.");
            });
        }
    }, []);
    
    const getStatusText = useCallback((member) => {
        switch (member.status) {
            case 'called': return isSimpleMode ? 'Вызывается' : `Вызывается в: ${member.windows?.name || '...'}`;
            case 'acknowledged': return isSimpleMode ? 'Идет к окну' : `Идет в: ${member.windows?.name || '...'}`;
            case 'serviced': return 'Обслужен';
            default: return 'Ожидает';
        }
    }, [isSimpleMode]);

    const assignedMemberInSimpleMode = useMemo(() => 
        isSimpleMode ? members.find(m => m.assigned_window_id === windows[0]?.id && (m.status === 'called' || m.status === 'acknowledged')) : null
    , [members, windows, isSimpleMode]);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spinner />
        </div>
    );
    
    if (error) return <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>{error}</div>;

    return (
        <div className={styles.pageWrapper}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
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
                            <button onClick={() => setIsJoinModalOpen(true)} className={styles.controlButton} title="Показать QR-код и ссылку для входа">
                                <QrCode size={24} color="var(--accent-blue)" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>
            
            <main className={`container ${styles.mainContent}`}>
                {!isSimpleMode && (
                    <Section title="Панели операторов">
                        <InstructionCard icon={<Info size={20} />} title="Раздайте доступы операторам">
                            Кликните по карточке, чтобы открыть панель окна для себя, или нажмите "Поделиться", чтобы отправить ссылку.
                        </InstructionCard>
                        <div className={styles.windowsList}>
                            {windows.map(win => (
                                <div key={win.id} className={styles.windowItemContainer}>
                                    <Link 
                                        to={`/window-admin/${win.admin_secret_key}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className={styles.windowLink}
                                        title={`Открыть панель для "${win.name}"`}
                                    >
                                        <Card className={styles.windowCard}>
                                            <div className={styles.windowInfo}>
                                                <Link2 size={20} className={styles.windowIcon} />
                                                <p className={styles.windowName}>{win.name}</p>
                                            </div>
                                        </Card>
                                    </Link>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenWindowModal(win);
                                        }}
                                        className={styles.copyButton}
                                        title={`Поделиться доступом для "${win.name}"`}
                                    >
                                        <Share2 size={18} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
                
                <Section title="Общая очередь">
                    <div className={styles.memberList}>
                        {members.length > 0 ? (
                            members.map(member => (
                                <Card key={member.id} className={`${styles.memberCard} ${member.status === 'called' ? styles.called : ''} ${member.status === 'acknowledged' ? styles.acknowledged : ''} ${member.status === 'serviced' ? styles.serviced : ''} ${member.status === 'called' ? 'called-animation' : ''}`}>
                                    <div className={styles.memberInfo}>
                                        <p className={styles.memberName}>{member.display_code || `#${member.ticket_number}`} - {member.member_name}</p>
                                        {member.services?.name && (<p className={styles.memberService}>{member.services.name}</p>)}
                                        <p className={styles.memberStatus}>{getStatusText(member)}</p>
                                    </div>
                                    <div className={styles.memberActions}>
                                        {isSimpleMode && member.status === 'waiting' && (
                                            <Button onClick={() => callMember(member.id, windows[0].id)} className={`${styles.actionButton} ${styles.callButton}`} title="Вызвать участника"><PhoneCall size={20} /></Button>
                                        )}
                                        <Button onClick={() => handleRemoveMember(member)} className={`${styles.actionButton} ${styles.removeButton}`} title="Удалить участника"><UserX size={20} /></Button>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <div className={styles.emptyState}>
                                <Users size={48} className={styles.emptyStateIcon} />
                                <h3 className={styles.emptyStateTitle}>В очереди пока никого нет</h3>
                                <p className={styles.emptyStateText}>Поделитесь QR-кодом или ссылкой, чтобы люди могли присоединиться.</p>
                                <Button onClick={() => setIsJoinModalOpen(true)} className={styles.emptyStateButton}><QrCode size={18} />Показать QR-код</Button>
                            </div>
                        )}
                    </div>
                </Section>
            </main>

            {isSimpleMode && (
                <footer className={styles.footer}>
                    <div className={`container ${styles.footerActions}`}>
                        {assignedMemberInSimpleMode ? (
                             <>
                                <Button onClick={() => returnToQueue(assignedMemberInSimpleMode.id)} isLoading={isProcessing} className={styles.returnButton}><Undo2 size={20} /> Вернуть</Button>
                                <Button onClick={() => completeService(assignedMemberInSimpleMode.id)} isLoading={isProcessing} className={styles.completeButton}><Check size={20} /> Завершить</Button>
                            </>
                        ) : (
                             <Button onClick={callNextInSimpleMode} isLoading={isProcessing} disabled={waitingMembersCount === 0 || queue?.status === 'paused'} className={styles.callNextButton}><PhoneCall size={20} /> Вызвать следующего</Button>
                        )}
                    </div>
                </footer>
            )}

            <Modal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)}>
                <div className={styles.modalContent}>
                    <p className={styles.modalInstruction}>Поделитесь QR-кодом или ссылкой, чтобы люди могли присоединиться.</p>
                    {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className={styles.qrImage} /> : <Spinner />}
                    <p className={styles.joinLink}>{joinUrl || 'Генерация ссылки...'}</p>
                    <Button onClick={() => handleShare({url: joinUrl, title: `Вход в очередь: ${queue?.name}`, text: 'Отсканируйте QR или перейдите по ссылке, чтобы войти в очередь.', key: 'join-link' })}>
                        {copiedKey === 'join-link' ? <><Check size={18} /> Скопировано!</> : <><Share2 size={18} /> Поделиться</>}
                    </Button>
                </div>
            </Modal>
            
            <Modal isOpen={!!selectedWindow} onClose={handleCloseWindowModal} title={`Доступ для "${selectedWindow?.name}"`} backdropClassName={styles.adminModalBackdrop}>
                {selectedWindow && (
                    <div className={styles.modalContent}>
                        {windowQrCode ? <img src={windowQrCode} alt={`QR для ${selectedWindow.name}`} className={styles.qrImage} /> : <Spinner />}
                        <p className={styles.joinLink}>{`${window.location.origin}/window-admin/${selectedWindow.admin_secret_key}`}</p>
                        <Button className={styles.adminShareButton} onClick={() => handleShare({ url: `${window.location.origin}/window-admin/${selectedWindow.admin_secret_key}`, title: `Доступ к управлению: ${selectedWindow.name}`, text: `Ссылка для входа в панель управления очередью для "${selectedWindow.name}"`, key: selectedWindow.id })}>
                            {copiedKey === selectedWindow.id ? <><Check size={18} /> Скопировано!</> : <><Share2 size={18} /> Поделиться доступом</>}
                        </Button>
                    </div>
                )}
            </Modal>

            <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation(prev => ({...prev, isOpen: false}))} onConfirm={confirmation.onConfirm} title={confirmation.title} confirmText={confirmation.confirmText} isDestructive={confirmation.isDestructive}>
                {confirmation.message}
            </ConfirmationModal>
        </div>
    );
}

export default AdminPage;