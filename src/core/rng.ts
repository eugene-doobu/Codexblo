export class GameRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  nextUint32(): number {
    let next = (this.state += 0x6d2b79f5);
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return (next ^ (next >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  integer(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.nextFloat() * (maxInclusive - minInclusive + 1)) + minInclusive;
  }
}