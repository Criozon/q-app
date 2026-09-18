import { useState, useRef, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Button from './Button';
import styles from './DurationPicker.module.css';

/**
 * Набор длительности двумя циферблатами — часы и минуты, как на телефоне.
 *
 * Готовых пресетов (15/30/60) не хватало: солярий продаёт минуты, лодку
 * берут на десятки минут, место в кемпинге — на часы, и одним набором
 * все три случая не покрыть. Строка кнопок «+1 ч / +10 мин / +1 мин»
 * покрывала, но читалась как ребус.
 *
 * Стрелки держат нажатие: одиночное касание — шаг, удержание — разгон.
 * Иначе сорок минут набирались бы сорока нажатиями. По самому числу
 * можно ударить и ввести значение с клавиатуры.
 */

const HOLD_DELAY_MS = 400;
const HOLD_STEP_MS = 70;

/** Повтор шага, пока кнопку держат. */
function useHoldRepeat(step: () => void) {
    const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
    const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = useCallback(() => {
        if (delay.current) { clearTimeout(delay.current); delay.current = null; }
        if (repeat.current) { clearInterval(repeat.current); repeat.current = null; }
    }, []);

    const start = useCallback(() => {
        stop();
        step();
        delay.current = setTimeout(() => { repeat.current = setInterval(step, HOLD_STEP_MS); }, HOLD_DELAY_MS);
    }, [step, stop]);

    // Палец мог уйти за пределы экрана — таймеры не должны пережить размонтирование.
    useEffect(() => stop, [stop]);

    return { start, stop };
}

interface DialProps {
    label: string;
    value: number;
    max: number;
    /**
     * Именно сеттер состояния, а не «принять новое значение»: шаг обязан
     * считаться от предыдущего значения внутри обновления. Иначе интервал
     * удержания замыкает значение того рендера, в котором его завели, и
     * стрелка навсегда прибавляет к одному и тому же числу. На этом уже
     * обжигались с таймером опроса на странице ожидания.
     */
    setValue: Dispatch<SetStateAction<number>>;
}

function Dial({ label, value, max, setValue }: DialProps) {
    const [draft, setDraft] = useState<string | null>(null);

    const stepUp = useCallback(() => {
        setValue(prev => Math.min(max, prev + 1));
    }, [max, setValue]);

    const stepDown = useCallback(() => {
        setValue(prev => Math.max(0, prev - 1));
    }, [setValue]);

    const up = useHoldRepeat(stepUp);
    const down = useHoldRepeat(stepDown);

    const commit = () => {
        if (draft === null) return;
        const parsed = Number.parseInt(draft, 10);
        setValue(Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0);
        setDraft(null);
    };

    return (
        <div className={styles.dial}>
            <button
                type="button"
                className={styles.arrow}
                onPointerDown={up.start}
                onPointerUp={up.stop}
                onPointerLeave={up.stop}
                onPointerCancel={up.stop}
                disabled={value >= max}
                aria-label={`${label}: больше`}
            >
                <ChevronUp size={22} />
            </button>

            <input
                className={styles.value}
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                value={draft ?? String(value).padStart(2, '0')}
                onChange={event => setDraft(event.target.value)}
                onFocus={event => { setDraft(String(value)); event.target.select(); }}
                onBlur={commit}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                aria-label={label}
            />

            <button
                type="button"
                className={styles.arrow}
                onPointerDown={down.start}
                onPointerUp={down.stop}
                onPointerLeave={down.stop}
                onPointerCancel={down.stop}
                disabled={value <= 0}
                aria-label={`${label}: меньше`}
            >
                <ChevronDown size={22} />
            </button>

            <span className={styles.dialLabel}>{label}</span>
        </div>
    );
}

interface Props {
    /** Подпись кнопки подтверждения: запуск или добавление к идущему. */
    confirmLabel: string;
    onConfirm: (minutes: number) => void;
    isProcessing: boolean;
}

function DurationPicker({ confirmLabel, onConfirm, isProcessing }: Props) {
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(0);
    const total = hours * 60 + minutes;

    return (
        <div className={styles.picker}>
            <div className={styles.dials}>
                <Dial label="часы" value={hours} max={23} setValue={setHours} />
                <span className={styles.colon}>:</span>
                <Dial label="минуты" value={minutes} max={59} setValue={setMinutes} />
            </div>

            <Button
                onClick={() => onConfirm(total)}
                isLoading={isProcessing}
                disabled={total <= 0}
                className={styles.confirm}
            >
                {confirmLabel}
            </Button>
        </div>
    );
}

export default DurationPicker;
