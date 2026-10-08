/*
 * Заглушка регистрации service worker для версии-файла (сборка --mode single).
 * Файл открывается с диска (file://), где service worker не работает — он и не нужен:
 * приложение и так целиком лежит на компьютере.
 */
const noop = () => {};

export function useRegisterSW() {
  return {
    needRefresh: [false, noop] as [boolean, (v: boolean) => void],
    offlineReady: [false, noop] as [boolean, (v: boolean) => void],
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
