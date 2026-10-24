/*
 * Замок разработчика — открытая половина пары ключей. Им закрываются журнал грамоток и копии, запечатанные после
 * перевода. Открыть их может только тот, у кого закрытая половина (файл у разработчика, в код не попадает).
 *
 * Строки ниже меняет `da` → «Журнал грамоток» → «Создать пару ключей». Пока стоит заготовка, закрытой половины нет
 * ни у кого: журнал и запечатанные копии не прочитает никто. `da release` об этом предупреждает.
 */

// da:developer-lock
export const DEVELOPER_LOCK = 'BMQqd5LE6Qg4D7KsAz4g2WrAVpBJR/wJcXOBeGif4IKgKng68Ws1lTJpGIG1+EC2IrfFmcJvITHcOY/u0nY9QeQ=';
// da:developer-lock-placeholder
export const DEVELOPER_LOCK_IS_PLACEHOLDER = true;
