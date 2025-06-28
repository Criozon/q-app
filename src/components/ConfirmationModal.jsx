import React from 'react';
import Modal from './Modal';
import Button from './Button';
import styles from './ConfirmationModal.module.css';

function ConfirmationModal({ 
    isOpen, 
    onClose, 
    onConfirm,
    title, 
    children, // `children` будет текстом-подтверждением
    confirmText = 'Подтвердить',
    cancelText = 'Отмена'
}) {
  
  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm();
    onClose(); // Закрываем модальное окно после подтверждения
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className={styles.content}>
        {children}
      </div>
      <div className={styles.buttonContainer}>
        <Button 
          onClick={onClose} 
          className={styles.cancelButton}
        >
          {cancelText}
        </Button>
        <Button 
          onClick={handleConfirm}
          className={styles.confirmButton}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmationModal;