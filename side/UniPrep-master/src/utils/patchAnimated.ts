/**
 * Prevent "Cannot read property 'stopTracking' of undefined" on Hermes.
 *
 * TRUE root cause (discovered by reading node_modules source):
 * In AnimatedImplementation.js, Animated.spring/timing/decay internally do:
 *
 *   const singleValue: any = animatedValue;
 *   singleValue.stopTracking();          // ← CRASHES if singleValue is undefined
 *
 * This happens when a component unmounts (tab switch) and its Animated.Value
 * ref gets garbage-collected by Hermes, but the animation closure created by
 * Animated.spring().start() still holds a reference to the now-undefined value.
 *
 * Strategy (3 layers):
 *   1. Monkey-patch Animated.spring, Animated.timing, Animated.decay so that
 *      if the value is nullish, they return a safe no-op CompositeAnimation.
 *   2. Patch AnimatedValue prototype chain (_tracking, __detach, etc.) as
 *      defense-in-depth for the secondary _tracking === undefined case.
 *   3. Global ErrorUtils handler as last resort.
 *
 * Must be the FIRST import in App.tsx.
 */
import { Animated } from 'react-native';

// ═══════════════════════════════════════════════════════════════════
// LAYER 1: Patch Animated.spring / timing / decay at the API level
// ═══════════════════════════════════════════════════════════════════
// These are the actual functions that crash when the animated value
// is undefined. We wrap them so they guard against nullish values.

const NOOP_ANIMATION = {
  start: (cb?: any) => { cb && cb({ finished: false }); },
  stop: () => {},
  reset: () => {},
  _startNativeLoop: () => {},
  _isUsingNativeDriver: () => false,
};

// Wrap a CompositeAnimation so its start/stop/reset never throw
function safeAnim(anim: any): any {
  if (!anim || anim === NOOP_ANIMATION) return NOOP_ANIMATION;
  return {
    start: (cb?: any) => { try { anim.start(cb); } catch (_) { cb && cb({ finished: false }); } },
    stop: () => { try { anim.stop(); } catch (_) {} },
    reset: () => { try { anim.reset(); } catch (_) {} },
    _startNativeLoop: (iterations?: any) => { try { anim._startNativeLoop?.(iterations); } catch (_) {} },
    _isUsingNativeDriver: () => { try { return anim._isUsingNativeDriver?.() || false; } catch (_) { return false; } },
  };
}

const origSpring = Animated.spring;
const origTiming = Animated.timing;
const origDecay = Animated.decay;
const origSequence = Animated.sequence;
const origParallel = Animated.parallel;

(Animated as any).spring = function (value: any, config: any) {
  if (value == null) return NOOP_ANIMATION;
  try { return safeAnim(origSpring(value, config)); } catch (_) { return NOOP_ANIMATION; }
};

(Animated as any).timing = function (value: any, config: any) {
  if (value == null) return NOOP_ANIMATION;
  try { return safeAnim(origTiming(value, config)); } catch (_) { return NOOP_ANIMATION; }
};

(Animated as any).decay = function (value: any, config: any) {
  if (value == null) return NOOP_ANIMATION;
  try { return safeAnim(origDecay(value, config)); } catch (_) { return NOOP_ANIMATION; }
};

(Animated as any).sequence = function (animations: any[]) {
  try { return safeAnim(origSequence(animations)); } catch (_) { return NOOP_ANIMATION; }
};

(Animated as any).parallel = function (animations: any[], config?: any) {
  try { return safeAnim(origParallel(animations, config)); } catch (_) { return NOOP_ANIMATION; }
};

// ═══════════════════════════════════════════════════════════════════
// LAYER 2: Patch AnimatedValue prototype chain (defense-in-depth)
// ═══════════════════════════════════════════════════════════════════
// Handles the secondary case where _tracking becomes undefined/null
// due to Hermes GC race conditions.

const SAFE_TRACKING: any = new Proxy(Object.freeze({}), {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
    return () => {};
  },
});

const TRACKING = Symbol('_tracking');

function patchTrackingProp(proto: any) {
  if (!proto || proto[TRACKING] === 'patched') return;
  try {
    Object.defineProperty(proto, '_tracking', {
      configurable: true,
      get(this: any) { return this[TRACKING] ?? SAFE_TRACKING; },
      set(this: any, v: any) { this[TRACKING] = v; },
    });
    Object.defineProperty(proto, TRACKING, { value: 'patched', writable: true, configurable: true });
  } catch (_) {}
}

function safePatch(proto: any, method: string) {
  if (!proto || !proto[method]) return;
  const orig = proto[method];
  if ((orig as any).__patched) return;
  proto[method] = function (this: any, ...args: any[]) {
    try { return orig.apply(this, args); } catch (_) {}
  };
  (proto[method] as any).__patched = true;
}

// Patch AnimatedValue + parent prototypes
const valueProto = (Animated.Value as any).prototype;
if (valueProto) {
  let p = valueProto;
  while (p && p !== Object.prototype) {
    patchTrackingProp(p);
    safePatch(p, '__detach');
    safePatch(p, 'animate');
    safePatch(p, 'stopAnimation');
    safePatch(p, 'stopTracking');
    p = Object.getPrototypeOf(p);
  }
}

// Patch AnimatedValueXY
try {
  const xyProto = (Animated.ValueXY as any)?.prototype;
  if (xyProto) {
    patchTrackingProp(xyProto);
    safePatch(xyProto, '__detach');
    safePatch(xyProto, 'stopAnimation');
  }
} catch (_) {}

// Patch AnimatedInterpolation
try {
  const testVal = new Animated.Value(0);
  const interp = testVal.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  let interpProto = Object.getPrototypeOf(interp);
  while (interpProto && interpProto !== Object.prototype) {
    patchTrackingProp(interpProto);
    safePatch(interpProto, '__detach');
    safePatch(interpProto, 'stopAnimation');
    safePatch(interpProto, 'stopTracking');
    interpProto = Object.getPrototypeOf(interpProto);
  }
} catch (_) {}

// ═══════════════════════════════════════════════════════════════════
// LAYER 3: Global error handler — last resort
// ═══════════════════════════════════════════════════════════════════
try {
  const EU = (globalThis as any).ErrorUtils;
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error: any, isFatal: boolean) => {
      const msg = error?.message || '';
      if (
        !isFatal &&
        (msg.includes('stopTracking') ||
         msg.includes('__detach') ||
         msg.includes('_tracking'))
      ) {
        if (__DEV__) {
          console.warn('[patchAnimated] Suppressed:', msg);
        }
        return;
      }
      if (prev) prev(error, isFatal);
    });
  }
} catch (_) {}

export {};
