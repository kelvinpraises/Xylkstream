import { poseidon } from "./poseidon";

export class IncrementalMerkleTree {
  depth: number;
  zeros: bigint[] = [];
  filledSubtrees: bigint[];
  leaves: bigint[] = [];
  nextIndex = 0;
  root: bigint = 0n;

  constructor(depth: number) {
    this.depth = depth;
    this.filledSubtrees = new Array(depth).fill(0n);
    let currentZero = 0n;
    this.zeros[0] = currentZero;
    for (let i = 1; i < depth; i++) {
      currentZero = poseidon([currentZero, currentZero]);
      this.zeros[i] = currentZero;
    }
    this.root = this.zeros[depth - 1];
  }

  insert(leaf: bigint): bigint {
    this.leaves.push(leaf);
    const index = this.nextIndex;
    let currentHash = leaf;
    let currentIndex = index;
    for (let i = 0; i < this.depth; i++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees[i] = currentHash;
        currentHash = poseidon([currentHash, this.zeros[i]]);
      } else {
        currentHash = poseidon([this.filledSubtrees[i], currentHash]);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    this.root = currentHash;
    this.nextIndex++;
    return currentHash;
  }

  getProof(index: number): { root: bigint; pathElements: bigint[]; pathIndices: number[] } {
    if (index >= this.nextIndex) throw new Error("Index out of bounds");
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let currentIndex = index;
    for (let i = 0; i < this.depth; i++) {
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);
      const levelSize = Math.pow(2, i);
      if (isRight) {
        pathElements.push(this._reconstructSubtree((currentIndex - 1) * levelSize, i));
      } else {
        const sibStart = (currentIndex + 1) * levelSize;
        pathElements.push(sibStart < this.nextIndex ? this._reconstructSubtree(sibStart, i) : this.zeros[i]);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    return { root: this.root, pathElements, pathIndices };
  }

  private _reconstructSubtree(leafIndex: number, level: number): bigint {
    if (level === 0) return leafIndex < this.leaves.length ? BigInt(this.leaves[leafIndex]) : this.zeros[0];
    const levelSize = Math.pow(2, level - 1);
    const left = this._reconstructSubtree(leafIndex, level - 1);
    const right = this._reconstructSubtree(leafIndex + levelSize, level - 1);
    return poseidon([left, right]);
  }
}
