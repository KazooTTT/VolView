import { z } from 'zod';
import { TypedArray } from 'itk-wasm';
import { parseUrl } from '@/src/utils/url';
import { EPSILON } from '../constants';
import { Maybe } from '../types';

export function identity<T>(arg: T) {
  return arg;
}

export const isFulfilled = <T>(
  input: PromiseSettledResult<T>
): input is PromiseFulfilledResult<T> => input.status === 'fulfilled';

type PromiseResolveFunction<T> = (value: T) => void;
type PromiseRejectFunction = (reason?: any) => void;
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: PromiseResolveFunction<T>;
  reject: PromiseRejectFunction;
}

export function defer<T>(): Deferred<T> {
  let innerResolve: PromiseResolveFunction<T> | null = null;
  let innerReject: PromiseRejectFunction | null = null;

  const resolve = (value: T) => {
    if (innerResolve) innerResolve(value);
  };
  const reject = (reason?: Error) => {
    if (innerReject) innerReject(reason);
  };

  const promise = new Promise<T>((res, rej) => {
    innerResolve = res;
    innerReject = rej;
  });

  return { promise, resolve, reject };
}

export function removeFromArray<T>(arr: Array<T>, el: T) {
  const idx = arr.indexOf(el);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  return keys.reduce((o, k) => ({ ...o, [k]: obj[k] }), {} as Pick<T, K>);
}

export const pluck =
  <T, K extends keyof T>(key: K) =>
  (obj: T): T[K] =>
    obj[key];

/**
 * Takes a predicate and a list of values and returns a a tuple (2-item array),
 *  with each item containing the subset of the list that matches the predicate
 *  and the complement of the predicate respectively
 *
 * @sig (T -> Boolean, T[]) -> [T[], T[]]
 *
 * @param {Function} predicate A predicate to determine which side the element belongs to.
 * @param {Array} arr The list to partition
 *
 * Inspired by the Ramda function of the same name
 * @see https://ramdajs.com/docs/#partition
 *
 * @example
 *
 *     const isNegative: (n: number) => boolean = n => n < 0
 *     const numbers = [1, 2, -4, -7, 4, 22]
 *     partition(isNegative, numbers)
 *     // => [ [-4, -7], [1, 2, 4, 22] ]
 *
 * Source https://gist.github.com/zachlysobey/71ac85046d0d533287ed85e1caa64660
 */
export function partition<T>(
  predicate: (val: T) => boolean,
  arr: Array<T>
): [Array<T>, Array<T>] {
  const partitioned: [Array<T>, Array<T>] = [[], []];
  arr.forEach((val: T) => {
    const partitionIndex: 0 | 1 = predicate(val) ? 0 : 1;
    partitioned[partitionIndex].push(val);
  });
  return partitioned;
}

export function partitionByType<T, U extends T>(
  guard: (x: T) => x is U,
  arr: T[]
): [U[], Exclude<T, U>[]] {
  const ret: [U[], Exclude<T, U>[]] = [[], []];
  arr.forEach((el) =>
    guard(el) ? ret[0].push(el) : ret[1].push(el as Exclude<T, U>)
  );
  return ret;
}

export const chunk = <T>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_: any, i: number) =>
    arr.slice(i * size, i * size + size)
  );

export function plural(n: number, word: string, pluralWord?: string) {
  return n > 1 ? pluralWord ?? `${word}s` : word;
}

export const ensureDefault = <T>(
  key: string,
  records: Record<string, T>,
  default_: T
) => {
  if (!(key in records)) {
    // eslint-disable-next-line no-param-reassign
    records[key] = default_;
  }

  return records[key];
};

type ArrayLike<T> = T extends unknown[] ? T : T extends TypedArray ? T : never;
export function arrayEquals<T>(a: ArrayLike<T>, b: ArrayLike<T>) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

