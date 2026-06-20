// Quick bigram-coverage measurement over K_CONCRETE_SENTENCES.
// Reports total sentences, unique bigrams, vocab coverage.
import { K_CONCRETE_SENTENCES } from '../js/brain/curriculum.js';

const pairs = new Map();
let totalPairs = 0;
let totalWords = 0;
const uniqueVocab = new Set();

for (const s of K_CONCRETE_SENTENCES) {
  const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  totalWords += words.length;
  for (const w of words) uniqueVocab.add(w);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (!a || !b) continue;
    const key = `${a}|${b}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
    totalPairs++;
  }
}

const N = 2247;
console.log(`Sentences: ${K_CONCRETE_SENTENCES.length}`);
console.log(`Total word positions: ${totalWords}`);
console.log(`Avg words/sentence: ${(totalWords / K_CONCRETE_SENTENCES.length).toFixed(2)}`);
console.log(`Total bigram occurrences: ${totalPairs}`);
console.log(`Unique bigrams: ${pairs.size}`);
console.log(`Unique vocab used in corpus: ${uniqueVocab.size}`);
console.log(`Vocab coverage vs N=2247: ${((uniqueVocab.size / N) * 100).toFixed(1)}%`);
console.log(`Bigrams / vocab-used ratio (mean out-degree): ${(pairs.size / uniqueVocab.size).toFixed(2)}`);
console.log(`Erdős-Rényi giant-component target (Np > 1 ⇒ ${N - 1} edges for N=${N}): ${pairs.size >= N - 1 ? 'PASS' : 'BELOW'}`);
console.log(`Hard percolation target (4500 bigrams): ${pairs.size >= 4500 ? 'PASS' : `BELOW by ${4500 - pairs.size}`}`);
