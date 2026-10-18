/**
 * Блок Google — единственное место, которое разговаривает с Google. Остальные части приложения
 * обращаются к нему только через этот файл: `import { … } from '@/core/google'`.
 *
 *   config  — ключи проекта и «можно ли здесь работать с Google»
 *   auth    — вход и выход, токен только в памяти
 *   http    — запросы с повтором при перегрузке, понятные ошибки, очередь массовых операций
 *   picker  — окно выбора Google (так файлы «показывают» приложению)
 *   drive   — Google Диск
 *   sheets  — Google Таблицы
 *   md5     — контрольная сумма для сверки файлов с Диском
 */
export * from './config';
export * from './errors';
export { runQueue, type QueueResult } from './http';
export { ensureToken, getAuthState, getToken, prepareGoogle, rememberedEmail, signedInEvents, signIn, signOut, useGoogleAuth, type GoogleAuthState } from './auth';
export { pick, preparePicker, type PickedItem, type PickOptions } from './picker';
export * as drive from './drive';
export { FOLDER_COLORS, FOLDER_MIME, fileUrl, folderUrl, isFolder, type DriveFile } from './drive';
export * as sheets from './sheets';
export { md5 } from './md5';
