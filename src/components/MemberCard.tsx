import { useState, useCallback } from 'react';
import { Check, PhoneCall, Undo2, UserX, Timer, MessageSquare, Plus } from 'lucide-react';
import Card from './Card';
import DurationPicker from './DurationPicker';
import { useTicker } from '../hooks/useTicker';
import { msUntil, formatClock, formatDuration } from '../utils/clock';
import type { MemberStatus } from '../types/domain';
import styles from './MemberCard.module.css';

/**
 * Карточка участника со всем управлением на ней.
 *
 * Раньше действия жили в подвале и относились к «текущему вызванному» —
 * то есть работать можно было только по одному и строго по порядку.
 * Для проката это не годится: по очереди может идти лодка, а освободиться
 * катамаран, и позвать нужно того, кто дальше в списке. Поэтому вызвать,
 * вернуть, завершить и удалить можно у любого участника.
 *
 * Таймер и пометка тоже здесь, но спрятаны за значками: очереди без
 * выдачи они не нужны, а места на карточке немного.
 */

export interface CardMember {
    id: string;
    display_code: string | null;
    ticket_number: number;
    member_name: string;
    service_name: string | null;
    status: MemberStatus;
    note: string | null;
    timer_ends_at: string | null;
}

interface Props {
    member: CardMember;
    /** Подпись состояния: страницы формулируют её по-своему. */
    statusText: string;
    isProcessing: boolean;
    /** Участник у моего окна — выделяем. */
    highlighted?: boolean;
    /** Занят другим окном — приглушаем. */
    dimmed?: boolean;
    onCall?: (memberId: string) => void;
    onReturn?: (memberId: string) => void;
    onFinish?: (memberId: string) => void;
    onRemove?: (memberId: string) => void;
    onStartTimer?: (memberId: string, minutes: number) => void;
    onExtendTimer?: (memberId: string, minutes: number) => void;
    onSaveNote?: (memberId: string, note: string | null) => void;
}

