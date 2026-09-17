import { useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import Button from './Button';
import { formatDuration } from '../utils/clock';
import styles from './MemberCard.module.css';

/**
 * Набор длительности кнопками прибавления.
 *
 * Готовых пресетов (15/30/60) здесь не хватало: солярий продаёт минуты,
 * лодку берут на десятки минут, место в кемпинге — на часы. Один набор
 * на все три случая не подобрать, поэтому длительность набирается.
 *
 * По самому числу можно ударить и ввести точное значение — иначе восемь
 * минут для солярия набирались бы восемью нажатиями.
 */

const STEPS = [
    { label: '+1 ч', minutes: 60 },
    { label: '+10 мин', minutes: 10 },
    { label: '+1 мин', minutes: 1 },
];

const MAX_MINUTES = 24 * 60;

interface Props {
    /** Подпись кнопки подтверждения: запуск или добавление к идущему. */
    confirmLabel: string;
    onConfirm: (minutes: number) => void;
    onCancel: () => void;
    isProcessing: boolean;
    /** Начальное значение: при добавлении удобно начинать не с нуля. */
    initialMinutes?: number;
}

function DurationPicker({ confirmLabel, onConfirm, onCancel, isProcessing, initialMinutes = 0 }: Props) {
    const [minutes, setMinutes] = useState(initialMinutes);
    const [isTyping, setIsTyping] = useState(false);

    const add = useCallback((delta: number) => {
        setMinutes(current => Math.min(MAX_MINUTES, current + delta));
    }, []);

    return (
        <div className={styles.picker}>
            <div className={styles.pickerValueRow}>
                {isTyping ? (
                    <input
                        className={styles.pickerInput}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_MINUTES}
                        autoFocus
                        value={minutes || ''}
                        onChange={event => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            setMinutes(Number.isFinite(parsed) ? Math.min(MAX_MINUTES, Math.max(0, parsed)) : 0);
                        }}
                        onBlur={() => setIsTyping(false)}
                        onKeyDown={event => { if (event.key === 'Enter') setIsTyping(false); }}
                        aria-label="Длительность в минутах"
                    />
                ) : (
                    <button
                        type="button"
                        className={styles.pickerValue}
                        onClick={() => setIsTyping(true)}
                        title="Ввести точное число минут"
                    >
                        {minutes > 0 ? formatDuration(minutes * 60_000) : 'не задано'}
                    </button>
                )}
                <button
                    type="button"
                    className={styles.pickerReset}
                    onClick={() => setMinutes(0)}
                    disabled={minutes === 0}
                    title="Сбросить"
                >
                    <RotateCcw size={16} />
                </button>
            </div>

            <div className={styles.pickerSteps}>
                {STEPS.map(step => (
                    <button
                        key={step.label}
                        type="button"
                        className={styles.pickerStep}
                        onClick={() => add(step.minutes)}
                    >
                        {step.label}
                    </button>
                ))}
            </div>

            <div className={styles.pickerActions}>
                <Button onClick={onCancel} className={styles.pickerCancel}>Отмена</Button>
                <Button
                    onClick={() => onConfirm(minutes)}
                    isLoading={isProcessing}
                    disabled={minutes <= 0}
                    className={styles.pickerConfirm}
                >
                    {confirmLabel}
                </Button>
            </div>
        </div>
    );
}

export default DurationPicker;
