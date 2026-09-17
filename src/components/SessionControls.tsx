import { useState, useEffect, useCallback } from 'react';
import { Check, Plus, Timer, ChevronDown } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { useTicker } from '../hooks/useTicker';
import { msUntil, formatClock, formatDuration } from '../utils/clock';
import styles from './SessionControls.module.css';

/**
 * Выдача под таймер — для мест, где обслуживание длится не минуту
 * у стойки: прокат лодок, солярий, картинг. Человек уходит с чем-то
 * на время, и администратору нужно помнить, что именно он выдал
 * и когда это заканчивается.
 *
 * Сознательно без учёта единиц: какая лодка свободна, какая сохнет,
 * какая сломана — это администратор видит глазами. Здесь только
 * свободная пометка и время.
 *
 * Общее для панели окна и для админки с одним окном — иначе тот же
 * экран пришлось бы писать дважды.
 */

const PRESETS = [15, 30, 60];

interface AcceptPanelProps {
    /** Минуты — null, если время не задали: пометка без таймера законна. */
    onAccept: (note: string | null, minutes: number | null) => void | Promise<void>;
    isProcessing: boolean;
    /** Идентификатор вызванного: сменился — форма чистая. */
    resetKey: string | undefined;
    /**
     * Показать форму сразу. Ожидается «есть кто-то на руках»: в поликлинике
     * таких не бывает никогда, и лишние поля там ни к чему; у лодочника
     * после первого же клиента кто-то на воде есть всегда, и форма не
     * требует лишнего нажатия.
     */
    defaultExpanded?: boolean;
}

export function AcceptPanel({ onAccept, isProcessing, resetKey, defaultExpanded = false }: AcceptPanelProps) {
    const [note, setNote] = useState('');
    const [minutes, setMinutes] = useState('');
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    useEffect(() => { setNote(''); setMinutes(''); }, [resetKey]);

    const handleAccept = useCallback(() => {
        const parsed = Number.parseInt(minutes, 10);
        void onAccept(note.trim() || null, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    }, [note, minutes, onAccept]);

    if (!isExpanded) {
        return (
            <button type="button" className={styles.expandButton} onClick={() => setIsExpanded(true)}>
                <Timer size={18} /> Выдать под таймер <ChevronDown size={16} />
            </button>
        );
    }

    return (
        <div className={styles.acceptPanel}>
            <input
                className={styles.noteInput}
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Пометка: катамаран 3, кабина 2…"
                maxLength={60}
            />
            <div className={styles.minutesRow}>
                {PRESETS.map(preset => (
                    <button
                        key={preset}
                        type="button"
                        className={`${styles.minutePreset} ${minutes === String(preset) ? styles.minutePresetActive : ''}`}
                        onClick={() => setMinutes(minutes === String(preset) ? '' : String(preset))}
                    >
                        {preset} мин
                    </button>
                ))}
                <input
                    className={styles.minutesInput}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1440}
                    value={minutes}
                    onChange={event => setMinutes(event.target.value)}
                    placeholder="мин"
                />
            </div>
            <Button onClick={handleAccept} isLoading={isProcessing} className={styles.acceptButton}>
                <Timer size={20} /> Принять
            </Button>
            <p className={styles.acceptHint}>
                Человек останется в списке с таймером. Без минут — просто пометка, время не пойдёт.
            </p>
        </div>
    );
}

export interface SessionMember {
    id: string;
    display_code: string | null;
    member_name: string;
    note: string | null;
    timer_ends_at: string | null;
}

interface SessionListProps {
    members: SessionMember[];
    isProcessing: boolean;
    onExtend: (memberId: string, minutes: number) => void | Promise<void>;
    onFinish: (memberId: string) => void | Promise<void>;
    onSaveNote: (memberId: string, note: string | null) => void | Promise<void>;
}

export function SessionList({ members, isProcessing, onExtend, onFinish, onSaveNote }: SessionListProps) {
    // Гонит обратные отсчёты: значение не нужно, нужна перерисовка.
    useTicker(1000);

    /**
     * Черновики пометок держим отдельно от данных: Realtime перезагружает
     * список на каждое событие, и без черновика набранный текст затирался
     * бы прямо под пальцами.
     */
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const handleBlur = useCallback(async (member: SessionMember) => {
        const draft = drafts[member.id];
        if (draft === undefined) return;
        setDrafts(current => {
            const next = { ...current };
            delete next[member.id];
            return next;
        });
        const cleaned = draft.trim() || null;
        if (cleaned !== (member.note ?? null)) await onSaveNote(member.id, cleaned);
    }, [drafts, onSaveNote]);

    if (members.length === 0) return null;

    return (
        <div className={styles.sessionSection}>
            <h2 className={styles.sessionTitle}>Сейчас на руках</h2>
            <div className={styles.sessionList}>
                {members.map(member => {
                    const left = msUntil(member.timer_ends_at);
                    const isOver = left !== null && left <= 0;
                    return (
                        <Card
                            key={member.id}
                            className={`${styles.sessionCard} ${isOver ? styles.overdueCard : ''}`}
                        >
                            <div className={styles.sessionInfo}>
                                <p className={styles.sessionName}>
                                    {member.display_code} - {member.member_name}
                                </p>
                                <input
                                    className={styles.noteInline}
                                    value={drafts[member.id] ?? member.note ?? ''}
                                    onChange={event => setDrafts(current => ({ ...current, [member.id]: event.target.value }))}
                                    onBlur={() => { void handleBlur(member); }}
                                    placeholder="пометка"
                                    maxLength={60}
                                />
                                {left === null ? (
                                    <p className={styles.noTimer}>Без таймера</p>
                                ) : isOver ? (
                                    <p className={styles.overdueText}>Время вышло {formatDuration(left)} назад</p>
                                ) : (
                                    <p className={styles.timerText}>Осталось {formatClock(left)}</p>
                                )}
                            </div>
                            <div className={styles.sessionActions}>
                                <Button
                                    onClick={() => { void onExtend(member.id, 15); }}
                                    disabled={isProcessing}
                                    className={styles.extendButton}
                                    title="Добавить 15 минут"
                                >
                                    <Plus size={16} /> 15
                                </Button>
                                <Button
                                    onClick={() => { void onFinish(member.id); }}
                                    disabled={isProcessing}
                                    className={styles.finishButton}
                                    title="Закончил с этим участником"
                                >
                                    <Check size={20} />
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