type ComparatorFunction<T> = (a: T, b: T) => boolean;
export function arrayEqualsWithComparator<T>(
  a: T[],
  b: T[],
  cmp: ComparatorFunction<T>
) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!cmp(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Wraps non-arrays in an array.
 * @param maybeArray
 */
export function wrapInArray<T>(maybeArray: T | T[]): T[] {
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
}

/**
 * Extracts the basename from a URL.
 */
export function getURLBasename(url: string) {
  return parseUrl(url, window.location.href).pathname.split('/').at(-1) ?? '';
}

// from https://stackoverflow.com/a/18650828
export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

export function roundIfCloseToInteger(value: number, eps = EPSILON) {
  const rounded = Math.round(value);
  if (Math.abs(rounded - value) <= eps) {
    return rounded;
  }
  return value;
}

export function hasKey<O extends Object>(
  obj: O,
  key: PropertyKey
): key is keyof O {
  return key in obj;
}

export function remapKeys<O extends Object, K extends keyof O>(
  obj: O,
  keyMap: Record<K, K>
) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (hasKey(keyMap, key)) return [keyMap[key], value];
      throw new Error(`Key ${key} not found in keyMap`);
    })
  );
}

// return object without the given keys
export const omit = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[] | K
) =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !wrapInArray(keys).includes(key as K))
  ) as Omit<T, K>;

export function ensureError(e: unknown) {
  return e instanceof Error ? e : new Error(JSON.stringify(e));
}

// remove undefined properties
export function cleanUndefined(obj: Object) {
  return Object.entries(obj).reduce(
    (cleaned, [key, value]) =>
      value === undefined ? cleaned : { ...cleaned, [key]: value },
    {}
  );
}

// converts named colors (red, antiquewhite, etc) to hex
export function standardizeColor(color: Maybe<string>) {
  if (!color) return '#ffffff';
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');
  ctx.fillStyle = color;
  return ctx.fillStyle;
}

// https://github.com/colinhacks/zod/discussions/839#discussioncomment-4335236
export function zodEnumFromObjKeys<K extends string>(
  obj: Record<K, any>
): z.ZodEnum<[K, ...K[]]> {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return z.enum([firstKey, ...otherKeys]);
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export const TypedArrayConstructorNames = [
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
];

/**
 * Creates a new typed array of the same type as the source array.
 * This utility handles the TypeScript typing issues when using array.constructor.
 *
 * @param sourceArray The source array to match the type of
 * @param arrayLength The length of the new array
 * @returns A new array of the same type as sourceArray
 */
export function createTypedArrayLike<T extends TypedArray | number[]>(
  sourceArray: T,
  arrayLength: number
): T {
  return new (sourceArray.constructor as new (length: number) => T)(
    arrayLength
  );
}

// https://stackoverflow.com/a/74823834
type Entries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

// Object.entries with keys preserved rather as string
export const getEntries = <T extends object>(obj: T) =>
  Object.entries(obj) as Entries<T>;

/**
 * Normalizes a list of objects to { order, byKey }
 * @param objects
 * @param key
 * @returns
 */
export function normalizeForStore<T, K extends keyof T>(objects: T[], key: K) {
  type KeyType = T[K];
  const order: KeyType[] = objects.map((obj) => obj[key]);
  const byKey = objects.reduce<Record<K, T>>(
    (acc, obj) => ({ ...acc, [obj[key] as string | number | symbol]: obj }),
    {} as Record<string | number | symbol, T>
  );

  return { order, byKey };
}

export function shortenNumber(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) {
    return value.toExponential(2);
  }
  return value.toFixed(2);
}

/**
 * Listens for an event once.
 * @param target
 * @param event
 * @param callback
 */
export function addEventListenerOnce<T extends EventTarget>(
  target: T,
  event: string,
  callback: (...args: any[]) => any
) {
  const handler = () => {
    target.removeEventListener(event, handler);
    return callback();
  };
  target.addEventListener(event, handler);
}

/**
 * Converts a byte sequence to ASCII.
 * @param bytes
 * @param param1
 * @returns
 */
export function toAscii(
  bytes: Uint8Array | Uint8ClampedArray,
  { ignoreNulls = false } = {}
) {
  const chars = [];
  for (let i = 0; i < bytes.length; i++) {
    if (!(ignoreNulls && bytes[i] === 0)) {
      chars.push(String.fromCharCode(bytes[i]));
    }
  }
  return chars.join('');
}

/**
 * Wraps a generator as a coroutine.
 * @param generator
 * @param args
 * @returns
 */
export function asCoroutine<T, R, N>(gen: Generator<T, R, N>) {
  // run initial code
  const result = gen.next();
  if (result.done) return () => result;
  return (value: N): IteratorResult<T, R> => gen.next(value);
}
