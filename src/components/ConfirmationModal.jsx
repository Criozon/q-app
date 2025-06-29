import React from 'react';
import Modal from './Modal';
import Button from './Button';
import styles from './ConfirmationModal.module.css';

function ConfirmationModal({ 
    isOpen, 
    onClose, 
    onConfirm,
    onCancelAction = onClose,
    title, 
    children,
    confirmText = 'Подтвердить',
    cancelText = 'Отмена',
    // --- НАЧАЛО ИЗМЕНЕНИЙ ---
    // 1. Добавляем новый пропс. По умолчанию действие НЕ является разрушительным.
    isDestructive = false
    // --- КОНЕЦ ИЗМЕНЕНИЙ ---
}) {
  
  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onCancelAction();
    onClose();
  }

  // --- НАЧАЛО ИЗМЕНЕНИЙ ---
  // 2. Динамически собираем классы для кнопки подтверждения
  const confirmButtonClassName = [
    styles.confirmButton, // Базовый класс
    isDestructive ? styles.destructive : '' // Добавляем класс, если действие разрушительное
  ].filter(Boolean).join(' ');
  // --- КОНЕЦ ИЗМЕНЕНИЙ ---

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className={styles.content}>
        {children}
      </div>
      <div className={styles.buttonContainer}>
        <Button 
          onClick={handleCancel} 
          className={styles.cancelButton}
        >
          {cancelText}
        </Button>
        <Button 
          onClick={handleConfirm}
          // --- НАЧАЛО ИЗМЕНЕНИЙ ---
          // 3. Применяем собранные классы
          className={confirmButtonClassName}
          // --- КОНЕЦ ИЗМЕНЕНИЙ ---
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmationModal;