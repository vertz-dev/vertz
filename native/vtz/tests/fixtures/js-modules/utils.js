export function greet(name) {
  return 'Hello, ' + name + '!';
}

export function add(a, b) {
  return a + b;
}

export function repeat(str, times) {
  let result = '';
  for (let i = 0; i < times; i++) {
    result += str;
  }
  return result;
}

console.log('utils loaded');