function MemberCard({
    member, statusText, isProcessing, highlighted, dimmed,
    onCall, onReturn, onFinish, onRemove, onStartTimer, onExtendTimer, onSaveNote,
}: Props) {
    // Гонит обратный отсчёт. Значение не нужно — нужна перерисовка.
    useTicker(1000);

    const [openPanel, setOpenPanel] = useState<'none' | 'timer' | 'note'>('none');
    const [noteDraft, setNoteDraft] = useState<string | null>(null);

    const left = msUntil(member.timer_ends_at);
    const isOver = left !== null && left <= 0;
    const isRunning = member.status === 'in_service';
    const canReturn = member.status !== 'waiting' && member.status !== 'serviced';

    const commitNote = useCallback(() => {
        if (noteDraft === null) return;
        const cleaned = noteDraft.trim() || null;
        setNoteDraft(null);
        setOpenPanel('none');
        if (cleaned !== (member.note ?? null)) onSaveNote?.(member.id, cleaned);
    }, [noteDraft, member.id, member.note, onSaveNote]);

    const handleTimer = useCallback((minutes: number) => {
        setOpenPanel('none');
        if (isRunning) onExtendTimer?.(member.id, minutes);
        else onStartTimer?.(member.id, minutes);
    }, [isRunning, member.id, onExtendTimer, onStartTimer]);

    const cardClasses = [
        styles.card,
        highlighted && member.status === 'called' && styles.called,
        highlighted && member.status === 'called' && 'called-animation',
        highlighted && member.status === 'acknowledged' && styles.acknowledged,
        isRunning && styles.inService,
        isRunning && isOver && styles.overdue,
        member.status === 'serviced' && styles.serviced,
        dimmed && styles.dimmed,
    ].filter(Boolean).join(' ');

    return (
        <Card id={`member-${member.id}`} className={cardClasses}>
            <div className={styles.info}>
                <p className={styles.name}>
                    {member.display_code || `#${member.ticket_number}`} — {member.member_name}
                </p>
                {member.service_name && <p className={styles.service}>{member.service_name}</p>}
                <p className={styles.status}>{statusText}</p>
            </div>

            {isRunning && isOver && (
                <p className={styles.overdueLine}>Время вышло {formatDuration(left)} назад</p>
            )}

            {openPanel === 'note' && (
                <input
                    className={styles.noteInput}
                    value={noteDraft ?? ''}
                    onChange={event => setNoteDraft(event.target.value)}
                    onBlur={commitNote}
                    onKeyDown={event => { if (event.key === 'Enter') commitNote(); }}
                    placeholder="Катамаран 3, кабина 2…"
                    maxLength={60}
                    autoFocus
                />
            )}

            {openPanel === 'timer' && (
                <DurationPicker
                    confirmLabel={isRunning ? 'Добавить' : 'Запустить'}
                    onConfirm={handleTimer}
                    onCancel={() => setOpenPanel('none')}
                    isProcessing={isProcessing}
                />
            )}

            {/* Отметки и действия в одном ряду, но с переносом: на узком
                экране пометка с таймером занимают строку целиком, и кнопки
                уезжают вниз — лучше, чем сплющенное в три строки имя. */}
            <div className={styles.controls}>
                <div className={styles.marks}>
                    {onSaveNote && (
                        member.note ? (
                            <button
                                type="button"
                                className={styles.noteChip}
                                onClick={() => { setNoteDraft(member.note ?? ''); setOpenPanel('note'); }}
                                title="Изменить пометку"
                            >
                                {member.note}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={styles.markButton}
                                onClick={() => { setNoteDraft(''); setOpenPanel('note'); }}
                                title="Добавить пометку"
                            >
                                <MessageSquare size={18} />
                            </button>
                        )
                    )}

                    {(onStartTimer || onExtendTimer) && (
                        left === null ? (
                            <button
                                type="button"
                                className={styles.markButton}
                                onClick={() => setOpenPanel(openPanel === 'timer' ? 'none' : 'timer')}
                                title="Задать время"
                            >
                                <Timer size={18} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={`${styles.timerChip} ${isOver ? styles.timerChipOver : ''}`}
                                onClick={() => setOpenPanel(openPanel === 'timer' ? 'none' : 'timer')}
                                title="Добавить время"
                            >
                                {isOver
                                    ? `−${formatDuration(left)}`
                                    : formatClock(left)}
                                <Plus size={14} />
                            </button>
                        )
                    )}
                </div>

                <div className={styles.actions}>
                    {canReturn && onReturn && (
                        <button
                            type="button"
                            className={`${styles.action} ${styles.returnAction}`}
                            onClick={() => onReturn(member.id)}
                            disabled={isProcessing}
                            title="Вернуть в очередь"
                        >
                            <Undo2 size={18} />
                        </button>
                    )}

                    {member.status === 'waiting' && onCall && (
                        <button
                            type="button"
                            className={`${styles.action} ${styles.callAction}`}
                            onClick={() => onCall(member.id)}
                            disabled={isProcessing}
                            title="Вызвать"
                        >
                            <PhoneCall size={18} />
                        </button>
                    )}

                    {member.status !== 'waiting' && member.status !== 'serviced' && onFinish && (
                        <button
                            type="button"
                            className={`${styles.action} ${styles.finishAction}`}
                            onClick={() => onFinish(member.id)}
                            disabled={isProcessing}
                            title="Завершить"
                        >
                            <Check size={18} />
                        </button>
                    )}

                    {onRemove && (
                        <button
                            type="button"
                            className={`${styles.action} ${styles.removeAction}`}
                            onClick={() => onRemove(member.id)}
                            disabled={isProcessing}
                            title="Удалить участника"
                        >
                            <UserX size={18} />
                        </button>
                    )}
                </div>
            </div>
        </Card>
    );
}

export default MemberCard;
