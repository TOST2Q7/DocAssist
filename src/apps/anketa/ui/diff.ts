/** Пословный дифф для подсветки «было → стало». */
export interface DiffPart {
  type: 'same' | 'del' | 'ins';
  text: string;
}

function tokens(s: string): string[] {
  return s.match(/[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu) ?? [];
}

export function diffWords(a: string, b: string): DiffPart[] {
  const x = tokens(a);
  const y = tokens(b);
  const n = x.length;
  const m = y.length;
  // LCS по токенам (строки короткие — квадратичный алгоритм подходит).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('same', x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', x[i++]);
    else push('ins', y[j++]);
  }
  while (i < n) push('del', x[i++]);
  while (j < m) push('ins', y[j++]);
  return out;
}
