import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWindowAdmin } from '../context/WindowAdminContext';
import { Check, PhoneCall, Undo2, Users, QrCode, Share2, UserX } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import ConfirmationModal from '../components/ConfirmationModal';
import toast from 'react-hot-toast';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import styles from './WindowAdminPage.module.css';

function WindowAdminPage() {
    const {
        windowInfo, queueInfo, members, loading, error, isProcessing, 
        isJoinModalOpen, joinUrl, qrCodeUrl, setIsJoinModalOpen,
        callNext, callSpecific, completeService, returnToQueue
    } = useWindowAdmin();

    const [copied, setCopied] = useState(false);
    const [confirmation, setConfirmation] = useState({ isOpen: false });
    const listRef = useRef(null);

    const assignedMember = useMemo(() => 
        members.find(m => m.assigned_window_id === windowInfo?.id && (m.status === 'called' || m.status === 'acknowledged')), 
        [members, windowInfo]
    );
    
    // --- НАЧАЛО ИСПРАВЛЕНИЙ ---
    // Выносим вычисления в тело компонента, где и должны быть все хуки
    const waitingMembers = useMemo(() => members.filter(m => m.status === 'waiting'), [members]);
    const waitingMembersCount = waitingMembers.length;
    // --- КОНЕЦ ИСПРАВЛЕНИЙ ---

    useEffect(() => {
        if (assignedMember) {
            const memberElement = document.getElementById(`member-${assignedMember.id}`);
            if (memberElement) {
                memberElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [assignedMember]);

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

    const handleShare = useCallback(() => {
        const shareData = {
            url: joinUrl,
            title: `Вход в очередь: ${queueInfo?.name}`,
            text: 'Отсканируйте QR или перейдите по ссылке, чтобы войти в очередь.'
        };
        if (navigator.share) {
            navigator.share(shareData).catch(err => log("WindowAdminShare", "Ошибка Web Share API", err));
        } else {
            navigator.clipboard.writeText(shareData.url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(() => toast.error("Не удалось скопировать ссылку."));
        }
    }, [joinUrl, queueInfo]);
    
    const getStatusText = useCallback((status) => {
        if (status === 'called') return 'Вызывается...';
        if (status === 'acknowledged') return '✅ Подтвердил, идет!';
        if (status === 'serviced') return 'Обслужен';
        return 'Ожидает';
    }, []);
    
    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    if (error) return <div className={`container ${styles.errorContainer}`}>{error}</div>;

    const assignedMemberCardClasses = assignedMember ? [
        styles.memberCard,
        styles.assignedMemberCard, 
        assignedMember.status === 'called' && styles.called,
        assignedMember.status === 'called' && 'called-animation',
        assignedMember.status === 'acknowledged' && styles.acknowledged,
    ].filter(Boolean).join(' ') : '';
    
    return (
        <div className={styles.pageWrapper}>
            <header className={styles.header}>
                <div className={`container ${styles.headerContent}`}>
                    <div className={styles.headerPlaceholder}></div>
                    <div className={styles.headerCenter}>
                        <h1 className={styles.headerTitle}>{windowInfo?.name}</h1>
                        <div className={styles.queueCount}>
                            <div className={`${styles.statusIndicator} ${queueInfo?.status === 'paused' ? styles.statusIndicatorPaused : ''}`}></div>
                            {/* Используем новую переменную */}
                            <span>В очереди: {waitingMembersCount}</span>
                        </div>
                    </div>
                    <div className={styles.headerActions}>
                        <button onClick={() => setIsJoinModalOpen(true)} className={styles.controlButton} title="Показать QR-код для входа">
                            <QrCode size={24} color="var(--accent-blue)" />
                        </button>
                    </div>
                </div>
            </header>

            <main className={styles.mainScrollWrapper}>
                <div className={`container ${styles.mainContent}`}>
                    {assignedMember && (
                        <Card className={assignedMemberCardClasses}>
                            <div className={styles.memberInfo}>
                                <p className={styles.memberName}>{assignedMember.display_code} - {assignedMember.member_name}</p>
                                {assignedMember.service_name && (<p className={styles.memberService}>{assignedMember.service_name}</p>)}
                                <p className={styles.memberStatus}>{getStatusText(assignedMember.status)}</p>
                            </div>
                        </Card>
                    )}

                    <div className={styles.memberList} ref={listRef}>
                        {members.filter(member => member.id !== assignedMember?.id).map(member => {
                            const isThisWindowAssigned = member.assigned_window_id === windowInfo?.id;
                            const memberCardClasses = [
                                styles.memberCard,
                                isThisWindowAssigned && member.status === 'called' && styles.called,
                                isThisWindowAssigned && member.status === 'called' && 'called-animation',
                                isThisWindowAssigned && member.status === 'acknowledged' && styles.acknowledged,
                                member.status === 'serviced' && styles.serviced,
                                (member.assigned_window_id && !isThisWindowAssigned) && styles.assignedToOther
                            ].filter(Boolean).join(' ');
                            return (
                                <Card key={member.id} id={`member-${member.id}`} className={memberCardClasses}>
                                    <div className={styles.memberInfo}>
                                        <p className={styles.memberName}>{member.display_code} - {member.member_name}</p>
                                        {member.service_name && (<p className={styles.memberService}>{member.service_name}</p>)}
                                    </div>
                                    <div className={styles.memberActions}>
                                        {member.status === 'waiting' && (
                                            <Button onClick={() => callSpecific(member.id)} disabled={!!assignedMember || isProcessing} className={`${styles.actionButton} ${styles.callButton}`} title="Вызвать этого участника"><PhoneCall size={20} /></Button>
                                        )}
                                        <Button onClick={() => handleRemoveMember(member)} className={`${styles.actionButton} ${styles.removeButton}`} title="Удалить участника"><UserX size={20} /></Button>
                                    </div>
                                </Card>
                            )
                        })}
                        
                        {members.length === 0 && (
                            <div className={styles.emptyState}>
                                <Users size={48} className={styles.emptyStateIcon} />
                                <h3 className={styles.emptyStateTitle}>В очереди пока никого нет</h3>
                                <p className={styles.emptyStateText}>Нажмите на иконку QR-кода вверху, чтобы показать клиенту код для входа.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <footer className={styles.footer}>
                <div className={`container ${styles.footerActions}`}>
                    {assignedMember ? (
                        <>
                            <Button onClick={() => returnToQueue(assignedMember.id)} isLoading={isProcessing} className={styles.returnButton}><Undo2 size={20} /> Вернуть</Button>
                            <Button onClick={() => completeService(assignedMember.id)} isLoading={isProcessing} className={styles.completeButton}><Check size={20} /> Завершить</Button>
                        </>
                    ) : (
                        // Используем новую переменную
                        <Button onClick={callNext} isLoading={isProcessing} disabled={waitingMembersCount === 0 || queueInfo?.status === 'paused'} className={styles.callNextButton}><PhoneCall size={20} /> Вызвать следующего</Button>
                    )}
                </div>
            </footer>

            <Modal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)}>
                <div className={styles.modalContent}>
                     <p className={styles.modalInstruction}>Поделитесь QR-кодом или ссылкой, чтобы люди могли присоединиться.</p>
                    {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className={styles.qrImage} /> : <Spinner />}
                    <p className={styles.joinLink}>{joinUrl || '...'}</p>
                    <Button onClick={handleShare}>{copied ? <><Check size={18} /> Скопировано!</> : <><Share2 size={18} /> Поделиться</>}</Button>
                </div>
            </Modal>

            <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation({ ...confirmation, isOpen: false })} onConfirm={confirmation.onConfirm} title={confirmation.title} confirmText={confirmation.confirmText} isDestructive={confirmation.isDestructive}>
                {confirmation.message}
            </ConfirmationModal>
        </div>
    );
}

export default WindowAdminPage;