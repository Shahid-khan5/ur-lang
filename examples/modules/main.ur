// Module example — lao ... se import hota hai.
// Run with: urlang run examples/modules/main.ur
lao { jama, zarab, PI } "./math.ur" se;

bolo "2 + 3 =", jama(2, 3);
bolo "4 * 5 =", zarab(4, 5);
bolo "daira:", zarab(PI, 4);
