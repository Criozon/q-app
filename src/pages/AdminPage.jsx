import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

function AdminPage() {
    const { secretKey } = useParams();
    const [queue, setQueue] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    const calledMember = members.find(m => m.status === 'called');
    const waitingMembersCount = members.filter(m => m.status === 'waiting').length;

    // --- Функции управления очередью ---
    const handleMainButtonClick = async () => {
        if (calledMember) {
            await supabase.from('queue_members').update({ status: 'serviced' }).eq('id', calledMember.id);
        } else {
            const nextMember = members.find(m => m.status === 'waiting');
            if (nextMember) {
                await supabase.from('queue_members').update({ status: 'called' }).eq('id', nextMember.id);
            } else {
                toast.error('Нет участников в очереди для вызова.');
            }
        }
    };

    const handleCallSpecific = async (memberId) => {
        if (calledMember) {
            toast.error('Сначала завершите обслуживание текущего участника.');
            return;
        }
        await supabase.from('queue_members').update({ status: 'called' }).eq('id', memberId);
    };
    
    const handleRemoveMember = async (memberId) => {
        if (window.confirm('Вы уверены, что хотите удалить этого участника?')) {
            setMembers(currentMembers => currentMembers.filter(m => m.id !== memberId));
            const { error } = await supabase.from('queue_members').delete().eq('id', memberId);
            if (error) {
                toast.error('Ошибка при удалении на сервере.');
            }
        }
    };

    // --- Эффекты для загрузки данных и подписки ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const { data: queueData, error: queueError } = await supabase
                    .from('queues').select('*').eq('admin_secret_key', secretKey).single();
                if (queueError) throw new Error("Очередь не найдена.");
                setQueue(queueData);

                const joinUrl = `${window.location.origin}/join/${queueData.id}`;
                const qrUrl = await QRCode.toDataURL(joinUrl);
                setQrCodeUrl(qrUrl);

                const { data: membersData, error: membersError } = await supabase.from('queue_members')
                    .select('*').eq('queue_id', queueData.id).order('ticket_number', { ascending: true });
                if (membersError) throw membersError;
                setMembers(membersData || []);
            } catch (error) {
                console.error(error);
                setQueue(null);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [secretKey]);

    useEffect(() => {
        if (!queue) return;
        const channel = supabase.channel(`admin-updates-for-${queue.id}`)
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, 
                async () => {
                    const { data } = await supabase.from('queue_members')
                       .select('*').eq('queue_id', queue.id).order('ticket_number', { ascending: true });
                    if (data) setMembers(data);
                }
            ).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [queue]);

    if (loading) return <div>Загрузка...</div>;
    if (!queue) return <div>Ошибка: Очередь не найдена или неверная ссылка.</div>;

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px', display: 'flex', gap: '40px', justifyContent: 'center' }}>
            <div style={{ flex: '0 1 350px' }}>
                <div style={{textAlign: 'center'}}>
                    <h1>{queue.name}</h1>
                    <h2 style={{fontWeight: 'normal', fontSize: '1.2em', color: '#555'}}>Пригласите участников</h2>
                </div>
                
                <Link to={`/print/${queue.id}`} target="_blank" title="Нажмите, чтобы открыть страницу для печати">
                    <div style={{ marginTop: '10px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
                        {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" style={{width: '100%', display: 'block'}} />}
                    </div>
                </Link>
                <p style={{textAlign: 'center', marginTop: '5px', fontSize: '0.9em'}}>Нажмите на QR-код для печати</p>
                
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/join/${queue.id}`} 
                        style={{flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px'}}
                    />
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/join/${queue.id}`);
                            toast.success('Ссылка скопирована!');
                        }}
                        title="Скопировать ссылку"
                        style={{padding: '8px 12px', cursor: 'pointer', border: '1px solid #ccc', background: '#f8f9fa', borderRadius: '4px'}}
                    >
                        📋
                    </button>
                </div>

                <hr style={{ margin: '20px 0' }} />
                <button 
                    onClick={handleMainButtonClick} 
                    disabled={!calledMember && waitingMembersCount === 0}
                    style={{
                        width: '100%', padding: '15px', fontSize: '18px', color: 'white', border: 'none', 
                        borderRadius: '5px', cursor: 'pointer', transition: 'all 0.3s ease',
                        background: calledMember ? '#28a745' : '#007bff',
                        opacity: (!calledMember && waitingMembersCount === 0) ? 0.5 : 1,
                    }}>
                    {calledMember ? `Завершить #${calledMember.ticket_number}` : 'Вызвать следующего'}
                </button>
            </div>

            <div style={{ flex: '0 1 600px', borderLeft: '1px solid #eee', paddingLeft: '40px' }}>
                <h2>Участники в очереди ({waitingMembersCount})</h2>
                <ul style={{ listStyle: 'none', padding: 0, maxHeight: '80vh', overflowY: 'auto' }}>
                    {members.map(member => (
                        <li key={member.id} style={{ 
                            fontSize: '1.2em', padding: '15px', border: '1px solid #eee', marginBottom: '10px', borderRadius: '5px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s ease',
                            background: member.status === 'called' ? '#d4edda' : (member.status === 'serviced' ? '#f8f9fa' : 'white'),
                            textDecoration: member.status === 'serviced' ? 'line-through' : 'none',
                            color: member.status === 'serviced' ? '#6c757d' : 'black'
                        }}>
                            <div>
                                <strong style={{color: '#007bff', fontSize: '1.4em'}}>#{member.ticket_number}</strong> - {member.member_name}
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                {member.status === 'waiting' && (
                                    <button 
                                        onClick={() => handleCallSpecific(member.id)} 
                                        disabled={!!calledMember} 
                                        style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer', opacity: calledMember ? 0.5 : 1}}
                                        title="Приоритетный вызов"
                                    >
                                        Вызвать
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleRemoveMember(member.id)} 
                                    style={{background: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer'}}
                                    title="Удалить участника"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
                {members.length === 0 && <p>Пока никто не встал в очередь.</p>}
            </div>
        </div>
    );
}

export default AdminPage;