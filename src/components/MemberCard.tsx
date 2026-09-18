import { useState, useCallback } from 'react';
import { Check, PhoneCall, Undo2, UserX, Timer, MessageSquare } from 'lucide-react';
import Card from './Card';
import Modal from './Modal';
import Button from './Button';
import DurationPicker from './DurationPicker';
import { useTicker } from '../hooks/useTicker';
import { msUntil, formatClockShort, formatDuration } from '../utils/clock';
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
 * Таймер и пометка тоже здесь, но спрятаны за значками и отделены от
 * кнопок управления: очереди без выдачи они не нужны, а места в строке
 * немного. Открываются модальным окном, а не раскрытием карточки —
 * иначе список прыгал бы под пальцем.
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

    const [modal, setModal] = useState<'none' | 'timer' | 'note'>('none');
    const [noteDraft, setNoteDraft] = useState('');

    const left = msUntil(member.timer_ends_at);
    const isOver = left !== null && left <= 0;
    const isRunning = member.status === 'in_service';
    const canReturn = member.status !== 'waiting' && member.status !== 'serviced';

    const openNote = useCallback(() => {
        setNoteDraft(member.note ?? '');
        setModal('note');
    }, [member.note]);

    const commitNote = useCallback(() => {
        const cleaned = noteDraft.trim() || null;
        setModal('none');
        if (cleaned !== (member.note ?? null)) onSaveNote?.(member.id, cleaned);
    }, [noteDraft, member.id, member.note, onSaveNote]);

    const handleTimer = useCallback((minutes: number) => {
        setModal('none');
        if (isRunning) onExtendTimer?.(member.id, minutes);
        else onStartTimer?.(member.id, minutes);
    }, [isRunning, member.id, onExtendTimer, onStartTimer]);

    // Та же строка целиком — для всплывающей подсказки, когда её подрезало.
    const metaText = [isOver ? 'Просрочено' : statusText, member.service_name, member.note]
        .filter(Boolean).join(' · ');

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
            {/* Одна строка: слева сведения, справа отметки и действия.
                Пометка и состояние живут в строке под именем — так они не
                отъедают ширину у кнопок и не делают карточку выше. */}
            <div className={styles.row}>
                <div className={styles.info}>
                    <p className={styles.name}>
                        {member.display_code || `#${member.ticket_number}`} — {member.member_name}
                    </p>
                    {/* Пометка стоит в одной строке со сведениями, а не
                        отдельным блоком. Строка не переносится: не влезло —
                        подрезается многоточием, полностью видно во всплывающей
                        подсказке, а на телефоне — по нажатию, которое открывает
                        ту же пометку на правку. Поэтому кликабельна вся
                        строка: у подрезанной пометки не осталось бы цели
                        под палец. */}
                    <p
                        className={`${styles.meta} ${member.note && onSaveNote ? styles.metaClickable : ''}`}
                        title={metaText}
                        onClick={member.note && onSaveNote ? openNote : undefined}
                    >
                        <span className={isOver ? styles.metaOverdue : undefined}>
                            {isOver ? 'Просрочено' : statusText}
                        </span>
                        {member.service_name && (
                            <span className={styles.metaService}> · {member.service_name}</span>
                        )}
                        {member.note && (
                            <span className={styles.metaNote}> · {member.note}</span>
                        )}
                    </p>
                </div>

                <div className={styles.marks}>
                    {/* Значок пометки нужен, только пока её нет: дальше
                        пометка редактируется прямо в строке под именем. */}
                    {onSaveNote && !member.note && (
                        <button
                            type="button"
                            className={styles.markButton}
                            onClick={openNote}
                            title="Добавить пометку"
                        >
                            <MessageSquare size={17} />
                        </button>
                    )}

                    {(onStartTimer || onExtendTimer) && (
                        left === null ? (
                            <button
                                type="button"
                                className={styles.markButton}
                                onClick={() => setModal('timer')}
                                title="Задать время"
                            >
                                <Timer size={17} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={`${styles.timerChip} ${isOver ? styles.timerChipOver : ''}`}
                                onClick={() => setModal('timer')}
                                title="Добавить время"
                            >
                                {isOver ? `−${formatDuration(left)}` : formatClockShort(left)}
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
                            <Undo2 size={17} />
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
                            <PhoneCall size={17} />
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
                            <Check size={17} />
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
                            <UserX size={17} />
                        </button>
                    )}
                </div>
            </div>

            {/* Не раскрываем карточку, а показываем окно: иначе список
                разъезжается под пальцем и соседние строки уезжают. */}
            <Modal isOpen={modal === 'note'} onClose={() => setModal('none')} title="Пометка">
                <div className={styles.noteModal}>
                    <input
                        className={styles.noteInput}
                        value={noteDraft}
                        onChange={event => setNoteDraft(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') commitNote(); }}
                        placeholder="Катамаран 3, кабина 2…"
                        maxLength={60}
                        autoFocus
                    />
                    <Button onClick={commitNote} className={styles.noteSave}>Сохранить</Button>
                </div>
            </Modal>

            <Modal
                isOpen={modal === 'timer'}
                onClose={() => setModal('none')}
                title={isRunning ? 'Добавить время' : 'Сколько времени'}
            >
                <DurationPicker
                    confirmLabel={isRunning ? 'Добавить' : 'Запустить'}
                    onConfirm={handleTimer}
                    isProcessing={isProcessing}
                />
            </Modal>
        </Card>
    );
}

export default MemberCard;
