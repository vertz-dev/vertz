import { greet, add, repeat } from './utils.js';
import { APP_NAME, VERSION, MAX_RETRIES } from './config.js';

console.log('entry started');
console.log(greet(APP_NAME));
console.log('version: ' + VERSION);
console.log('sum: ' + add(10, 20));
console.log('repeat: ' + repeat('ab', MAX_RETRIES));
console.log('entry done');
