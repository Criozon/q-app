import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import Spinner from '../components/Spinner';
import * as service from '../services/supabaseService';

function PrintPage() {
    const { queueId } = useParams<{ queueId: string }>();
    const [queueName, setQueueName] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const generateQR = async () => {
            try {
                if (!queueId) throw new Error('Не указана очередь');
                const { data, error } = await service.getQueueById(queueId);
                if (error) throw error;
                if (!data) throw new Error('Очередь не найдена или была удалена');

                setQueueName(data.name);
                
                // --- ИЗМЕНЕНИЕ: Убираем /#/ из URL ---
                const joinUrl = `${window.location.origin}/join/${data.short_id}`;
                // --- КОНЕЦ ИЗМЕНЕНИЯ ---
                
                const qrUrl = await QRCode.toDataURL(joinUrl, { width: 500, margin: 2 });
                setQrCodeUrl(qrUrl);
            } catch (err) {
                console.error("Ошибка при генерации QR", err);
            } finally {
                setLoading(false);
            }
        };
        void generateQR();
    }, [queueId]);

    const printStyles = `
        @media print {
            body * { visibility: hidden; }
            #print-section, #print-section * { visibility: visible; }
            #print-section { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; }
            button { display: none; }
        }
    `;
    
    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px', fontFamily: 'sans-serif' }}>
            <Spinner />
            <p>Генерация QR-кода...</p>
        </div>
    );

    return (
        <>
            <style>{printStyles}</style>
            <div id="print-section" style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '50px' }}>
                <h1>Отсканируйте, чтобы встать в очередь:</h1>
                <h2 style={{ marginBottom: '30px', fontSize: '2.5em' }}>{queueName}</h2>
                {qrCodeUrl && <img src={qrCodeUrl} alt={`QR-код для очереди ${queueName}`} />}
                <button onClick={() => window.print()} style={{ marginTop: '40px', padding: '15px 30px', fontSize: '18px', cursor: 'pointer' }}>
                    🖨️ Распечатать
                </button>
            </div>
        </>
    );
}

export default PrintPage;