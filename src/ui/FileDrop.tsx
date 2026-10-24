import { Upload } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useGramotki } from '@/core/gramotka/react';
import { errorText, KEY_FILE_EXT } from '@/core/gramotka/store';
import { APPS } from '@/core/registry/apps';
import { Emitter } from '@/core/util/events';
import { showGramotki } from './GramotkiDialog';
import { useToast } from './Toast';

/*
 * Файлы можно перетащить в любое место окна. Пока файл над окном — затемнение с подсказкой,
 * после отпускания — окно приложения, которое разбирает файлы (manifest.fileDrop: «Личные дела» —
 * что за файл, на чьё имя закрепить, как назвать). Кнопкой то же окно открывает openIncomingFiles().
 * Файл ключа грамоток разбирает само ядро: открывает грамотки вместо ввода фразы.
 */

const isKeyFile = (f: File) => f.name.toLowerCase().endsWith(`.${KEY_FILE_EXT}`);

const handler = APPS.find((a) => a.fileDrop)?.fileDrop;
const incoming = new Emitter<File[]>();

/** Открыть окно для выбранных файлов (кнопкой, без перетаскивания — например, на телефоне). */
export function openIncomingFiles(files: File[]): void {
  if (files.length) incoming.emit(files);
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

/** Файлы из перетаскивания. Папки браузер отдаёт пустыми «файлами» — их пропускаем. */
function droppedFiles(dt: DataTransfer): { files: File[]; folders: number } {
  const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file');
  if (!items.length) return { files: Array.from(dt.files), folders: 0 };
  const files: File[] = [];
  let folders = 0;
  for (const it of items) {
    if (it.webkitGetAsEntry?.()?.isDirectory) {
      folders++;
      continue;
    }
    const f = it.getAsFile();
    if (f) files.push(f);
  }
  return { files, folders };
}

export function FileDrop() {
  const toast = useToast();
  const { store } = useGramotki();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);

  useEffect(() => incoming.on((files) => setQueue((q) => [...q, ...files])), []);

  useEffect(() => {
    if (!handler) return;
    // Картинку или текст тащат внутри самой страницы — это не новый файл.
    let inside = false;
    const onStart = () => (inside = true);
    const onEnd = () => (inside = false);
    const onEnter = (e: DragEvent) => {
      if (inside || !hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    // Без preventDefault браузер не даст бросить файл — и откроет его вместо сайта.
    const onOver = (e: DragEvent) => {
      if (inside || !hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (inside || !hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      setDragging(false);
      const { files, folders } = droppedFiles(e.dataTransfer);
      if (folders) toast('Папки не добавляются — перетащите сами файлы');
      const key = files.find(isKeyFile);
      if (key && store) {
        const st = store.snapshot().status;
        if (st === 'open') toast('Грамотки уже открыты');
        else if (st === 'new') showGramotki.emit();
        else
          void key
            .arrayBuffer()
            .then((b) => store.unlockWithKeyFile(new Uint8Array(b), false))
            .then(
              () => toast('Грамотки открыты файлом ключа'),
              (err: unknown) => toast(errorText(err)),
            );
      }
      openIncomingFiles(files.filter((f) => !isKeyFile(f)));
    };
    const handlers = { dragstart: onStart, dragend: onEnd, dragenter: onEnter, dragover: onOver, drop: onDrop };
    for (const [type, fn] of Object.entries(handlers)) window.addEventListener(type, fn as EventListener);
    return () => {
      for (const [type, fn] of Object.entries(handlers)) window.removeEventListener(type, fn as EventListener);
    };
  }, [toast, store]);

  const close = useCallback(() => setQueue([]), []);

  if (!handler) return null;
  const Dialog = handler;
  return (
    <>
      {dragging && (
        // Затемнение — единственная цель перетаскивания (у содержимого pointer-events: none), поэтому
        // dragleave на нём значит «файл увели за окно». Движение мыши — перетаскивание уже закончилось.
        <div className="drop-overlay" onDragLeave={(e) => e.target === e.currentTarget && setDragging(false)} onMouseMove={() => setDragging(false)}>
          <div className="drop-overlay__frame">
            <Upload size={40} className="brand-icon" />
            <strong>Отпустите файл, чтобы добавить его</strong>
            <span className="muted">Дальше спросим, что это за файл и на чьё имя его закрепить</span>
          </div>
        </div>
      )}
      {queue.length > 0 && (
        <Suspense fallback={null}>
          <Dialog files={queue} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
