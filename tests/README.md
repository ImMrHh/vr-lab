# Tests — VR Lab Booking Calendar

## How to run

```sh
node tests/app.test.js
```

No npm install or build step needed. The test file is self-contained and runs in Node.js.

## What is tested

| Test group | Functions covered |
|---|---|
| `getMonday()` | Returns the Monday of the current, next, and previous week |
| `getCellDate()` | Day offsets: d=0 is Monday, d=4 is Friday |
| `dStr()` | ISO date string output (YYYY-MM-DD), zero-padded |
| `slotKey()` | Format is `YYYY-MM-DD_PX`; day index shifts date correctly |
| `isToday()` | Returns `true` for today's weekday, `false` for other weeks |
| `isPast()` | Returns `true` for past dates, `false` for far-future dates |
| `isPastSchoolEnd()` | Dates after July 15, 2026 return `true`; current date returns `false` |
| `esc()` | Escapes `<`, `>`, `&`, `"`, `'`; safe strings pass unchanged |
| `HOLIDAYS` set | Known holidays are present; non-holidays are absent |

## How to add new tests

Open `tests/app.test.js` and add a new `test()` block in the relevant section:

```js
test('description of what you are testing', () => {
  // use assert(condition, 'message') for boolean checks
  assert(someFunction() === expectedValue, 'optional error message');
  // or use assertEqual for strict equality
  assertEqual(someFunction(), expectedValue);
});
```

The test runner prints `✓` for passing tests and `✗` with the error for failing ones.  
It exits with code `1` if any test fails, making it compatible with CI pipelines.
