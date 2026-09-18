import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Settings, QrCode, PauseCircle, PlayCircle, Users, Share2, Link2, Check, Info, PhoneCall, Plus, Trash2, Home, Megaphone, BarChart3, Send, RefreshCw } from 'lucide-react';
import { useQueue } from '../hooks/useQueue';
import * as service from '../services/supabaseService';
import { useMyQueues } from '../hooks/useMyQueues';

import Card from '../components/Card';
import Section from '../components/Section';
import Modal from '../components/Modal';
import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import InstructionCard from '../components/InstructionCard';
import Input from '../components/Input';
import ServiceRow from '../components/ServiceRow';
import NumberStepper from '../components/NumberStepper';
import homeStyles from './HomePage.module.css';
import MemberCard from '../components/MemberCard';
import { byWorkOrder } from '../utils/memberOrder';
import styles from './AdminPage.module.css';
import log from '../utils/logger';
import type { ConfirmationState, ServiceDraft, QueueStats, Announcement, AdminMember, WindowWithServices } from '../types/domain';

const PAGE_SOURCE = 'MasterAdminPage';

function AdminPage() {
    const {
      queue, members, windows, services, loading, error, errorKind, qrCodeUrl, joinUrl,
      waitingMembersCount, setQueue, loadQueueData
    } = useQueue();

    const navigate = useNavigate();
    const location = useLocation();
    const [, setMyQueues] = useMyQueues();
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedWindow, setSelectedWindow] = useState<WindowWithServices | null>(null);
    const [windowQrCode, setWindowQrCode] = useState('');
    const [confirmation, setConfirmation] = useState<ConfirmationState>({ isOpen: false });
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [announcementDraft, setAnnouncementDraft] = useState('');
    const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [isStatsOpen, setIsStatsOpen] = useState(false);

    const [newServiceName, setNewServiceName] = useState('');
    const [isAddingService, setIsAddingService] = useState(false);
    const lastServiceInputRef = useRef(null);
    
    const [editableServices, setEditableServices] = useState<ServiceDraft[]>([]);
    const [initialServicesState, setInitialServicesState] = useState<ServiceDraft[]>([]);
    const [desiredWindowCount, setDesiredWindowCount] = useState(0);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    
    useEffect(() => {
        if (isSettingsModalOpen) {
            if (services && windows) {
                const servicesWithIndices = services.map(service => {
                    const assignedWindowIndices = windows
                        .filter(win => win.window_services.some(ws => ws.service_id === service.id))
                        .map(win => parseInt(win.name.split(' ')[1]));
                    return { ...service, window_indices: assignedWindowIndices };
                });
                setEditableServices(servicesWithIndices);
                setInitialServicesState(JSON.parse(JSON.stringify(servicesWithIndices)));
            }
            if (windows) {
                setDesiredWindowCount(windows.length);
            }
        }
    }, [isSettingsModalOpen, services, windows]);
    
    const handleAddService = async () => {
        if (!newServiceName.trim()) return toast.error('Название услуги не может быть пустым.');
        setIsAddingService(true);
        try {
            const { data } = await service.addService(queue!.id, newServiceName.trim());
            setEditableServices(prev => [...prev, { ...data, window_indices: [] }]);
            setNewServiceName('');
        } catch {
            toast.error('Не удалось добавить услугу.');
        } finally {
            setIsAddingService(false);
        }
    };
    
    const handleRemoveService = (serviceIdToRemove: string) => {
        setEditableServices(prev => prev.filter(s => s.id !== serviceIdToRemove));
    };

    const handleUpdateEditableService = (updatedService: ServiceDraft) => {
        setEditableServices(prev => prev.map(s => s.id === updatedService.id ? updatedService : s));
    };
    
    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        const toastId = toast.loading('Сохраняем настройки...');
        
        try {
            let freshWindows = windows; 
            const newWindowsToAdd = desiredWindowCount - windows.length;
            if (newWindowsToAdd > 0) {
                await service.addWindowsToQueue(queue!.id, newWindowsToAdd);
                const { data } = await service.getWindowsByQueueId(queue!.id);
                freshWindows = data;
            }

            const assignmentPromises = editableServices.map(finalService => {
                const initialService = initialServicesState.find(s => s.id === finalService.id);
                if (!initialService || JSON.stringify(initialService.window_indices) !== JSON.stringify(finalService.window_indices)) {
                    const windowIds = finalService.window_indices
                        .map(index => freshWindows.find(w => w.name === `Окно ${index}`)?.id)
                        .filter((id): id is string => Boolean(id));
                    return service.updateServiceWindowAssignments(finalService.id, windowIds);
                }
                return Promise.resolve();
            });

            const deletedServicePromises = initialServicesState
                .filter(initialService => !editableServices.some(finalService => finalService.id === initialService.id))
                .map(deletedService => service.removeService(deletedService.id));

            await Promise.all([...assignmentPromises, ...deletedServicePromises]);
            
            toast.success('Настройки успешно сохранены!', { id: toastId });
        } catch {
            toast.error('Не удалось сохранить настройки.', { id: toastId });
        } finally {
            await loadQueueData();
            setIsSavingSettings(false);
            setIsSettingsModalOpen(false);
        }
    };
    
    const isSimpleMode = useMemo(() => windows.length === 1, [windows]);
    useEffect(() => { if (queue && !loading) { setMyQueues(prevQueues => { const queueExists = prevQueues.some(q => q.id === queue.id); if (queueExists) return prevQueues; return [{ id: queue.id, name: queue.name, admin_secret_key: queue.admin_secret_key }, ...prevQueues]; }); if (location.state?.fromCreation && !isJoinModalOpen) { setIsJoinModalOpen(true); navigate(location.pathname, { replace: true, state: {} }); } } }, [queue, loading, location.state, navigate, setMyQueues, isJoinModalOpen]);
    const handleToggleQueueStatus = useCallback(async () => { if (!queue) return; const originalStatus = queue.status; const newStatus = originalStatus === 'active' ? 'paused' : 'active'; const actionText = newStatus === 'paused' ? 'приостановлена' : 'возобновлена'; setQueue(prevQueue => (prevQueue ? { ...prevQueue, status: newStatus } : prevQueue)); try { await service.updateQueueStatus(queue.id, newStatus); toast.success(`Запись в очередь ${actionText}.`); } catch { toast.error("Не удалось изменить статус очереди."); setQueue(prevQueue => (prevQueue ? { ...prevQueue, status: originalStatus } : prevQueue)); } }, [queue, setQueue]);
    // Все четыре — через try/finally. Сервисный слой при ошибке БРОСАЕТ,
    // поэтому без finally строка setIsProcessing(false) просто не
    // выполнялась: одна неудачная сеть — и кнопки админки оставались
    // заблокированными до перезагрузки страницы.
    const callMember = useCallback(async (memberId: string, windowId: string) => {
        setIsProcessing(true);
        try {
            await service.callSpecificMember(memberId, windowId);
        } catch {
            toast.error('Не удалось вызвать участника.');
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const completeService = useCallback(async (memberId: string) => {
        setIsProcessing(true);
        try {
            await service.updateMemberStatus(memberId, 'serviced');
        } catch {
            toast.error('Не удалось завершить обслуживание.');
        } finally {
            setIsProcessing(false);
        }
    }, []);

    // Выдача под таймер: очередь с одним окном ведётся прямо отсюда,
    // и лодочнику незачем открывать отдельную панель окна. Окно передаём,
    // когда оно одно — иначе принятый не попадёт в панель этого окна.
    const startTimer = useCallback(async (memberId: string, minutes: number) => {
        setIsProcessing(true);
        try {
            const windowId = windows.length === 1 ? windows[0].id : null;
            await service.startMemberSession(memberId, null, minutes, windowId);
        } catch {
            toast.error('Не удалось запустить время.');
        } finally {
            setIsProcessing(false);
        }
    }, [windows]);

    const extendTimer = useCallback(async (memberId: string, minutes: number) => {
        setIsProcessing(true);
        try {
            await service.extendMemberTimer(memberId, minutes);
        } catch {
            toast.error('Не удалось продлить время.');
        } finally {
            setIsProcessing(false);
        }
    }, []);

    // Без setIsProcessing: заметку правят прямо в карточке, блокировать
    // из-за неё остальные кнопки незачем.
    const saveNote = useCallback(async (memberId: string, note: string | null) => {
        try {
            await service.updateMemberNote(memberId, note);
        } catch {
            toast.error('Не удалось сохранить заметку.');
        }
    }, []);

    const returnToQueue = useCallback(async (memberId: string) => {
        setIsProcessing(true);
        try {
            await service.returnMemberToWaiting(memberId);
        } catch {
            toast.error('Не удалось вернуть участника в очередь.');
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const callNextInSimpleMode = useCallback(async () => {
        if (windows.length !== 1) return;
        setIsProcessing(true);
        try {
            await service.callNextMemberToWindow(windows[0].id);
        } catch {
            toast.error('Не удалось вызвать следующего.');
        } finally {
            setIsProcessing(false);
        }
    }, [windows]);
    
    // --- ИЗМЕНЕНИЕ: Генерируем ссылку с short_key ---
    const handleOpenWindowModal = useCallback(async (win: WindowWithServices) => {
        setSelectedWindow(win);
        const adminLink = `${window.location.origin}/window-admin/${win.short_key}`;
        try {
            const qr = await QRCode.toDataURL(adminLink, { width: 300, margin: 2 });
            setWindowQrCode(qr);
        } catch (err) {
            log(PAGE_SOURCE, "Ошибка генерации QR для админа окна", err);
            setWindowQrCode('');
        }
    }, []);

    const handleCloseWindowModal = useCallback(() => { setSelectedWindow(null); setWindowQrCode(''); }, []);

    // Объявления — односторонний канал к ожидающим. Ровно то, чего не умеют
    // аппаратные системы: они показывают только номера.
    const loadAnnouncements = useCallback(async () => {
        if (!queue) return;
        try {
            const { data } = await service.getAnnouncements(queue.id);
            setAnnouncements(data || []);
        } catch (err) {
            log(PAGE_SOURCE, 'Не удалось загрузить объявления', err);
        }
    }, [queue]);

    useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

    const handlePostAnnouncement = useCallback(async () => {
        const body = announcementDraft.trim();
        if (!body) return;
        setIsPostingAnnouncement(true);
        try {
            const { error } = await service.postAnnouncement(queue!.id, body);
            if (error) throw error;
            setAnnouncementDraft('');
            await loadAnnouncements();
            toast.success('Объявление отправлено всем ожидающим.');
        } catch {
            toast.error('Не удалось отправить объявление.');
        } finally {
            setIsPostingAnnouncement(false);
        }
    }, [announcementDraft, queue, loadAnnouncements]);

    const handleDeleteAnnouncement = useCallback(async (id: string) => {
        try {
            await service.deleteAnnouncement(id);
            await loadAnnouncements();
        } catch {
            toast.error('Не удалось удалить объявление.');
        }
    }, [loadAnnouncements]);

    const handleOpenStats = useCallback(async () => {
        setIsStatsOpen(true);
        try {
            const { data } = await service.getQueueStats(queue!.id);
            setStats(data);
        } catch {
            toast.error('Не удалось загрузить итоги.');
        }
    }, [queue]);
    const handleRemoveMember = useCallback((member: AdminMember) => { setConfirmation({ isOpen: true, title: 'Удалить участника?', message: <p>Вы уверены, что хотите удалить <strong>{member.member_name} ({member.display_code})</strong> из очереди?</p>, confirmText: 'Да, удалить', isDestructive: true, onConfirm: async () => { await service.deleteMember(member.id); toast.success(`Участник ${member.member_name} удален.`);},});}, []);
    const handleDeleteCurrentQueue = useCallback(() => { if (!queue) return; setConfirmation({ isOpen: true, title: 'Удалить очередь?', message: <p>Вы уверены, что хотите удалить очередь <strong>"{queue.name}"</strong>? Это действие необратимо.</p>, confirmText: 'Да, удалить', isDestructive: true, onConfirm: () => { const toastId = toast.loading(`Удаляем очередь "${queue.name}"...`); service.deleteQueue(queue.id).then(({error}) => { if (error) toast.error(`Не удалось удалить очередь "${queue.name}".`, { id: toastId }); else { setMyQueues(prev => prev.filter(q => q.id !== queue.id)); toast.success(`Очередь "${queue.name}" удалена.`, { id: toastId }); navigate('/'); } }); } }); }, [queue, navigate, setMyQueues]);
    const handleShare = useCallback(async (shareData: ShareData & { key?: string }) => { if (navigator.share) { try { await navigator.share(shareData); } catch (err) { log(PAGE_SOURCE, 'Ошибка Web Share API:', err); } } else { navigator.clipboard.writeText(shareData.url ?? '').then(() => { setCopiedKey(shareData.key ?? null); setTimeout(() => setCopiedKey(null), 2000); }).catch(() => toast.error("Не удалось скопировать ссылку.")); } }, []);
    const getStatusText = useCallback((member: AdminMember) => { switch (member.status) { case 'called': return isSimpleMode ? 'Вызывается' : `Вызывается в: ${member.window_name?.name || '...'}`; case 'acknowledged': return isSimpleMode ? 'Идет к окну' : `Идет в: ${member.window_name?.name || '...'}`; case 'in_service': return 'Идёт обслуживание'; case 'serviced': return 'Обслужен'; default: return 'Ожидает'; } }, [isSimpleMode]);
    // Сверху то, что требует внимания: горящие таймеры, потом вызванные.
    const sortedMembers = useMemo(() => members.slice().sort(byWorkOrder), [members]);

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner /></div>;
    // Сетевой сбой раньше показывался как «очередь не найдена» — человек
    // решал, что потерял очередь, хотя она на месте. Теперь причины разведены.
    if (error) return (
        <div className={`container ${styles.pageWrapper}`} style={{ paddingTop: '60px', textAlign: 'center' }}>
            <div className={styles.emptyState}>
                {errorKind === 'network' ? (
                    <>
                        <h3 className={styles.emptyStateTitle}>Нет связи с сервером</h3>
                        <p className={styles.emptyStateText}>
                            Очередь никуда не делась — не удалось до неё достучаться.
                            Проверьте соединение и попробуйте ещё раз.
                        </p>
                        <Button onClick={() => { void loadQueueData(true); }} className={styles.emptyStateButton}>
                            <RefreshCw size={18} />Попробовать снова
                        </Button>
                    </>
                ) : (
                    <>
                        <h3 className={styles.emptyStateTitle}>Очередь не найдена</h3>
                        <p className={styles.emptyStateText}>Возможно, она была удалена или вы перешли по неверной ссылке.</p>
                        <Button onClick={() => navigate('/')} className={styles.emptyStateButton}>
                            <Home size={18} />Вернуться на главную
                        </Button>
                    </>
                )}
            </div>
        </div>
    );


    return (
        <div className={styles.pageWrapper}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div className={styles.leftActions}>
                            <button onClick={() => setIsSettingsModalOpen(true)} className={styles.controlButton} title="Настройки услуг и окон"><Settings size={22} color="var(--accent-blue)" /></button>
                            <button onClick={handleOpenStats} className={styles.controlButton} title="Итоги очереди"><BarChart3 size={22} color="var(--accent-blue)" /></button>
                            <button onClick={handleDeleteCurrentQueue} className={`${styles.controlButton} ${styles.deleteButton}`} title="Удалить очередь"><Trash2 size={22} /></button>
                        </div>
                        <div className={styles.headerCenter}>
                            <h1 className={styles.headerTitle}>{queue?.name}</h1>
                            <div className={styles.queueCount}><div className={`${styles.statusIndicator} ${queue?.status === 'paused' ? styles.statusIndicatorPaused : ''}`}></div><span>{queue?.status === 'active' ? 'Активна' : 'Пауза'} | В очереди: {waitingMembersCount}</span></div>
                        </div>
                        <div className={styles.rightActions}>
                            <button onClick={handleToggleQueueStatus} className={styles.controlButton} title={queue?.status === 'active' ? 'Приостановить запись' : 'Возобновить запись'}>{queue?.status === 'active' ? <PauseCircle size={24} color="#ff9500" /> : <PlayCircle size={24} color="var(--accent-green)" />}</button>
                            <button onClick={() => setIsJoinModalOpen(true)} className={styles.controlButton} title="Показать QR-код и ссылку для входа"><QrCode size={24} color="var(--accent-blue)" /></button>
                        </div>
                    </div>
                </div>
            </header>
            
            <main className={`container ${styles.mainContent}`}>
                {!isSimpleMode && (
                    <Section title="Панели операторов">
                        <InstructionCard icon={<Info size={20} />} title="Раздайте доступы операторам">Кликните по карточке, чтобы открыть панель окна для себя, или нажмите "Поделиться", чтобы отправить ссылку.</InstructionCard>
                        <div className={styles.windowsList}>{windows.map(win => (
                            <div key={win.id} className={styles.windowItemContainer}>
                                <Link to={`/window-admin/${win.short_key}`} target="_blank" rel="noopener noreferrer" className={styles.windowLink} title={`Открыть панель для "${win.name}"`}>
                                    <Card className={styles.windowCard}><div className={styles.windowInfo}><Link2 size={20} className={styles.windowIcon} /><p className={styles.windowName}>{win.name}</p></div></Card>
                                </Link>
                                <Button onClick={() => handleOpenWindowModal(win)} className={styles.copyButton} title={`Поделиться доступом для "${win.name}"`}><Share2 size={18} /></Button>
                            </div>
                        ))}</div>
                    </Section>
                )}
                <Section title="Объявление для очереди">
                    <Card className={styles.announcePanel}>
                        <p className={styles.announceHint}>
                            Сообщение увидят все, кто ждёт прямо сейчас — например, что приём задерживается.
                        </p>
                        <div className={styles.announceRow}>
                            <Input
                                placeholder="Врач задерживается на 15 минут"
                                value={announcementDraft}
                                maxLength={500}
                                onChange={(e) => setAnnouncementDraft(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handlePostAnnouncement()}
                            />
                            <Button
                                onClick={handlePostAnnouncement}
                                isLoading={isPostingAnnouncement}
                                disabled={!announcementDraft.trim()}
                                className={styles.announceButton}
                                title="Отправить объявление"
                            >
                                <Send size={18} />
                            </Button>
                        </div>
                        {announcements.length > 0 && (
                            <div className={styles.announceList}>
                                {announcements.map(a => (
                                    <div key={a.id} className={styles.announceItem}>
                                        <Megaphone size={16} />
                                        <span>{a.body}</span>
                                        <button
                                            className={styles.announceDelete}
                                            onClick={() => handleDeleteAnnouncement(a.id)}
                                            title="Удалить объявление"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </Section>

                <Section title="Общая очередь">
                    {/* Всё управление — на карточках: отдельные кнопки внизу
                        относились к «текущему вызванному» и не давали работать
                        выборочно. По очереди может идти лодка, а освободиться
                        катамаран — и позвать нужно того, кто дальше. */}
                    <div className={styles.memberList}>
                        {sortedMembers.length > 0 ? sortedMembers.map(member => (
                            <MemberCard
                                key={member.id}
                                member={{
                                    id: member.id,
                                    display_code: member.display_code,
                                    ticket_number: member.ticket_number,
                                    member_name: member.member_name,
                                    // В админке связи приходят объектами из
                                    // PostgREST-embed, карточке нужна строка.
                                    service_name: member.service_name?.name ?? null,
                                    status: member.status,
                                    note: member.note,
                                    timer_ends_at: member.timer_ends_at,
                                }}
                                statusText={getStatusText(member)}
                                isProcessing={isProcessing}
                                highlighted
                                onCall={isSimpleMode ? (id) => callMember(id, windows[0].id) : undefined}
                                onReturn={returnToQueue}
                                onFinish={completeService}
                                onRemove={() => handleRemoveMember(member)}
                                onStartTimer={startTimer}
                                onExtendTimer={extendTimer}
                                onSaveNote={saveNote}
                            />
                        )) : (
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
                <footer className={styles.footer}><div className={`container ${styles.footerActions}`}><Button onClick={callNextInSimpleMode} isLoading={isProcessing} disabled={waitingMembersCount === 0 || queue?.status === 'paused'} className={styles.callNextButton}><PhoneCall size={20} /> Вызвать следующего</Button></div></footer>
            )}

            <Modal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)}><div className={styles.modalContent}><p className={styles.modalInstruction}>Поделитесь QR-кодом или ссылкой, чтобы люди могли присоединиться.</p>{qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className={styles.qrImage} /> : <Spinner />}<p className={styles.joinLink}>{joinUrl || 'Генерация ссылки...'}</p><Button onClick={() => handleShare({url: joinUrl, title: `Вход в очередь: ${queue?.name}`, text: 'Отсканируйте QR или перейдите по ссылке, чтобы войти в очередь.', key: 'join-link' })}>{copiedKey === 'join-link' ? <><Check size={18} /> Скопировано!</> : <><Share2 size={18} /> Поделиться</>}</Button></div></Modal>
            
            <Modal isOpen={!!selectedWindow} onClose={handleCloseWindowModal} title={`Доступ для "${selectedWindow?.name}"`} backdropClassName={styles.adminModalBackdrop}>
                {selectedWindow && (
                <div className={styles.modalContent}>
                    {windowQrCode ? <img src={windowQrCode} alt={`QR для ${selectedWindow.name}`} className={styles.qrImage} /> : <Spinner />}
                    {/* --- ИЗМЕНЕНИЕ: Генерируем ссылку с short_key --- */}
                    <p className={styles.joinLink}>{`${window.location.origin}/window-admin/${selectedWindow.short_key}`}</p>
                    <Button className={styles.adminShareButton} onClick={() => handleShare({ url: `${window.location.origin}/window-admin/${selectedWindow.short_key}`, title: `Доступ к управлению: ${selectedWindow.name}`, text: `Ссылка для входа в панель управления очередью для "${selectedWindow.name}"`, key: selectedWindow.id })}>
                        {copiedKey === selectedWindow.id ? <><Check size={18} /> Скопировано!</> : <><Share2 size={18} /> Поделиться доступом</>}
                    </Button>
                </div>)}
            </Modal>
            
            <Modal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} title="Итоги очереди">
                {!stats ? <Spinner /> : (
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}><span>Обслужено</span><strong>{stats.served_total}</strong></div>
                        <div className={styles.statItem}><span>Сейчас ждут</span><strong>{stats.waiting_now}</strong></div>
                        <div className={styles.statItem}><span>Средний приём</span><strong>{stats.avg_service_minutes != null ? `${stats.avg_service_minutes} мин` : '—'}</strong></div>
                        <div className={styles.statItem}><span>Среднее ожидание</span><strong>{stats.avg_wait_minutes != null ? `${stats.avg_wait_minutes} мин` : '—'}</strong></div>
                        <div className={styles.statItem}><span>Отложили вызов</span><strong>{stats.deferred_total}</strong></div>
                        {/* Час пика приходит моментом времени — форматируем в поясе смотрящего */}
                        <div className={styles.statItem}><span>Пик нагрузки</span><strong>{stats.peak_hour_at ? new Date(stats.peak_hour_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div>
                        {stats.by_window?.length > 1 && (
                            <div className={styles.statsByWindow}>
                                <h4>По окнам</h4>
                                {stats.by_window.map(w => (
                                    <div key={w.window_name} className={styles.statRow}>
                                        <span>{w.window_name}</span>
                                        <span>{w.served} чел.{w.avg_minutes != null ? ` · ${w.avg_minutes} мин` : ''}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal isOpen={isSettingsModalOpen} onClose={handleSaveSettings} title="Настройки очереди">
                <Card className={homeStyles.form}>
                    <div className={homeStyles.formRow}>
                      <label className={homeStyles.formLabel}>Количество окон</label>
                      <NumberStepper 
                        value={desiredWindowCount}
                        onChange={setDesiredWindowCount}
                        min={windows.length}
                        max={20}
                      />
                    </div>
                    
                    <div className={homeStyles.serviceSection}>
                      <p className={homeStyles.serviceHelpText}>
                        Здесь можно добавить или удалить услуги, а также выбрать окна, в которых они доступны.
                      </p>
                      <div className={homeStyles.serviceRowsContainer}>
                          {editableServices.map((service, index) => (
                            <ServiceRow
                                key={service.id}
                                service={service}
                                onUpdate={handleUpdateEditableService}
                                onRemove={() => handleRemoveService(service.id)}
                                windowCount={desiredWindowCount}
                                ref={index === editableServices.length - 1 ? lastServiceInputRef : null}
                            />
                          ))}
                      </div>
                      <div className={styles.addServiceForm}>
                        <Input placeholder="Название новой услуги" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddService()} />
                        <Button onClick={handleAddService} isLoading={isAddingService}><Plus size={18} /></Button>
                      </div>
                    </div>
                    <Button onClick={handleSaveSettings} isLoading={isSavingSettings} className={styles.saveSettingsButton}>
                      Сохранить и закрыть
                    </Button>
                </Card>
            </Modal>

            <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation(prev => ({...prev, isOpen: false}))} onConfirm={confirmation.onConfirm} title={confirmation.title} confirmText={confirmation.confirmText} isDestructive={confirmation.isDestructive} onCancelAction={confirmation.onCancelAction}>{confirmation.message}</ConfirmationModal>
        </div>
    );
}

export default AdminPage;