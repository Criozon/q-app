import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { QrCode, Check, PhoneCall, UserX, ChevronRight, Copy, Printer } from 'lucide-react';

import Card from '../components/Card';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Section from '../components/Section';

function AdminPage() {
    const { secretKey } = useParams();
    const [queue, setQueue] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(true);
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [joinUrl, setJoinUrl] = useState('');
    const [isButtonLoading, setIsButtonLoading] = useState(false);

    const listRef = useRef(null);
    const calledMember = members.find(m => m.status === 'called');
    const waitingMembersCount = members.filter(m => m.status === 'waiting').length;

    const handleMainButtonClick = async () => {
        setIsButtonLoading(true);
        if (calledMember) {
            setMembers(prev => prev.map(m => m.id === calledMember.id ? { ...m, status: 'serviced' } : m));
            await supabase.from('queue_members').update({ status: 'serviced' }).eq('id', calledMember.id);
        } else {
            const nextMember = members.find(m => m.status === 'waiting');
            if (nextMember) {
                setMembers(prev => prev.map(m => m.id === nextMember.id ? { ...m, status: 'called' } : m));
                await supabase.from('queue_members').update({ status: 'called' }).eq('id', nextMember.id);
            }
        }
        setIsButtonLoading(false);
    };
    const handleCallSpecific = async (memberId) => {
        if (calledMember) { toast.error('Завершите текущее обслуживание.'); return; }
        setIsButtonLoading(true);
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'called' } : m));
        await supabase.from('queue_members').update({ status: 'called' }).eq('id', memberId);
        setIsButtonLoading(false);
    };
    const handleRemoveMember = async (memberId) => {
        if (window.confirm('Удалить участника?')) {
            setMembers(currentMembers => currentMembers.filter(m => m.id !== memberId));
            await supabase.from('queue_members').delete().eq('id', memberId);
        }
    };
    const handleShare = () => {
        if (navigator.share) {
            navigator.share({ title: `Очередь: ${queue.name}`, url: joinUrl });
        } else {
            navigator.clipboard.writeText(joinUrl);
            toast.success('Ссылка скопирована!');
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const { data: qData, error: qError } = await supabase.from('queues').select('*').eq('admin_secret_key', secretKey).single();
                if (qError || !qData) throw new Error("Очередь не найдена.");
                setQueue(qData);
                const currentJoinUrl = `${window.location.origin}/join/${qData.id}`;
                setJoinUrl(currentJoinUrl);
                const qrUrl = await QRCode.toDataURL(currentJoinUrl);
                setQrCodeUrl(qrUrl);
            } catch (error) {
                setQueue(null);
            }
        };
        fetchInitialData();
    }, [secretKey]);
    
    useEffect(() => {
        if (!queue) {
            if (loading) setLoading(false);
            return;
        }
        const fetchMembers = async () => {
            const { data } = await supabase.from('queue_members').select('*').eq('queue_id', queue.id).order('ticket_number');
            setMembers(data || []);
            setLoading(false);
        };
        fetchMembers();
        const channel = supabase.channel(`admin-rt-${queue.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'queue_members', filter: `queue_id=eq.${queue.id}` }, fetchMembers).subscribe();
        return () => supabase.removeChannel(channel);
    }, [queue, loading]);

    if (loading) return <div className="container" style={{textAlign: 'center', paddingTop: '40px'}}>Загрузка...</div>;
    if (!queue) return <div className="container" style={{textAlign: 'center', paddingTop: '40px'}}>Ошибка.</div>;
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--background)' }}>
            <header style={{ padding: '12px 0', backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
                <div className="container" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <div style={{width: '44px'}}></div>
                    <h1 style={{ fontSize: '17px', fontWeight: '600', margin: 0 }}>{queue.name}</h1>
                    <button onClick={() => setIsModalOpen(true)} style={{background: 'none', border: 'none', padding: '8px', cursor: 'pointer', height: '44px', width: '44px'}}>
                        <QrCode size={24} color="var(--accent-blue)" />
                    </button>
                </div>
            </header>
            
            <main ref={listRef} className="container" style={{ flex: 1, overflowY: 'auto', padding: '20px 0', paddingBottom: '120px' }}>
                <Section title={`В очереди (${waitingMembersCount})`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {members.map(member => (
                            <Card id={`member-${member.id}`} key={member.id} style={{ 
                                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                transition: 'all 0.3s ease',
                                borderLeft: member.status === 'called' ? `4px solid var(--accent-green)` : '4px solid transparent',
                                opacity: member.status === 'serviced' ? 0.4 : 1,
                            }}>
                                <div>
                                    <p style={{fontSize: '18px', fontWeight: '600', textDecoration: member.status === 'serviced' ? 'line-through' : 'none'}}>
                                        {member.display_code || `#${member.ticket_number}`} - {member.member_name}
                                    </p>
                                    <p style={{fontSize: '14px', color: 'var(--text-secondary)'}}>
                                        {member.status === 'called' ? 'Вызывается...' : (member.status === 'serviced' ? 'Обслужен' : 'Ожидает')}
                                    </p>
                                </div>
                                <div style={{display: 'flex', gap: '8px'}}>
                                    {member.status === 'waiting' && <Button onClick={() => handleCallSpecific(member.id)} disabled={!!calledMember || isButtonLoading} style={{padding: '8px', backgroundColor: '#6e6e73', width: 'auto'}} title="Приоритетный вызов"><ChevronRight size={20}/></Button>}
                                    <Button onClick={() => handleRemoveMember(member.id)} disabled={isButtonLoading} style={{padding: '8px', backgroundColor: 'var(--accent-red)', width: 'auto'}} title="Удалить"><UserX size={20}/></Button>
                                </div>
                            </Card>
                        ))}
                        {members.length === 0 && <p style={{textAlign: 'center', color: 'var(--text-secondary)', padding: '20px'}}>В очереди пока никого нет.</p>}
                    </div>
                </Section>
            </main>

            <footer style={{ padding: '16px 0', backgroundColor: 'var(--card-background)', borderTop: '1px solid var(--border-color)', position: 'sticky', bottom: 0, zIndex: 10 }}>
                <div className="container">
                    <Button 
                        onClick={handleMainButtonClick} 
                        disabled={(!calledMember && waitingMembersCount === 0) || isButtonLoading} 
                        style={{backgroundColor: calledMember ? 'var(--accent-green)' : 'var(--accent-blue)'}}
                    >
                        {isButtonLoading ? '...' : (calledMember ? 
                            <><Check size={20} /> Завершить ({calledMember.display_code || calledMember.ticket_number})</> : 
                            <><PhoneCall size={20}/> Вызвать следующего</>
                        )}
                    </Button>
                </div>
            </footer>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Покажите QR-код или отправьте ссылку">
                <div style={{textAlign: 'center'}}>
                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" style={{width: '100%', maxWidth: '300px', borderRadius: '8px', display: 'block', margin: '0 auto'}}/>}
                    <p style={{margin: '16px 0', wordBreak: 'break-all'}}>{joinUrl}</p>
                    <Button onClick={handleShare}>Поделиться</Button>
                </div>
            </Modal>
        </div>
    );
}

export default AdminPage;