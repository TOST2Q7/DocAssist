/** Отдать файл пользователю (скачивание; на iOS откроется меню «Поделиться/Сохранить в Файлы»). */
export function downloadBytes(data: Uint8Array | string, fileName: string, mime = 'application/octet-stream'): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function mimeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Попросить пользователя выбрать файлы.
 * Поле добавляется в документ: на iOS Safari «отвязанное» поле иногда не сообщает о выборе.
 * Событие «cancel» не используем — в некоторых браузерах оно приходит раньше выбора;
 * поле от отменённого выбора просто удаляется при следующем вызове.
 */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  document.querySelectorAll('input[data-docassist-picker]').forEach((el) => el.remove());
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.dataset.docassistPicker = '';
    input.addEventListener(
      'change',
      () => {
        const files = input.files ? [...input.files] : [];
        input.remove();
        resolve(files);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}
