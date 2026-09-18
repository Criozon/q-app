import { useState, useRef, useEffect, useCallback } from 'react';
import { Timer, MoreVertical } from 'lucide-react';
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
 * Таймер и заметка тоже здесь, но спрятаны за значками и отделены от
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

    /**
     * Меню второстепенных действий. Возврат в очередь и удаление нужны
     * редко, а рядом с «Закончить» только путали: красная кнопка с
     * человечком читалась как «закончить обслуживание».
     */
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    /** Раскрывать вверх, если карточка у нижнего края — иначе меню обрежет. */
    const [menuUp, setMenuUp] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) return;
        const closeOnOutside = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMenuOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isMenuOpen]);

    const toggleMenu = useCallback(() => {
        const box = menuRef.current?.getBoundingClientRect();
        // 160 px — примерная высота меню вместе с отступами.
        if (box) setMenuUp(window.innerHeight - box.bottom < 160);
        setIsMenuOpen(open => !open);
    }, []);

    const runFromMenu = useCallback((action: () => void) => () => {
        setIsMenuOpen(false);
        action();
    }, []);

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

    // Закрытому участнику заметку уже не заводят — только читают,
    // если она осталась.
    const canEditNote = Boolean(onSaveNote) && member.status !== 'serviced';

    // Та же строка целиком — для всплывающей подсказки, когда её подрезало.
    const metaText = [member.note, isOver ? 'Просрочено' : statusText, member.service_name]
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
                Заметка и состояние живут в строке под именем — так они не
                отъедают ширину у кнопок и не делают карточку выше. */}
            <div className={styles.row}>
                <div className={styles.info}>
                    <p className={styles.name}>
                        {member.display_code || `#${member.ticket_number}`} — {member.member_name}
                    </p>
                    {/* Заметка стоит в одной строке со сведениями, а не
                        отдельным блоком. Строка не переносится: не влезло —
                        подрезается многоточием, полностью видно во всплывающей
                        подсказке, а на телефоне — по нажатию, которое открывает
                        ту же заметку на правку. Поэтому кликабельна вся
                        строка: у подрезанной заметки не осталось бы цели
                        под палец. */}
                    <p
                        className={`${styles.meta} ${member.note && canEditNote ? styles.metaClickable : ''}`}
                        title={metaText}
                        onClick={member.note && canEditNote ? openNote : undefined}
                    >
                        <span className={isOver ? styles.metaOverdue : undefined}>
                            {isOver ? 'Просрочено' : statusText}
                        </span>
                        {member.service_name && (
                            <span className={styles.metaService}> · {member.service_name}</span>
                        )}
                    </p>
                </div>

                {/* Заметка — отдельным блоком, а не хвостом служебной строки:
                    её писал человек, и в общей строке она читалась как
                    системная подпись. На широком экране стоит посередине,
                    на телефоне переносится под сведения — так и состояние
                    остаётся видно, и заметке хватает трёх строк. */}
                {member.note && (
                    <p
                        className={`${styles.noteBlock} ${canEditNote ? styles.noteClickable : ''}`}
                        title={member.note}
                        onClick={canEditNote ? openNote : undefined}
                    >
                        {member.note}
                    </p>
                )}

                <div className={styles.marks}>
                    {/* Закрытому время уже не задают: приём окончен, и
                        таймер при этом гасится в базе (миграция 0008). */}
                    {member.status !== 'serviced' && (onStartTimer || onExtendTimer) && (
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
                    {/* Главное действие — подписью, а не значком. Зелёная
                        галочка и красный человечек рядом читались как две
                        стороны одного «закончить». */}
                    {member.status === 'waiting' && onCall && (
                        <button
                            type="button"
                            className={`${styles.primary} ${styles.callPrimary}`}
                            onClick={() => onCall(member.id)}
                            disabled={isProcessing}
                        >
                            Вызвать
                        </button>
                    )}

                    {member.status !== 'waiting' && member.status !== 'serviced' && onFinish && (
                        <button
                            type="button"
                            className={`${styles.primary} ${styles.finishPrimary}`}
                            onClick={() => onFinish(member.id)}
                            disabled={isProcessing}
                        >
                            Закончить
                        </button>
                    )}

                    {(canEditNote || onReturn || onRemove) && (
                        <div className={styles.menuAnchor} ref={menuRef}>
                            <button
                                type="button"
                                className={styles.menuButton}
                                onClick={toggleMenu}
                                disabled={isProcessing}
                                aria-haspopup="menu"
                                aria-expanded={isMenuOpen}
                                title="Ещё"
                            >
                                <MoreVertical size={18} />
                            </button>

                            {isMenuOpen && (
                                <div
                                    className={`${styles.menu} ${menuUp ? styles.menuUp : ''}`}
                                    role="menu"
                                >
                                    {canEditNote && (
                                        <button
                                            type="button"
                                            className={styles.menuItem}
                                            role="menuitem"
                                            onClick={runFromMenu(openNote)}
                                        >
                                            {member.note ? 'Изменить заметку' : 'Сделать заметку'}
                                        </button>
                                    )}
                                    {canReturn && onReturn && (
                                        <button
                                            type="button"
                                            className={styles.menuItem}
                                            role="menuitem"
                                            onClick={runFromMenu(() => onReturn(member.id))}
                                        >
                                            Вернуть в очередь
                                        </button>
                                    )}
                                    {onRemove && (
                                        <button
                                            type="button"
                                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                            role="menuitem"
                                            onClick={runFromMenu(() => onRemove(member.id))}
                                        >
                                            Удалить из очереди
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Не раскрываем карточку, а показываем окно: иначе список
                разъезжается под пальцем и соседние строки уезжают. */}
            <Modal isOpen={modal === 'note'} onClose={() => setModal('none')} title="Заметка">
                <div className={styles.noteModal}>
                    <textarea
                        className={styles.noteInput}
                        value={noteDraft}
                        onChange={event => setNoteDraft(event.target.value)}
                        // Enter сохраняет, перенос строки — Shift+Enter:
                        // заметки короткие, и лишний тап по кнопке не нужен.
                        onKeyDown={event => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                commitNote();
                            }
                        }}
                        placeholder="Катамаран 3, кабина 2…"
                        maxLength={160}
                        rows={3}
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
