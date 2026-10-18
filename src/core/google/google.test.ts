import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMany, parseBatch, uploadFile } from './drive';
import { errorFromResponse, GoogleError, isRetryable } from './errors';
import { backoffDelay, connectAuth, gfetch, runQueue, setSleepForTests, tokenAllowed } from './http';
import { md5 } from './md5';
import { a1, columnLetters } from './sheets';

const enc = (s: string) => new TextEncoder().encode(s);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('md5', () => {
  it('совпадает с известными значениями', () => {
    expect(md5(enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5(enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5(enc('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(md5(enc('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))).toBe('57edf4a22be3c955ac49da2e2107b67a');
    // Ровно 56 и 64 байта — границы дополнения.
    expect(md5(enc('a'.repeat(56)))).toBe('3b0c8ac703f828b04c6c197006d17218');
    expect(md5(enc('a'.repeat(64)))).toBe('014842d480b571495a4a0363793f7367');
  });
});

describe('ошибки Google', () => {
  it('различает виды ошибок', () => {
    expect(errorFromResponse(401, {}).kind).toBe('auth');
    expect(errorFromResponse(403, { error: { errors: [{ reason: 'appNotAuthorizedToFile' }] } }).kind).toBe('notAuthorized');
    expect(errorFromResponse(403, { error: { errors: [{ reason: 'insufficientFilePermissions' }] } }).kind).toBe('permission');
    expect(errorFromResponse(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }).kind).toBe('rateLimit');
    expect(errorFromResponse(429, {}).kind).toBe('rateLimit');
    expect(errorFromResponse(404, {}).kind).toBe('notFound');
    expect(errorFromResponse(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }).kind).toBe('quota');
    expect(errorFromResponse(503, {}).kind).toBe('server');
    expect(errorFromResponse(400, { error: { message: 'Bad' } }).message).toContain('Bad');
  });
  it('повторять только перегрузку, сбои Google и обрывы связи', () => {
    expect(isRetryable(new GoogleError('rateLimit', ''))).toBe(true);
    expect(isRetryable(new GoogleError('network', ''))).toBe(true);
    expect(isRetryable(new GoogleError('notFound', ''))).toBe(false);
    expect(isRetryable(new GoogleError('auth', ''))).toBe(false);
  });
  it('задержка растёт и ограничена', () => {
    expect(backoffDelay(0)).toBeGreaterThanOrEqual(1000);
    expect(backoffDelay(0)).toBeLessThan(2000);
    expect(backoffDelay(3)).toBeGreaterThanOrEqual(8000);
    expect(backoffDelay(10)).toBeLessThan(33_000);
  });
});

describe('gfetch', () => {
  const unauthorized = vi.fn();
  const fetchMock = vi.fn();
  beforeEach(() => {
    connectAuth(() => 'tok', unauthorized);
    setSleepForTests(() => Promise.resolve());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    unauthorized.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('пропуск входа уходит только в API Google', async () => {
    expect(tokenAllowed('https://www.googleapis.com/drive/v3/files')).toBe(true);
    expect(tokenAllowed('https://sheets.googleapis.com/v4/spreadsheets/x')).toBe(true);
    expect(tokenAllowed('http://www.googleapis.com/drive/v3/files')).toBe(false);
    expect(tokenAllowed('https://www.googleapis.com.evil.test/')).toBe(false);
    expect(tokenAllowed('https://script.google.com/macros/s/x/exec')).toBe(false);
    await expect(gfetch('https://evil.test/steal')).rejects.toMatchObject({ kind: 'other' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('подставляет токен и повторяет при перегрузке', async () => {
    fetchMock.mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(json(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } })).mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(gfetch('https://www.googleapis.com/a')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('не повторяет бесконечно', async () => {
    fetchMock.mockImplementation(async () => json(429, {}));
    await expect(gfetch('https://www.googleapis.com/a', { retries: 2 })).rejects.toMatchObject({ kind: 'rateLimit' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('404 и нет прав — сразу ошибка, без повтора', async () => {
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await expect(gfetch('https://www.googleapis.com/a')).rejects.toMatchObject({ kind: 'notFound' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 — сообщает модулю входа и не повторяет', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(gfetch('https://www.googleapis.com/a')).rejects.toMatchObject({ kind: 'auth' });
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('обрыв связи — не больше трёх повторов', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(gfetch('https://www.googleapis.com/a')).rejects.toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('без входа — понятная ошибка, запроса нет', async () => {
    connectAuth(() => null, unauthorized);
    await expect(gfetch('https://www.googleapis.com/a')).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('runQueue', () => {
  it('ограничивает одновременность и не останавливается на ошибке', async () => {
    let running = 0;
    let peak = 0;
    const progress: number[] = [];
    const res = await runQueue(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        if (n === 3) throw new Error('плохо');
        return n * 2;
      },
      { concurrency: 2, onProgress: (d) => progress.push(d) },
    );
    expect(peak).toBe(2);
    expect(res.map((r) => (r.ok ? r.value : 'x'))).toEqual([2, 4, 'x', 8, 10, 12]);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('Диск', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    connectAuth(() => 'tok', () => {});
    setSleepForTests(() => Promise.resolve());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('после обрыва при загрузке не создаёт копию, если файл уже дошёл', async () => {
    vi.useFakeTimers();
    const data = enc('скан');
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, { files: [{ id: 'F1', name: 'скан.jpg', md5Checksum: md5(data), mimeType: 'image/jpeg' }] }));
    const p = uploadFile({ name: 'скан.jpg', parentId: 'P', data, mimeType: 'image/jpeg' });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ id: 'F1' });
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('in+parents');
  });

  it('разбирает пакетный ответ', () => {
    const b = 'batch_x';
    const text = [
      `--${b}\r\nContent-Type: application/http\r\nContent-ID: <response-0>\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"A","name":"a"}\r\n`,
      `--${b}\r\nContent-Type: application/http\r\nContent-ID: <response-1>\r\n\r\nHTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\n\r\n{"error":{"code":404}}\r\n`,
      `--${b}--`,
    ].join('');
    const m = parseBatch(text, b);
    expect(m.get('0')).toEqual({ status: 200, body: { id: 'A', name: 'a' } });
    expect(m.get('1')?.status).toBe(404);
  });

  it('getMany: пакеты по 100, у каждого файла — свой результат', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      const parts = [...body.matchAll(/Content-ID: <(\d+)>\r\n\r\nGET \/drive\/v3\/files\/([^?]+)/g)];
      const text = parts.map(([, n, id]) => `--rb\r\nContent-ID: <response-${n}>\r\n\r\nHTTP/1.1 ${id === 'gone' ? '404 Not Found' : '200 OK'}\r\n\r\n${id === 'gone' ? '{}' : JSON.stringify({ id, name: id })}\r\n`).join('') + '--rb--';
      return new Response(text, { status: 200, headers: { 'Content-Type': 'multipart/mixed; boundary=rb' } });
    });
    const ids = [...Array.from({ length: 150 }, (_, i) => `f${i}`), 'gone'];
    const m = await getMany(ids);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(m.get('f149')).toMatchObject({ ok: true, file: { id: 'f149' } });
    expect(m.get('gone')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('Таблицы', () => {
  it('адреса ячеек', () => {
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(25)).toBe('Z');
    expect(columnLetters(26)).toBe('AA');
    expect(columnLetters(701)).toBe('ZZ');
    expect(columnLetters(702)).toBe('AAA');
    expect(a1("Лист 'один'", 5, 2)).toBe("'Лист ''один'''!C5");
  });
});
