// Spring-driven values. Every visible property eases toward its target, so any
// change of scene state becomes motion without per-transition choreography.

export interface SpringConfig {
  stiffness: number
  damping: number
}

export const SOFT: SpringConfig = { stiffness: 110, damping: 19 }
export const CAMERA: SpringConfig = { stiffness: 38, damping: 12.5 }

export class Spring {
  value: number
  velocity = 0
  target: number
  private pending: { target: number; at: number } | null = null

  constructor(v: number, private cfg: SpringConfig = SOFT) {
    this.value = v
    this.target = v
  }

  set(target: number, now: number, delay = 0) {
    if (delay > 0) {
      if (this.pending?.target === target || (this.pending === null && this.target === target)) return
      this.pending = { target, at: now + delay }
    } else {
      this.pending = null
      this.target = target
    }
  }

  jump(v: number) {
    this.value = this.target = v
    this.velocity = 0
    this.pending = null
  }

  /** Advances one step; returns true while still moving. */
  step(dt: number, now: number): boolean {
    if (this.pending && now >= this.pending.at) {
      this.target = this.pending.target
      this.pending = null
    }
    const { stiffness, damping } = this.cfg
    const force = -stiffness * (this.value - this.target) - damping * this.velocity
    this.velocity += force * dt
    this.value += this.velocity * dt
    const settled = Math.abs(this.velocity) < 1e-3 && Math.abs(this.value - this.target) < 1e-3
    if (settled) {
      this.value = this.target
      this.velocity = 0
    }
    return !settled || this.pending !== null
  }
}

/** A bag of named springs for one animated entity. */
export class Animated<K extends string> {
  springs: Record<K, Spring>

  constructor(initial: Record<K, number>, cfg?: SpringConfig) {
    this.springs = {} as Record<K, Spring>
    for (const k in initial) this.springs[k] = new Spring(initial[k], cfg)
  }

  get(k: K) {
    return this.springs[k].value
  }

  set(targets: Partial<Record<K, number>>, now: number, delay = 0) {
    for (const k in targets) this.springs[k as K].set(targets[k as K]!, now, delay)
  }

  step(dt: number, now: number) {
    let moving = false
    for (const k in this.springs) moving = this.springs[k].step(dt, now) || moving
    return moving
  }
}
