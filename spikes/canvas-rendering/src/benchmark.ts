/**
 * Headless benchmark for comparing signal update performance
 * Measures the cost of updating signals with different subscriber counts
 */

import { signal, effect } from './signal';

interface BenchmarkResult {
  name: string;
  nodeCount: number;
  updates: number;
  totalTime: number;
  avgUpdateTime: number;
  opsPerSecond: number;
}

function benchmark(name: string, nodeCount: number, updateCount: number): BenchmarkResult {
  // Create signals
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: i,
    x: signal(Math.random() * 1000),
    y: signal(Math.random() * 1000),
  }));

  // Create effects that subscribe to the signals
  const cleanups: Array<() => void> = [];
  for (const node of nodes) {
    const cleanup = effect(() => {
      // Simulate reading both x and y (like a render would)
      const x = node.x.value;
      const y = node.y.value;
      // Prevent optimization
      if (x < 0 || y < 0) console.log('unreachable');
    });
    cleanups.push(cleanup);
  }

  // Run benchmark
  const start = performance.now();
  
  for (let i = 0; i < updateCount; i++) {
    // Update random nodes
    for (let j = 0; j < 10; j++) {
      const idx = Math.floor(Math.random() * nodeCount);
      nodes[idx].x.value = Math.random() * 1000;
      nodes[idx].y.value = Math.random() * 1000;
    }
  }

  const end = performance.now();
  const totalTime = end - start;

  // Cleanup
  for (const cleanup of cleanups) {
    cleanup();
  }

  return {
    name,
    nodeCount,
    updates: updateCount * 20, // 10 nodes * 2 properties
    totalTime,
    avgUpdateTime: totalTime / (updateCount * 20),
    opsPerSecond: ((updateCount * 20) / totalTime) * 1000,
  };
}

function formatResult(result: BenchmarkResult): string {
  return `
${result.name}
  Node Count: ${result.nodeCount}
  Total Updates: ${result.updates}
  Total Time: ${result.totalTime.toFixed(2)}ms
  Avg Update Time: ${result.avgUpdateTime.toFixed(4)}ms
  Ops/Second: ${result.opsPerSecond.toFixed(0)}
`;
}

// Run benchmarks
console.log('🚀 Running Signal Performance Benchmarks\n');
console.log('=' .repeat(50));

const results: BenchmarkResult[] = [];

// Test with different node counts
for (const nodeCount of [100, 500, 1000]) {
  const result = benchmark(`Signal Updates (${nodeCount} nodes)`, nodeCount, 100);
  results.push(result);
  console.log(formatResult(result));
}

console.log('=' .repeat(50));
console.log('\n📊 Summary:');
console.log('Node Count | Ops/Second | Avg Update Time');
console.log('-'.repeat(50));
for (const result of results) {
  console.log(
    `${result.nodeCount.toString().padEnd(10)} | ` +
    `${result.opsPerSecond.toFixed(0).padEnd(10)} | ` +
    `${result.avgUpdateTime.toFixed(4)}ms`
  );
}
