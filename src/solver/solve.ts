import type { RubiksCube } from '../cube/RubiksCube';

let worker: Worker | null = null;
let ready = false;
let readyResolvers: Array<() => void> = [];
let errorHandler: ((msg: string) => void) | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();

function ensureWorker(): void {
  if (worker) return;
  worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const data = e.data;
    if (data.type === 'ready') {
      ready = true;
      const rs = readyResolvers;
      readyResolvers = [];
      rs.forEach((r) => r());
      return;
    }
    if (data.type === 'result') {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.solution as string);
      else p.reject(new Error(data.error ?? '求解失败'));
    }
  };
  worker.onerror = (e: ErrorEvent) => {
    const msg = e.message || '求解器工作线程出错';
    const err = new Error(msg);
    pending.forEach((p) => p.reject(err));
    pending.clear();
    if (!ready) {
      readyResolvers = [];
      errorHandler?.(msg);
    }
  };
}

export function onSolverError(cb: (msg: string) => void): void {
  errorHandler = cb;
}

export function initSolver(): Promise<void> {
  ensureWorker();
  if (ready) return Promise.resolve();
  return new Promise((resolve) => readyResolvers.push(resolve));
}

export function isReady(): boolean {
  return ready;
}

export function solve(facelets: string, maxDepth = 21, timeoutMs = 15000): Promise<string> {
  ensureWorker();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      pending.delete(id);
      if (worker) {
        worker.terminate();
        worker = null;
        ready = false;
      }
      reject(new Error('求解超时（状态可能不可达）'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (s) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(s);
      },
      reject: (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      },
    });
    worker!.postMessage({ id, facelets, maxDepth });
  });
}

/** 从魔方对象导出面贴串并求解。 */
export async function solveCube(cube: RubiksCube): Promise<{ facelets: string; solution: string }> {
  const facelets = cube.extractFaceletString();
  if (facelets.length !== 54) throw new Error('无法读取魔方状态，请检查录入');
  await initSolver();
  const solution = await solve(facelets);
  return { facelets, solution };
}
