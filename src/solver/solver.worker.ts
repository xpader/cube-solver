import Cube from 'cubejs';

// 初始化在 worker 线程同步执行（约 4-5 秒），完成后通知主线程
Cube.initSolver();
postMessage({ type: 'ready' });

self.onmessage = (e: MessageEvent) => {
  const { id, facelets, maxDepth } = e.data as { id: number; facelets: string; maxDepth?: number };
  try {
    const cube = Cube.fromString(facelets);
    const solution = cube.solve(maxDepth ?? 21);
    (self as unknown as Worker).postMessage({ type: 'result', id, ok: true, solution });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'result',
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
