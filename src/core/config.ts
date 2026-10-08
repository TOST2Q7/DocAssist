/** Общие константы приложения. */
export const APP_NAME = 'DocAssist';
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
/** Версия-файл (открыта с диска двойным кликом), а не сайт. */
export const IS_SINGLE_FILE = __SINGLE_FILE__;

export const GITHUB_OWNER = 'TOST2Q7';
export const GITHUB_REPO = 'DocAssist';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;
/** Ветка, из которой берётся номер версии, если релизов ещё нет. */
export const RELEASE_BRANCH = 'main';
