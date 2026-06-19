export class GameRng {
  private readonly initialSeed: number;
  private state: number;

  constructor(seed: number) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  getInitialSeed(): number {
    return this.initialSeed;
  }

  getState(): number {
    return this.state >>> 0;
  }

  nextUint32(): number {
    this.state = (Math.imul(this.state, 0x015a4e35) + 1) >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  integer(minInclusive: number, maxInclusive: number): number {
    return this.generateRnd(maxInclusive - minInclusive + 1) + minInclusive;
  }

  generateRnd(boundExclusive: number): number {
    if (boundExclusive <= 0) {
      return 0;
    }
    const value = this.advanceRndSeed();
    if (boundExclusive <= 0x7fff) {
      return (value >> 16) % boundExclusive;
    }
    return value % boundExclusive;
  }

  flipCoin(frequency = 2): boolean {
    return this.generateRnd(frequency) === 0;
  }

  randomIntLessThan(boundExclusive: number): number {
    return Math.max(this.generateRnd(boundExclusive), 0);
  }

  discardRandomValues(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.nextUint32();
    }
  }

  private advanceRndSeed(): number {
    const signed = this.nextUint32() | 0;
    if (signed === -2147483648) {
      return -2147483648;
    }
    return Math.abs(signed);
  }
}
