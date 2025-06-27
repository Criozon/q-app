import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import QRCode from 'qrcode';

function AdminPage() {
    const { secretKey } = useParams();
    const [queue, setQueue] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    const handleCallNext = async () => {
        const nextMember = members.find(m => m.status === 'waiting');
        if (!nextMember) { alert('Нет участников в очереди для вызова.'); return; }
        await supabase.from('queue_members').update({ status: 'called' }).eq('id', nextMember.id);
    };
    
    const handleMarkServiced = async (memberId) => {
        await supabase.from('queue_members').update({ status: 'serviced' }).eq('id', memberId);
    };

    const handleRemoveMember = async (memberId) => {
        if (window.confirm('Вы уверены, что хотите удалить этого участника?')) {
            await supabase.from('queue_members').delete().eq('id', memberId);
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.from('queues').select('*').eq('admin_secret_key', secretKey).single();
                if (error) throw error;
                setQueue(data);
                const joinUrl = `${window.location.origin}/join/${data.id}`;
                const qrUrl = await QRCode.toDataURL(joinUrl);
                setQrCodeUrl(qrUrl);
            } catch (err) { 
                console.error(err);
                setQueue(null);
            } 
            finally { setLoading(false); }
        };
        fetchInitialData();
    }, [secretKey]);
    
    useEffect(() => {
        if (!queue) return;
        const fetchMembers = async () => {
            const { data } = await supabase.from('queue_members').select('*').eq('queue_id', queue.id).order('ticket_number', { ascending: true });
            setMembers(data || []);
        };
        fetchMembers();
        const channel = supabase.channel(`admin-realtime-${queue.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, fetchMembers)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [queue]);


    if (loading) return <div>Загрузка...</div>;
    if (!queue) return <div>Очередь не найдена.</div>;

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px' }}>
            <h1>Панель управления: {queue.name}</h1>
            <div style={{ display: 'flex', gap: '40px' }}>
                <div>
                    <h2>QR-код для входа</h2>
                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR-код" />}
                    <p style={{maxWidth: '256px', wordBreak: 'break-all'}}>
                        Ссылка для входа: 
                        <a href={`${window.location.origin}/join/${queue.id}`} target="_blank" rel="noopener noreferrer">
                            {`${window.location.origin}/join/${queue.id}`}
                        </a>
                    </p>
                </div>
                <div>
                    <h2>Участники</h2>
                    <button onClick={handleCallNext}>Вызвать следующего</button>
                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                        {members.map(member => (
                            <li key={member.id} style={{ background: member.status === 'called' ? 'lightgreen' : 'transparent', padding: '5px', border: '1px solid #ccc', marginBottom: '5px' }}>
                                #{member.ticket_number} - {member.member_name} ({member.status})
                                {member.status === 'called' && <button onClick={() => handleMarkServiced(member.id)} style={{marginLeft: '10px'}}>✓ Завершить</button>}
                                <button onClick={() => handleRemoveMember(member.id)} style={{marginLeft: '10px'}}>✕</button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default AdminPage;
