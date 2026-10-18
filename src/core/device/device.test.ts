import { describe, expect, it } from 'vitest';
import { formatStamp, guessDeviceName } from './device';
import { decideSync } from './sync';

describe('устройство', () => {
  it('угадывает имя по браузеру', () => {
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome на Windows');
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari на iPhone');
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 YaBrowser/24.10 Mobile Safari/537.36')).toBe('Яндекс Браузер на Android');
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge на Windows');
  });
  it('метка: дата, время, устройство', () => {
    const s = formatStamp({ at: '2026-10-18T14:40:00.000Z', device: 'Chrome на Windows' });
    expect(s).toMatch(/18\.10\.2026/);
    expect(s).toMatch(/Chrome на Windows$/);
    expect(formatStamp(undefined)).toBe('неизвестно когда');
  });
});

describe('сверка «устройство ↔ Диск»', () => {
  it('решает по трём отпечаткам', () => {
    expect(decideSync('a', 'a', undefined)).toBe('same');
    expect(decideSync('a', undefined, undefined)).toBe('push');
    expect(decideSync(undefined, 'b', undefined)).toBe('pull');
    expect(decideSync('a2', 'a', 'a')).toBe('push');
    expect(decideSync('a', 'a2', 'a')).toBe('pull');
    expect(decideSync('a2', 'a3', 'a')).toBe('conflict');
    // Без общей истории разные версии — решает человек.
    expect(decideSync('x', 'y', undefined)).toBe('conflict');
  });
});
