// Fibonacci — recursion, types, loops.
kaam fib(n: adad): adad {
  agar (n < 2) { wapas n; }
  wapas fib(n - 1) + fib(n - 2);
}

rakho i = 0;
jab tak (i <= 10) {
  bolo "fib(" + i + ") =", fib(i);
  i += 1;
}
