import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function WaitPage() {
    const { queueId, memberId } = useParams();
    const [myInfo, setMyInfo] = useState(null);
    const [queueName, setQueueName] = useState('');
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [status, setStatus] = useState('loading');
    
    const notificationTriggered = useRef(false);
    const audioPlayer = useRef(null);

    const fetchAllMyData = useCallback(async () => {
        const { data: memberData, error: memberError } = await supabase.from('queue_members').select('*').eq('id', memberId).single();
        if (memberError || !memberData) { setStatus('error'); return; }
        setMyInfo(memberData);
        const { data: queueData } = await supabase.from('queues').select('name').eq('id', queueId).single();
        if (queueData) setQueueName(queueData.name);
        const { count } = await supabase.from('queue_members').select('*', { count: 'exact', head: true }).eq('queue_id', queueId).eq('status', 'waiting').lt('ticket_number', memberData.ticket_number);
        setPeopleAhead(count || 0);
    }, [queueId, memberId]);

    useEffect(() => {
        fetchAllMyData().then(() => setStatus('ok'));
        const channel = supabase.channel(`wait-page-rt-${memberId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queueId}` }, fetchAllMyData)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchAllMyData, memberId, queueId]);

    useEffect(() => {
        if (myInfo && myInfo.status === 'called' && !notificationTriggered.current) {
            notificationTriggered.current = true;
            document.title = "ВАША ОЧЕРЕДЬ!";
            if (audioPlayer.current) audioPlayer.current.play().catch(e => {});
        }
    }, [myInfo]);

    if (status === 'loading') return <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>Загрузка...</div>;
    if (status === 'error' || !myInfo) return <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>Не удалось найти вашу запись.</div>;

    const animationClass = myInfo?.status === 'called' ? 'called-animation' : '';

    return (
        <div className={`container ${animationClass}`}>
            <div style={{ textAlign: 'center', border: `2px solid ${myInfo?.status === 'called' ? 'var(--accent-green)' : 'var(--accent-blue)'}`, borderRadius: '16px', padding: '30px', marginTop: '40px' }}>
                <audio ref={audioPlayer} src="/notification.mp3" preload="auto" />
                <h2>Очередь: {queueName}</h2>
                <hr style={{margin: '15px 0', borderColor: 'var(--border-color)'}}/>
                <p style={{ fontSize: '1.2em', color: 'var(--text-secondary)' }}>Здравствуйте, <strong>{myInfo?.member_name}</strong>!</p>
                <h1>Ваш код: <span style={{ color: 'var(--accent-blue)', fontSize: '1.5em' }}>{myInfo?.display_code}</span></h1>
                
                {myInfo?.status === 'waiting' && (
                    <>
                        <p style={{ fontSize: '1.5em' }}>Перед вами: <strong>{peopleAhead}</strong> чел.</p>
                        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Эта страница будет обновляться автоматически.</p>
                    </>
                )}
                {myInfo?.status === 'called' && (
                    <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--accent-green)', color: 'white', borderRadius: '12px' }}>
                        <h2 style={{color: 'white', fontWeight: 'bold'}}>Вас вызывают!</h2>
                    </div>
                )}
                {myInfo?.status === 'serviced' && (
                    <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--text-secondary)', color: 'white', borderRadius: '12px' }}>
                        <h2 style={{color: 'white'}}>Ваше обслуживание завершено.</h2>
                    </div>
                )}
            </div>
        </div>
    );
}

export default WaitPage;