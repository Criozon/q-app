import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function WaitPage() {
    const { queueId, memberName } = useParams();
    const [myInfo, setMyInfo] = useState(null);
    const [queueName, setQueueName] = useState('');
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [loading, setLoading] = useState(true); // <-- ВОТ ЭТА СТРОКА, КОТОРУЮ Я СЛУЧАЙНО УДАЛИЛ
    
    // useRef для звука и для предотвращения двойного срабатывания
    const audioPlayer = useRef(null);
    const hasBeenCalled = useRef(false);

    useEffect(() => {
        const fetchDataAndSubscribe = async () => {
            // --- Внутренняя функция для получения всех данных ---
            const fetchAllData = async () => {
                // Получаем информацию о себе
                const { data: memberData, error: memberError } = await supabase
                    .from('queue_members').select('*').eq('queue_id', queueId).eq('member_name', memberName)
                    .order('created_at', { ascending: false }).limit(1).single();

                if (memberError || !memberData) {
                    setLoading(false);
                    return;
                }
                
                setMyInfo(memberData);

                // Если статус изменился на "called" впервые
                if (memberData.status === 'called' && !hasBeenCalled.current) {
                    hasBeenCalled.current = true; // Отмечаем, что уже вызывали
                    document.title = "ВАША ОЧЕРЕДЬ!";
                    if(audioPlayer.current) {
                        audioPlayer.current.play().catch(e => {});
                    }
                }
                
                // Получаем название очереди
                const { data: queueData } = await supabase
                    .from('queues').select('name').eq('id', queueId).single();
                if (queueData) setQueueName(queueData.name);

                // Считаем людей впереди
                const { count } = await supabase
                    .from('queue_members').select('*', { count: 'exact', head: true })
                    .eq('queue_id', queueId).eq('status', 'waiting')
                    .lt('ticket_number', memberData.ticket_number);
                setPeopleAhead(count || 0);

                setLoading(false);
            };

            // --- Выполняем первый раз ---
            await fetchAllData();

            // --- Подписываемся на ЛЮБЫЕ изменения ---
            const channel = supabase.channel(`public-wait-page-for-${queueId}`)
                .on('postgres_changes', 
                    { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueId}` },
                    (payload) => {
                        // При любом изменении просто запрашиваем все данные заново
                        fetchAllData();
                    }
                ).subscribe();

            // Отписка при уходе со страницы
            return () => {
                supabase.removeChannel(channel);
            };
        };

        fetchDataAndSubscribe();

    }, [queueId, memberName]); // Зависимости должны быть стабильными

    if (loading) return <div>Загрузка вашего статуса...</div>;
    if (!myInfo) return <div>Не удалось найти вашу запись в очереди. Возможно, вы были удалены.</div>;

    // Добавляем класс анимации, если статус 'called'
    const animationClass = myInfo.status === 'called' ? 'called-animation' : '';

    return (
        <div className={animationClass} style={{ maxWidth: '600px', margin: '50px auto', padding: '30px', fontFamily: 'sans-serif', border: '2px solid #007bff', borderRadius: '10px', textAlign: 'center' }}>
            {/* Скрытый аудио плеер */}
            <audio ref={audioPlayer} src="/notification.mp3" preload="auto"></audio>

            <h2>Очередь: {queueName}</h2>
            <hr />
            <p style={{ fontSize: '1.2em' }}>Здравствуйте, <strong>{myInfo.member_name}</strong>!</p>
            <h1>Ваш номер: <span style={{ color: '#007bff' }}>#{myInfo.ticket_number}</span></h1>
            
            {myInfo.status === 'waiting' && (
                <>
                    <p style={{ fontSize: '1.5em' }}>Перед вами: <strong>{peopleAhead}</strong> чел.</p>
                    <p style={{ marginTop: '20px', color: '#555' }}>Эта страница будет обновляться автоматически.</p>
                </>
            )}

            {myInfo.status === 'called' && (
                <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#28a745', color: 'white', borderRadius: '8px' }}>
                    <h2>Вас вызывают!</h2>
                </div>
            )}
             {myInfo.status === 'serviced' && (
                <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#6c757d', color: 'white', borderRadius: '8px' }}>
                    <h2>Ваше обслуживание завершено. Спасибо!</h2>
                </div>
            )}
        </div>
    );
}

export default WaitPage;