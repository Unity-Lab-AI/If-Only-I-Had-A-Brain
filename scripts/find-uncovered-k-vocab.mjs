// Find K-vocabulary words that don't appear in any K_CONCRETE_SENTENCES.
// Helps target sentence expansion at uncovered high-frequency words.
import { K_CONCRETE_SENTENCES } from '../js/brain/curriculum.js';
import { K_VOCABULARY } from '../js/brain/k-vocabulary.js';

const usedWords = new Set();
for (const s of K_CONCRETE_SENTENCES) {
  for (const w of s.toLowerCase().split(/\s+/).filter(w => w.length > 0)) {
    usedWords.add(w);
  }
}

const uncovered = [];
for (const w of K_VOCABULARY) {
  if (!usedWords.has(w) && w.length >= 3) uncovered.push(w);
}

console.log(`K_VOCABULARY size: ${K_VOCABULARY.length}`);
console.log(`Covered in sentences: ${usedWords.size}`);
console.log(`Uncovered (≥3 chars): ${uncovered.length}`);
console.log(`\nFULL UNCOVERED LIST (one per line, for batch generation):`);
console.log(uncovered.join('\n'));
