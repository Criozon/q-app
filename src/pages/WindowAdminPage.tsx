import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWindowAdmin } from '../hooks/useWindowAdmin';
import type { ConfirmationState, MemberStatus, WindowAdminData } from '../types/domain';
import { Check, PhoneCall, Users, QrCode, Share2, RefreshCw } from 'lucide-react';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import ConfirmationModal from '../components/ConfirmationModal';
import toast from 'react-hot-toast';
import log from '../utils/logger';
import * as service from '../services/supabaseService';
import MemberCard from '../components/MemberCard';
import { byWorkOrder } from '../utils/memberOrder';
import styles from './WindowAdminPage.module.css';

type Member = WindowAdminData['members'][number];

function WindowAdminPage() {
    const {
        windowInfo, queueInfo, members, assignedMember, loading, error, errorKind, isProcessing, loadInitialData,
        isJoinModalOpen, joinUrl, qrCodeUrl, setIsJoinModalOpen,
        callNext, callSpecific, completeService, returnToQueue, cancelMember,
        startTimer, extendTimer, saveNote,
        isQueueDeleted
    } = useWindowAdmin();

    const [copied, setCopied] = useState(false);
    const [confirmation, setConfirmation] = useState<ConfirmationState>({ isOpen: false });
    const listRef = useRef(null);

    const waitingMembers = useMemo(() => members.filter((m: Member) => m.status === 'waiting'), [members]);
    const waitingMembersCount = waitingMembers.length;

    // Сверху то, что требует внимания: горящие таймеры, потом вызванные.
    const sortedMembers = useMemo(() => members.slice().sort(byWorkOrder), [members]);

    useEffect(() => {
        if (assignedMember) {
            const memberElement = document.getElementById(`member-${assignedMember.id}`);
            if (memberElement) {
                memberElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [assignedMember]);

    const handleRemoveMember = useCallback((member: Member) => {
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
    
    const getStatusText = useCallback((status: MemberStatus) => {
        if (status === 'called') return 'Вызывается...';
        if (status === 'acknowledged') return '✅ Подтвердил, идет!';
        if (status === 'in_service') return 'Идёт обслуживание';
        if (status === 'serviced') return 'Обслужен';
        if (status === 'cancelled') return 'Не подошёл';
        return 'Ожидает';
    }, []);
    
    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    
    if (error) return (
        <div className={`container ${styles.pageWrapper}`} style={{paddingTop: '60px', textAlign: 'center'}}>
            <div className={styles.errorContainer}>
                {errorKind === 'network'
                    ? 'Не удалось связаться с сервером. Проверьте соединение — данные никуда не делись.'
                    : error}
            </div>
            {/* Сетевой сбой — повод попробовать ещё раз, а не тупик. */}
            {errorKind === 'network' && (
                <Button
                    onClick={() => { void loadInitialData(true); }}
                    style={{ marginTop: '20px' }}
                >
                    <RefreshCw size={18} /> Попробовать снова
                </Button>
            )}
        </div>
    );

    if (isQueueDeleted) {
        return (
            <div className={styles.pageWrapper}>
                <div className={`container ${styles.mainContent}`}>
                    <div className={styles.emptyState}>
                        <h3 className={styles.emptyStateTitle}>Очередь была удалена</h3>
                        <p className={styles.emptyStateText}>Мастер-администратор удалил очередь, к которой была привязана эта панель.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.pageWrapper}>
            <header className={styles.header}>
                <div className={`container ${styles.headerContent}`}>
                    <div className={styles.headerPlaceholder}></div>
                    <div className={styles.headerCenter}>
                        <h1 className={styles.headerTitle}>{windowInfo?.name}</h1>
                        {queueInfo && (
                            <div className={styles.queueCount}>
                                <div className={`${styles.statusIndicator} ${queueInfo?.status === 'paused' ? styles.statusIndicatorPaused : ''}`}></div>
                                <span>В очереди: {waitingMembersCount}</span>
                            </div>
                        )}
                    </div>
                    <div className={styles.headerActions}>
                        {queueInfo && (
                            <button onClick={() => setIsJoinModalOpen(true)} className={styles.controlButton} title="Показать QR-код для входа">
                                <QrCode size={24} color="var(--accent-blue)" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className={styles.mainScrollWrapper}>
                <div className={`container ${styles.mainContent}`}>
                    {/* Всё управление — на карточках. Раньше действия жили
                        в подвале и относились к «текущему вызванному», то есть
                        работать можно было только по одному и по порядку.
                        Прокату это не годится: по очереди может идти лодка,
                        а освободиться катамаран. */}
                    <div className={styles.memberList} ref={listRef}>
                        {sortedMembers.map((member: Member) => {
                            const isMine = member.assigned_window_id === windowInfo?.id;
                            return (
                                <MemberCard
                                    key={member.id}
                                    member={member}
                                    statusText={getStatusText(member.status)}
                                    isProcessing={isProcessing}
                                    highlighted={isMine}
                                    dimmed={!!member.assigned_window_id && !isMine}
                                    onCall={callSpecific}
                                    onReturn={returnToQueue}
                                    onCancel={cancelMember}
                                    onFinish={completeService}
                                    onRemove={() => handleRemoveMember(member)}
                                    onStartTimer={startTimer}
                                    onExtendTimer={extendTimer}
                                    onSaveNote={saveNote}
                                />
                            );
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

            {/* В подвале остаётся только вызов следующего — он не дубль
                карточной кнопки: зовёт через call_next_member_to_window,
                который учитывает привязку услуг к окнам. Кнопка на карточке
                вызывает конкретного человека в обход маршрутизации. */}
            <footer className={styles.footer}>
                <div className={`container ${styles.footerActions}`}>
                    <Button onClick={callNext} isLoading={isProcessing} disabled={waitingMembersCount === 0 || queueInfo?.status === 'paused'} className={styles.callNextButton}><PhoneCall size={20} /> Вызвать следующего</Button>
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

export default WindowAdminPage;