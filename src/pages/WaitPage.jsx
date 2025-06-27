import { useState, useEffect, useRef } from 'react'; // <-- Добавляем useRef
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function WaitPage() {
    const { queueId, memberName } = useParams();
    const [myInfo, setMyInfo] = useState(null);
    const [queueName, setQueueName] = useState('');
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // --- Добавляем useRef для звука и заголовка ---
    const notificationTriggered = useRef(false);
    const audioPlayer = useRef(null);

    useEffect(() => {
        let channel = null;
        const fetchAllData = async () => {
            const { data: memberData, error: memberError } = await supabase
                .from('queue_members').select('*').eq('queue_id', queueId).eq('member_name', memberName)
                .order('created_at', { ascending: false }).limit(1).single();

            if (memberError || !memberData) {
                setIsLoading(false);
                return;
            }
            setMyInfo(memberData);

            // --- НОВАЯ ЛОГИКА ПРОВЕРКИ СТАТУСА ---
            if (memberData.status === 'called' && !notificationTriggered.current) {
                notificationTriggered.current = true; // Отмечаем, что сработало
                document.title = "ВАША ОЧЕРЕДЬ!"; // Меняем заголовок
                if (audioPlayer.current) {
                    audioPlayer.current.play().catch(e => {}); // Проигрываем звук
                }
            }

            const { data: queueData } = await supabase
                .from('queues').select('name').eq('id', queueId).single();
            if (queueData) setQueueName(queueData.name);

            const { count } = await supabase
                .from('queue_members').select('*', { count: 'exact', head: true })
                .eq('queue_id', queueId).eq('status', 'waiting')
                .lt('ticket_number', memberData.ticket_number);
            setPeopleAhead(count || 0);

            setIsLoading(false);
        };

        const setupPage = async () => {
            await fetchAllData();
            channel = supabase.channel(`wait-page-rt-${queueId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueId}` }, 
                () => { fetchAllData(); })
                .subscribe();
        };
        
        setupPage();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [queueId, memberName]);

    if (isLoading) return <div>Загрузка...</div>;
    if (!myInfo) return <div>Ваша запись в очереди не найдена.</div>;
    
    // --- Добавляем класс для анимации ---
    const animationClass = myInfo.status === 'called' ? 'called-animation' : '';

    return (
        <div className={animationClass} style={{ padding: '40px', fontFamily: 'sans-serif' }}>
             {/* --- Добавляем плеер для звука --- */}
            <audio ref={audioPlayer} src="/notification.mp3" preload="auto"></audio>
            
            <h1>Очередь: {queueName}</h1>
            <h2>Здравствуйте, {myInfo.member_name}!</h2>
            <p style={{ fontSize: '2em' }}>Ваш номер: #{myInfo.ticket_number}</p>
            <p>Статус: <strong>{myInfo.status}</strong></p>
            <p>Людей впереди: {peopleAhead}</p>
            
            {myInfo.status === 'called' && (
                <div style={{ marginTop: '20px', padding: '20px', background: 'lightgreen' }}>
                    <h2>Вас вызывают!</h2>
                </div>
            )}
        </div>
    );
}

export default WaitPage;