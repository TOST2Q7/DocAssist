import { FileText, ImageIcon } from 'lucide-react';
import { baseName, extName } from '@/core/storage/types';
import { Modal } from '@/ui/Modal';
import { isImageName } from '../model/transfer';
import { useObjectUrl } from './hooks';

/** Миниатюра: картинка или значок файла. */
export function Thumb({ path, onClick }: { path: string; onClick?: () => void }) {
  const isImage = isImageName(path);
  const url = useObjectUrl(isImage ? path : null);
  return (
    <button type="button" className="dela-thumb" onClick={onClick} aria-label={`Открыть ${baseName(path)}`}>
      {isImage && url ? <img src={url} alt="" loading="lazy" /> : isImage ? <ImageIcon size={24} className="faint" /> : <FileText size={24} className="faint" />}
      {!isImage && <span className="dela-thumb__ext">{extName(path).toUpperCase()}</span>}
    </button>
  );
}

export function Preview({ path, onClose }: { path: string; onClose: () => void }) {
  const url = useObjectUrl(path);
  return (
    <Modal title={baseName(path)} wide onClose={onClose}>
      <div className="dela-preview">{url ? <img src={url} alt={baseName(path)} /> : <div className="loading">Загрузка…</div>}</div>
    </Modal>
  );
}
