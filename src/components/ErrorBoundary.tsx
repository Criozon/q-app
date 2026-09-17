import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import log from '../utils/logger';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Не даёт одной ошибке превратить приложение в белый экран.
 *
 * Без такого барьера любое исключение при рендере или внутри useEffect
 * заставляет React снести всё дерево — человек видит пустую страницу,
 * без объяснений и без возможности что-то сделать. На этом уже обожглись:
 * Chrome на Android запрещает `new Notification()` и бросает исключение,
 * из-за чего страница ожидания белела ровно в момент вызова — когда она
 * нужнее всего.
 *
 * Здесь показываем понятное сообщение и кнопку перезагрузки. Талон
 * участника при этом никуда не девается — он хранится на сервере.
 */
class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        log('ErrorBoundary', 'Приложение упало', { error, component: info.componentStack });
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center', gap: '16px',
                padding: '24px', textAlign: 'center', fontFamily: 'inherit',
            }}>
                <h2 style={{ margin: 0 }}>Что-то пошло не так</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary, #6e6e73)', maxWidth: '32ch' }}>
                    Страница не смогла отобразиться. Ваше место в очереди сохранено —
                    обновите страницу, чтобы вернуться к нему.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        minHeight: '44px', padding: '0 24px', borderRadius: '12px',
                        border: 'none', cursor: 'pointer', fontSize: '1em',
                        backgroundColor: 'var(--accent-blue, #007aff)', color: '#fff',
                    }}
                >
                    Обновить страницу
                </button>
            </div>
        );
    }
}

export default ErrorBoundary;
